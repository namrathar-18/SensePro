/**
 * ParticleField — Canvas-based floating particle system.
 * Subtle, performant ambient background for dashboard shells.
 */
import { useEffect, useRef, memo } from "react";
import { useTheme } from "@/lib/theme";

interface ParticleFieldProps {
  className?: string;
  /** Number of particles. Default: 40 */
  count?: number;
  /** Particle color. Default: white */
  color?: string;
  /** Max opacity per particle (0–1). Default: 0.15 */
  maxOpacity?: number;
  /** Speed multiplier. Default: 0.3 */
  speed?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  o: number;
}

function ParticleFieldRaw({
  className = "",
  count: propCount,
  color: propColor,
  maxOpacity: propMaxOpacity,
  speed = 0.3,
}: ParticleFieldProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Theme-aware defaults
  const count = propCount ?? (isDark ? 40 : 25);
  const color = propColor ?? (isDark ? "245,158,11" : "0,0,0");
  const maxOpacity = propMaxOpacity ?? (isDark ? 0.15 : 0.08);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    // Init particles
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    particles.current = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      r: Math.random() * 2 + 0.5,
      o: Math.random() * maxOpacity,
    }));

    const draw = () => {
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;
      ctx.clearRect(0, 0, cw, ch);

      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = cw;
        if (p.x > cw) p.x = 0;
        if (p.y < 0) p.y = ch;
        if (p.y > ch) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${p.o})`;
        ctx.fill();
      }

      raf.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
    };
  }, [count, color, maxOpacity, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none select-none ${className}`}
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
}

export const ParticleField = memo(ParticleFieldRaw);
