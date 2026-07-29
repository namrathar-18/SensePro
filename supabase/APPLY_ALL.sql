-- ============================================================
-- SensePro+ · APPLY ALL — paste this whole file into the
-- Supabase SQL editor and press RUN (one time, fresh project).
-- Order: schema -> RLS -> auth hook -> grants -> phase3 ->
-- seed (53 students) -> demo read access.
-- ============================================================


-- ==================== 0001_init.sql ====================
-- SensePro+ schema v1 · Supabase Postgres
-- Invariants encoded here: embeddings-only identity, k>=5 aggregate suppression,
-- hash-chained audit log, cascade deletion for right-to-erasure.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------- identity & consent (Tier 1) ----------
create table students (
  id uuid primary key default gen_random_uuid(),
  reg_no text unique not null,
  full_name text not null,
  class_section text not null,
  seat_zone text check (seat_zone in ('front','mid','back')),
  created_at timestamptz not null default now()
);

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  consent_version text not null,
  signed_at timestamptz not null default now(),
  signature_hash text not null,          -- sha256 of signed form scan; raw scan kept offline in appendix file
  withdrawn_at timestamptz
);

-- 512-d ArcFace templates. Raw images are NEVER stored.
create table embeddings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  pose_bin text not null check (pose_bin in ('center','left','right','up','down','avg')),
  vec vector(512) not null,
  quality real not null,
  created_at timestamptz not null default now()
);
create index embeddings_student_idx on embeddings(student_id);
-- Similarity search index for registry lookups / dedup checks:
create index embeddings_vec_idx on embeddings using ivfflat (vec vector_cosine_ops) with (lists = 50);

-- ---------- devices & sessions ----------
create table devices (
  id uuid primary key default gen_random_uuid(),
  device_key text unique not null,        -- printed on the board/rig
  label text not null,
  room text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  class_section text not null,
  subject text,
  mode text not null default 'lecture' check (mode in ('lecture','exam','workshop')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid                          -- auth.users id of teacher
);

-- ---------- presence (Tier 1) ----------
create table presence_intervals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  state text not null check (state in ('PRESENT','UNVERIFIED','ABSENT')),
  started_at timestamptz not null,
  ended_at timestamptz,
  source_device uuid references devices(id)
);
create index presence_session_idx on presence_intervals(session_id, student_id);

-- ---------- proctor flags: review-only, never auto-penalty ----------
create table proctor_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  flag_type text not null check (flag_type in ('phone','extra_person','head_pose','other')),
  suppressed boolean not null default false,   -- true if gaze-down filter suppressed it
  flagged_at timestamptz not null,
  review_status text not null default 'pending' check (review_status in ('pending','dismissed','upheld')),
  reviewed_by uuid,
  reviewed_at timestamptz
);

-- ---------- engagement (Tier 2): AGGREGATES ONLY ----------
-- There is intentionally NO per-student engagement table. Do not add one.
create table engagement_zone_aggregates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  window_start timestamptz not null,
  window_s int not null default 60,
  zone text not null check (zone in ('front','mid','back','class')),
  n_tracked int not null check (n_tracked >= 5),   -- k-anonymity floor enforced in DB
  enrolled_in_zone int not null,
  coverage real not null check (coverage >= 0 and coverage <= 1),
  vnei real not null check (vnei >= 0 and vnei <= 1),
  signals jsonb not null default '{}'::jsonb        -- e.g. {"phone_rate":0.1,"head_down_rate":0.2}
);
create index engagement_session_idx on engagement_zone_aggregates(session_id, window_start);

-- ---------- hash-chained audit log ----------
create table audit_log (
  seq bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,                 -- 'edge:<device_key>' | 'api:<user>' | 'system'
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  hash text not null
);

create or replace function audit_chain() returns trigger language plpgsql as $fn$
declare prev text;
begin
  select hash into prev from audit_log order by seq desc limit 1;
  if prev is null then prev := repeat('0', 64); end if;
  new.prev_hash := prev;
  new.hash := encode(digest(prev || new.actor || new.action || coalesce(new.payload::text,'') || new.at::text, 'sha256'), 'hex');
  return new;
end $fn$;

create trigger audit_chain_trg before insert on audit_log
for each row execute function audit_chain();

