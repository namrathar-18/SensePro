import type { AttendanceState } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const styles: Record<AttendanceState, string> = {
  PRESENT: "text-[color:var(--ok)] border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10",
  UNVERIFIED: "text-[color:var(--warn)] border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10",
  ABSENT: "text-[color:var(--muted)] border-[color:var(--line)] bg-[color:var(--surface-2)]/60",
};

export function StateChip({
  state,
  className,
  size = "md",
}: {
  state: AttendanceState;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-mono-nums uppercase tracking-wider",
        "shadow-sm transition-colors",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-[11px]",
        styles[state],
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: "currentColor", boxShadow: "0 0 6px 0 currentColor" }}
      />
      {state}
    </span>
  );
}
