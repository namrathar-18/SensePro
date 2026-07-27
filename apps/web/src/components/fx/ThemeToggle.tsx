import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)] ${className}`}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {/* Ambient glow behind icon */}
      <span
        aria-hidden
        className="absolute inset-0 z-0 scale-75 opacity-0 rounded-full blur-md transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
        style={{
          background: "var(--primary-glow)",
        }}
      />
      
      <div className="relative z-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={isDark ? "dark" : "light"}
            initial={{ y: -16, opacity: 0, rotate: isDark ? -90 : 90 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: 16, opacity: 0, rotate: isDark ? 90 : -90 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            {isDark ? (
              <Moon className="h-4 w-4" strokeWidth={2.5} />
            ) : (
              <Sun className="h-4 w-4 text-[color:var(--primary)]" strokeWidth={2.5} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </button>
  );
}