-- ---------- RLS (skeleton — tighten per role in migration 0002) ----------
alter table students enable row level security;
alter table consent_records enable row level security;
alter table embeddings enable row level security;
alter table presence_intervals enable row level security;
alter table proctor_flags enable row level security;
alter table engagement_zone_aggregates enable row level security;
alter table class_sessions enable row level security;
alter table devices enable row level security;
alter table audit_log enable row level security;

-- Roles arrive as a custom JWT claim: (auth.jwt() ->> 'app_role') in
-- ('teacher','management','admin','student'). Service role bypasses RLS (API server).
-- Example policies (expand in 0002):
create policy "students self read" on students
  for select using ((auth.jwt() ->> 'app_role') in ('teacher','management','admin'));
create policy "aggregates readable by staff" on engagement_zone_aggregates
  for select using ((auth.jwt() ->> 'app_role') in ('teacher','management','admin'));
-- TODO 0002: student self-only policies, write policies for service paths, audit read=admin.

-- ==================== 0002_rls.sql ====================
-- SensePro+ RLS v1 · tightens the migration 0001 skeleton into the full
-- per-role policy set. Role arrives as the JWT claim app_role, one of
-- teacher | management | admin | student. The FastAPI vision write-path
-- authenticates with the Supabase service role, which bypasses RLS entirely —
-- that's how presence/embeddings/proctor writes happen without per-row
-- client auth. Every policy below governs client (anon/authenticated) access
-- only.
--
-- Invariants this file exists to enforce (see ENGINEERING.md):
--   - no per-student engagement read path (engagement_zone_aggregates has no
--     student_id column, so this is structurally true regardless of policy)
--   - proctor flags are reviewed, never deleted or auto-actioned by staff
--   - a student sees only their own rows, never another student's
--   - embeddings never reach teacher/management/student, only admin (audit
--     use — e.g. confirming a deletion actually purged the vectors) and the
--     service role (the actual matching path)

-- ---------- link a student row to its Supabase Auth user ----------
-- Nullable: most students won't have a login account in Phase 1; embeddings
-- keep working via the service-role match path regardless. Populate this
-- when/if a student-lite login is issued.
alter table students add column auth_uid uuid references auth.users(id);
create index students_auth_uid_idx on students(auth_uid) where auth_uid is not null;

-- ---------- drop the 0001 skeleton policies, replace with the full set ----------
drop policy if exists "students self read" on students;
drop policy if exists "aggregates readable by staff" on engagement_zone_aggregates;

-- ============================================================
-- students
-- ============================================================
create policy "students staff read" on students
  for select using ((auth.jwt() ->> 'app_role') in ('teacher', 'management', 'admin'));

create policy "students self read" on students
  for select using (auth_uid = auth.uid());

-- No client insert/update/delete policy: enrolment and roster edits go
-- through the service role only.

-- ============================================================
-- consent_records
-- ============================================================
create policy "consent admin read" on consent_records
  for select using ((auth.jwt() ->> 'app_role') = 'admin');

create policy "consent self read" on consent_records
  for select using (
    exists (
      select 1 from students s
      where s.id = consent_records.student_id and s.auth_uid = auth.uid()
    )
  );

-- ============================================================
-- embeddings — the strictest table: never teacher/management/student
-- ============================================================
create policy "embeddings admin read" on embeddings
  for select using ((auth.jwt() ->> 'app_role') = 'admin');

-- No insert/update/delete policy at all: only the service role (the
-- enrolment CLI / vision write-path) ever writes an embedding.

-- ============================================================
-- class_sessions
-- ============================================================
create policy "sessions staff read" on class_sessions
  for select using ((auth.jwt() ->> 'app_role') in ('teacher', 'management', 'admin'));

create policy "sessions teacher insert own" on class_sessions
  for insert with check (
    (auth.jwt() ->> 'app_role') = 'teacher' and created_by = auth.uid()
  );

create policy "sessions teacher update own" on class_sessions
  for update using (
    (auth.jwt() ->> 'app_role') = 'teacher' and created_by = auth.uid()
  );

-- ============================================================
-- presence_intervals (Tier 1 — per-student, consented)
-- ============================================================
create policy "presence staff read" on presence_intervals
  for select using ((auth.jwt() ->> 'app_role') in ('teacher', 'management', 'admin'));

create policy "presence self read" on presence_intervals
  for select using (
    exists (
      select 1 from students s
      where s.id = presence_intervals.student_id and s.auth_uid = auth.uid()
    )
  );

-- No client write policy: presence is written only by the vision pipeline
-- (service role) as it observes the class session.

