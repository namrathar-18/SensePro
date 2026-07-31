-- Student visibility of class_sessions.
--
-- Problem this fixes: a student can read their own presence_intervals (RLS
-- "presence self read"), but class_sessions was staff-only. So the student
-- console's join returned nothing and every row rendered as "— Session" with no
-- class name, subject, or mode.
--
-- A class_session row carries no personal data — class section, subject, mode,
-- start/end time. It is the timetable. Letting a signed-in student read the
-- sessions of THEIR OWN class section is the minimum needed to show "which
-- class was this, and did I attend it", and reveals nothing about anyone else:
-- per-student attendance is still gated by the presence_intervals policies.
--
-- Run once in the Supabase SQL editor (idempotent).

drop policy if exists "sessions student read own section" on class_sessions;

create policy "sessions student read own section" on class_sessions
  for select
  using (
    public.jwt_role() = 'student'
    and class_section in (
      select s.class_section
      from students s
      where s.auth_uid = auth.uid()
    )
  );

-- Students already hold SELECT on class_sessions via the authenticated grant
-- (APPLY_ALL.sql); the policy above is what actually admits the rows.
