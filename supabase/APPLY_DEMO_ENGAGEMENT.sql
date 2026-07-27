-- ============================================================
-- SensePro+ · DEMO ONLY — relax the engagement k-anonymity floor
-- ============================================================
-- Class engagement (VNEI) is aggregate-only and, by design, suppresses any
-- zone with fewer than 5 tracked faces (privacy — DPDP / EU AI Act). That means
-- with 1-2 people in front of a webcam you see NOTHING, which is correct.
--
-- For a small controlled demo, run this to lower the DB floor to 1 so the
-- engagement you test is stored and visible. Pair it with ENGAGEMENT_K_MIN=1 in
-- backend/.env (already set). KEEP THE FLOOR AT 5 IN PRODUCTION.
--
-- To restore production privacy: swap the check back to (n_tracked >= 5).
alter table engagement_zone_aggregates
  drop constraint if exists engagement_zone_aggregates_n_tracked_check;
alter table engagement_zone_aggregates
  add constraint engagement_zone_aggregates_n_tracked_check check (n_tracked >= 1);
