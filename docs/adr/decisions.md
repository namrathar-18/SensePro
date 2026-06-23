# ADR 001 — Browser capture over edge device

**Date:** Week 1  
**Status:** Accepted  
**Decided by:** Full team

## Decision
Use `getUserMedia()` in the browser to capture the classroom camera, stream JPEG frames over WebSocket to the Python backend.

## Why
- No hardware procurement (removes hardest logistics for a 1-month build)
- Works on any classroom laptop/smart-board already present
- Common, defensible pattern (Zoom/Meet do the same)

## Trade-offs accepted
- Frames briefly transit the network (LAN only; processed in memory; never stored)
- Adds ~1-2 frame latency vs on-device inference
- Future work: in-browser ONNX inference for better privacy + scale

---

# ADR 002 — InsightFace buffalo_l as primary vision library

**Date:** Week 1  
**Status:** Accepted

## Decision
Use InsightFace's `buffalo_l` pack (SCRFD + ArcFace ResNet-50) as the single dependency for detection + embedding.

## Why
- One `pip install insightface` gives detection, embedding, and landmarks
- Pretrained on MS-Celeb/Glint (millions of faces) — no training required
- CPU-capable via onnxruntime; good accuracy at 640px

## Trade-offs accepted
- ~330 MB model download on first run (cache in CI)
- SCRFD tuned for frontal; accuracy degrades past 5-6m (documented honestly)

---

# ADR 003 — No per-student engagement data (ever)

**Date:** Week 1  
**Status:** Accepted (non-negotiable)

## Decision
The schema has NO per-student engagement table. Engagement exists only as zone-level aggregates with k≥5 suppression.

## Why
- EU AI Act Article 5(1)(f) prohibits emotion inference in education (since Feb 2025)
- India's DPDP Act requires data minimisation
- Per-student "attention scores" are pseudoscientific and legally risky
- VNEI is both more honest (admits what the camera can't see) and fairer (weights all zones equally)

## Trade-offs accepted
- Less granular analytics
- Management can't drill down to individual students (by design)

---

# ADR 004 — Supabase as single backend service

**Date:** Week 1  
**Status:** Accepted

## Decision
Use Supabase for Postgres, pgvector, Auth, RLS, Realtime, and Storage.

## Why
- One vendor = one free tier to manage
- Team has prior experience (UniEasy project)
- pgvector is native for 512-d ArcFace embeddings
- Realtime subscriptions power live roster without polling
- Auth + RLS enforces role-based access at the DB layer (belt-and-suspenders)

## Trade-offs accepted
- Free tier pauses after inactivity (keep-alive ping required for demo)
- Service key must never leave the backend

---

# ADR 005 — Human-in-the-loop for all proctor flags (hard invariant)

**Date:** Week 1  
**Status:** Accepted (non-negotiable)

## Decision
`proctor_flags.auto_action` is a generated column that is always NULL. The system never penalises automatically. Every flag goes to a teacher review queue.

## Why
- A false positive that auto-penalises a student in an exam is a serious harm
- Gaze-down suppression reduces FPR but does not eliminate it
- Human oversight is legally and ethically required
- Stated clearly at viva: "the system assists, never decides"

## Trade-offs accepted
- Teacher must actively review the queue during exams
- Slower than fully automated, but correct
