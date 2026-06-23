# SensePro+ — CLAUDE.md (Invariants & Working Agreement)

## Non-negotiable invariants — never violate these

1. **Raw frames are NEVER stored.** Frames arrive over WebSocket, are processed in memory, and immediately discarded. No frame hits disk, no frame hits the DB, no frame hits any log.
2. **No per-student engagement data exists.** The `engagement_zone_aggregates` table is the ONLY engagement table. There is no per-student engagement score, emotion label, or attention rating anywhere in the schema, API, or UI.
3. **Every proctor flag goes to a human review queue.** The system NEVER auto-penalises. `proctor_flags.auto_action` must always be NULL.
4. **k ≥ 5 suppression on engagement.** Any aggregate with fewer than 5 students in a zone is suppressed (NULL / hidden). Enforced via DB CHECK constraint and API layer.
5. **Consent before enrollment.** A student's embedding cannot be written until `consent_records.signed_at` is non-null for that student.
6. **Audit log is append-only and hash-chained.** Never DELETE from `audit_log`. The trigger that writes `prev_hash` must never be bypassed.
7. **No emotion labels.** We track: head_pose_score, eye_closure_score, phone_detected (bool), stillness_score. We do NOT label: tired, bored, attentive, stressed, happy, sad.
8. **Every AI-tool-generated line must be explainable by the author at viva.** If you can't explain it, rewrite it.

## Architecture constants

- Backend: Python 3.11 + FastAPI + WebSocket
- Vision: InsightFace (buffalo_l) for SCRFD + ArcFace, ByteTrack, YOLOv8n
- DB: Supabase (Postgres + pgvector + Auth + RLS + Realtime)
- Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui
- Frame rate: 1–2 fps from browser, JPEG, downscaled to max 640px wide
- Cosine similarity threshold: start 0.45, calibrate on real faces

## Git rules

- `main` is protected — no direct pushes
- All commits: conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`)
- Squash-merge PRs
- No bot authors on commits — human reviews and commits all AI output
- Branch naming: `feat/`, `fix/`, `docs/`, `test/`

## Slice ownership

| Slice | Owner | Scope |
|-------|-------|-------|
| A — Capture & Recognition | Vishwas | WS pipeline, SCRFD/ArcFace/ByteTrack, enrollment CLI, /capture UI |
| B — Attendance & Identity | Member 2 | Presence FSM, Auth/RLS, teacher + student-lite dashboards |
| C — Proctor & Engagement | Member 3 | YOLO, gaze filter, VNEI, management + admin dashboards |

## Week exit criteria

- **Week 1:** Live browser camera names an enrolled face end-to-end
- **Week 2:** Start session → live roster fills → export PDF report
- **Week 3:** Exam mode flags phone (not writing student); VNEI bias chart renders
- **Week 4:** Bound report + rehearsed demo + backup video + clean repo
