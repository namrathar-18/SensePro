# SensePro+ — PRD implementation checklist

Status of every PRD feature. Legend:

- ✅ **Done & verified** — implemented and confirmed working (build passes / 43 backend tests pass).
- 🟡 **Done in code — one hand-off step to go fully live** — the code is complete; it needs a
  one-time environment step (install a model, or run the Supabase SQL). See README “Go fully live”.
- 🟠 **Partial** — present but not fully wired.
- ⚪ **Out of scope for v1** (PRD §4 explicitly defers these).

---

## Core platform
| Feature | Status | Notes |
|---|---|---|
| Monorepo builds end-to-end | ✅ | `npm run build` (frontend) + `pytest` 43/43 + `ruff` clean |
| Responsive PWA, dark cinematic UI | ✅ | React + TS + Vite + TanStack Router |
| Your Supabase creds wired; friend's removed | ✅ | publishable key in app; friend's project ref scrubbed |
| Fresh git history under your name | ✅ | detached from friend's repo; pushed to your repo only |
| Real 4MCA-B class (53 students) everywhere | ✅ | roster.json (backend) + class-roster.ts (frontend) + seed.sql |

## 1 · Attendance (the make-or-break loop)
| Feature | Status | Notes |
|---|---|---|
| Laptop webcam capture (getUserMedia → WebSocket) | ✅ | `/capture` page, live overlay + present list |
| Face detect → track → re-ID → presence | ✅ | pipeline + IoU tracker + FSM (PRESENT/UNVERIFIED/ABSENT) |
| Live roster with **names + reg numbers** | ✅ | WS result enriched from roster.json |
| Presence persisted to Supabase | 🟡 | add service key + run migrations/seed → writes go live |
| Real face recognition on the real class | 🟡 | `pip install .[insightface]` + `enroll_class` (stub runs until then) |
| Teacher live roster (Realtime) | ✅/🟡 | reads live from Postgres when seeded; else shows the real class demo |
| Enrolment tool (no training, embeddings only) | ✅ | single-student CLI **and** batch `enroll_class` for the whole class |

## 2 · Exam proctoring
| Feature | Status | Notes |
|---|---|---|
| Exam mode from the webcam (`/capture?mode=exam`) | ✅ | folds the proctor engine into the webcam path |
| Phone / extra-person detection | 🟡 | logic done; real detection = `pip install .[proctor]` + `PROCTOR_BACKEND=yolo` (stub until then) |
| Gaze-down false-positive suppression | ✅ | writing-posture filter; FPR on/off measured by the eval harness |
| Human review queue (never auto-penalise) | ✅ | every flag = `pending`; ProctorReviewPanel + teacher review |

## 3 · Engagement (VNEI, fairness-aware)
| Feature | Status | Notes |
|---|---|---|
| Zone (front/mid/back) VNEI aggregation | ✅ | runs from webcam + RTSP; behavioural signals only |
| Aggregate-only, k ≥ 5 suppression | ✅ | enforced in code **and** DB CHECK constraint |
| Coverage badge (honest about unseen seats) | ✅ | VneiPanel |
| Naive-mean-vs-VNEI bias chart | ✅ | BiasChart on Management/Trends |
| No per-student engagement anywhere | ✅ | invariant held in schema, API, and UI |

## 4 · Dashboards & roles
| Feature | Status | Notes |
|---|---|---|
| Teacher (live roster, review, KPIs) | ✅ | live when seeded; class demo otherwise |
| Management (cross-class trends, VNEI) | ✅ | |
| Admin (devices, users, consent, deletion queue, audit) | ✅ | |
| Student-lite `/me` (own record, consent, request deletion) | ✅ | |
| Login + demo entry | ✅ | real Supabase auth + “Continue in demo mode” |

## 5 · Data, privacy, compliance (DPDP / EU AI Act)
| Feature | Status | Notes |
|---|---|---|
| Supabase schema (pgvector, sessions, presence, flags, aggregates) | ✅ | migrations 0001–0007 |
| RLS policies per role | ✅ | migrations 0002–0006 |
| Hash-chained audit log | ✅ | trigger-enforced chain |
| Consent registry | ✅ | schema + seed + admin UI |
| Embeddings-only; raw frames discarded | ✅ | never persisted |
| No emotion labels; behaviour only | ✅ | invariant |
| Right-to-deletion | 🟠 | cascade delete in schema + request UI (admin queue / `/me`); a dedicated purge **API endpoint** is not yet wired |
| Apply migrations + seed to *your* Supabase | 🟡 | run the SQL in the Supabase editor (README step 2) |

## 6 · Reporting & evaluation
| Feature | Status | Notes |
|---|---|---|
| Honest eval harness (accuracy, duration error, proctor FPR on/off) | ✅ | `python -m eval.run` |
| Session report PDF export | ✅ | teacher “Export session report (PDF)” button generates a branded one-page PDF (jsPDF + autotable) |

## Out of scope for v1 (PRD §4 — future work)
⚪ Multi-classroom fleet management · native mobile apps · LMS deep integration ·
liveness/anti-spoofing v2 · in-browser inference at scale · audio/talk-time analytics.

---

### The two things to do for a fully-live demo
1. **Enrol the real class** → `pip install -e ".[insightface]"` then run `enroll_class` (README step 1).
2. **Turn on Supabase** → run the migrations + `seed.sql`, add the service-role key to `backend/.env` (README step 2).

Everything else already runs the moment you start the backend and frontend.
