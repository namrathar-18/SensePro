import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Command, Fingerprint } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { GlowBorder, ShimmerButton, ClickSpark, ThemeToggle, Lightfall } from "@/components/fx";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in · SensePro+" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !pwd) return;
    setBusy(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password: pwd,
          options: { data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
        if (error) throw error;
        nav({ to: "/teacher" });
        return;
      }
    } catch (err: any) {
      if (err?.message?.includes("placeholder") || err?.message?.includes("fetch")) {
        toast.info("Demo mode — Supabase not configured. Redirecting to console.");
        nav({ to: "/teacher" });
        return;
      }
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ClickSpark sparkColor="#F59E0B" sparkCount={8} sparkRadius={18}>
      <div className="app-bg grain-overlay relative flex min-h-screen items-center justify-center overflow-hidden px-6">
        {/* Theme Toggle */}
        <div className="absolute top-6 right-6 z-50">
          <ThemeToggle className="bg-transparent border-transparent hover:bg-[color:var(--surface-2)] hover:border-[color:var(--line)]" />
        </div>

        {/* Ambient */}
        <div className="absolute inset-0 -z-30">
          <Lightfall
            dpr={1}
            colors={isDark
              ? ["#F59E0B", "#D97706", "#10B981"]
              : ["#B45309", "#92400E", "#059669"]
            }
            backgroundColor={isDark ? "#07070A" : "#F8F6F1"}
            speed={0.3}
            streakCount={2}
            streakWidth={0.6}
            streakLength={1}
            glow={isDark ? 0.6 : 0.4}
            density={0.4}
            twinkle={0.5}
            zoom={3}
            backgroundGlow={isDark ? 0.2 : 0.1}
            opacity={isDark ? 0.45 : 0.25}
            mouseInteraction={true}
            mouseStrength={isDark ? 0.3 : 0.2}
            mouseRadius={0.7}
            mixBlendMode={isDark ? "screen" : "multiply"}
          />
        </div>

        {/* Decorative grid lines */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute top-1/4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color:var(--line)] to-transparent" />
          <div className="absolute top-3/4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[color:var(--line)] to-transparent" />
          <div className="absolute left-1/4 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[color:var(--line)] to-transparent" />
          <div className="absolute left-3/4 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[color:var(--line)] to-transparent" />
        </div>

        {/* Login card */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative z-10 w-full max-w-md"
        >
          <GlowBorder
            className="w-full"
            color="var(--primary, #F59E0B)"
            duration={5}
            radius="20px"
          >
            <div className="glass-frosted glass-hover rounded-[20px] p-8">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-lg animate-pulse-ring"
                  style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--primary))" }}
                >
                  <Command className="h-5 w-5 text-[#07070A]" />
                </div>
                <div>
                  <div className="font-display text-xl font-extrabold tracking-tight">
                    SensePro<span className="text-gradient">+</span>
                  </div>
                  <div className="font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                    Console · Access
                  </div>
                </div>
              </div>

              {/* Title */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: mode === "signin" ? -16 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: mode === "signin" ? 16 : -16 }}
                  transition={{ duration: 0.25 }}
                >
                  <h1 className="mt-8 font-display text-3xl font-extrabold tracking-tight text-[color:var(--ink)]">
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </h1>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    {mode === "signin"
                      ? "Faculty & staff console. Student devices sign in via campus SSO."
                      : "Register with your campus email. Your admin will assign roles after verification."}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Form */}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <AnimatePresence>
                  {mode === "signup" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Field label="Full name">
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Dr. R. Rao"
                          className="input-field"
                          autoComplete="name"
                        />
                      </Field>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Field label="Email">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@campus"
                    className="input-field"
                    autoComplete="email"
                  />
                </Field>

                <Field label="Password">
                  <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    placeholder="••••••••"
                    className="input-field"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </Field>

                <ShimmerButton type="submit" disabled={busy} className="h-12 w-full text-sm">
                  {busy ? "Verifying…" : mode === "signin" ? "Enter console" : "Create account"}
                </ShimmerButton>

                <button
                  type="button"
                  onClick={() => nav({ to: "/teacher" })}
                  className="h-11 w-full rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] text-sm font-medium text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                >
                  Continue in demo mode →
                </button>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    className="font-mono-nums text-[10px] uppercase tracking-[0.16em] text-[color:var(--primary)] transition-colors hover:text-[color:var(--ink)]"
                  >
                    {mode === "signin" ? "Create an account" : "Already have an account? Sign in"}
                  </button>
                  <div className="flex items-center gap-1 text-[color:var(--muted)]">
                    <Fingerprint className="h-3 w-3" />
                    <span className="font-mono-nums text-[10px] uppercase tracking-[0.18em]">
                      DPDP
                    </span>
                  </div>
                </div>
              </form>
            </div>
          </GlowBorder>
        </motion.div>

        <style>{`
          .input-field {
            width: 100%;
            height: 48px;
            padding: 0 14px;
            border-radius: 10px;
            background: color-mix(in oklab, var(--surface) 80%, transparent);
            border: 1px solid var(--line);
            color: var(--ink);
            font-family: var(--font-mono);
            font-size: 13px;
            outline: none;
            transition: border-color .2s ease, box-shadow .2s ease;
          }
          .input-field::placeholder { color: var(--muted); }
          .input-field:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px var(--primary-glow),
                        0 0 20px var(--primary-glow);
          }
        `}</style>
      </div>
    </ClickSpark>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
        {label}
      </div>
      {children}
    </label>
  );
}
