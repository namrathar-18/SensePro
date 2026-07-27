import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_shell/sessions")({
  head: () => ({
    meta: [
      { title: "Sessions · SensePro+" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionsPage,
});

const ROWS = [
  { d: "Today · 10:00", t: "Data Structures", c: "24MCA-A", p: 42, r: 40, m: "attendance" },
  { d: "Today · 08:30", t: "Discrete Math", c: "24MCA-B", p: 38, r: 36, m: "attendance" },
  { d: "Wed · 14:00", t: "OS Midterm", c: "24MCA-A", p: 42, r: 41, m: "exam_proctor" },
  { d: "Wed · 10:00", t: "DBMS Lab", c: "24MCA-B", p: 38, r: 34, m: "attendance" },
  { d: "Tue · 09:00", t: "AI Fundamentals", c: "24MCA-A", p: 42, r: 39, m: "attendance" },
  { d: "Mon · 11:00", t: "Compiler Design", c: "24MCA-A", p: 42, r: 38, m: "attendance" },
  { d: "Mon · 09:00", t: "Machine Learning", c: "24MCA-B", p: 38, r: 35, m: "attendance" },
];

function SessionsPage() {
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
          Every session ships as a one-click PDF with roster, presence intervals, and coverage.
        </p>
      </header>

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--line)]/60 text-left font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
              <th className="px-4 py-3 font-normal">When</th>
              <th className="px-4 py-3 font-normal">Session</th>
              <th className="px-4 py-3 font-normal">Cohort</th>
              <th className="px-4 py-3 font-normal">Mode</th>
              <th className="px-4 py-3 font-normal">Present</th>
              <th className="px-4 py-3 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i} className="border-t border-[color:var(--line)]/50 transition-colors hover:bg-[color:var(--surface-2)]/60">
                <td className="px-4 py-3 font-mono-nums text-xs text-[color:var(--muted)]">{r.d}</td>
                <td className="px-4 py-3 text-[color:var(--ink)]">{r.t}</td>
                <td className="px-4 py-3 font-mono-nums text-xs">{r.c}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-[0.16em] ${
                    r.m === "exam_proctor"
                      ? "border-[color:var(--warn)]/30 bg-[color:var(--warn)]/10 text-[color:var(--warn)]"
                      : "border-[color:var(--primary)]/30 bg-[color:var(--primary)]/10 text-[color:var(--primary)]"
                  }`}>
                    {r.m.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono-nums tabular-nums text-[color:var(--ink)]">{r.r}/{r.p}</td>
                <td className="px-4 py-3 text-right">
                  <button className="sp-btn sp-btn-ghost h-8 text-xs">
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
