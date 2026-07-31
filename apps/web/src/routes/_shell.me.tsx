import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Hand } from "lucide-react";
import { StateChip } from "@/components/sp/StateChip";
import { fetchMyAttendanceSummary } from "@/lib/data/live";
import { fetchActiveSession } from "@/lib/data/roster";
import { overridePresence } from "@/lib/data/attendance";
import { useAuth } from "@/lib/auth";
import type { AttendanceRecord } from "@/lib/data/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/me")({
  head: () => ({
    meta: [{ title: "Me · SensePro+" }],
  }),
  component: MePage,
});

function MePage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    fetchMyAttendanceSummary().then(setHistory).catch(() => {});
  }, []);

  // Attended vs missed, split by session type. "Attended" = a PRESENT record;
  // anything else (unverified, absent, or no record at all) is a miss.
  const byType = useMemo(() => {
    const types = [
      { key: "lecture", label: "Class" },
      { key: "exam", label: "Exam" },
      { key: "workshop", label: "Workshop" },
    ];
    return types.map((t) => {
      const rows = history.filter((h) => (h.mode ?? "lecture") === t.key);
      const attended = rows.filter((h) => h.state === "PRESENT").length;
      return {
        ...t,
        total: rows.length,
        attended,
        missed: rows.length - attended,
        pct: rows.length ? Math.round((attended / rows.length) * 100) : null,
      };
    });
  }, [history]);

  // Ask the teacher to verify my presence: flags me UNVERIFIED in the live
  // session so I surface on the teacher's roster (and QR check-in) for review.
  async function requestPresenceCheck() {
    if (!user?.reg_no) {
      toast.error("Sign in as a student to request a check");
      return;
    }
    setRequesting(true);
    try {
      const session = await fetchActiveSession();
      if (!session) {
        toast.error("No live session right now — ask your teacher to start one");
        return;
      }
      await overridePresence(session.id, user.reg_no, "UNVERIFIED");
      setRequested(true);
      toast.success("Request sent — your teacher will verify you");
    } catch {
      toast.error("Could not send the request");
    } finally {
      setRequesting(false);
    }
  }

  const strip = history.slice(0, 21).reverse();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {/* Heat strip */}
        <section className="glass-panel p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Attendance · last 21 sessions
              </div>
              <div className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
                {user?.full_name ?? "Your pattern"}
                {user?.reg_no ? (
                  <span className="ml-2 font-mono-nums text-sm font-normal text-[color:var(--muted)]">
                    {user.reg_no}
                  </span>
                ) : null}
              </div>
            </div>
            <Legend />
          </div>
          <div className="mt-5 grid grid-cols-21 gap-1.5" style={{ gridTemplateColumns: "repeat(21, minmax(0,1fr))" }}>
            {strip.map((h, i) => (
              <div
                key={i}
                title={`${h.class_name} · ${new Date(h.date).toLocaleDateString()} · ${h.state}`}
                className="aspect-square rounded-sm border border-[color:var(--line)]"
                style={{
                  background:
                    h.state === "PRESENT"
                      ? "color-mix(in oklab, var(--ok) 60%, transparent)"
                      : h.state === "UNVERIFIED"
                        ? "color-mix(in oklab, var(--warn) 55%, transparent)"
                        : "var(--surface-2)",
                }}
              />
            ))}
          </div>
        </section>

        {/* Attendance by session type — attended vs missed */}
        <section className="glass-panel p-6">
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Attendance by type
          </div>
          <div className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
            Attended vs missed
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {byType.map((t) => (
              <div
                key={t.key}
                className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)]/60 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
                    {t.label}
                  </div>
                  <div
                    className={cn(
                      "font-mono-nums text-[10px] uppercase tracking-wider",
                      t.pct == null
                        ? "text-[color:var(--muted)]"
                        : t.pct >= 75
                          ? "text-[color:var(--ok)]"
                          : "text-[color:var(--warn)]",
                    )}
                  >
                    {t.pct == null ? "—" : `${t.pct}%`}
                  </div>
                </div>
                <div className="mt-2 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
                  {t.attended}
                  <span className="ml-1 font-mono-nums text-sm font-normal text-[color:var(--muted)]">
                    / {t.total}
                  </span>
                </div>
                <div className="mt-1 font-mono-nums text-[11px] text-[color:var(--muted)]">
                  {t.missed} missed
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${t.pct ?? 0}%`,
                      background:
                        (t.pct ?? 0) >= 75 ? "var(--ok)" : "var(--warn)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Per-session list */}
        <section className="glass-panel overflow-hidden">
          <header className="border-b border-[color:var(--line)] px-5 py-4">
            <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Sessions
            </div>
            <div className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
              Detailed history
            </div>
          </header>
          <div className="max-h-[440px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[color:var(--surface)]">
                <tr className="border-b border-[color:var(--line)]">
                  {["Date", "Class", "Type", "State"].map((h) => (
                    <th key={h} className="px-5 py-2 text-left font-mono-nums text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-[color:var(--line)]/60 hover:bg-[color:var(--surface-2)]/40">
                    <td className="px-5 py-2.5 font-mono-nums text-xs text-[color:var(--muted)]">
                      {new Date(h.date).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-2.5 text-[color:var(--ink)]">
                      {h.class_name}
                      <span className="ml-2 font-mono-nums text-[11px] text-[color:var(--muted)]">
                        {h.subject}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-wider",
                          h.mode === "exam"
                            ? "border-[color:var(--warn)]/30 bg-[color:var(--warn)]/10 text-[color:var(--warn)]"
                            : h.mode === "workshop"
                              ? "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                              : "border-[color:var(--primary)]/30 bg-[color:var(--primary)]/10 text-[color:var(--primary)]",
                        )}
                      >
                        {h.mode === "lecture" ? "class" : h.mode}
                      </span>
                    </td>
                    <td className="px-5 py-2.5"><StateChip state={h.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Right column */}
      <div className="space-y-6">
        {/* Request presence check — for when the camera didn't verify me */}
        <section className="glass-panel p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--primary)]/40 bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
              <Hand className="h-5 w-5" />
            </div>
            <div>
              <div className="font-mono-nums text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
                Not marked present?
              </div>
              <div className="font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
                Request presence check
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            If the camera couldn't verify you, send a request — you'll show up on your teacher's
            screen for manual verification (or a QR check-in).
          </p>
          <button
            onClick={requestPresenceCheck}
            disabled={requesting || requested}
            className="sp-focus mt-4 h-12 w-full rounded-md bg-[color:var(--primary)] text-sm font-semibold text-white transition-colors hover:bg-[color:var(--primary-deep)] disabled:opacity-50"
          >
            {requested ? "Request sent ✓" : requesting ? "Sending…" : "Request presence check"}
          </button>
        </section>

        <section className="glass-panel p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-mono-nums text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
                Consent status
              </div>
              <div className="font-display text-lg font-extrabold tracking-tight text-[color:var(--ok)]">
                Active · v2.1
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-[color:var(--muted)]">
            You've consented to camera-based classroom attendance. Frames are processed in memory
            and never stored. Aggregate zone analytics never include your identity.
          </p>
        </section>

        <section className="glass-panel p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 text-[color:var(--bad)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-mono-nums text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
                Data control
              </div>
              <div className="font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
                Delete my data
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Removes your biometric template and unlinks past attendance from your identity.
            Aggregate analytics (already de-identified) are retained.
          </p>

          <AnimatePresence mode="wait">
            {deleted ? (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 rounded-md border border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 p-4 font-mono-nums text-xs text-[color:var(--ok)]"
              >
                Deletion request submitted · admin will action within 24h.
              </motion.div>
            ) : !confirming ? (
              <motion.button
                key="btn"
                onClick={() => setConfirming(true)}
                className="sp-focus mt-4 h-12 w-full rounded-md border border-[color:var(--bad)]/50 bg-[color:var(--bad)]/10 text-sm font-semibold text-[color:var(--bad)] transition-colors hover:bg-[color:var(--bad)]/20"
              >
                Request deletion
              </motion.button>
            ) : (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 space-y-3 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-4"
              >
                {!confirmed ? (
                  <>
                    <div className="text-sm text-[color:var(--ink)]">
                      Step 1 of 2 — confirm you understand this action.
                    </div>
                    <label className="flex items-start gap-2 text-xs text-[color:var(--muted)]">
                      <input
                        type="checkbox"
                        onChange={(e) => setConfirmed(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[color:var(--primary)]"
                      />
                      <span>
                        I understand my biometric template will be purged and cannot be recovered.
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-[color:var(--ink)]">
                      Step 2 of 2 — submit the request.
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setConfirming(false);
                          setConfirmed(false);
                        }}
                        className="sp-focus h-12 flex-1 rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] text-xs text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setDeleted(true)}
                        className="sp-focus h-12 flex-1 rounded-md bg-[color:var(--bad)] text-xs font-semibold text-white transition-colors hover:opacity-90"
                      >
                        Submit deletion
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3">
      {[
        { c: "var(--ok)", l: "Present" },
        { c: "var(--warn)", l: "Unverified" },
        { c: "var(--surface-2)", l: "Absent", border: true },
      ].map((x) => (
        <div key={x.l} className="flex items-center gap-1.5 font-mono-nums text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
          <span
            className={cn("h-3 w-3 rounded-sm", x.border && "border border-[color:var(--line)]")}
            style={{ background: x.border ? "var(--surface-2)" : `color-mix(in oklab, ${x.c} 60%, transparent)` }}
          />
          {x.l}
        </div>
      ))}
    </div>
  );
}
