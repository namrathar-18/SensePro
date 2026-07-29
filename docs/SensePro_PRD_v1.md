# SensePro+ — Product Requirements Document (v1)
### Browser-based attendance, proctoring & fairness-aware engagement analytics
**MCA major project · CHRIST University · Team of 3 · 4-week build**
**Doc owner:** Namratha R · **Status:** v1 for build · **Supersedes:** the on-board edge architecture in the earlier roadmap files (see §6).

---

## 0 · Read this first — three things your answers changed

1. **Timeline is 1 month, full scope.** This is the most aggressive plan in the whole evaluation. It is doable *only* because (a) there is **no model training** — see §9 — so zero GPU-days are spent; (b) the browser-camera decision removes all hardware procurement and setup; (c) you lean hard on the AI tool fleet. Every phase below has an **MVP line** and a **full line**. If you slip, you cut *down to the MVP line in reverse order: VNEI depth → proctor breadth → and you protect attendance at all costs.* Attendance must be bulletproof; the other two degrade gracefully.

2. **Camera via web app (Zoom/Meet style) = no edge device.** This is a real architecture change and it *supersedes* the on-board ONNX design in the earlier files. The classroom laptop/board opens the web app, grants camera permission (`getUserMedia`), and streams frames to a Python backend that runs the vision models. The browser is the *capture + display* surface; the server is the *brain*. This is simpler for a 1-month build and removes the hardest logistics — at the cost of running an inference server (fine for one classroom).

3. **You enroll, you don't "train."** You said "train the model" and "50 frames to train" — the models (ArcFace, SCRFD, YOLO) are **already trained** on millions of faces. You **enroll** each student by computing a face *embedding* (a 512-number fingerprint) once, then *match* live faces against it. The video→frames pipeline you described is exactly right — it's just **enrollment**, not training, and the right target is **10–20 quality frames per student, not 50** (§9–10). No epochs, no datasets, no loss curves.

---

## 1 · Problem statement

Manual attendance costs every lecture 5–8 minutes of contact time and is trivially gamed (proxy calls). Exam invigilation is labour-intensive and inconsistent. And no instructor has objective, *fair* visibility into whether a session actually held the room — and the few systems that attempt "engagement" silently over-count visible front-row students and ignore the back, or cross into pseudoscientific per-student "emotion grading."

CHRIST classrooms already run laptops/smart-board browsers capable of camera access. The opportunity: a **software-only** system that, from a single classroom camera feed in the browser, (a) marks attendance automatically and continuously, (b) assists exam proctoring with a human always in the loop, and (c) reports **class- and zone-level** engagement that weighs every seat equally and is honest about what the camera cannot see — all under India's DPDP Act and designed to the strictest global standard (the EU AI Act's prohibition on emotion inference in education).

## 2 · Solution overview

A responsive web app captures the classroom camera and streams frames to a FastAPI backend. The backend detects faces (SCRFD), tracks them (ByteTrack), re-identifies each track every N seconds against enrolled embeddings (ArcFace), and drives a per-student **presence state machine**. In exam mode it adds object detection (YOLOv8n: phone, extra person) and a **gaze-down suppression filter** so students writing aren't falsely flagged — every flag goes to a **human review queue**, never an auto-penalty. A parallel **engagement layer** derives behavioural signals (head pose, eye-closure, phone-in-hand, stillness) and aggregates them with the **Visibility-Normalised Engagement Index (VNEI)** — class/zone level only, with a **coverage badge** that refuses to pretend it sees what it can't. Everything persists in Supabase (Postgres + pgvector + Auth/RLS + Realtime); four role dashboards consume it live.

## 3 · Goals & success metrics

| Metric | MVP target | Full target |
|---|---|---|
| ID accuracy ≤ 4 m | ≥ 90% | ≥ 95% |
| ID accuracy 5–6 m | report honestly | ≥ 85% |
| Presence-duration error / 60 min | ≤ 8 min | ≤ 5 min |
| Frame→dashboard latency | < 4 s | < 3 s |
| Proctor false-positive reduction (gaze-down filter on vs off) | demonstrated | ≥ 50% |
| Fabricated/auto-penalty actions | 0 (hard) | 0 (hard) |
| VNEI back-vs-front bias (naive mean vs VNEI) | shown on one chart | quantified per-zone |
| Demo stability | 0 crashes in a 20-min run | 0 in 45 min |

