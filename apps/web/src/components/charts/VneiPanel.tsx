import type { ZoneAggregateRow } from "@/lib/data/engagement";
import { latestWindow } from "@/lib/data/engagement";
import { cn } from "@/lib/utils";

function Badge({ tone, children }: { tone: "warn" | "muted" | "ok"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-wider",
        tone === "warn" && "border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 text-[color:var(--warn)]",
        tone === "muted" && "border-[color:var(--muted)]/40 bg-[color:var(--surface)] text-[color:var(--muted)]",
        tone === "ok" && "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]"
      )}
    >
      {children}
    </span>
  );
}

/** Live VNEI by zone with the honesty devices attached: every bar carries a
 *  coverage badge, coverage under 50% renders hatched LOW-CONFIDENCE, and a
 *  zone with no row in the window shows "suppressed (k<5)" — absence is the
 *  k-anonymity floor working, never a zero. Trend renders as one sparkline
 *  per zone (small multiples), so meaning never rides on series color. */

const ZONES: Array<"front" | "mid" | "back"> = ["front", "mid", "back"];

const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(45deg, transparent 0 6px, rgba(128,148,176,.25) 6px 8px)",
};

function ZoneBar({ row }: { row: ZoneAggregateRow | undefined }) {
  if (!row) {
    return (
      <div
        className="grid h-9 place-items-center rounded-lg bg-surface-2"
        style={HATCH}
        role="img"
        aria-label="suppressed: fewer than 5 tracked faces"
      >
        <span className="font-mono text-[10.5px] tracking-wider text-muted uppercase">
          suppressed (k&lt;5)
        </span>
      </div>
    );
  }
  const lowConfidence = row.coverage < 0.5;
  const pct = Math.round(row.vnei * 100);
  return (
    <div>
      <div
        className="relative h-9 overflow-hidden rounded-lg bg-surface-2"
        role="img"
        aria-label={`VNEI ${pct} percent, coverage ${Math.round(row.coverage * 100)} percent, ${row.n_tracked} tracked`}
      >
        <div
          className="grid h-full place-items-end rounded-lg bg-primary"
          style={{ width: `${Math.max(pct, 8)}%`, ...(lowConfidence ? HATCH : {}) }}
        />
        <span className="absolute inset-y-0 left-3 grid place-items-center font-mono text-[12px] font-medium text-white">
          {pct}%
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={lowConfidence ? "warn" : "muted"}>
          coverage {Math.round(row.coverage * 100)}% · {row.n_tracked}/{row.enrolled_in_zone}
        </Badge>
        {lowConfidence ? <Badge tone="warn">LOW CONFIDENCE</Badge> : null}
      </div>
    </div>
  );
}

function Sparkline({ zone, rows }: { zone: string; rows: ZoneAggregateRow[] }) {
  const W = 200;
  const H = 36;
  if (rows.length < 2) {
    return (
      <p className="font-mono text-[11px] text-muted">
        trend appears after two or more windows
      </p>
    );
  }
  const step = W / (rows.length - 1);
  const points = rows.map((r, i) => `${i * step},${H - r.vnei * (H - 4) - 2}`).join(" ");
  const last = rows[rows.length - 1];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-9 w-full"
      role="img"
      aria-label={`${zone} VNEI trend across ${rows.length} windows, latest ${Math.round(last.vnei * 100)} percent`}
    >
      <polyline points={points} fill="none" stroke="#3B82F6" strokeWidth={2} />
      <circle
        cx={(rows.length - 1) * step}
        cy={H - last.vnei * (H - 4) - 2}
        r={2.5}
        fill="#3B82F6"
      />
    </svg>
  );
}

export function VneiPanel({ rows }: { rows: ZoneAggregateRow[] }) {
  const { windowStart, byZone } = latestWindow(rows);
  return (
    <div>
      <p className="mb-3 font-mono text-[11.5px] text-muted">
        {windowStart
          ? `latest window · ${new Date(windowStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "no windows recorded yet"}
      </p>
      <div className="flex flex-col gap-4">
        {ZONES.map((zone) => (
          <div key={zone} className="grid items-center gap-3 sm:grid-cols-[64px_1fr_200px]">
            <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
              {zone}
            </span>
            <ZoneBar row={byZone.get(zone)} />
            <Sparkline zone={zone} rows={rows.filter((r) => r.zone === zone)} />
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11.5px] text-muted">
        VNEI normalises by who the camera actually saw; coverage declares how much that was.
        Suppressed windows are withheld, never estimated.
      </p>
    </div>
  );
}
