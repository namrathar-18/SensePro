import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, ClipboardList, Users, ShieldAlert, Wrench } from "lucide-react";
import { fetchSessionsLive, type SessionRow } from "@/lib/data/live";

export const Route = createFileRoute("/_shell/sessions")({
  head: () => ({
    meta: [
      { title: "Sessions · SensePro+" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionsPage,
});

// Session types, in display order. "lecture" is class attendance in this
// product's language; exam adds proctoring; workshop is a lab/activity session.
const GROUPS = [
  { key: "lecture", title: "Attendance", hint: "Class attendance (lecture)", icon: Users },
  { key: "exam", title: "Exam proctoring", hint: "Invigilated exams", icon: ShieldAlert },
  { key: "workshop", title: "Workshop", hint: "Workshop / lab sessions", icon: Wrench },
] as const;

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
  return `${day} · ${time}`;
}

function SessionsPage() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessionsLive()
      .then((r) => setRows(r))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  // Anything with an unrecognised mode falls under Attendance so it never hides.
  const known = new Set(GROUPS.map((g) => g.key));
  const groupOf = (mode: string) => (known.has(mode as never) ? mode : "lecture");

  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
          § sessions
        </div>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
          Session history
        </h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Grouped by what the session was — attendance, exam, or workshop — newest first, with the
          distinct headcount marked present.
        </p>
      </header>

      {loading ? (
        <div className="glass-panel px-4 py-16 text-center font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
          Loading sessions…
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-panel flex flex-col items-center gap-3 px-4 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-[color:var(--muted)]" />
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            No sessions yet
          </div>
          <div className="max-w-sm text-sm text-[color:var(--muted)]">
            Start a session from <span className="text-[color:var(--ink)]">New Session</span>; it will
            appear here the moment the capture kiosk creates it.
          </div>
        </div>
      ) : (
        GROUPS.map((g) => {
          const groupRows = rows.filter((r) => groupOf(r.mode) === g.key);
          if (groupRows.length === 0) return null;
          const Icon = g.icon;
          return (
            <section key={g.key} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 text-[color:var(--primary)]" />
                <h3 className="font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
                  {g.title}
                </h3>
                <span className="rounded-full bg-[color:var(--surface-2)] px-2 py-0.5 font-mono-nums text-[10px] text-[color:var(--muted)]">
                  {groupRows.length}
                </span>
                <span className="font-mono-nums text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
                  {g.hint}
                </span>
              </div>
              <div className="glass-panel overflow-hidden">
                <div className="overflow-x-auto">
                  <SessionTable rows={groupRows} />
                </div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function SessionTable({ rows }: { rows: SessionRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[color:var(--line)]/60 text-left font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
          <th className="px-4 py-3 font-normal">When</th>
          <th className="px-4 py-3 font-normal">Session</th>
          <th className="px-4 py-3 font-normal">Cohort</th>
          <th className="px-4 py-3 font-normal">Present</th>
          <th className="px-4 py-3 font-normal">Status</th>
          <th className="px-4 py-3 font-normal"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="border-t border-[color:var(--line)]/50 transition-colors hover:bg-[color:var(--surface-2)]/60"
          >
            <td className="px-4 py-3 font-mono-nums text-xs text-[color:var(--muted)]">
              {fmtWhen(r.starts_at)}
            </td>
            <td className="px-4 py-3 text-[color:var(--ink)]">{r.subject}</td>
            <td className="px-4 py-3 font-mono-nums text-xs">{r.class_section}</td>
            <td className="px-4 py-3 font-mono-nums tabular-nums text-[color:var(--ink)]">
              {r.present}
            </td>
            <td className="px-4 py-3">
              <span
                className={`inline-flex items-center gap-1.5 font-mono-nums text-[11px] ${
                  r.ends_at ? "text-[color:var(--muted)]" : "text-[color:var(--ok)]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    r.ends_at ? "bg-[color:var(--muted)]" : "bg-[color:var(--ok)]"
                  }`}
                />
                {r.ends_at ? "Ended" : "Live"}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <button className="sp-btn sp-btn-ghost h-8 text-xs">
                <Download className="h-3.5 w-3.5" /> PDF
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