## 4 · Scope

**In (v1):** browser camera capture; server-side face detection/recognition/tracking; presence engine + attendance; exam-proctor mode with gaze-down suppression + human review queue; VNEI engagement (aggregate only); enrollment tool; four dashboards (teacher, management, admin, student-lite) in one responsive PWA; Supabase backend with consent + hash-chained audit; DPDP-aligned data handling.

**Out (v1 → future scope):** multi-classroom fleet management; native mobile apps; LMS deep integration (stub only); liveness/anti-spoofing v2; on-device/in-browser inference at scale; talk-time/audio analytics (optional module, separate consent — only if time remains).

**MVP cut line (what ships if Week 4 gets tight):** attendance end-to-end + one teacher dashboard + enrollment + consent/audit + a working proctor *demo* on a short clip + a *single* VNEI bias chart. Management/admin dashboards and VNEI depth degrade to "shown, not polished."

## 5 · Users & roles (Supabase RLS-enforced)

| Role | Sees | Key actions |
|---|---|---|
| **Teacher** | Live roster, session heatmap, own classes | Start/stop session, export report, review proctor flags |
| **Management** | Cross-class engagement trends (aggregate only) | View analytics, no per-student engagement exists to view |
| **Admin** | Devices (capture clients), users, consent registry, audit chain | Manage enrollment, users, data-deletion requests |
| **Student-lite** | Own attendance + consent status | View own record, request data deletion |

## 6 · Architecture (revised for browser capture — supersedes earlier edge design)

```
┌────────────────────────────────────────────────────────┐
│ CLASSROOM DEVICE — browser (laptop / smart-board / phone)│
│   getUserMedia() camera → capture @ 1–2 fps, downscaled  │
│   /capture kiosk view: live video + recognition overlay  │
│   (optional) MediaPipe FaceLandmarker for cheap head-pose│
└───────────────┬───────────────────────▲─────────────────┘
        frames (WebSocket, JPEG)         │ results (names, states, flags)
┌───────────────▼───────────────────────┴─────────────────┐
│ BACKEND — FastAPI + WebSocket (Python 3.11)               │
│   SCRFD detect → ByteTrack track → ArcFace re-ID/track/Ns │
│   → cosine match vs embedding cache → Presence FSM        │
│   exam mode: YOLOv8n (phone/person) + gaze-down filter    │
│   engagement: head-pose + eye-closure + phone + stillness │
│              → VNEI aggregation (zone/class, k≥5)         │
│   frames processed in memory, DISCARDED immediately       │
└───────────────┬──────────────────────────────────────────┘
                │ persist + query
┌───────────────▼──────────────┐   ┌────────────────────────┐
│ SUPABASE                      │   │ FRONTEND — one PWA (Vercel)│
│  Postgres + pgvector (embeds) │◄──│  /capture /teacher        │
│  Auth + Row-Level Security    │   │  /management /admin /me   │
│  Realtime (live dashboards)   │   │  React + TS + Tailwind    │
│  Storage (encrypted exports)  │   └────────────────────────┘
└───────────────────────────────┘
```

