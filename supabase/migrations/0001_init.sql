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