-- ============================================================
-- proctor_flags — human review queue, never auto-penalty
-- ============================================================
create policy "proctor staff read" on proctor_flags
  for select using ((auth.jwt() ->> 'app_role') in ('teacher', 'admin'));

-- Staff may only move a flag through review_status — never touch flag_type,
-- student_id, or delete the row. Enforced by a trigger, since RLS's USING/
-- WITH CHECK clauses can restrict *which* rows are touched but not *which
-- columns* change within an allowed row.
create policy "proctor staff review" on proctor_flags
  for update using ((auth.jwt() ->> 'app_role') in ('teacher', 'admin'))
  with check ((auth.jwt() ->> 'app_role') in ('teacher', 'admin'));

create or replace function proctor_flags_review_only() returns trigger
language plpgsql as $fn$
begin
  if (auth.jwt() ->> 'app_role') in ('teacher', 'admin') and not (auth.jwt() ? 'service_role') then
    if new.session_id <> old.session_id
       or new.student_id is distinct from old.student_id
       or new.flag_type <> old.flag_type
       or new.suppressed <> old.suppressed
       or new.flagged_at <> old.flagged_at then
      raise exception 'staff review may only change review_status, reviewed_by, reviewed_at';
    end if;
  end if;
  return new;
end $fn$;

create trigger proctor_flags_review_only_trg before update on proctor_flags
for each row execute function proctor_flags_review_only();

-- No insert/delete policy: flags are raised only by the vision pipeline
-- (service role) — staff review, they never create or remove a flag.

-- ============================================================
-- engagement_zone_aggregates (Tier 2 — aggregate only, k >= 5 in schema)
-- ============================================================
create policy "aggregates staff read" on engagement_zone_aggregates
  for select using ((auth.jwt() ->> 'app_role') in ('teacher', 'management', 'admin'));

-- No client write policy: aggregation runs server-side (service role) only.

-- ============================================================
-- devices (capture clients)
-- ============================================================
create policy "devices staff read" on devices
  for select using ((auth.jwt() ->> 'app_role') in ('teacher', 'admin'));

create policy "devices admin write" on devices
  for all using ((auth.jwt() ->> 'app_role') = 'admin')
  with check ((auth.jwt() ->> 'app_role') = 'admin');

-- ============================================================
-- audit_log — admin only, append-only via the hash-chain trigger
-- ============================================================
create policy "audit admin read" on audit_log
  for select using ((auth.jwt() ->> 'app_role') = 'admin');

-- No client insert/update/delete policy: every row is appended by the
-- audit_chain trigger (migration 0001) on service-role writes to the tables
-- above. Client-side writes to audit_log are never permitted, including
-- by admin — the chain must reflect what the system actually did.

-- ==================== 0003_auth_role_hook.sql ====================
-- SensePro+ auth role delivery · Custom Access Token Hook
--
-- The RLS policies in 0002 read the role from the JWT as (auth.jwt() ->> 'app_role').
-- This migration makes that claim real: a user_roles table holds each auth user's
-- role, and a Supabase Access Token Hook injects it as a top-level claim on every
-- token issued. The claim therefore lives in the signed JWT, not just user_metadata
-- (which a client could try to influence at signup).
--
-- After applying, enable the hook in the dashboard OR via config:
--   Authentication > Hooks > Customize Access Token (JWT) > select public.custom_access_token_hook
-- (done via the Management API in this project's setup).

create table if not exists user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_role text not null check (app_role in ('teacher','management','admin','student')),
  created_at timestamptz not null default now()
);

-- The hook runs as supabase_auth_admin; it must read user_roles.
alter table user_roles enable row level security;

revoke all on table user_roles from anon, authenticated;
grant select on table user_roles to supabase_auth_admin;

drop policy if exists "auth admin reads roles" on user_roles;
create policy "auth admin reads roles" on user_roles
  for select to supabase_auth_admin using (true);

-- Access Token Hook: merge app_role into the event's claims.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $fn$
declare
  claims jsonb;
  role_text text;
