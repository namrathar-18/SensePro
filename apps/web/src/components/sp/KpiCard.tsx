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
        "glass-frosted glass-hover relative flex flex-col justify-between overflow-hidden rounded-xl px-5 py-4",
        className,
      )}
      spotlightColor={`color-mix(in oklab, ${color} 15%, transparent)`}
    >
      {/* left accent rule with soft glow */}
      <div
        aria-hidden
        className="absolute inset-y-3 left-0 w-[2px] rounded-r-full"
        style={{ background: color, opacity: 0.85, boxShadow: `0 0 12px 0 ${color}` }}
      />
      {/* subtle top-edge accent tint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          opacity: 0.35,
        }}
      />

      <div className="flex items-start justify-between">
        <div className="sp-eyebrow">{label}</div>
        {icon ? <div className="text-[color:var(--muted)]">{icon}</div> : null}
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <CountUp
          value={value}
          className="font-display text-[34px] font-extrabold leading-none tracking-tight text-[color:var(--ink)]"
        />
        {suffix ? (
          <span className="font-mono-nums text-[15px] text-[color:var(--muted)]">{suffix}</span>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-2 font-mono-nums text-[11px] leading-none tracking-wide text-[color:var(--muted)]">
          {hint}
        </div>
      ) : null}
    </SpotlightCard>
  );
}
