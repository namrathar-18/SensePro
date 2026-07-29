import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/sp/AppShell";
import { ROLE_HOME, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

const TITLES: Record<string, string> = {
  "/teacher": "Teacher · Live Session",
  "/management": "Management · Cohort Analytics",
  "/admin": "Admin · System Console",
  "/me": "My Console",
  "/enrollment": "Enrollment · Station",
  "/proctor": "Proctor · Review Queue",
  "/trends": "Management · Aggregate Trends",
  "/sessions": "Teacher · Session History",
  "/start": "Start · New Session",
};

// Who may open which page. Longest-prefix match wins.
const PAGE_ROLES: Record<string, Role[]> = {
  "/teacher": ["teacher", "admin"],
  "/sessions": ["teacher", "admin"],
  "/start": ["teacher", "admin"],
  "/proctor": ["teacher", "admin"],
  "/enrollment": ["admin"],
  "/management": ["management", "admin"],
  "/trends": ["management", "admin"],
  "/admin": ["admin"],
  // "Me" is a student's personal attendance page. Staff have no personal
  // attendance — and because teacher/management/admin hold staff-read RLS on
  // presence_intervals, letting them open /me would surface the whole class's
  // rows (not "theirs"). Students only.
  "/me": ["student"],
};

function allowedRolesFor(path: string): Role[] | undefined {
  const key = Object.keys(PAGE_ROLES)
    .filter((p) => path.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PAGE_ROLES[key] : undefined;
}

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const allowed = allowedRolesFor(path);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav({ to: "/login" });
    } else if (allowed && !allowed.includes(user.role)) {
      nav({ to: ROLE_HOME[user.role] });
    }
  }, [user, loading, path, allowed, nav]);

  if (loading) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center">
        <div className="font-mono-nums text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
          Authenticating…
        </div>
      </div>
    );
  }
  if (!user || (allowed && !allowed.includes(user.role))) return null;

  const title = TITLES[path] ?? "Console";
  return (
    <AppShell title={title}>
      <Outlet />
    </AppShell>
  );
}
