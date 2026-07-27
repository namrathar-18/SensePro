-- ============================================================
-- SensePro+ · APPLY ROLES — run ONCE in the Supabase SQL editor
-- AFTER APPLY_ALL.sql and after the role accounts exist.
--
-- Makes RLS enforce roles server-side using the JWT's app_metadata.app_role
-- (set on each account by the seed script). Additive to the 0002 policies —
-- staff logins can now read their tables; students already self-read via
-- auth.uid(). The demo anon-read stays as a fallback.
-- ============================================================

-- Role helper: reads the role from the top-level claim (if a hook is enabled)
-- or from app_metadata (how the accounts are provisioned here).
create or replace function public.jwt_role() returns text
language sql stable as $$
  select coalesce(
    auth.jwt() ->> 'app_role',
    auth.jwt() -> 'app_metadata' ->> 'app_role'
  );
$$;

-- ---- staff read policies (app_metadata role) ----
create policy "students staff read am"    on students                   for select using (public.jwt_role() in ('teacher','management','admin'));
create policy "sessions staff read am"    on class_sessions             for select using (public.jwt_role() in ('teacher','management','admin'));
create policy "presence staff read am"    on presence_intervals         for select using (public.jwt_role() in ('teacher','management','admin'));
create policy "proctor staff read am"     on proctor_flags              for select using (public.jwt_role() in ('teacher','admin'));
create policy "aggregates staff read am"  on engagement_zone_aggregates for select using (public.jwt_role() in ('teacher','management','admin'));
create policy "consent admin read am"     on consent_records            for select using (public.jwt_role() = 'admin');
create policy "devices staff read am"     on devices                    for select using (public.jwt_role() in ('teacher','admin'));
create policy "audit admin read am"       on audit_log                  for select using (public.jwt_role() = 'admin');

-- ---- staff may move a flag through review (app_metadata role) ----
create policy "proctor staff review am" on proctor_flags
  for update using (public.jwt_role() in ('teacher','admin'))
  with check (public.jwt_role() in ('teacher','admin'));

-- ---- base grants the admin dashboard needs (RLS still restricts rows) ----
grant select on consent_records, audit_log, devices, user_roles to authenticated;

-- ---- admin can read the role directory (Users page) ----
create policy "user_roles admin read am" on user_roles
  for select to authenticated using (public.jwt_role() = 'admin');

-- ---- realtime for the live proctor queue on the teacher/proctor pages ----
-- (presence_intervals + class_sessions already published in APPLY_ALL)
