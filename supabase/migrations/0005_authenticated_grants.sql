-- SensePro+ · grant `authenticated` the base table privileges RLS depends on,
-- scoped to exactly what the Phase-2 frontend reads.
--
-- Same class of gap as 0004 (which granted service_role): Postgres GRANTs and
-- RLS policies are two separate, ADDITIVE layers. RLS restricts which ROWS a
-- query can touch; a GRANT is required before the role can query the table
-- AT ALL. The frontend's Supabase client authenticates as `authenticated`
-- once a user is signed in — without a grant, every read (including the
-- Realtime subscription Phase-2 Prompt 3 depends on) is rejected before RLS
-- is even evaluated.
--
-- Deliberately NOT a blanket grant across all 9 tables: embeddings,
-- consent_records, audit_log, and proctor_flags are not read by the browser
-- in Phase 2, so `authenticated` gets no base privilege on them at all —
-- defense in depth on top of their existing admin-only RLS policies, not
-- relying on RLS alone to keep those tables closed. Extend this grant only
-- when a real feature needs to read one of those tables from the client.

grant usage on schema public to authenticated;
grant select on students, class_sessions, presence_intervals to authenticated;
