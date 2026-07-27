import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import { mockSessions, mockVneiTrend, mockZones } from "@/lib/data/mock";
import { ZoneStrip } from "@/components/charts/ZoneStrip";
import { cn } from "@/lib/utils";
import type { ZoneAggregate } from "@/lib/data/types";
import { fetchActiveSession } from "@/lib/data/roster";
import type { ActiveSession } from "@/lib/data/roster";
import { fetchZoneAggregates } from "@/lib/data/engagement";
import type { ZoneAggregateRow } from "@/lib/data/engagement";
import { VneiPanel } from "@/components/charts/VneiPanel";
import { WifiOff, GaugeCircle } from "lucide-react";

export const Route = createFileRoute("/_shell/management")({
  head: () => ({
    meta: [{ title: "Management · SensePro+" }],
  }),
  component: ManagementPage,
});

function ManagementPage() {
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [rows, setRows] = useState<ZoneAggregateRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const active = await fetchActiveSession();
      setSession(active);
      setRows(active ? await fetchZoneAggregates(active.id) : []);
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const trend = useMemo(() => mockVneiTrend(), []);
  const zones = useMemo(() => mockZones(), []);
  const biasZones: ZoneAggregate[] = useMemo(() => zones.map((z) => ({
    ...z,
    naive_mean: z.naive_mean ?? z.vnei * (0.9 + Math.random() * 0.2),
    n_visible: z.n_visible ?? z.n_tracked,
    suppressed: z.n_tracked < 5,
  })), [zones]);
  const sessions = useMemo(() => mockSessions(), []);
  const [compareA, setCompareA] = useState(sessions[0]?.id ?? "");
  const [compareB, setCompareB] = useState(sessions[1]?.id ?? "");

  return (
    <div className="space-y-8">
      {/* VNEI trend */}
      <section className="glass-panel p-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Class engagement · VNEI
            </div>
            <div className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
              Trend across sessions
            </div>
          </div>
          <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">
            Aggregate only · no per-student scoring
          </div>
        </header>
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="vneiG" x1="0" x2="1">
                  <stop offset="0%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#10B981" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
              <XAxis dataKey="session" stroke="#6B6B78" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
              <YAxis domain={[0, 1]} stroke="#6B6B78" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#151519",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                  fontFamily: "IBM Plex Mono",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#6B6B78" }}
              />
              <Line
                type="monotone"
                dataKey="vnei"
                stroke="url(#vneiG)"
                strokeWidth={2.5}
                dot={{ fill: "#F59E0B", r: 3 }}
                activeDot={{ r: 5, fill: "#10B981" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Live VNEI by zone */}
      <section className="glass-panel p-6">
        <header>
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Engagement fairness · Live data
          </div>
          <div className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
            VNEI by zone
          </div>
          <div className="mt-1 font-mono-nums text-[11px] text-[color:var(--muted)]">
            Live from engagement_zone_aggregates. Every number declares its coverage; missing evidence is withheld.
          </div>
        </header>
        <div className="mt-4">
          {load === "loading" ? (
            <p className="py-8 text-center font-mono text-[12.5px] text-[color:var(--muted)]">
              loading aggregates…
            </p>
          ) : load === "error" ? (
            <div className="flex flex-col items-center justify-center py-12 text-[color:var(--muted)]">
              <WifiOff className="mb-4 h-8 w-8 opacity-50" />
              <div className="font-display text-lg font-medium text-[color:var(--ink)]">Could not load engagement data</div>
              <p className="mt-1 text-sm">Check your connection and role, then refresh.</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[color:var(--muted)]">
              <GaugeCircle className="mb-4 h-8 w-8 opacity-50" />
              <div className="font-display text-lg font-medium text-[color:var(--ink)]">{session ? "No windows recorded yet" : "No live session"}</div>
              <p className="mt-1 text-sm">Zone aggregates appear once a session runs with at least 5 tracked faces in a zone.</p>
            </div>
          ) : (
            <VneiPanel rows={rows} />
          )}
        </div>
      </section>

      {/* ZoneStrip — camera coverage distribution */}
      <section className="glass-panel p-6">
        <header>
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Camera coverage
          </div>
          <div className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
            Visible students by zone
          </div>
        </header>
        <div className="mt-4">
          <ZoneStrip zones={biasZones} />
        </div>
      </section>

      {/* Zones */}
      <section className="glass-panel p-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Room zones
            </div>
            <div className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
              Zone engagement + coverage
            </div>
          </div>
          <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">
            Aggregate per zone · no student identifiers on this view
          </div>
        </header>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)]/40 px-4 py-2.5">
          <div className="font-mono-nums text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Coverage legend
          </div>
          <LegendSwatch tone="ok" label="≥ 70% · reportable" />
          <LegendSwatch tone="warn" label="50–69% · caution" />
          <LegendSwatch tone="lowconf" label="< 50% · low-confidence (hatched)" />
          <LegendSwatch tone="suppressed" label="k < 5 tracked · suppressed" />
          <div className="ml-auto font-mono-nums text-[10px] text-[color:var(--muted)]">
            coverage = tracked ÷ enrolled in zone
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {zones.map((z) => {
            const suppressed = z.n_tracked < 5;
            const lowConf = !suppressed && z.coverage < 0.5;
            const pct = Math.round(z.vnei * 100);
            return (
              <div
                key={z.zone}
                aria-label={
                  suppressed
                    ? `Zone ${z.zone} suppressed, fewer than 5 tracked`
                    : lowConf
                      ? `Zone ${z.zone} low confidence, coverage ${Math.round(z.coverage * 100)} percent`
                      : `Zone ${z.zone} VNEI ${pct} of 100`
                }
                className={cn(
                  "relative overflow-hidden rounded-lg border p-5",
                  suppressed
                    ? "border-dashed border-[color:var(--muted)]/50 bg-[color:var(--surface-2)]/30"
                    : lowConf
                      ? "border-[color:var(--warn)]/50 bg-[color:var(--surface-2)]/40"
                      : "border-[color:var(--line)] bg-[color:var(--surface-2)]/60",
                )}
                style={
                  lowConf
                    ? {
                        backgroundImage:
                          "repeating-linear-gradient(45deg, transparent 0 8px, color-mix(in oklab, var(--warn) 22%, transparent) 8px 10px)",
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono-nums text-[11px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                    Zone · {z.zone}
                  </div>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-wider",
                      suppressed
                        ? "border-[color:var(--muted)]/40 bg-[color:var(--surface)] text-[color:var(--muted)]"
                        : z.coverage >= 0.7
                          ? "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]"
                          : z.coverage >= 0.5
                            ? "border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 text-[color:var(--warn)]"
                            : "border-[color:var(--warn)]/50 bg-[color:var(--warn)]/15 text-[color:var(--warn)]",
                    )}
                  >
                    coverage {Math.round(z.coverage * 100)}%
                  </span>
                </div>

                {suppressed ? (
                  <div className="mt-4 flex h-[112px] flex-col items-center justify-center rounded-md border border-dashed border-[color:var(--muted)]/50 bg-[color:var(--surface)]/40 text-center">
                    <div className="font-mono-nums text-[10px] uppercase tracking-[0.24em] text-[color:var(--muted)]">
                      suppressed
                    </div>
                    <div className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[color:var(--muted)]">
                      k &lt; 5
                    </div>
                    <div className="mt-1 font-mono-nums text-[10px] text-[color:var(--muted)]">
                      too few tracked to report
                    </div>
                  </div>
                ) : lowConf ? (
                  <div className="mt-4">
                    <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--warn)]">
                      low-confidence
                    </div>
                    <div className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[color:var(--muted)]">
                      —
                    </div>
                    <div className="mt-1 font-mono-nums text-[11px] text-[color:var(--muted)]">
                      coverage {Math.round(z.coverage * 100)}% · number withheld until ≥ 50%
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="font-display text-5xl font-extrabold tracking-tight text-[color:var(--ink)]">
                      {pct}
                      <span className="ml-1 font-mono-nums text-lg text-[color:var(--muted)]">/100</span>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background:
                            "linear-gradient(90deg, var(--primary), var(--accent))",
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 font-mono-nums text-[11px] text-[color:var(--muted)]">
                  tracked · {z.n_tracked}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Session compare */}
      <section className="glass-panel p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Session compare
            </div>
            <div className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
              Side-by-side aggregates
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SessionPick value={compareA} onChange={setCompareA} sessions={sessions} />
            <span className="font-mono-nums text-xs text-[color:var(--muted)]">vs</span>
            <SessionPick value={compareB} onChange={setCompareB} sessions={sessions} />
          </div>
        </header>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[compareA, compareB].map((id, i) => {
            const s = sessions.find((x) => x.id === id);
            if (!s) return null;
            return (
              <div key={i} className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)]/60 p-5">
                <div className="font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
                  {s.id}
                </div>
                <div className="mt-1 font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
                  {s.class_name}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <MiniStat label="Present" value={`${s.present_count}/${s.total_count}`} />
                  <MiniStat label="Attendance" value={`${Math.round((s.present_count / s.total_count) * 100)}%`} />
                  <MiniStat label="VNEI" value={s.vnei.toFixed(2)} accent />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SessionPick({
  value, onChange, sessions,
}: {
  value: string; onChange: (v: string) => void; sessions: ReturnType<typeof mockSessions>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sp-focus h-12 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 font-mono-nums text-xs text-[color:var(--ink)] outline-none focus:border-[color:var(--primary)]"
    >
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.id} · {s.class_name}
        </option>
      ))}
    </select>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-2">
      <div className="font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
        {label}
      </div>
      <div className={cn("mt-1 font-display text-xl font-extrabold tracking-tight", accent ? "text-[color:var(--accent)]" : "text-[color:var(--ink)]")}>
        {value}
      </div>
    </div>
  );
}

function LegendSwatch({
  tone,
  label,
}: {
  tone: "ok" | "warn" | "lowconf" | "suppressed";
  label: string;
}) {
  const swatch =
    tone === "ok"
      ? "bg-[color:var(--ok)]/70 border-[color:var(--ok)]/50"
      : tone === "warn"
        ? "bg-[color:var(--warn)]/70 border-[color:var(--warn)]/50"
        : tone === "lowconf"
          ? "border-[color:var(--warn)]/50"
          : "border-dashed border-[color:var(--muted)]/60 bg-[color:var(--surface)]";
  const style =
    tone === "lowconf"
      ? {
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in oklab, var(--warn) 45%, transparent) 4px 6px)",
        }
      : undefined;
  return (
    <div className="flex items-center gap-2">
      <span className={cn("inline-block h-3.5 w-6 rounded-sm border", swatch)} style={style} />
      <span className="font-mono-nums text-[11px] text-[color:var(--muted)]">{label}</span>
    </div>
  );
}
