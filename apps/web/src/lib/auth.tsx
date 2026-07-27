// Real auth: the signed-in Supabase user + their role (from the JWT's
// app_metadata.app_role, which is server-controlled and cannot be spoofed by
// the client). Used by the route guards, the nav, and the login flow.

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  reg_no?: string;
}

export const ROLE_HOME: Record<Role, string> = {
  teacher: "/teacher",
  management: "/management",
  admin: "/admin",
  student: "/me",
};

export const ROLE_LABEL: Record<Role, string> = {
  teacher: "Teacher",
  management: "Management",
  admin: "Admin",
  student: "Student",
};

function toAuthUser(u: User | null | undefined): AuthUser | null {
  if (!u) return null;
  const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
  const role = ((meta.app_role as Role) ?? "student") as Role;
  const full_name =
    (meta.full_name as string) || u.email?.split("@")[0] || "User";
  return { id: u.id, email: u.email ?? "", role, full_name, reg_no: meta.reg_no as string | undefined };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(toAuthUser(data.session?.user));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) setUser(toAuthUser(session?.user));
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Staff sign-in with email + password. */
export async function signInStaff(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

/** Student sign-in: they type their name + register number. The account email
 *  is derived from the register number; the password IS the register number. */
export async function signInStudent(regNo: string) {
  const reg = regNo.trim();
  return supabase.auth.signInWithPassword({
    email: `${reg}@student.sensepro.app`,
    password: reg,
  });
}
