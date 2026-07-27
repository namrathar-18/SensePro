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
