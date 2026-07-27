/**
 * TextReveal — Staggered character/word animation on mount or scroll intersection.
 * Each word fades up from below with a slight blur, creating cinematic text entry.
 */
import { motion, type Variants } from "framer-motion";
import { memo } from "react";

interface TextRevealProps {
  text: string;
  className?: string;
  /** Delay before animation starts (seconds). Default: 0 */
  delay?: number;
  /** Stagger between each word (seconds). Default: 0.06 */
  stagger?: number;
  /** Split by "word" or "char". Default: "word" */
  splitBy?: "word" | "char";
}

const container: Variants = {
  hidden: {},
  visible: (stagger: number) => ({
    transition: { staggerChildren: stagger },
  }),
};

const child: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    filter: "blur(8px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

function TextRevealRaw({
  text,
  className = "",
  delay = 0,
  stagger = 0.06,
  splitBy = "word",
}: TextRevealProps) {
  const units = splitBy === "char" ? text.split("") : text.split(" ");

  return (
    <motion.span
      className={`inline-flex flex-wrap ${className}`}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      custom={stagger}
      style={{ transitionDelay: `${delay}s` }}
    >
      {units.map((unit, i) => (
        <motion.span key={i} variants={child} className="inline-block">
          {unit}
          {splitBy === "word" && i < units.length - 1 ? "\u00A0" : ""}
        </motion.span>
      ))}
    </motion.span>
  );
}

export const TextReveal = memo(TextRevealRaw);
