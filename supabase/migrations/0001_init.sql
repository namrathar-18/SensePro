-- SensePro+ · Migration 0001 · Initial Schema
-- Run: supabase db push  OR  paste into Supabase SQL editor

-- ─── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "vector";        -- pgvector for ArcFace embeddings
create extension if not exists "pgcrypto";      -- gen_random_bytes for audit hash

-- ─── Enums ─────────────────────────────────────────────────────────────────
create type user_role as enum ('teacher', 'management', 'admin', 'student');
create type presence_state as enum ('PRESENT', 'UNVERIFIED', 'ABSENT');
create type session_mode as enum ('attendance', 'exam');
create type flag_type as enum ('phone_detected', 'extra_person', 'gaze_sustained');

-- ─── Users (extends Supabase auth.users) ───────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'student',
  student_id  text unique,                  -- null for non-students
  class_id    uuid,                         -- FK added after classes table
  created_at  timestamptz default now()
);

-- ─── Classes ───────────────────────────────────────────────────────────────
create table public.classes (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  teacher_id  uuid references public.profiles(id),
  created_at  timestamptz default now()
);

alter table public.profiles
  add constraint fk_profile_class
  foreign key (class_id) references public.classes(id) on delete set null;

-- ─── Consent records ───────────────────────────────────────────────────────
create table public.consent_records (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  signed_at   timestamptz,
  ip_hash     text,                         -- SHA-256 of IP, for audit
  version     text not null default '1.0',
  withdrawn_at timestamptz,
  created_at  timestamptz default now(),
  unique (student_id, version)
);

-- ─── Embeddings (pgvector) ─────────────────────────────────────────────────
-- INVARIANT: a row here MUST have consent_records.signed_at non-null
create table public.embeddings (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  pose_bin    text not null,                -- 'center'|'left'|'right'|'up'|'down'|'avg'
  embedding   vector(512) not null,
  quality_score float4,
  created_at  timestamptz default now()
);

-- IVFFlat index for cosine similarity search
create index on public.embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 20);

-- ─── Devices (browser capture clients) ─────────────────────────────────────
create table public.devices (
  id          uuid primary key default uuid_generate_v4(),
  label       text not null,
  class_id    uuid references public.classes(id) on delete set null,
  registered_by uuid references public.profiles(id),
  last_seen   timestamptz,
  created_at  timestamptz default now()
);

-- ─── Class sessions ────────────────────────────────────────────────────────
create table public.class_sessions (
  id          uuid primary key default uuid_generate_v4(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  teacher_id  uuid references public.profiles(id),
  device_id   uuid references public.devices(id),
  mode        session_mode not null default 'attendance',
  started_at  timestamptz default now(),
  ended_at    timestamptz,
  meta        jsonb default '{}'::jsonb     -- frame_count, avg_latency_ms, etc.
);

-- ─── Presence intervals ────────────────────────────────────────────────────
create table public.presence_intervals (
  id           uuid primary key default uuid_generate_v4(),
  session_id   uuid not null references public.class_sessions(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  state        presence_state not null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  duration_s   int generated always as (
    extract(epoch from (coalesce(ended_at, now()) - started_at))::int
  ) stored
);

create index on public.presence_intervals (session_id, student_id);

-- ─── Proctor flags (human review queue only — NEVER auto-penalise) ─────────
create table public.proctor_flags (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references public.class_sessions(id) on delete cascade,
  flag_type     flag_type not null,
  detected_at   timestamptz not null default now(),
  confidence    float4,
  zone          text,                       -- spatial zone hint
  reviewer_id   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  review_note   text,
  auto_action   text generated always as (null) stored,  -- INVARIANT: always NULL
  created_at    timestamptz default now()
);

-- ─── Engagement zone aggregates ────────────────────────────────────────────
-- INVARIANT: student_count >= 5 enforced by CHECK — never per-student rows
create table public.engagement_zone_aggregates (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references public.class_sessions(id) on delete cascade,
  zone            text not null,            -- 'front'|'middle'|'back'|'left'|'right'
  window_start    timestamptz not null,
  window_end      timestamptz not null,
  student_count   int not null,
  vnei_score      float4,                   -- null if student_count < 5
  coverage_ratio  float4 not null,          -- fraction of zone seats camera could see
  head_pose_avg   float4,
  eye_closure_avg float4,
  phone_rate      float4,                   -- fraction of frames phone detected
  stillness_avg   float4,
  created_at      timestamptz default now(),
  constraint k_suppression check (student_count >= 5 or vnei_score is null)
);

-- ─── Audit log (append-only, hash-chained) ─────────────────────────────────
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,                         -- null = system
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  payload     jsonb default '{}'::jsonb,
  prev_hash   text,
  row_hash    text,
  created_at  timestamptz default now()
);

-- Trigger: compute hash chain on insert
create or replace function public.audit_hash_chain()
returns trigger language plpgsql as $$
declare
  prev text;
begin
  select row_hash into prev
    from public.audit_log
    order by id desc
    limit 1;

  new.prev_hash := coalesce(prev, 'GENESIS');
  new.row_hash  := encode(
    digest(
      new.prev_hash || '|' || new.action || '|' ||
      coalesce(new.entity_id::text, '') || '|' ||
      new.payload::text || '|' ||
      new.created_at::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

create trigger trg_audit_hash
  before insert on public.audit_log
  for each row execute function public.audit_hash_chain();

-- Prevent deletes and updates on audit_log
create rule no_delete_audit as on delete to public.audit_log do instead nothing;
create rule no_update_audit as on update to public.audit_log do instead nothing;
