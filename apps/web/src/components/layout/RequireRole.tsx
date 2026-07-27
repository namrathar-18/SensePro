import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { ROLE_HOME, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

/** Route guard: unauthenticated -> /login; wrong role -> their own home.
 *  Waits on the initial session check (loading) before deciding, so a
 *  logged-in user isn't bounced to /login during the first render. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null; // brief — session check is local + fast

  if (!user) return <Navigate to="/login" replace />;

  if (!roles.includes(user.role)) {
    // Signed in, but this route isn't theirs — send them to their own
    // landing page rather than a dead end.
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  return <>{children}</>;
}
