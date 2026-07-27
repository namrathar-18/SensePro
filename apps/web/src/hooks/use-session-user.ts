import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
}

/** Decode a JWT payload without verifying it — the server issued this token and
 *  RLS re-checks every request, so the client only reads a claim it already
 *  trusts. This is how we read `app_role`, which the Custom Access Token Hook
 *  (migration 0003) injects into the access TOKEN, not into user_metadata. */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) return {};
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  try {
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function toSessionUser(session: Session | null): SessionUser | null {
  if (!session) return null;
  const claims = decodeJwtPayload(session.access_token);
  const role = claims.app_role as string | undefined;
  const u = session.user;
  return {
    id: u.id, // real Supabase uid — matches what RLS sees, valid reviewed_by
    email: u.email ?? "",
    full_name: (u.user_metadata?.full_name as string) ?? u.email?.split("@")[0] ?? "User",
    // Role comes ONLY from the JWT app_role claim. No claim -> no role -> no
    // access. Never default to a privileged role, never widen on error — that
    // would hand every visitor staff access.
    roles: role ? [role] : [],
  };
}

export function useSessionUser() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setUser(toSessionUser(data.session));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(toSessionUser(session));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