begin
  select app_role into role_text
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  if role_text is not null then
    claims := jsonb_set(claims, '{app_role}', to_jsonb(role_text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$fn$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from anon, authenticated, public;

-- ==================== 0004_service_role_grants.sql ====================
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

-- ==================== 0005_authenticated_grants.sql ====================
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

-- ==================== 0006_fix_proctor_trigger.sql ====================
-- SensePro+ · remove a dead check from the proctor review-only trigger.
--
-- The 0002 version guarded staff updates with `not (auth.jwt() ? 'service_role')`,
-- which tests for a top-level JWT KEY named service_role. No Supabase token has
-- such a key — the service token carries role='service_role' as a VALUE. The
-- clause was always true and only misleads future edits. The outer app_role
-- check already scopes the restriction to staff: service-role tokens carry no
-- app_role claim, so they skip the column freeze naturally.

create or replace function proctor_flags_review_only() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $fn$
begin
  if (auth.jwt() ->> 'app_role') in ('teacher', 'admin') then
    if new.session_id <> old.session_id
       or new.student_id is distinct from old.student_id
       or new.flag_type <> old.flag_type
       or new.suppressed <> old.suppressed
       or new.flagged_at <> old.flagged_at then
      raise exception 'staff review may only change review_status, reviewed_by, reviewed_at';
    end if;
  end if;
  return new;
end $fn$;

-- ==================== 0007_phase3_read_paths.sql ====================
-- Phase 3 read paths: grants follow features (ADR 0006).
-- The teacher proctor-review panel and the management VNEI view go live now,
-- so the RLS policies that have sat dormant since 0001/0002 get their base
-- table privileges — and only now. Role gating stays in the policies
-- (proctor_flags: teacher/admin; engagement aggregates: staff); these grants
-- only stop Postgres rejecting the queries before policies are evaluated.

grant select on proctor_flags to authenticated;
grant select on engagement_zone_aggregates to authenticated;

-- Staff review touches exactly the three review columns. Column-scoped grant
-- plus the 0002/0006 trigger: two layers saying the same thing.
grant update (review_status, reviewed_by, reviewed_at) on proctor_flags to authenticated;

-- Live review queue: new flags reach the teacher dashboard without polling.
alter publication supabase_realtime add table proctor_flags;

-- ==================== seed.sql (4MCA-B roster) ====================
-- SensePro+ seed data — 4MCA-B class roster (53 students).
-- Run AFTER migrations 0001..0007 in the Supabase SQL editor.
-- Idempotent: re-running upserts the same rows (reg_no / device_key unique).

-- 1) Students -------------------------------------------------------------
insert into students (reg_no, full_name, class_section, seat_zone) values
  ('2547201', 'Aadharsh Krishnaa G', '4MCA-B', 'front'),
  ('2547203', 'Abhinav Jain', '4MCA-B', 'mid'),
  ('2547204', 'Aimee Susan Joseph', '4MCA-B', 'back'),
  ('2547205', 'Ajanya Vinayan', '4MCA-B', 'front'),
  ('2547206', 'Akashdeep Dey', '4MCA-B', 'mid'),
  ('2547208', 'Alan Sojan', '4MCA-B', 'back'),
  ('2547209', 'Albin Thomas', '4MCA-B', 'front'),
  ('2547210', 'Alok Tayal', '4MCA-B', 'mid'),
  ('2547211', 'Amogh Venkat D', '4MCA-B', 'back'),
  ('2547212', 'Anaamika KS', '4MCA-B', 'front'),
  ('2547213', 'Angel Blessy', '4MCA-B', 'mid'),
  ('2547216', 'Annette Elizabeth Shoney', '4MCA-B', 'back'),
  ('2547217', 'Annie Neena A.A', '4MCA-B', 'front'),
  ('2547218', 'B K Vishnu', '4MCA-B', 'mid'),
  ('2547219', 'Bhavya Dhanuka', '4MCA-B', 'back'),
  ('2547220', 'Dinu Devees George', '4MCA-B', 'front'),
  ('2547221', 'Ekta Singh', '4MCA-B', 'mid'),
  ('2547222', 'Emima J', '4MCA-B', 'back'),
  ('2547223', 'Enrita Fernandes', '4MCA-B', 'front'),
  ('2547224', 'Evan John Mathew', '4MCA-B', 'mid'),
  ('2547225', 'Evana Joseph', '4MCA-B', 'back'),
  ('2547226', 'Hanna Joshy', '4MCA-B', 'front'),
  ('2547227', 'Blessy I', '4MCA-B', 'mid'),
  ('2547228', 'Jai Pareek', '4MCA-B', 'back'),
  ('2547229', 'Karun Nagaraj', '4MCA-B', 'front'),
  ('2547230', 'Kuheli Begum', '4MCA-B', 'mid'),
  ('2547231', 'Kunnal', '4MCA-B', 'back'),
  ('2547232', 'Mahamat Tahir Souleymane', '4MCA-B', 'front'),
  ('2547233', 'Mohammed Rehan', '4MCA-B', 'mid'),
  ('2547234', 'Namratha R', '4MCA-B', 'back'),
  ('2547236', 'Nirupama Vincent', '4MCA-B', 'front'),
  ('2547237', 'Omkaar Chakraborty', '4MCA-B', 'mid'),
  ('2547238', 'Paavan Gupta', '4MCA-B', 'back'),
  ('2547239', 'Prajwal K T', '4MCA-B', 'front'),
  ('2547240', 'Pranav MR', '4MCA-B', 'mid'),
  ('2547241', 'R Karan', '4MCA-B', 'back'),
  ('2547242', 'Rahul Gupta', '4MCA-B', 'front'),
  ('2547243', 'Rishi Raj', '4MCA-B', 'mid'),
  ('2547244', 'Roy Mathew', '4MCA-B', 'back'),
  ('2547245', 'Sachin D', '4MCA-B', 'front'),
  ('2547246', 'Saurabh Burnwal', '4MCA-B', 'mid'),
  ('2547247', 'Sharon Mathew', '4MCA-B', 'back'),
  ('2547249', 'Slaven Derick Pais', '4MCA-B', 'front'),
  ('2547250', 'Sneha Varghese', '4MCA-B', 'mid'),
  ('2547252', 'Sudeepa Santhanam', '4MCA-B', 'back'),
  ('2547254', 'Varun Singh', '4MCA-B', 'front'),
  ('2547255', 'Vishwas Vashishtha', '4MCA-B', 'mid'),
  ('2547256', 'Xavier Amith J', '4MCA-B', 'back'),
  ('2547257', 'Yash Barjatya', '4MCA-B', 'front'),
  ('2547259', 'Ananya M', '4MCA-B', 'mid'),
  ('2547260', 'Mistry Jamis', '4MCA-B', 'back'),
  ('2547261', 'Maniarasan J', '4MCA-B', 'front'),
  ('2547262', 'Anushka Singh', '4MCA-B', 'mid')
on conflict (reg_no) do update set
  full_name = excluded.full_name,
  class_section = excluded.class_section,
  seat_zone = excluded.seat_zone;

-- 2) Consent records (v1, signed) ----------------------------------------
-- signature_hash is a sha256 placeholder; the signed form scans are kept
-- offline (DPDP: only the hash lives in the DB).
insert into consent_records (student_id, consent_version, signature_hash)
select s.id, 'v1', encode(digest(s.reg_no || ':v1', 'sha256'), 'hex')
from students s
where s.class_section = '4MCA-B'
  and not exists (select 1 from consent_records c where c.student_id = s.id);

