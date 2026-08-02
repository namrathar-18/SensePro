import type { ReactNode } from "react";
import { CountUp } from "./CountUp";
import { cn } from "@/lib/utils";
import { SpotlightCard } from "@/components/fx";

type Accent = "primary" | "accent" | "ok" | "warn" | "bad" | "muted";

const accentVar: Record<Accent, string> = {
  primary: "var(--primary)",
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  muted: "var(--muted)",
};

export function KpiCard({
  label,
  value,
  suffix,
  hint,
  icon,
  accent = "primary",
  className,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  icon?: ReactNode;
  accent?: Accent;
  className?: string;
}) {
  const color = accentVar[accent];

  return (
    <SpotlightCard
      className={cn(
        // Fixed min-height keeps a row of cards aligned even when one has no
        // suffix or hint — previously justify-between spread them differently.
        "glass-frosted glass-hover relative flex min-h-[124px] flex-col overflow-hidden rounded-xl p-5",
        className,
      )}
      spotlightColor={`color-mix(in oklab, ${color} 15%, transparent)`}
    >
      {/* Label row: a small accent dot carries the colour, replacing the glowing
          left rule + top gradient line, which read as stray artefacts. */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="flex-1 truncate font-mono-nums text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted)]">
          {label}
        </span>
        {icon ? <span className="shrink-0 text-[color:var(--muted)]">{icon}</span> : null}
      </div>

      {/* Value sits on its own baseline so every card's number lines up. */}
      <div className="mt-auto flex items-baseline gap-1.5 pt-4">
        <CountUp
          value={value}
          className="font-display text-[32px] font-extrabold leading-none tracking-tight text-[color:var(--ink)]"
        />
        {suffix ? (
          <span className="font-mono-nums text-[14px] leading-none text-[color:var(--muted)]">
            {suffix}
          </span>
        ) : null}
      </div>

      {hint ? (
        <div className="mt-2 truncate font-mono-nums text-[11px] leading-none text-[color:var(--muted)]">
          {hint}
        </div>
      ) : null}
    </SpotlightCard>
  );
}
