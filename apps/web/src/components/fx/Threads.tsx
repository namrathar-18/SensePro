import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme";

interface ThreadsProps {
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
  color?: string;
  className?: string;
}

export function Threads({
  amplitude = 1,
  distance = 0,
  enableMouseInteraction = true,
  color,
  className = "",
}: ThreadsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  // Theme-aware default color if none provided
  const threadColor = color || (theme === "dark" ? "rgba(245, 158, 11, 0.2)" : "rgba(217, 119, 6, 0.1)");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);

    const lines: Line[] = [];
    const count = 30; // number of threads
    const lineSpacing = height / count;

    class Line {
      y: number;
      offset: number;

      constructor(y: number) {
        this.y = y;
        this.offset = Math.random() * Math.PI * 2;
      }

      draw(ctx: CanvasRenderingContext2D, time: number, mouse: { x: number; y: number }) {
        ctx.beginPath();
        for (let x = 0; x < width; x += 10) {
          // Base wave movement
          const wave = Math.sin(x * 0.005 + time + this.offset) * amplitude * 20;

          // Mouse interaction
          let dy = 0;
          if (enableMouseInteraction) {
            const dx = mouse.x - x;
            const dist = Math.sqrt(dx * dx + Math.pow(mouse.y - this.y, 2));
            if (dist < 150) {
              dy = ((150 - dist) / 150) * 30 * Math.sin(time * 5); // repel effect
            }
          }

          ctx.lineTo(x, this.y + wave + dy + distance);
        }
        ctx.strokeStyle = threadColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    for (let i = 0; i < count; i++) {
      lines.push(new Line(i * lineSpacing));
    }

    const mouse = { x: -1000, y: -1000 };
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    
    if (enableMouseInteraction) {
      window.addEventListener("mousemove", handleMouseMove);
    }

    let time = 0;
    let animationFrame: number;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.01;

      lines.forEach((line) => {
        line.draw(ctx, time, mouse);
      });

      animationFrame = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (enableMouseInteraction) {
        window.removeEventListener("mousemove", handleMouseMove);
      }
      cancelAnimationFrame(animationFrame);
    };
  }, [amplitude, distance, enableMouseInteraction, threadColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
}
