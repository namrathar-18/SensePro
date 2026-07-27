# ADR 0006 — Realtime read path and grants-follow-features

**Context.** Phase 2 makes attendance real: the backend persists presence intervals and the
teacher dashboard must show a roster that updates by itself. ADR 0004 already committed to
database-centric reads (browser → Postgres via RLS, no custom read API). Two discoveries during
implementation shaped this ADR: (1) Postgres GRANTs and RLS are additive layers — enabling RLS
policies without base table privileges leaves every client query rejected before policies are
evaluated (this bit both `service_role`, fixed in 0004, and `authenticated`, fixed in 0005);
(2) the note in the playbook naming this ADR "0005" was stale — 0005 is the RLS-policies ADR.

**Decision.**
- **Reads:** the browser reads `students`, `class_sessions`, and `presence_intervals` directly
  with the anon-key client under RLS, and subscribes to `presence_intervals` changes over
  Supabase Realtime (`supabase_realtime` publication), filtered by session id. No REST read
  endpoint, no polling. The roster is derived client-side: latest interval per student sets the
  state; PRESENT durations sum closed intervals plus the open one.
- **Writes:** the backend opens an interval with a client-generated uuid (INSERT) and closes it
  by PATCHing `ended_at` onto that same id — one row per interval, never a duplicate insert.
  Writes run off the event loop (`run_in_threadpool`) and are log-and-drop on failure: the
  capture loop must survive a database outage; a lost interval is recoverable, a crashed live
  session is not. A retry queue was built and then removed — writes are sparse (one burst per
  re-ID pass) and a queue that only drains on the next write changes nothing at this scale.
- **Grants follow features:** `authenticated` holds SELECT on exactly the three tables the
  Phase-2 UI reads. `embeddings`, `consent_records`, `audit_log`, and `proctor_flags` have RLS
  policies (0002) but no `authenticated` grant — those policies are intentionally dormant until
  a real feature reads those tables from the client, at which point the grant is widened in a
  migration. Defense in depth: a future RLS mistake on a sensitive table cannot leak rows to a
  role that lacks base privileges.
- The session report PDF is generated client-side (jspdf, dynamically imported) from the live
  roster — no report endpoint, no server rendering.

**Consequences.**
- (+) Zero read API to build, document, or keep consistent; the roster updates within ~1s of a
  backend write; the report works offline from already-loaded data.
- (+) One-row-per-interval makes `presence_intervals` directly usable for duration analytics.
- (−) Dormant RLS policies can read as dead code; this ADR is the record of why they exist.
- (−) A dropped write is silently absent from the roster (logged server-side only). Accepted
  for single-classroom scale; revisit if intervals ever feed grading rather than display.
- (−) Client-side JWT payload decode (unverified) routes the UI only; RLS remains the actual
  enforcement — worth restating at viva.
