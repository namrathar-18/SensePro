import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, WifiOff, ChevronDown, QrCode } from "lucide-react";
import { KpiCard } from "@/components/sp/KpiCard";
import { StateChip } from "@/components/sp/StateChip";
import { overridePresence, type OverrideState } from "@/lib/data/attendance";
import {
  deriveRoster,
  fetchActiveSession,
  fetchIntervals,
  fetchStudents,
  subscribePresence,
} from "@/lib/data/roster";
import type { ActiveSession, IntervalRow } from "@/lib/data/roster";
import type { AttendanceState, RosterEntry } from "@/lib/data/types";
import { CLASS_ROSTER } from "@/lib/data/class-roster";
import { exportSessionPdf } from "@/lib/data/report";
import { ProctorReviewPanel } from "@/components/ProctorReviewPanel";
import { QrVerification } from "@/components/sp/QrVerification";
import { useQrEnabled } from "@/lib/qr-settings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** The real 4MCA-B class list with NO attendance claimed — every student reads
 *  ABSENT until live presence data arrives. Shown when Supabase has no seeded
 *  roster or is unreachable, so the dashboard is never empty but also never
 *  invents attendance (a fabricated present/absent spread here could be read as
 *  real). Seed supabase/seed.sql + start a session for live data. */
function fallbackRoster(): RosterEntry[] {
  return CLASS_ROSTER.map((s) => ({
    student_id: s.reg_no,
    full_name: s.full_name,
    reg_no: s.reg_no,
    state: "ABSENT" as AttendanceState,
    last_seen: null,
    present_seconds: 0,
  })) as unknown as RosterEntry[];
}

export const Route = createFileRoute("/_shell/teacher")({
  head: () => ({
    meta: [{ title: "Teacher · SensePro+" }],
  }),
  component: TeacherPage,
});

