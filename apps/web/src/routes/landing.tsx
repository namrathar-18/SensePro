import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ShieldCheck, Eye, Brain, Lock,
  ChevronRight, ArrowRight, Zap,
} from "lucide-react";
import {
  SpotlightCard, TextReveal, ShimmerButton,
  MagneticHover, ClickSpark, ThemeToggle, Lightfall,
} from "@/components/fx";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "SensePro+ · Classroom Command Center" },
      { name: "description", content: "Browser-based attendance, proctor review, and fairness-aware engagement analytics for higher education." },
      { property: "og:title", content: "SensePro+ · Classroom Command Center" },
      { property: "og:description", content: "Mission-control for the classroom — privacy-first, bias-aware." },
    ],
  }),
  component: LandingPage,
});

const PILLARS = [
  {
    icon: Eye, title: "Browser-based capture",
    desc: "No hardware, no drivers. Any webcam in Chrome ships frames to the inference server over a WebSocket.",
    stat: "0ms", statLabel: "hardware required",
  },
  {
    icon: Brain, title: "Fairness-aware analytics",
    desc: "VNEI corrects for visibility bias. Zone aggregates suppress when k < 5. Never per-student engagement.",
    stat: "k<5", statLabel: "suppression threshold",
  },
  {
    icon: Lock, title: "Privacy by design",
    desc: "Frames never stored. Embeddings purged post-enrollment. Hash-chained audit trail. DPDP-aligned consent.",
    stat: "0", statLabel: "frames stored",
  },
];

const INVARIANTS = [
  "No raw frames stored after inference",
  "No per-student engagement scores",
  "No emotion classification or behavioral profiling",
  "Aggregates suppressed when k < 5",
  "Human-in-the-loop proctoring — flags, never verdicts",
  "Student can withdraw consent + delete all data at any time",
];

