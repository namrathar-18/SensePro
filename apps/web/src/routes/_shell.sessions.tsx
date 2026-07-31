import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, ClipboardList, Users, ShieldAlert, Wrench } from "lucide-react";
import { fetchSessionsLive, type SessionRow } from "@/lib/data/live";
import { fetchStudents, fetchIntervals, deriveRoster } from "@/lib/data/roster";
import { exportSessionPdf } from "@/lib/data/report";
import { toast } from "sonner";

export const Route = createFileRoute("/_shell/sessions")({
  head: () => ({
    meta: [
      { title: "Sessions · SensePro+" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionsPage,
});

// Three separate tabs. "lecture" is class attendance in this product's language;
// exam adds proctoring; workshop is a lab/activity session.
const TABS = [
  { key: "lecture", title: "Attendance", hint: "Class attendance (lecture)", icon: Users },
  { key: "exam", title: "Exam proctoring", hint: "Invigilated exams", icon: ShieldAlert },
  { key: "workshop", title: "Workshop", hint: "Workshop / lab sessions", icon: Wrench },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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

async function exportSession(r: SessionRow) {
  try {
    const [students, intervals] = await Promise.all([fetchStudents(), fetchIntervals(r.id)]);
    const roster = deriveRoster(students, intervals);
    if (roster.length === 0) {
      toast.error("No roster data for this session yet");
      return;
    }
    await exportSessionPdf({ section: r.class_section, subject: r.subject, roster: roster as never });
    toast.success("Report downloaded");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not generate the PDF");
  }
}

function SessionsPage() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("lecture");

  useEffect(() => {
    fetchSessionsLive()
      .then((r) => setRows(r))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  // Unknown modes fall under Attendance so nothing hides.
  const known = new Set(TABS.map((t) => t.key));
  const groupOf = (mode: string): TabKey => (known.has(mode as never) ? (mode as TabKey) : "lecture");
  const countFor = (k: TabKey) => rows.filter((r) => groupOf(r.mode) === k).length;

  const tabRows = useMemo(() => rows.filter((r) => groupOf(r.mode) === tab), [rows, tab]);
  const active = TABS.find((t) => t.key === tab)!;

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
          Separate sections for attendance, exam proctoring, and workshops. Each session exports as a
          one-click PDF report.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const activeTab = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={activeTab}
              className={`sp-focus flex h-11 items-center gap-2 rounded-md border px-4 font-mono-nums text-xs uppercase tracking-wider transition-colors ${
                activeTab
                  ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                  : "border-[color:var(--line)] bg-[color:var(--surface-2)] text-[color:var(--muted)] hover:text-[color:var(--ink)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.title}
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${activeTab ? "bg-white/20" : "bg-[color:var(--surface)]"}`}>
                {countFor(t.key)}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="glass-panel px-4 py-16 text-center font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
          Loading sessions…
        </div>
      ) : tabRows.length === 0 ? (
        <div className="glass-panel flex flex-col items-center gap-3 px-4 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-[color:var(--muted)]" />
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            No {active.title.toLowerCase()} sessions yet
          </div>
          <div className="max-w-sm text-sm text-[color:var(--muted)]">
            Start a {tab === "lecture" ? "lecture" : tab} session from{" "}
            <span className="text-[color:var(--ink)]">New Session</span>; it appears here the moment
            the capture kiosk creates it.
          </div>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <SessionTable rows={tabRows} />
          </div>
        </div>
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
              <button onClick={() => exportSession(r)} className="sp-btn sp-btn-ghost h-8 text-xs">
                <Download className="h-3.5 w-3.5" /> PDF
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
