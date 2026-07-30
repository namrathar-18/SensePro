import { Link, useRouterState, Outlet, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio, Users, BarChart3, Shield, User, Command, Fingerprint,
  ShieldAlert, LineChart, ClipboardList, Menu, X, LogOut,
} from "lucide-react";
import { ConnectionBadge } from "./ConnectionBadge";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { MagneticHover, ParticleField, ThemeToggle } from "@/components/fx";
import { useAuth, signOut, ROLE_LABEL } from "@/lib/auth";

export type AppRole = "teacher" | "management" | "admin" | "proctor" | "student";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Radio;
  mono: string;
  roles?: AppRole[];
}

const NAV: NavItem[] = [
  { to: "/start", label: "New Session", icon: Radio, mono: "NEW", roles: ["teacher", "admin"] },
  { to: "/teacher", label: "Teacher", icon: Users, mono: "TCH", roles: ["teacher", "admin"] },
  { to: "/sessions", label: "Sessions", icon: ClipboardList, mono: "SES", roles: ["teacher", "admin"] },
  { to: "/proctor", label: "Proctor", icon: ShieldAlert, mono: "PRO", roles: ["teacher", "proctor", "admin"] },
  { to: "/enrollment", label: "Enrollment", icon: Fingerprint, mono: "ENR", roles: ["admin"] },
  { to: "/management", label: "Management", icon: BarChart3, mono: "MGT", roles: ["management", "admin"] },
  { to: "/trends", label: "Trends", icon: LineChart, mono: "TRD", roles: ["management", "admin"] },
  { to: "/admin", label: "Admin", icon: Shield, mono: "ADM", roles: ["admin"] },
  { to: "/me", label: "Me", icon: User, mono: "ME", roles: ["student"] },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const nav = useNavigate();
  const items = NAV.filter((n) => !n.roles || (user ? n.roles.includes(user.role as AppRole) : false));

  const initials = (user?.full_name ?? "User")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
    nav({ to: "/login" });
  }

  const navContent = (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-6">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--line)] animate-breathe"
          style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--primary))" }}
        >
          <Command className="h-4 w-4 text-[#07070A]" strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[15px] font-extrabold leading-none tracking-tight text-[color:var(--ink)]">
            SensePro<span className="text-gradient">+</span>
          </div>
          <div className="sp-eyebrow mt-1.5 text-[9.5px] leading-none">Command Center</div>
        </div>
      </div>

      <div className="mx-5 sp-hairline" />

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 pt-4">
        <div className="sp-eyebrow px-3 pb-2 text-[9.5px]">Workspace</div>
        {items.map((n) => {
          const active = pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <MagneticHover key={n.to} strength={active ? 0 : 4}>
              <Link
                to={n.to}
                data-active={active}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "sp-focus group relative flex h-11 items-center gap-3 rounded-md px-3 text-[13px] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  active
                    ? "bg-gradient-to-r from-[color:var(--surface-2)] to-[color:var(--surface-2)]/40 text-[color:var(--ink)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                    : "text-[color:var(--muted)] hover:bg-[color:var(--surface-2)]/50 hover:text-[color:var(--ink)]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    active ? "opacity-100 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "opacity-0",
                  )}
                  style={{ background: "var(--primary)" }}
                />
                <Icon className={cn("h-[15px] w-[15px] transition-colors duration-200", active && "text-[color:var(--primary)]")} strokeWidth={2} />
                <span className="flex-1 truncate">{n.label}</span>
                <span className="font-mono-nums text-[9.5px] tracking-[0.14em] text-[color:var(--muted)]">
                  {n.mono}
                </span>
              </Link>
            </MagneticHover>
          );
        })}
      </nav>

      {/* Operator card + sign out */}
      <div className="mt-auto p-4">
        <div className="flex items-center gap-3 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)]/70 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] font-mono-nums text-[11px] font-semibold text-[color:var(--ink)]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] leading-tight text-[color:var(--ink)]">
              {user?.full_name ?? "Not signed in"}
            </div>
            <div className="truncate font-mono-nums text-[10px] leading-tight text-[color:var(--muted)]">
              {user ? ROLE_LABEL[user.role] : ""}
              {user?.reg_no ? ` · ${user.reg_no}` : ""}
            </div>
          </div>
          <ThemeToggle className="shrink-0 bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)] border-transparent hover:border-[color:var(--line)]" />
          <button
            onClick={handleSignOut}
            className="sp-focus flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--muted)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="app-bg relative flex min-h-screen w-full overflow-hidden">
      {/* Ambient layers */}
      <ParticleField className="fixed inset-0 -z-10" count={10} maxOpacity={0.05} speed={0.1} />

      {/* Desktop sidebar */}
      <aside className="glass-frosted sticky top-0 hidden h-screen w-[268px] shrink-0 flex-col rounded-none border-0 border-r border-[color:var(--line)] lg:flex">
        {navContent}
      </aside>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-screen w-[280px] flex-col bg-[color:var(--surface)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--muted)] hover:bg-[color:var(--surface-2)]"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
        {navContent}
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-frosted sticky top-0 z-20 flex h-14 items-center gap-4 rounded-none border-0 border-b border-[color:var(--line)] px-4 sm:px-8">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--muted)] hover:bg-[color:var(--surface-2)] lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 sm:flex">
            <h1 className="truncate font-display text-[17px] font-extrabold leading-none tracking-tight text-[color:var(--ink)]">
              {title}
            </h1>
            <span className="sp-eyebrow text-[10px]">
              /{pathname.replace(/^\//, "")}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div
              aria-label={new Date().toDateString()}
              className="hidden font-mono-nums text-[11px] tracking-wide text-[color:var(--muted)] sm:block"
            >
              {new Date().toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })}
            </div>
            <ConnectionBadge state="LIVE" />
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8"
          >
            {children ?? <Outlet />}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
