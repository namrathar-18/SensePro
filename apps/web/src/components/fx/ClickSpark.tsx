/**
 * ClickSpark — Burst of particles at click location.
 * Wraps children; on any click inside, spawns radial sparks.
 */
import { useRef, useCallback, memo, type ReactNode } from "react";

interface ClickSparkProps {
  children: ReactNode;
  /** Spark color. Default: amber primary */
  sparkColor?: string;
  /** Number of sparks per click. Default: 8 */
  sparkCount?: number;
  /** Radius in px. Default: 20 */
  sparkRadius?: number;
  /** Duration in ms. Default: 400 */
  duration?: number;
}

function ClickSparkRaw({
  children,
  sparkColor = "#F59E0B",
  sparkCount = 8,
  sparkRadius = 20,
  duration = 400,
}: ClickSparkProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = ref.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (let i = 0; i < sparkCount; i++) {
        const spark = document.createElement("div");
        const angle = (2 * Math.PI * i) / sparkCount;
        const tx = Math.cos(angle) * sparkRadius;
        const ty = Math.sin(angle) * sparkRadius;

        Object.assign(spark.style, {
          position: "absolute",
          left: `${x}px`,
          top: `${y}px`,
          width: "3px",
          height: "3px",
          borderRadius: "50%",
          backgroundColor: sparkColor,
          boxShadow: `0 0 6px ${sparkColor}`,
          pointerEvents: "none",
          zIndex: "9999",
          transform: "translate(-50%, -50%) scale(1)",
          transition: `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration}ms ease-out`,
        });

        container.appendChild(spark);

        // Force reflow
        spark.getBoundingClientRect();

        spark.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`;
        spark.style.opacity = "0";

        setTimeout(() => spark.remove(), duration);
      }
    },
    [sparkColor, sparkCount, sparkRadius, duration],
  );

  return (
    <div ref={ref} onClick={handleClick} className="relative" style={{ position: "relative" }}>
      {children}
    </div>
  );
}

export const ClickSpark = memo(ClickSparkRaw);
