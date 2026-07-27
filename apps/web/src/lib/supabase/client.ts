// One Supabase client for the whole app. Re-exported from lib/supabase so the
// session hook and the data layer share a SINGLE GoTrueClient instance — two
// separate createClient calls split auth state across two token stores (and
// warn "Multiple GoTrueClient instances" in the console), which is why a
// reviewer's session could fail to match the session RLS evaluates.
export { supabase } from "@/lib/supabase";
