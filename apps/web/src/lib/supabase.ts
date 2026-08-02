import { createClient } from "@supabase/supabase-js";

/** Anon/publishable key only — this ships to the browser. RLS governs every
 *  read; the service-role key never appears here or anywhere in apps/web.
 *
 *  The project URL and key are supplied through the environment rather than
 *  hardcoded. The publishable key is safe to expose to a browser, but pinning a
 *  specific project into source control means every fork and every clone points
 *  at the live instance holding real student records. Set VITE_SUPABASE_URL and
 *  VITE_SUPABASE_ANON_KEY in `.env.local` (see .env.example). */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Supabase is not configured. Copy apps/web/.env.example to .env.local and set " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
