import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/theme";

interface GridDistortionProps {
  gridSize?: number;
  mouseRadius?: number;
  distortionStrength?: number;
  className?: string;
}

export function GridDistortion({
  gridSize = 40,
  mouseRadius = 150,
  distortionStrength = 0.5,
  className = "",
}: GridDistortionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  // Faint amber on dark, very faint gray/amber on light
  const gridColor = theme === "dark" ? "rgba(245, 158, 11, 0.05)" : "rgba(0, 0, 0, 0.04)";
  const highlightColor = theme === "dark" ? "rgba(245, 158, 11, 0.15)" : "rgba(217, 119, 6, 0.1)";

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

    const mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };
    
    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };
    
    window.addEventListener("mousemove", handleMouseMove);

    let animationFrame: number;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      
      // Smooth mouse follow
      mouse.x += (mouse.targetX - mouse.x) * 0.1;
      mouse.y += (mouse.targetY - mouse.y) * 0.1;

      // Draw grid
      ctx.lineWidth = 1;

      for (let x = 0; x < width; x += gridSize) {
        for (let y = 0; y < height; y += gridSize) {
          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          let offsetX = 0;
          let offsetY = 0;
          let color = gridColor;

          if (dist < mouseRadius) {
            // Distort grid points away from mouse
            const force = (mouseRadius - dist) / mouseRadius;
            offsetX = -(dx / dist) * force * mouseRadius * distortionStrength;
            offsetY = -(dy / dist) * force * mouseRadius * distortionStrength;
            
            // Highlight color near mouse
            ctx.strokeStyle = highlightColor;
          } else {
            ctx.strokeStyle = gridColor;
          }

          // Draw a small cross at each grid intersection
          ctx.beginPath();
          ctx.moveTo(x + offsetX - 2, y + offsetY);
          ctx.lineTo(x + offsetX + 2, y + offsetY);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x + offsetX, y + offsetY - 2);
          ctx.lineTo(x + offsetX, y + offsetY + 2);
          ctx.stroke();
        }
      }

      animationFrame = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrame);
    };
  }, [gridSize, mouseRadius, distortionStrength, gridColor, highlightColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
}
