-- SensePro+ · Migration 0002 · Row-Level Security Policies
-- Must run AFTER 0001_init.sql

-- ─── Enable RLS on all tables ──────────────────────────────────────────────
alter table public.profiles                   enable row level security;
alter table public.classes                    enable row level security;
alter table public.consent_records            enable row level security;
alter table public.embeddings                 enable row level security;
alter table public.devices                    enable row level security;
alter table public.class_sessions             enable row level security;
alter table public.presence_intervals         enable row level security;
alter table public.proctor_flags              enable row level security;
alter table public.engagement_zone_aggregates enable row level security;
alter table public.audit_log                  enable row level security;

-- ─── Helper: get current user role ─────────────────────────────────────────
create or replace function public.current_role_name()
returns user_role language sql stable as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ─── profiles ───────────────────────────────────────────────────────────────
-- Everyone sees their own profile; admin/management see all; teacher sees their class
create policy "profiles_self_read" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_admin_all" on public.profiles
  for all using (public.current_role_name() = 'admin');

create policy "profiles_teacher_class" on public.profiles
  for select using (
    public.current_role_name() = 'teacher'
    and class_id in (select id from public.classes where teacher_id = auth.uid())
  );

create policy "profiles_management_read" on public.profiles
  for select using (public.current_role_name() = 'management');

-- ─── classes ────────────────────────────────────────────────────────────────
create policy "classes_teacher_own" on public.classes
  for all using (teacher_id = auth.uid());

create policy "classes_admin_all" on public.classes
  for all using (public.current_role_name() = 'admin');

create policy "classes_management_read" on public.classes
  for select using (public.current_role_name() = 'management');

-- ─── consent_records ────────────────────────────────────────────────────────
create policy "consent_self" on public.consent_records
  for all using (student_id = auth.uid());

create policy "consent_admin" on public.consent_records
  for all using (public.current_role_name() = 'admin');

-- ─── embeddings ─────────────────────────────────────────────────────────────
-- Only admin can write embeddings; no one can read them via API (service role only)
create policy "embeddings_admin_all" on public.embeddings
  for all using (public.current_role_name() = 'admin');

-- ─── devices ────────────────────────────────────────────────────────────────
create policy "devices_admin_all" on public.devices
  for all using (public.current_role_name() = 'admin');

create policy "devices_teacher_read" on public.devices
  for select using (public.current_role_name() = 'teacher');

-- ─── class_sessions ─────────────────────────────────────────────────────────
create policy "sessions_teacher_own" on public.class_sessions
  for all using (teacher_id = auth.uid());

create policy "sessions_admin_all" on public.class_sessions
  for all using (public.current_role_name() = 'admin');

create policy "sessions_management_read" on public.class_sessions
  for select using (public.current_role_name() = 'management');

-- ─── presence_intervals ─────────────────────────────────────────────────────
create policy "presence_student_self" on public.presence_intervals
  for select using (student_id = auth.uid());

create policy "presence_teacher_class" on public.presence_intervals
  for select using (
    public.current_role_name() = 'teacher'
    and session_id in (
      select id from public.class_sessions where teacher_id = auth.uid()
    )
  );

create policy "presence_admin_all" on public.presence_intervals
  for all using (public.current_role_name() = 'admin');

create policy "presence_management_read" on public.presence_intervals
  for select using (public.current_role_name() = 'management');

-- ─── proctor_flags ──────────────────────────────────────────────────────────
create policy "flags_teacher_own_session" on public.proctor_flags
  for all using (
    session_id in (
      select id from public.class_sessions where teacher_id = auth.uid()
    )
  );

create policy "flags_admin_all" on public.proctor_flags
  for all using (public.current_role_name() = 'admin');

-- ─── engagement_zone_aggregates ─────────────────────────────────────────────
-- Students cannot see engagement aggregates; teachers/management/admin can
create policy "engagement_teacher" on public.engagement_zone_aggregates
  for select using (
    public.current_role_name() in ('teacher', 'management', 'admin')
  );

-- ─── audit_log ──────────────────────────────────────────────────────────────
create policy "audit_admin_read" on public.audit_log
  for select using (public.current_role_name() = 'admin');

-- No update/delete policies (rules already block them; belt-and-suspenders)
