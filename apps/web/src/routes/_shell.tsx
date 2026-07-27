import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/sp/AppShell";
import { useRouterState } from "@tanstack/react-router";

const TITLES: Record<string, string> = {
  "/teacher": "Teacher · Live Session",
  "/management": "Management · Cohort Analytics",
  "/admin": "Admin · System Console",
  "/me": "My Console",
  "/enrollment": "Enrollment · Station",
  "/proctor": "Proctor · Review Queue",
  "/trends": "Management · Aggregate Trends",
  "/sessions": "Teacher · Session History",
};

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const title = TITLES[path] ?? "Console";
  return (
    <AppShell title={title}>
      <Outlet />
    </AppShell>
  );
}
