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
