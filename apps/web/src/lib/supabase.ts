import { createClient } from "@supabase/supabase-js";

/** Anon/publishable key only — this ships to the browser. RLS governs every
 *  read; the service-role key never appears here or anywhere in apps/web.
 *  The defaults below are the project's publishable key (safe to embed); set
 *  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local to override. */
const DEFAULT_SUPABASE_URL = "https://zhyzxunjklscataasamd.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_Hr3XxXxuGIH_UnMIhG_QUg_K77pB-kU";

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