const ROLES = [
  { label: "Teacher", desc: "Live roster, session PDF, proctor review queue.", mono: "TCH", color: "var(--primary)" },
  { label: "Management", desc: "VNEI trends, zone engagement, session compare.", mono: "MGT", color: "var(--accent)" },
  { label: "Admin", desc: "Devices, users, consent registry, audit chain.", mono: "ADM", color: "var(--warn)" },
  { label: "Student", desc: "Attendance history, consent status, data deletion.", mono: "ME", color: "var(--ok)" },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

function LandingPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <ClickSpark sparkColor="#F59E0B" sparkCount={10} sparkRadius={24}>
      <div className="app-bg grain-overlay relative min-h-screen overflow-hidden text-[color:var(--ink)]">
        {/* Ambient layers */}
        <div className="absolute inset-0 -z-30">
          <Lightfall
            dpr={1}
            colors={isDark
              ? ["#F59E0B", "#D97706", "#10B981"]
              : ["#B45309", "#92400E", "#059669"]
            }
            backgroundColor={isDark ? "#07070A" : "#F8F6F1"}
            speed={0.4}
            streakCount={isDark ? 3 : 2}
            streakWidth={isDark ? 0.8 : 0.6}
            streakLength={1.2}
            glow={isDark ? 0.8 : 0.5}
            density={0.5}
            twinkle={0.6}
            zoom={3}
            backgroundGlow={isDark ? 0.3 : 0.15}
            opacity={isDark ? 0.6 : 0.35}
            mouseInteraction={true}
            mouseStrength={isDark ? 0.4 : 0.25}
            mouseRadius={0.8}
            mixBlendMode={isDark ? "screen" : "multiply"}
          />
        </div>

        {/* ─── Nav ─── */}
        <nav className="glass-frosted fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between px-6 sm:px-10">
          <MagneticHover className="flex items-center gap-3" strength={4}>
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--primary))" }}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#07070A]" strokeWidth={2.5} />
            </div>
            <span className="font-display text-sm font-extrabold tracking-tight">
              SensePro<span className="text-gradient">+</span>
            </span>
          </MagneticHover>
          <div className="flex items-center gap-3">
            <ThemeToggle className="bg-transparent border-transparent hover:bg-[color:var(--surface-2)] hover:border-[color:var(--line)]" />
            <MagneticHover strength={3}>
              <Link to="/login" className="sp-btn sp-btn-primary h-9 px-4 text-xs">
                Sign in <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </MagneticHover>
          </div>
        </nav>

        {/* ─── Hero ─── */}
        <section className="relative flex min-h-[92vh] flex-col items-center justify-center px-6 pt-20 text-center">
          {/* Ambient glow behind hero */}
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: "600px", height: "600px",
              background: "radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)",
              filter: "blur(80px)",
            }}
            aria-hidden
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line-strong)] bg-[color:var(--surface-2)] px-4 py-1.5"
          >
            <Zap className="h-3 w-3 text-[color:var(--primary)]" />
            <span className="font-mono-nums text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-2)]">
              Classroom Command Center
            </span>
          </motion.div>

          <h1 className="mt-8 max-w-5xl font-display text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-[5.5rem]">
            <TextReveal text="Attendance that" delay={0.15} />
            <br />
            <span className="text-gradient">
              <TextReveal text="sees the class," delay={0.45} />
            </span>
            <br />
            <TextReveal text="not the student" delay={0.7} />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1 }}
            className="mt-6 max-w-lg text-[15px] leading-relaxed text-[color:var(--muted)]"
          >
            Browser-based face recognition for attendance and exam proctoring —
            built with visibility-normalised engagement and privacy invariants baked in.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.3 }}
            className="mt-8 flex flex-wrap justify-center gap-3"
          >
            <Link to="/capture">
              <ShimmerButton className="h-12 px-7 text-sm">
                Open capture <ArrowRight className="h-4 w-4" />
              </ShimmerButton>
            </Link>
            <Link
              to="/login"
              className="sp-btn sp-btn-secondary h-12 px-6 text-sm hover:border-glow transition-shadow duration-300"
            >
              Dashboard
            </Link>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4, y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: 2 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <div className="h-8 w-5 rounded-full border border-[color:var(--line-strong)] flex items-start justify-center pt-1.5">
              <div className="h-1.5 w-1 rounded-full bg-[color:var(--primary)]" />
            </div>
          </motion.div>
        </section>

        {/* ─── Pillars — Bento grid ─── */}
        <motion.section
          className="mx-auto max-w-6xl px-6 py-20"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <motion.div key={p.title} variants={fadeUp}>
                <SpotlightCard
                  className="glass-frosted glass-hover rounded-2xl p-6 h-full"
                  spotlightColor={i === 0 ? "var(--primary-glow)" : i === 1 ? "var(--accent-glow)" : "rgba(244,63,94,0.1)"}
                >
                  {/* Stat callout */}
                  <div className="mb-4 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-extrabold text-[color:var(--ink)]">{p.stat}</span>
                    <span className="font-mono-nums text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">{p.statLabel}</span>
                  </div>
                  <div className="h-px bg-gradient-to-r from-transparent via-[color:var(--line-strong)] to-transparent mb-4" />
                  <p.icon className="h-5 w-5 text-[color:var(--primary)]" strokeWidth={1.8} />
                  <h3 className="mt-3 font-display text-base font-extrabold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">{p.desc}</p>
                </SpotlightCard>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ─── Invariants ─── */}
        <motion.section
          className="mx-auto max-w-3xl px-6 py-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          variants={stagger}
        >
          <SpotlightCard
            className="glass-frosted glass-hover rounded-2xl p-8"
            spotlightColor="var(--accent-glow)"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-[color:var(--accent)]" />
              <span className="font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
                Non-negotiable
              </span>
            </div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight">
              Privacy invariants
            </h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Enforced at architecture level. Cannot be overridden by configuration.
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {INVARIANTS.map((inv, i) => (
                <motion.div
                  key={inv}
                  variants={fadeUp}
                  className="flex items-start gap-2.5 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)]/50 px-3 py-2.5"
                >
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--ok)]" strokeWidth={2} />
                  <span className="text-[13px] leading-snug">{inv}</span>
                </motion.div>
              ))}
            </div>
          </SpotlightCard>
        </motion.section>

        {/* ─── Roles ─── */}
        <motion.section
          className="mx-auto max-w-5xl px-6 py-16"
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
        >
          <div className="text-center mb-10">
            <span className="font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
              Role-based access
            </span>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
              Four consoles, one system
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <motion.div key={r.label} variants={fadeUp}>
                <SpotlightCard
                  className="glass-frosted glass-hover rounded-xl p-5 h-full cursor-default"
                  spotlightSize={180}
                  spotlightColor={`color-mix(in oklab, ${r.color} 8%, transparent)`}
                >
                  <div
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
                    style={{ background: `color-mix(in oklab, ${r.color} 12%, transparent)` }}
                  >
                    <div className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
                    <span className="font-mono-nums text-[9px] uppercase tracking-[0.18em]" style={{ color: r.color }}>
                      {r.mono}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-base font-extrabold">{r.label}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--muted)]">{r.desc}</p>
                </SpotlightCard>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ─── Footer ─── */}
        <footer className="border-t border-[color:var(--line)] py-8 text-center">
          <div className="font-mono-nums text-[10px] uppercase tracking-[0.18em] text-shimmer">
            SensePro+ · MCA Major Project · CHRIST University · 2026
          </div>
        </footer>
      </div>
    </ClickSpark>
  );
}
