-- SensePro+ · Migration 0003 · Helper functions

-- Called by the stop-session endpoint to close any still-open presence intervals
create or replace function public.close_open_intervals(
  p_session_id uuid,
  p_ended_at   timestamptz
)
returns void language plpgsql as $$
begin
  update public.presence_intervals
  set ended_at = p_ended_at
  where session_id = p_session_id
    and ended_at is null;
end;
$$;

-- Materialised view: per-session attendance summary (used by management reports)
create or replace view public.session_attendance_summary as
select
  pi.session_id,
  cs.class_id,
  cs.started_at,
  cs.ended_at,
  cs.mode,
  count(distinct pi.student_id)                                        as total_students,
  count(distinct pi.student_id) filter (
    where pi.state = 'PRESENT'
  )                                                                     as present_count,
  round(
    count(distinct pi.student_id) filter (where pi.state = 'PRESENT')
    * 100.0 /
    nullif(count(distinct pi.student_id), 0)
  , 1)                                                                  as attendance_pct
from public.presence_intervals pi
join public.class_sessions cs on cs.id = pi.session_id
group by pi.session_id, cs.class_id, cs.started_at, cs.ended_at, cs.mode;

-- Grant read to management and admin
grant select on public.session_attendance_summary to authenticated;