**Why this is defensible at viva:** the browser-capture / server-inference split is a legitimate, common pattern (it's how most web AI demos work). Honest trade-off to state plainly: sending frames to a server adds bandwidth and latency and means frames briefly leave the device — acceptable for a single-classroom system because **frames are processed in memory and never stored**; on-device/in-browser inference is the privacy-and-scale story for *future work*.

## 7 · Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React + TypeScript + Vite**, Tailwind, shadcn/ui, Recharts | One responsive PWA; `getUserMedia` capture; WebSocket client |
| Realtime | **WebSocket** (frames↑ results↓) + **Supabase Realtime** (DB→dashboard push) | Socket.IO acceptable if preferred |
| Backend | **Python 3.11 + FastAPI + WebSocket** | Auto OpenAPI docs |
| Vision | **InsightFace** (SCRFD + ArcFace bundled), **ByteTrack**, **Ultralytics YOLOv8n**, OpenCV, NumPy, onnxruntime | All pretrained; see §9 |
| Engagement signals | Landmark head-pose (solvePnP) + eye-aspect-ratio; **or** MediaPipe FaceLandmarker in-browser | In-browser version offloads server + improves privacy |
| DB / Auth / Storage | **Supabase** — Postgres + pgvector + Auth/RLS + Realtime + Storage | One vendor; you've shipped it before (UniEasy) |
| Deploy | **Vercel** (frontend) · backend on **Render / Railway / Fly.io or a college machine** · Supabase cloud | Backend needs always-on CPU; GPU optional, not required for one room |
| Repo / CI | **GitHub + GitHub Actions**, conventional commits, GitHub Flow | §15 |

Cash budget: ₹3k–10k (backend hosting for a month + optional Supabase Pro for demo weeks + report printing). No camera purchase (browser uses existing device cameras). Verify free-tier limits before demo week; set a keep-alive ping so the Supabase project never pauses.

## 8 · Data model (Supabase)

Use the schema already drafted in the project scaffold (`supabase/migrations/0001_init.sql`): `students`, `consent_records`, `embeddings` (vector(512)), `devices` (now = **browser capture clients**, not board hardware), `class_sessions`, `presence_intervals`, `proctor_flags` (review-only), `engagement_zone_aggregates` (**k ≥ 5 enforced in a CHECK constraint — no per-student engagement table exists by design**), and `audit_log` (hash-chained via trigger). RLS policies tighten per role in migration `0002`. Invariants live in `ENGINEERING.md`.

## 9 · Models & engines — and the "no training" correction

**You do not train anything. You enroll and match.**

| Job | Engine | Pretrained on | Runs |
|---|---|---|---|
| Face detection | **SCRFD** (InsightFace) | WIDER FACE | Server |
| Face embedding (identity) | **ArcFace** ResNet-50, 512-d (InsightFace `buffalo_l`) | MS-Celeb/Glint (millions of faces) | Server |
| Tracking (stable IDs) | **ByteTrack** | — (tracking-by-detection) | Server |
| Proctor objects | **YOLOv8n** | COCO ("cell phone", "person" are native classes) | Server (exam mode) |
| Head pose / eye-closure | Landmarks + solvePnP / EAR, **or** MediaPipe FaceLandmarker | pretrained | Server or browser |

- **Enrollment** = run each student's face through ArcFace once → store the 512-d embedding(s). **Recognition** = embed the live face → cosine-compare to stored embeddings → nearest match above threshold (start ~0.45, calibrate on your own set).
- **InsightFace gives detection + embedding + landmarks in one library** — make it your core dependency; it's the single biggest time-saver.
- **When would you ever fine-tune?** Effectively never here, and it would hurt (overfitting on 50 identities). If distance accuracy disappoints, fix it with better crops, threshold recalibration, multi-template matching, or a higher-res capture — not training.

## 10 · Enrollment pipeline — the "50 frames from a video" answer

Your video method is correct; the number isn't. **Target 10–20 quality frames per student** (50 adds storage and match cost for negligible accuracy gain). The pipeline produces however many you want — here's how:

1. **Capture** — guided ~20–30 s phone video per student: slow head turn through *center → left ~30° → right ~30° → slight up → slight down*; glasses on/off if worn; consistent light, plain wall. **Consent form signed at the same desk.**
2. **Extract** — `ffmpeg -i clip.mp4 -vf fps=5 frame_%03d.jpg` → ~100–150 raw frames.
3. **Quality-gate each frame** — detect face (SCRFD); reject if: face height < ~80 px, blur (Laplacian variance) below threshold, brightness out of range, or no single clear face. Tag each survivor with its **pose bin** (center/left/right/up/down) from landmark angles.
4. **Select + dedup** — keep the best **2–4 per pose bin** (≈10–20 total); drop near-duplicates (embedding cosine > 0.95 to an already-kept frame).
5. **Embed & purge** — ArcFace → 512-d per kept frame; store per-pose embeddings + one averaged template in pgvector; **delete the video and all extracted frames immediately**. Only embeddings persist (≤ ~2 MB for a 50-student class). This is your DPDP headline.
6. **Verify same-session** — student stands in front of the capture camera; must match own embedding ≥ threshold; re-capture failures on the spot. Target: 100% enrolment verification before anyone leaves.

**Logistics:** run a **team enrollment station** (one laptop/phone on a tripod) — not self-recorded videos (chaotic lighting/quality, more rejects, and consent capture is harder). 50 students ≈ one 75–90 min session. Build a tiny enrollment CLI/script (Week 1) that does steps 2–6 in one command per student.

## 11 · Privacy, ethics & the red line

- **DPDP-aligned:** signed consent before enrollment; recording/processing disclosure on the capture screen; embeddings-only identity; right-to-deletion endpoint (cascade-purges embeddings + records + appends audit entry); raw frames **never stored** (processed in memory, discarded).
- **Engagement is aggregate-only:** class/zone metrics, k ≥ 5 suppression, enforced in the DB schema. **No per-student engagement score exists** — not in the schema, API, or UI. **No emotion labels** — only observable behaviour (head pose, eye-closure, phone, stillness).
- **EU AI Act Article 5(1)(f):** inferring emotions in education is prohibited (since Feb 2025). India doesn't ban it, but you design to the strict standard and say so. Behavioural/fatigue signals sit outside the prohibited "emotion inference" category.
- **Human-in-the-loop:** every proctor flag is a review-queue item; the system never penalises.

## 12 · Phase plan — 4 weeks, phase by phase

> Cadence: daily 15-min standup, **Friday demo** (a feature that can't be demoed isn't done), **feature freeze start of Week 4**. Lead owns the integration branch and final review.

### Week 1 — Foundations + recognition loop *(the make-or-break week)*
- **MVP line:** repo + CI + Supabase project + schema applied; enrollment CLI working (video→embeddings); browser `/capture` captures camera and sends frames over WebSocket; backend detects + recognizes a known face and returns the name; consent form drafted.
- **Full line:** ByteTrack integrated (per-track re-ID, not per-frame); cosine threshold calibrated on the team's own faces; quality-gate tuned.
- **Exit:** a live browser camera names an enrolled team member on screen, end-to-end.

### Week 2 — Attendance + data + auth + first dashboard
- **MVP line:** presence state machine (PRESENT→UNVERIFIED→ABSENT, grace + miss rules — *already implemented & tested in the scaffold*); presence persisted to Supabase; Auth with the 4 roles + RLS; teacher dashboard with live roster (Supabase Realtime); one-click session report (PDF).
- **Full line:** session heatmap; student-lite portal (own record + delete-my-data); hash-chained audit on attendance writes; reconnect/buffer handling if the WS drops.
- **Exit:** start a session in the browser → roster fills live → export a report.

### Week 3 — Proctor mode + VNEI engagement + remaining dashboards
- **MVP line:** exam mode (faster sampling) + YOLOv8n phone/person detection → **human review queue**; gaze-down suppression filter with a before/after FPR number on a short clip; VNEI computed (head-pose + eye-closure + phone) at zone level with the coverage badge; **one** naive-mean-vs-VNEI bias chart.
- **Full line:** stillness signal; management + admin dashboards (engagement trends, devices, consent registry); trainer "class pulse" live strip.
- **Exit:** exam-mode demo flags a phone (not a writing student) into review; VNEI bias chart renders.

### Week 4 — Integration, evaluation, report, viva
- Feature freeze (bug-fixes only). One controlled **demo/validation session** with ~10–15 consented volunteers (your own batch — needs nobody's permission but theirs): collect accuracy, duration error, proctor FPR, VNEI-vs-naive numbers — **report honest figures incl. failures.** Write the report (reuse the 8-chapter skeleton from the earlier roadmap). Record a **backup demo video.** Rehearse the live demo twice, timed.
- **Exit:** bound report + a rehearsed live demo + backup video + clean repo.

## 13 · Team model — everyone does both FE *and* BE

You said no "you're backend, you're frontend" split — so ownership is by **vertical feature slice**, where each slice spans frontend *and* backend. Each person therefore touches the camera/CV, the database, *and* the UI.

| Slice | Backend part | Frontend part | Primary owner |
|---|---|---|---|
| **A · Capture & recognition** | WS frame intake, SCRFD/ArcFace/ByteTrack pipeline, enrollment CLI | `/capture` kiosk + recognition overlay | **Namratha R** |
| **B · Attendance & identity** | Presence FSM wiring, Auth/RLS, presence API, report PDF | Teacher + student-lite dashboards | Member 2 |
| **C · Proctor & engagement** | YOLO + gaze filter, VNEI aggregation, audit | Management + admin dashboards, bias chart, class pulse | Member 3 |

**Rules that actually distribute knowledge:** (1) every PR is **reviewed by a different member** than the author; (2) one **pairing block per week** on the hardest piece (rotate who pairs); (3) the lead owns the **integration branch** and merges; (4) standups surface blockers daily; (5) anyone must be able to explain any merged line at viva — if a tool wrote something you can't explain, rewrite it until you can.

## 14 · Team tracks — who builds what

Work is sliced by **feature, not by layer**, so every contributor writes both frontend and
backend on their track and reviews across tracks.

| Track | Owns | Discipline |
|---|---|---|
| **Track A — Attendance & integration (lead)** | Capture WS path, CV pipeline, presence FSM, Supabase schema/RLS, enrollment CLI, integration branch. Owns `ENGINEERING.md` invariants. | Plan → confirm → small steps → `make test` |
| **Track B — Proctor & exam mode** | YOLO proctor engine, gaze-down filter, review queue, exam-mode UI | Backend owns the API contract; UI consumes it |
| **Track C — Engagement & dashboards** | VNEI aggregation, zone analytics, teacher/management dashboards, PDF export | Design first, then build to match |

## 15 · Git flow, commits, PRs & documentation

**Use GitHub Flow, not full Gitflow.** For a 3-person, 1-month project, Gitflow's `develop`/`release`/`hotfix` branch ceremony is pure overhead. GitHub Flow is the right weight:

- `main` is **protected** and always deployable. Branch protection: no direct pushes; PR + **1 approval** + **CI green** required.
- Work on short-lived branches: `feat/capture-ws`, `fix/presence-grace`, `docs/prd`. Branch from `main`, open a **draft PR early**.
- **Squash-merge** PRs → clean, linear, human-authored history.
- **Conventional commits:** `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. This auto-generates a usable CHANGELOG and reads professionally to examiners and employers.
- **PR template** (`.github/pull_request_template.md`): *What changed · Why · How tested · Screenshots/clip · Checklist (tests pass, invariants respected, no secrets).*
- **Docs that earn marks:** `README` (one-command setup), `/docs/architecture.md`, `/docs/adr/*` (3-line decision records), the PRD in-repo, FastAPI auto OpenAPI, `CHANGELOG.md`.

## 16 · Risks (1-month specific)

| Risk | Severity | Mitigation |
|---|---|---|
| 1 month too tight for full scope | **High** | MVP cut line per phase; protect attendance first; VNEI degrades to one chart |
| Browser→server frame latency/bandwidth | Med | 1–2 fps, downscale before send, JPEG; cap resolution; cache top results |
| Recognition weak at classroom distance | Med | Quality-gated enrollment; calibrate threshold Week 1; report honest numbers; front-zone demo if needed |
| Inference server cost/uptime | Med | Free/cheap tier for one room; keep-alive; backup demo video |
| Everyone-does-everything causes collisions | Med | Frozen API contract end of Week 1; lead owns integration branch; cross-review |
| Exam-week crunch | Med | Freeze at Week 4 start; scope ladder; backup video so live failure ≠ disaster |

## 17 · Day-1 / Week-1 checklist (lead)
1. Create GitHub org + repo (private), branch protection, PR template, CI; everyone sets git identity (§15).
2. Create the Supabase project; apply `0001_init.sql`; freeze the API contract by end of Week 1.
3. Assign slices A/B/C; book the Week-4 demo room + recruit 10–15 volunteers; draft the consent form.
4. Stand up the backend repo (invariants in `ENGINEERING.md`); build the enrollment CLI first.
5. Get `/capture` → WebSocket → backend → "hello, recognized face" working by Friday. That single loop de-risks the whole month.

---
*v1 · supersedes the on-board edge architecture · browser-capture + server-inference · attendance + proctor + VNEI · 4-week MVP-laddered plan.*
