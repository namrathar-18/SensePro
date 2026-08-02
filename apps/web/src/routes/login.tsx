import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Command, Fingerprint, GraduationCap, Users } from "lucide-react";
import { toast } from "sonner";
import { GlowBorder, ShimmerButton, ClickSpark, ThemeToggle, Lightfall } from "@/components/fx";
import { useTheme } from "@/lib/theme";
import { ROLE_HOME, signInStaff, signInStudent } from "@/lib/auth";
import type { Role } from "@/lib/types";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · SensePro+" }] }),
  component: LoginPage,
});

/** Optional one-click demo sign-in.
 *
 * Passwords come from the environment and are never committed: these accounts
 * carry staff-level read access to real student attendance data, so a password
 * in source control is a privacy problem, not merely a security one. Set the
 * VITE_DEMO_*_PWD vars in `.env.local` (gitignored) to enable the buttons; with
 * none configured the block does not render.
 */
type QuickLogin = { role: Role; label: string; email: string; pwd: string };

const QUICK: QuickLogin[] = (
  [
    {
      role: "teacher",
      label: "Teacher",
      email: "teacher@sensepro.app",
      pwd: import.meta.env.VITE_DEMO_TEACHER_PWD,
    },
    {
      role: "management",
      label: "Management",
      email: "manage@sensepro.app",
      pwd: import.meta.env.VITE_DEMO_MANAGEMENT_PWD,
    },
    {
      role: "admin",
      label: "Admin",
      email: "admin@sensepro.app",
      pwd: import.meta.env.VITE_DEMO_ADMIN_PWD,
    },
  ] as { role: Role; label: string; email: string; pwd?: string }[]
).filter((q): q is QuickLogin => Boolean(q.pwd));

function LoginPage() {
  const nav = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [tab, setTab] = useState<"staff" | "student">("staff");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [busy, setBusy] = useState(false);

  function routeByRole(role: Role | undefined) {
    nav({ to: role ? ROLE_HOME[role] : "/me" });
  }

  async function doStaff(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email || !pwd) return;
    setBusy(true);
    const { data, error } = await signInStaff(email.trim(), pwd);
    setBusy(false);
    if (error) return toast.error(error.message || "Sign-in failed");
    routeByRole(data.user?.app_metadata?.app_role as Role | undefined);
  }

  async function quick(q: (typeof QUICK)[number]) {
    setBusy(true);
    const { data, error } = await signInStaff(q.email, q.pwd);
    setBusy(false);
    if (error) return toast.error(error.message || "Sign-in failed");
    routeByRole(data.user?.app_metadata?.app_role as Role | undefined);
  }

  async function doStudent(e?: React.FormEvent) {
    e?.preventDefault();
    if (!regNo.trim()) return toast.error("Enter your register number");
    setBusy(true);
    const { error } = await signInStudent(regNo);
    setBusy(false);
    if (error) return toast.error("Check your name and register number");
    nav({ to: "/me" });
  }

  return (
    <ClickSpark sparkColor="#F59E0B" sparkCount={8} sparkRadius={18}>
      <div className="app-bg grain-overlay relative flex min-h-screen items-center justify-center overflow-hidden px-6">
        <div className="absolute top-6 right-6 z-50">
          <ThemeToggle className="bg-transparent border-transparent hover:bg-[color:var(--surface-2)] hover:border-[color:var(--line)]" />
        </div>

        <div className="absolute inset-0 -z-30">
          <Lightfall
            dpr={1}
            colors={isDark ? ["#F59E0B", "#D97706", "#10B981"] : ["#B45309", "#92400E", "#059669"]}
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
            mouseInteraction={false}
            mouseStrength={0}
            mouseRadius={0.7}
            mixBlendMode={isDark ? "screen" : "multiply"}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative z-10 w-full max-w-md"
        >
          <GlowBorder className="w-full" color="var(--primary, #F59E0B)" duration={5} radius="20px">
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
                  <div className="font-mono-nums text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    Console · Access
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] p-1">
                {(["staff", "student"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={
                      "sp-focus flex h-10 items-center justify-center gap-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors " +
                      (tab === t
                        ? "bg-[color:var(--primary)] text-white"
                        : "text-[color:var(--muted)] hover:text-[color:var(--ink)]")
                    }
                  >
                    {t === "staff" ? <Users className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
                    {t}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {tab === "staff" ? (
                  <motion.form
                    key="staff"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={doStaff}
                    className="mt-5 space-y-4"
                  >
                    <p className="text-sm text-[color:var(--muted)]">
                      Faculty &amp; staff console — sign in with your campus email.
                    </p>
                    <Field label="Email">
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@sensepro.app" className="lf-input" autoComplete="email" />
                    </Field>
                    <Field label="Password">
                      <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" className="lf-input" autoComplete="current-password" />
                    </Field>
                    <ShimmerButton type="submit" disabled={busy} className="h-12 w-full text-sm">
                      {busy ? "Verifying…" : "Enter console"}
                    </ShimmerButton>

                    <div className="pt-1" hidden={QUICK.length === 0}>
                      <div className="mb-2 font-mono-nums text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted)]">
                        Quick demo login
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {QUICK.map((q) => (
                          <button
                            key={q.role}
                            type="button"
                            disabled={busy}
                            onClick={() => quick(q)}
                            className="sp-focus h-10 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] text-[11px] font-medium text-[color:var(--ink)] transition-colors hover:border-[color:var(--primary)]"
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.form>
                ) : (
                  <motion.form
                    key="student"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={doStudent}
                    className="mt-5 space-y-4"
                  >
                    <p className="text-sm text-[color:var(--muted)]">
                      Students: sign in with your name and register number to see your attendance.
                    </p>
                    <Field label="Your name">
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Namratha R" className="lf-input" autoComplete="name" />
                    </Field>
                    <Field label="Register number">
                      <input type="text" value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="e.g. 2547234" className="lf-input" autoComplete="off" />
                    </Field>
                    <ShimmerButton type="submit" disabled={busy} className="h-12 w-full text-sm">
                      {busy ? "Verifying…" : "View my attendance"}
                    </ShimmerButton>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="mt-5 flex items-center justify-end border-t border-[color:var(--line)] pt-4">
                <div className="flex items-center gap-1 text-[color:var(--muted)]">
                  <Fingerprint className="h-3 w-3" />
                  <span className="font-mono-nums text-[11px] uppercase tracking-[0.1em]">DPDP · RLS</span>
                </div>
              </div>
            </div>
          </GlowBorder>
        </motion.div>

        <style>{`
          .lf-input {
            width: 100%; height: 48px; padding: 0 14px; border-radius: 10px;
            background: color-mix(in oklab, var(--surface) 80%, transparent);
            border: 1px solid var(--line); color: var(--ink);
            font-family: var(--font-mono); font-size: 13px; outline: none;
            transition: border-color .2s ease, box-shadow .2s ease;
          }
          .lf-input::placeholder { color: var(--muted); }
          .lf-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow), 0 0 20px var(--primary-glow); }
        `}</style>
      </div>
    </ClickSpark>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 font-mono-nums text-[11px] uppercase tracking-[0.1em] text-[color:var(--muted)]">
        {label}
      </div>
      {children}
    </label>
  );
}