function formatRelative(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const diff = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ${diff % 60}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

/** Editable attendance state: shows the chip, opens a small menu to force a
 *  state (edge cases) or issue a QR check-in when QR mode is on. */
function StateOverride({
  state,
  qrOn,
  onSet,
  onIssueQr,
}: {
  state: AttendanceState;
  qrOn: boolean;
  onSet: (s: OverrideState) => void;
  onIssueQr: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="sp-focus flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-[color:var(--surface-2)]"
        aria-label="Change attendance state"
      >
        <StateChip state={state} />
        <ChevronDown className="h-3 w-3 text-[color:var(--muted)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] shadow-lg">
            {(["PRESENT", "UNVERIFIED", "ABSENT"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  onSet(s);
                  setOpen(false);
                }}
                disabled={s === state}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono-nums text-[11px] uppercase tracking-wider text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface-2)] disabled:opacity-40"
              >
                <StateChip state={s} /> {s === state && "· current"}
              </button>
            ))}
            {qrOn && (
              <button
                onClick={() => {
                  onIssueQr();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 border-t border-[color:var(--line)] px-3 py-2 text-left font-mono-nums text-[11px] uppercase tracking-wider text-[color:var(--primary)] transition-colors hover:bg-[color:var(--surface-2)]"
              >
                <QrCode className="h-3.5 w-3.5" /> Issue QR check-in
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TeacherPage() {
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [realtimeLive, setRealtimeLive] = useState(false);
  const [pendingFlags, setPendingFlags] = useState(0);
  const [filter, setFilter] = useState<"ALL" | AttendanceState>("ALL");
  const [now, setNow] = useState(() => Date.now());
  // True when we're showing the roster WITHOUT live presence data (Supabase not
  // seeded / unreachable) — surfaced so nobody reads it as real attendance.
  const [offline, setOffline] = useState(false);

  const studentsRef = useRef<Awaited<ReturnType<typeof fetchStudents>>>([]);
  const intervalsRef = useRef<Map<string, IntervalRow>>(new Map());
  const flashRef = useRef<Map<string, number>>(new Map());

  const rederive = useCallback(() => {
    setRoster((prev) => {
      const next = deriveRoster(studentsRef.current, [...intervalsRef.current.values()]);
      next.forEach(r => {
        const old = prev.find(p => p.student_id === r.student_id);
        if (old && old.state !== r.state) {
          flashRef.current.set(r.student_id, Date.now());
        }
      });
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [students, active] = await Promise.all([fetchStudents(), fetchActiveSession()]);
        if (cancelled) return;
        if (students.length === 0) {
          // Supabase reachable but roster not seeded yet — show the real class
          // so the dashboard is never empty. Run supabase/seed.sql for live data.
          setRoster(fallbackRoster());
          setOffline(true);
          setLoad("ready");
          return;
        }
        studentsRef.current = students;
        setSession(active);
        if (active) {
          const intervals = await fetchIntervals(active.id);
          if (cancelled) return;
          intervalsRef.current = new Map(intervals.map((iv) => [iv.id, iv]));
        }
        rederive();
        setLoad("ready");
      } catch {
        // Supabase unreachable / not configured — fall back to the real class.
        if (!cancelled) {
          setRoster(fallbackRoster());
          setOffline(true);
          setLoad("ready");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [rederive]);

  useEffect(() => {
    if (!session) return;
    const unsubscribe = subscribePresence(
      session.id,
      (row) => {
        intervalsRef.current.set(row.id, row);
        rederive();
      },
      setRealtimeLive,
    );
    return unsubscribe;
  }, [session, rederive]);

  // Tick every second for "last seen" relative display
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, UNVERIFIED: 0, ABSENT: 0 } as Record<AttendanceState, number>;
    for (const r of roster) c[r.state]++;
    return c;
  }, [roster]);

  const studentNames = useMemo(
    () => new Map(studentsRef.current.map((s) => [s.id, s.full_name])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load],
  );

  const present = counts.PRESENT;
  const total = roster.length;
  const openFlags = pendingFlags;

  const filtered = useMemo(
    () => (filter === "ALL" ? roster : roster.filter((r) => r.state === filter)),
    [roster, filter],
  );

  const filterCount = (k: "ALL" | AttendanceState) =>
    k === "ALL" ? total : counts[k];

  // Admin-toggled QR check-in for students the camera couldn't verify. The
  // panel serves both the FSM's UNVERIFIED students and anyone the teacher
  // explicitly issues a QR to (e.g. an ABSENT student who is actually present).
  const [qrOn] = useQrEnabled();
  const [qrPending, setQrPending] = useState<Set<string>>(new Set());
  // Pending = camera-unverified or teacher-issued, but not already present. As a
  // student checks in via the QR, presence updates over Realtime and they drop.
  const unverified = useMemo(
    () =>
      roster
        .filter(
          (r) =>
            r.state !== "PRESENT" && (r.state === "UNVERIFIED" || qrPending.has(r.student_id)),
        )
        .map((r) => ({ student_id: r.student_id, full_name: r.full_name })),
    [roster, qrPending],
  );

  // Manual teacher override for edge cases. Optimistic locally; persisted to the
  // live session via the backend when one is running (Realtime then confirms).
  const setState = useCallback(
    (regNo: string, state: OverrideState) => {
      setRoster((prev) =>
        prev.map((r) => (r.student_id === regNo ? ({ ...r, state } as RosterEntry) : r)),
      );
      if (session) {
        overridePresence(session.id, regNo, state)
          .then(() => toast.success(`${regNo} set ${state.toLowerCase()}`))
          .catch(() => toast.error("Could not save the change to the session"));
      } else {
        toast.message(`${regNo} set ${state.toLowerCase()} (no live session — local only)`);
      }
    },
    [session],
  );

  const issueQr = useCallback((regNo: string) => {
    setQrPending((prev) => new Set(prev).add(regNo));
  }, []);

  return (
    <div className="space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Present" value={present} suffix={`/ ${total}`} accent="ok" hint="Verified now" />
        <KpiCard label="Total roster" value={total} accent="primary" hint="Enrolled" />
        <KpiCard
          label="Attendance"
          value={Math.round((present / total) * 100)}
          suffix="%"
          accent="accent"
          hint="Live"
        />
        <KpiCard
          label="Open flags"
          value={openFlags}
          accent={openFlags > 0 ? "warn" : "muted"}
          hint="Awaiting review"
        />
      </div>

      {offline && (
        <div className="flex items-center gap-3 rounded-md border border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 px-4 py-3">
          <WifiOff className="h-4 w-4 shrink-0 text-[color:var(--warn)]" />
          <div className="min-w-0 text-[13px] text-[color:var(--warn)]">
            <span className="font-semibold">No live attendance data.</span>{" "}
            <span className="text-[color:var(--muted)]">
              Showing the class roster only — every student reads absent until a session runs and
              Supabase is reachable. Nothing here is a real attendance record.
            </span>
          </div>
        </div>
      )}

      {qrOn && unverified.length > 0 && (
        <QrVerification sessionId={session?.id ?? null} students={unverified} />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Roster */}
        <section className="glass-panel overflow-hidden">
          <header className="flex flex-col gap-4 border-b border-[color:var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Live roster
              </div>
              <div className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
                {session ? `${session.class_section}${session.subject ? " · " + session.subject : ""}` : "No live session"}
              </div>
              <div className="mt-1 flex items-center gap-2">
                {session && realtimeLive ? (
                  <span className="flex items-center gap-1.5 font-mono-nums text-[11px] text-[color:var(--ok)]">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--ok)] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--ok)]" />
                    </span>
                    realtime live
                  </span>
                ) : session ? (
                  <span className="flex items-center gap-1.5 font-mono-nums text-[11px] text-[color:var(--warn)]">
                    <WifiOff className="h-3 w-3" /> reconnecting...
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-1">
                {(["ALL", "PRESENT", "UNVERIFIED", "ABSENT"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    aria-pressed={filter === k}
                    className={cn(
                      "sp-focus min-h-12 rounded px-3 font-mono-nums text-[11px] uppercase tracking-wider transition-colors",
                      filter === k
                        ? "bg-[color:var(--primary)] text-white"
                        : "text-[color:var(--muted)] hover:text-[color:var(--ink)]",
                    )}
                  >
                    {k} <span className="ml-1 opacity-70">{filterCount(k)}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() =>
                  exportSessionPdf({
                    section: session?.class_section ?? "4MCA-B",
                    subject: session?.subject ?? "Live session",
                    roster: roster as never,
                  })
                    .then(() => toast.success("Report downloaded"))
                    .catch((err) =>
                      toast.error(
                        err instanceof Error ? err.message : "Could not generate the PDF",
                      ),
                    )
                }
                className="sp-focus flex h-12 items-center gap-2 rounded-md bg-[color:var(--primary)] px-4 text-xs font-semibold text-white transition-colors hover:bg-[color:var(--primary-deep)]">
                <Download className="h-3.5 w-3.5" /> Export session report (PDF)
              </button>
            </div>
          </header>

          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-[color:var(--surface)] backdrop-blur">
                <tr className="border-b border-[color:var(--line)]">
                  {["", "Reg no", "Name", "State (click to edit)", "Last seen"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left font-mono-nums text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const flashedAt = flashRef.current.get(r.student_id);
                  const flashing = !!flashedAt && now - flashedAt < 900;
                  return (
                    <tr
                      key={r.student_id}
                      className={cn(
                        "border-b border-[color:var(--line)]/60",
                        flashing && "row-flash",
                      )}
                    >
                      <td className="w-12 px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--line)] font-mono-nums text-[10px] font-semibold text-[color:var(--ink)] bg-[color:var(--surface-2)]">
                          {r.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono-nums text-xs text-[color:var(--muted)]">{r.student_id}</td>
                      <td className="px-4 py-3 text-[15px] text-[color:var(--ink)]">{r.full_name}</td>
                      <td className="px-4 py-3">
                        <StateOverride
                          state={r.state}
                          qrOn={qrOn}
                          onSet={(s) => setState(r.student_id, s)}
                          onIssueQr={() => issueQr(r.student_id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono-nums text-xs text-[color:var(--muted)]" title={r.last_seen ?? undefined}>
                        {formatRelative(r.last_seen, now)}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center font-mono-nums text-xs text-[color:var(--muted)]">
                      No rows match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Proctor review */}
        <section className="min-w-0">
          <ProctorReviewPanel
            sessionId={session?.id ?? null}
            studentNames={studentNames}
            onPendingCount={setPendingFlags}
          />
        </section>
      </div>
    </div>
  );
}
