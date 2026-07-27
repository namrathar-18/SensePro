/**
 * ShimmerButton — CTA button with a traveling shimmer highlight.
 * Premium feel for primary actions.
 */
import { memo, type ReactNode, type ButtonHTMLAttributes } from "react";

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Shimmer color. Default: white/20%. */
  shimmerColor?: string;
  /** Base gradient from/to. */
  fromColor?: string;
  toColor?: string;
}

function ShimmerButtonRaw({
  children,
  className = "",
  shimmerColor = "rgba(255,255,255,0.2)",
  fromColor = "var(--primary-deep, #D97706)",
  toColor = "var(--primary, #F59E0B)",
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      className={`group relative inline-flex items-center justify-center overflow-hidden rounded-xl px-6 py-3 font-bold text-[#07070A] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_24px_rgba(245,158,11,0.35)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none ${className}`}
      style={{ background: `linear-gradient(135deg, ${fromColor}, ${toColor})` }}
      {...props}
    >
      {/* Shimmer sweep */}
      <span
        className="absolute inset-0 -translate-x-full animate-[shimmer-sweep_2.5s_ease-in-out_infinite]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${shimmerColor} 50%, transparent 100%)`,
        }}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      <style>{`
        @keyframes shimmer-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </button>
  );
}

export const ShimmerButton = memo(ShimmerButtonRaw);
