import { createFileRoute } from "@tanstack/react-router";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, AreaChart, Area,
} from "recharts";

export const Route = createFileRoute("/_shell/trends")({
  head: () => ({
    meta: [
      { title: "Trends · SensePro+" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrendsPage,
});

const days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return {
    d: `${d.getDate()}/${d.getMonth() + 1}`,
    vnei: 0.62 + Math.sin(i / 2) * 0.08 + i * 0.008,
    attendance: 0.85 + Math.cos(i / 3) * 0.05,
    coverage: 0.72 + Math.sin(i / 4) * 0.1,
  };
});

const tooltipStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  fontFamily: "IBM Plex Mono",
  fontSize: 12,
} as const;

function TrendsPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
          § 14 days
        </div>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
          Aggregate trends
        </h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Class-level attendance, VNEI, and camera coverage over the last two weeks. Never per student, never emotion.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="VNEI (class weighted)" color="var(--primary)">
          <ResponsiveContainer>
            <LineChart data={days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="d" stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
              <YAxis stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} domain={[0.4, 0.9]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="vnei" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--primary)" }} />
            </LineChart>
          </ResponsiveContainer>
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
              <YAxis stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} domain={[0.7, 1]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area dataKey="attendance" stroke="var(--ok)" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Camera coverage" color="var(--accent)">
          <ResponsiveContainer>
            <LineChart data={days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="d" stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
              <YAxis stroke="var(--muted)" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} domain={[0.5, 1]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="coverage" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent)" }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="glass-panel p-6">
          <div className="font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
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
