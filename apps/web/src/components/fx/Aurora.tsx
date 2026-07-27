/**
 * Aurora — Animated gradient background with warm amber/emerald tones.
 * Obsidian Forge identity — not generic blue blobs.
 */
import { memo } from "react";
import { useTheme } from "@/lib/theme";

interface AuroraProps {
  className?: string;
  count?: number;
  speed?: number;
}

const DARK_HUES = [35, 45, 160, 28, 150]; // amber → gold → emerald → warm → teal
const LIGHT_HUES = [15, 30, 150, 10, 140]; // coral → peach → sage → warm red → mint

function AuroraRaw({ className = "", count = 3, speed = 1 }: AuroraProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const HUES = isDark ? DARK_HUES : LIGHT_HUES;

  const blobs = Array.from({ length: count }, (_, i) => {
    const hue = HUES[i % HUES.length];
    const sat = hue > 100 ? (isDark ? 65 : 45) : (isDark ? 85 : 75);
    const light = isDark ? (hue > 100 ? 40 : 50) : (hue > 100 ? 75 : 65);
    const delay = -(i * (20 / count));
    const dur = 20 / speed;
    const size = 35 + i * 12;
    const opacity = isDark ? (hue > 100 ? 0.12 : 0.18) : (hue > 100 ? 0.3 : 0.4);

    return (
      <div
        key={i}
        className={`absolute rounded-full blur-3xl ${isDark ? "mix-blend-screen" : "mix-blend-multiply"}`}
        style={{
          width: `${size}%`,
          height: `${size}%`,
          opacity,
          background: `radial-gradient(circle, hsla(${hue}, ${sat}%, ${light}%, 0.45) 0%, transparent 70%)`,
          animation: `aurora-drift-${i % 2 === 0 ? "a" : "b"} ${dur}s ease-in-out ${delay}s infinite alternate`,
        }}
      />
    );
  });

  return (
    <div className={`overflow-hidden pointer-events-none select-none ${className}`} aria-hidden="true">
      {blobs}
      <style>{`
        @keyframes aurora-drift-a {
          0%   { transform: translate(-10%, -10%) scale(1);   }
          50%  { transform: translate(15%, 5%) scale(1.15);   }
          100% { transform: translate(-5%, 10%) scale(0.95);  }
        }
        @keyframes aurora-drift-b {
          0%   { transform: translate(10%, 10%) scale(1.1);   }
          50%  { transform: translate(-15%, -5%) scale(0.9);  }
          100% { transform: translate(5%, -10%) scale(1.05);  }
        }
      `}</style>
    </div>
  );
}

export const Aurora = memo(AuroraRaw);
