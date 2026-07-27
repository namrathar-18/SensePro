/**
 * MagneticHover — Wrapper that makes children subtly follow the cursor.
 * Creates a magnetic "pull" effect within a bounding area.
 */
import { useRef, useState, useCallback, memo, type ReactNode } from "react";

interface MagneticHoverProps {
  children: ReactNode;
  className?: string;
  /** Maximum displacement in px. Default: 6 */
  strength?: number;
}

function MagneticHoverRaw({ children, className = "", strength = 6 }: MagneticHoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("translate3d(0,0,0)");

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = ((e.clientX - cx) / (rect.width / 2)) * strength;
      const dy = ((e.clientY - cy) / (rect.height / 2)) * strength;
      setTransform(`translate3d(${dx}px,${dy}px,0)`);
    },
    [strength],
  );

  const handleLeave = useCallback(() => {
    setTransform("translate3d(0,0,0)");
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={className}
      style={{ transform, transition: "transform 0.25s cubic-bezier(0.33, 1, 0.68, 1)" }}
    >
      {children}
    </div>
  );
}

export const MagneticHover = memo(MagneticHoverRaw);