-- 3) Browser-capture device (the laptop webcam client) -------------------
insert into devices (device_key, label, room) values
  ('browser-capture', 'Laptop webcam capture client', '4MCA-B classroom')
on conflict (device_key) do nothing;

-- 4) An open demo session so the teacher dashboard has a live session ----
insert into class_sessions (device_id, class_section, subject, mode, starts_at)
select d.id, '4MCA-B', 'Live demo session', 'lecture', now()
from devices d
where d.device_key = 'browser-capture'
  and not exists (
    select 1 from class_sessions cs where cs.class_section = '4MCA-B' and cs.ends_at is null
  );

-- ==================== demo read access (no-login dashboards) ====================
-- Lets the demo-mode (anon) dashboards READ live data without a login.
-- Writes still go only through the service role. Remove these for production
-- and use the authenticated + app_role path from 0002/0005/0007 instead.
grant usage on schema public to anon;
grant select on students, class_sessions, presence_intervals, proctor_flags, engagement_zone_aggregates to anon;

create policy "demo anon read students"    on students                     for select to anon using (true);
create policy "demo anon read sessions"    on class_sessions               for select to anon using (true);
create policy "demo anon read presence"    on presence_intervals           for select to anon using (true);
create policy "demo anon read flags"       on proctor_flags                for select to anon using (true);
create policy "demo anon read aggregates"  on engagement_zone_aggregates   for select to anon using (true);

-- Live teacher roster + management needs realtime on these (proctor_flags is
-- already published in 0007).
alter publication supabase_realtime add table presence_intervals;
alter publication supabase_realtime add table class_sessions;
