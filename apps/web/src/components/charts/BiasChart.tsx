import { useState } from "react";
import type { ZoneAggregate } from "@/lib/data/types";

/** Naive mean vs VNEI, grouped bars per classroom zone.
 *  Series palette validated (dataviz six-checks, dark surface #0E0E12):
 *  naive = #F59E0B, VNEI = #10B981. Warm-cold contrast ensures
 *  identity is reinforced with a legend, direct labels and bar gaps —
 *  never color alone. Values are ink-colored text, one axis, 0–100%. */

const SERIES = [
  { key: "naive_mean" as const, label: "Naive mean", color: "var(--primary)" },
  { key: "vnei" as const, label: "VNEI", color: "var(--accent)" },
];

const VW = 460;
const VH = 210;
const PAD = { top: 26, right: 12, bottom: 28, left: 36 };
const PLOT_W = VW - PAD.left - PAD.right;
const PLOT_H = VH - PAD.top - PAD.bottom;
const BAR_W = 34;
const BAR_GAP = 2;
const CAP_R = 4;

function topRoundedBar(x: number, y: number, w: number, h: number): string {
  if (h <= CAP_R) return `M${x},${y + h} h${w} v${-h} h${-w} Z`;
  return [
    `M${x},${y + h}`,
    `v${-(h - CAP_R)}`,
    `q0,${-CAP_R} ${CAP_R},${-CAP_R}`,
    `h${w - CAP_R * 2}`,
    `q${CAP_R},0 ${CAP_R},${CAP_R}`,
    `v${h - CAP_R}`,
    "Z",
  ].join(" ");
}

export function BiasChart({ zones }: { zones: ZoneAggregate[] }) {
  const [hover, setHover] = useState<{ zi: number; si: number } | null>(null);

  const groupW = PLOT_W / zones.length;
  const y = (v: number) => PAD.top + PLOT_H * (1 - v);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[12.5px] text-[color:var(--muted)]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        role="img"
        aria-label="Engagement by zone: naive mean versus visibility-normalised index"
        className="w-full"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={VW - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--line-strong)"
              strokeWidth={t === 0 ? 1.25 : 0.75}
              strokeDasharray={t === 0 ? undefined : "3 4"}
            />
            <text
              x={PAD.left - 7}
              y={y(t) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="var(--muted)"
              fontFamily="'IBM Plex Mono', monospace"
            >
              {Math.round(t * 100)}
            </text>
          </g>
        ))}

        {zones.map((z, zi) => {
          const cx = PAD.left + groupW * zi + groupW / 2;
          const groupLeft = cx - BAR_W - BAR_GAP / 2;
          return (
            <g key={z.zone}>
              {SERIES.map((s, si) => {
                const v = z[s.key];
                const bx = groupLeft + si * (BAR_W + BAR_GAP);
                const by = y(v);
                const bh = PAD.top + PLOT_H - by;
                const isHover = hover?.zi === zi && hover?.si === si;
                const isDim = hover !== null && !isHover;
                return (
                  <g
                    key={s.key}
                    tabIndex={0}
                    role="img"
                    aria-label={`${z.zone} zone, ${s.label}: ${Math.round(v * 100)} percent, ${z.n_visible} visible`}
                    onMouseEnter={() => setHover({ zi, si })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ zi, si })}
                    onBlur={() => setHover(null)}
                    className="chart-bar"
                  >
                    <rect
                      className="chart-bar__focus"
                      x={bx - 4}
                      y={PAD.top}
                      width={BAR_W + 8}
                      height={PLOT_H}
                      rx={4}
                      fill="transparent"
                    />
                    <path
                      d={topRoundedBar(bx, by, BAR_W, bh)}
                      fill={s.color}
                      opacity={isDim ? 0.45 : 1}
                    />
                    <text
                      x={bx + BAR_W / 2}
                      y={by - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={isHover ? 600 : 500}
                      fill={isHover ? "var(--ink)" : "var(--muted)"}
                      fontFamily="'IBM Plex Mono', monospace"
                    >
                      {Math.round(z[s.key] * 100)}%
                    </text>
                  </g>
                );
              })}
              <text
                x={cx}
                y={VH - 9}
                textAnchor="middle"
                fontSize={11}
                fill="var(--muted)"
                fontFamily="'IBM Plex Mono', monospace"
                style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                {z.zone}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="mt-1 min-h-5 font-mono-nums text-[11.5px] text-[color:var(--muted)]" aria-live="polite">
        {hover
          ? `${zones[hover.zi].zone} · ${SERIES[hover.si].label}: ${Math.round(
              zones[hover.zi][SERIES[hover.si].key] * 100,
            )}% · n=${zones[hover.zi].n_visible}`
          : "hover or tab across the bars for exact values"}
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer font-mono-nums text-[11px] uppercase tracking-wider text-[color:var(--muted)] select-none">
          View as table
        </summary>
        <table className="mt-2 w-full max-w-sm text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-[color:var(--line)] font-mono-nums text-[10.5px] uppercase tracking-wider text-[color:var(--muted)]">
              <th scope="col" className="py-1.5 pr-3 font-medium">Zone</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Naive mean</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">VNEI</th>
              <th scope="col" className="py-1.5 font-medium">n visible</th>
            </tr>
          </thead>
          <tbody className="font-mono-nums text-[color:var(--ink)]">
            {zones.map((z) => (
              <tr key={z.zone} className="border-b border-[color:var(--line)]/50 last:border-0">
                <td className="py-1.5 pr-3 uppercase">{z.zone}</td>
                <td className="py-1.5 pr-3">{Math.round(z.naive_mean * 100)}%</td>
                <td className="py-1.5 pr-3">{Math.round(z.vnei * 100)}%</td>
                <td className="py-1.5">{z.n_visible}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
