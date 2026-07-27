/**
 * SpotlightCard — Glass card with mouse-tracking radial glow.
 * The spotlight follows the cursor, creating a premium interactive feel.
 */
import { useRef, useState, useCallback, memo, type ReactNode } from "react";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** Spotlight color. Default: primary accent. */
  spotlightColor?: string;
  /** Spotlight size in px. Default: 300. */
  spotlightSize?: number;
}

function SpotlightCardRaw({
  children,
  className = "",
  spotlightColor = "var(--primary-glow)",
  spotlightSize = 300,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -1000, y: -1000 });
  const [opacity, setOpacity] = useState(0);

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleEnter = useCallback(() => setOpacity(1), []);
  const handleLeave = useCallback(() => setOpacity(0), []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`relative overflow-hidden ${className}`}
    >
      {/* Spotlight layer */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-500"
        style={{
          opacity,
          background: `radial-gradient(${spotlightSize}px circle at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export const SpotlightCard = memo(SpotlightCardRaw);
