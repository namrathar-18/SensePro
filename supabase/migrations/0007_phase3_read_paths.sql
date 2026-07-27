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
