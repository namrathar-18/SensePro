# ADR 0005 — Row-Level Security policies per role

**Context.** ADR 0004 commits the frontend to reading directly from Postgres via Supabase RLS
+ Realtime rather than through a custom REST API, so the database itself must enforce who can
see and change what — there is no application layer standing between the browser and the
tables. Migration `0001_init.sql` enabled RLS on all nine tables but left only two example
policies (staff read on `students` and on `engagement_zone_aggregates`), with a comment marking
the rest as a Phase-2 TODO: student self-only policies, write policies for service paths, and
audit read restricted to admin.

**Decision.** `supabase/migrations/0002_rls.sql` replaces the skeleton with the full per-role
policy set. Role arrives as the JWT claim `app_role` (`teacher | management | admin | student`).
The FastAPI vision write-path authenticates with the Supabase **service role**, which bypasses
RLS — that is how presence intervals, embeddings, and proctor flags get written without needing
per-row client authorization; every policy below governs client (anon/authenticated) access only.

| Table | Client read | Client write |
|---|---|---|
| `students` | staff (all rows); student (own row, via new `auth_uid` link) | none |
| `consent_records` | admin (all); student (own) | none |
| `embeddings` | **admin only** — for audit (e.g. confirming a deletion purged the vectors) | none |
| `class_sessions` | staff (all) | teacher (insert/update own sessions, `created_by = auth.uid()`) |
| `presence_intervals` | staff (all); student (own) | none |
| `proctor_flags` | teacher + admin (all) | teacher + admin may update `review_status`/`reviewed_by`/`reviewed_at` only — a trigger rejects any other column change on the same row |
| `engagement_zone_aggregates` | staff (all) | none |
| `devices` | teacher + admin (read); admin (write) | admin only |
| `audit_log` | admin | none — the hash-chain trigger appends rows on service-role writes; no client, not even admin, may insert |

A new nullable `students.auth_uid uuid references auth.users(id)` links a student's row to
their Supabase Auth account, since most students won't have a login in Phase 1 and the
recognition/matching path never depends on it.

`embeddings` is deliberately the strictest table: teacher, management, and student get **no**
read policy at all — not "returns nothing due to a restrictive filter," but no SELECT policy
exists for those roles, so Postgres denies the query outright. Admin keeps read access for
operational audit (confirming a right-to-deletion request actually removed the vectors) rather
than routing that check through a backend endpoint.

`proctor_flags` writes are constrained below the RLS grain: `USING`/`WITH CHECK` can restrict
*which rows* a role may touch but not *which columns* change within an allowed row, so a
`before update` trigger (`proctor_flags_review_only`) rejects any staff update that changes
`session_id`, `student_id`, `flag_type`, `suppressed`, or `flagged_at` — staff can move a flag
through review, they cannot rewrite what was flagged. This is the RLS-layer expression of the
human-in-the-loop invariant: staff review, the vision pipeline is the only writer of what
happened.

**Consequences.**
- (+) Authorization lives in the database, matching the database-centric read path from ADR
  0004 — a dashboard bug cannot leak rows RLS would have blocked.
- (+) `embeddings` being unreadable by teacher/management/student is a stricter stance than the
  original skeleton implied ("students self read" only, no mention of embeddings); it makes the
  "embeddings-only identity, never exposed" invariant concrete at the row-security layer.
- (−) `students.auth_uid` is a new column with no backfill in this migration — student self-read
  policies exist but return nothing until student accounts are actually linked (Week 2). This is
  expected: Phase 1 has no student-lite login yet.
- (−) The `proctor_flags` column-level restriction needed a trigger because RLS alone cannot
  express "these columns only" — worth remembering as a pattern if other tables need the same
  shape later (e.g. a future "reviewed but not re-flaggable" column set).
- Validated by execution, not just structurally: applied against a disposable local Postgres 16
  + pgvector container (with a minimal `auth.users`/`auth.uid()`/`auth.jwt()` stub standing in
  for Supabase's managed auth schema) — both `0001_init.sql` and this migration ran with zero
  errors, and all 16 policies landed as designed. Functionally verified default-deny (`SELECT`
  with no `app_role` claim returns 0 rows), staff read (teacher claim sees the seeded student),
  and the `embeddings` restriction (teacher claim explicitly returns 0 rows against embeddings,
  confirming no policy accidentally grants that access). Not yet applied to the real Supabase
  project — do that before relying on it in a live environment.
