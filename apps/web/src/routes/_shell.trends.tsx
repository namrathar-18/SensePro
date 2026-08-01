import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, AreaChart, Area,
} from "recharts";
import { fetchManagementSessions, type MgmtSession } from "@/lib/data/live";

export const Route = createFileRoute("/_shell/trends")({
  head: () => ({
    meta: [
      { title: "Trends · SensePro+" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrendsPage,
});

const tooltipStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  fontFamily: "IBM Plex Mono",
  fontSize: 12,
} as const;

function TrendsPage() {
  const [sessions, setSessions] = useState<MgmtSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchManagementSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  // Real per-session points, oldest -> newest. VNEI only where an aggregate
  // exists (k-floor); nulls leave a gap rather than inventing a value.
  const days = useMemo(
    () =>
      sessions.map((s) => ({
        d: s.label,
        attendance: s.attendance,
        vnei: s.vnei,
      })),
    [sessions],
  );
  const hasVnei = days.some((p) => p.vnei != null);

  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono-nums text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
          § across sessions
        </div>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
          Aggregate trends
        </h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Class-level attendance and VNEI across every recorded session. Never per student, never emotion.
        </p>
      </header>

      {loading ? (
        <div className="glass-panel px-4 py-16 text-center font-mono-nums text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
          Loading sessions…
        </div>
      ) : days.length === 0 ? (
        <div className="glass-panel px-4 py-16 text-center">
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
            No sessions recorded yet
          </div>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Run a session and the real attendance / engagement trend appears here.
          </p>
        </div>
      ) : (
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="VNEI (class weighted)" color="var(--primary)">
          {hasVnei ? (
            <ResponsiveContainer>
              <LineChart data={days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="d" stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
                <YAxis stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} domain={[0, 1]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="vnei" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--primary)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center font-mono-nums text-[11px] leading-relaxed text-[color:var(--muted)]">
              No VNEI recorded yet — zone engagement is withheld until a zone has at least 5 tracked
              faces (privacy floor).
            </div>
          )}
        </ChartCard>

        <ChartCard title="Attendance rate" color="var(--ok)">
          <ResponsiveContainer>
            <AreaChart data={days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ok)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--ok)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="d" stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
              <YAxis stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} domain={[0, 1]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${Math.round(v * 100)}%`, "attendance"]} />
              <Area dataKey="attendance" stroke="var(--ok)" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="glass-panel p-6">
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
            § notes
          </div>
          <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
            What "coverage" means
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--muted)]">
            Coverage is the fraction of enrolled, consented students the classroom camera can actually see during a
            session. When it drops below 70%, VNEI carries a caution badge — the model refuses to pretend it sees
            what it doesn't.
          </p>
        </div>
      </div>
      )}
    </div>
  );
}

function ChartCard({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">{title}</h3>
        <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      </div>
      <div className="h-56">{children}</div>
    </div>
  );
}
