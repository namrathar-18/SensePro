/**
 * GlowBorder — Animated border glow that pulses or follows focus.
 * Wraps children in a container with a traveling gradient border.
 */
import { memo, type ReactNode } from "react";

interface GlowBorderProps {
  children: ReactNode;
  className?: string;
  /** Glow color. Default: primary blue. */
  color?: string;
  /** Animation duration in seconds. Default: 3 */
  duration?: number;
  /** Border radius. Default: 12px */
  radius?: string;
  /** Border width. Default: 1px */
  borderWidth?: string;
}

function GlowBorderRaw({
  children,
  className = "",
  color = "var(--primary, #F59E0B)",
  duration = 3,
  radius = "12px",
  borderWidth = "1px",
}: GlowBorderProps) {
  return (
    <div className={`relative ${className}`} style={{ borderRadius: radius }}>
      {/* Animated border */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ borderRadius: radius, padding: borderWidth }}
      >
        <div
          className="absolute inset-[-200%] animate-[glow-spin_var(--dur)_linear_infinite]"
          style={{
            "--dur": `${duration}s`,
            background: `conic-gradient(from 0deg, transparent 0%, ${color} 10%, transparent 20%)`,
          } as React.CSSProperties}
        />
        <div
          className="absolute inset-[1px] rounded-[inherit]"
          style={{
            borderRadius: `calc(${radius} - ${borderWidth})`,
            background: "var(--surface, #0f172a)",
          }}
        />
      </div>
      {/* Content */}
      <div className="relative z-10">{children}</div>
      <style>{`
        @keyframes glow-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export const GlowBorder = memo(GlowBorderRaw);
