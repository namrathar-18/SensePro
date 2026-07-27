-- SensePro+ · grant the service_role Postgres role the table privileges it needs.
--
-- Supabase's server-side keys (both the classic service_role JWT and the newer
-- sb_secret_ key) authenticate as the `service_role` Postgres role. That role
-- BYPASSES RLS, but bypassing row security is not the same as holding base table
-- privileges — without an explicit GRANT, PostgREST rejects its reads/writes with
-- "permission denied for table ...". The backend write-path (presence intervals,
-- session lifecycle) runs as service_role, so it needs these grants.
--
-- Scoped to the public schema only. anon/authenticated are untouched — their
-- access stays governed entirely by the RLS policies in 0002/0003.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Future tables created in public inherit the same grant automatically.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
