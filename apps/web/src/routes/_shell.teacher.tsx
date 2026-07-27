import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Filter, Phone, Users2, Eye, WifiOff } from "lucide-react";
import { KpiCard } from "@/components/sp/KpiCard";
import { StateChip } from "@/components/sp/StateChip";
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

/** Real 4MCA-B class with a deterministic present/absent spread, shown when
 *  Supabase has no seeded roster/session yet so the dashboard is never empty.
 *  Seed supabase/seed.sql + start a session to switch to live data. */
function demoRoster(): RosterEntry[] {
  return CLASS_ROSTER.map((s, i) => {
    const r = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
    const state: AttendanceState = r < 0.68 ? "PRESENT" : r < 0.85 ? "UNVERIFIED" : "ABSENT";
    return {
      student_id: s.reg_no,
      full_name: s.full_name,
      reg_no: s.reg_no,
      state,
      last_seen:
        state === "PRESENT"
          ? new Date(Date.now() - Math.floor(r * 180_000)).toISOString()
          : null,
      present_seconds: state === "PRESENT" ? Math.floor(1200 + r * 1800) : 0,
    } as unknown as RosterEntry;
  });
}

export const Route = createFileRoute("/_shell/teacher")({
  head: () => ({
    meta: [{ title: "Teacher · SensePro+" }],
  }),
  component: TeacherPage,
});

const STATE_ORDER: AttendanceState[] = ["PRESENT", "UNVERIFIED", "ABSENT"];

function nextState(s: AttendanceState): AttendanceState {
  // Bias flow: PRESENT→UNVERIFIED→ABSENT→PRESENT (recovery)
  return STATE_ORDER[(STATE_ORDER.indexOf(s) + 1) % STATE_ORDER.length];
}

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

function TeacherPage() {
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [realtimeLive, setRealtimeLive] = useState(false);
  const [pendingFlags, setPendingFlags] = useState(0);
  const [filter, setFilter] = useState<"ALL" | AttendanceState>("ALL");
  const [now, setNow] = useState(() => Date.now());

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
          setRoster(demoRoster());
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
          setRoster(demoRoster());
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

  // Admin-toggled QR check-in for students the camera couldn't verify.
  const [qrOn] = useQrEnabled();
  const unverified = useMemo(
    () =>
      roster
        .filter((r) => r.state === "UNVERIFIED")
        .map((r) => ({
          student_id: r.student_id,
          full_name: (r as unknown as { full_name?: string }).full_name ?? r.student_id,
        })),
    [roster],
  );
  const resolveQr = useCallback((id: string, state: AttendanceState) => {
    setRoster((prev) =>
      prev.map((r) => (r.student_id === id ? ({ ...r, state } as RosterEntry) : r)),
    );
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

      {qrOn && unverified.length > 0 && (
        <QrVerification students={unverified} onResolve={resolveQr} />
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
              <button className="sp-focus flex h-12 items-center gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 text-xs text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]">
                <Filter className="h-3.5 w-3.5" /> Advanced
              </button>
              <button
                onClick={() =>
                  exportSessionPdf({
                    section: session?.class_section ?? "4MCA-B",
                    subject: session?.subject ?? "Live session",
                    roster: roster as never,
                  }).catch(() => toast.error("Could not generate the PDF"))
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
                  {["", "Reg no", "Name", "State", "Last seen"].map((h) => (
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
                      <td className="px-4 py-3"><StateChip state={r.state} /></td>
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
