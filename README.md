# SensePro+

Browser-based **attendance + exam proctoring + fairness-aware engagement analytics**.
MCA major project · CHRIST University · class 4MCA-B (53 students).

The classroom **laptop webcam** streams frames over a WebSocket to a Python/FastAPI
backend that runs face detection → tracking → recognition → a presence state machine,
and streams the live roster (with names) back to the browser. In exam mode it adds
phone / extra-person proctoring with a gaze-down false-positive filter (every flag goes
to a human review queue — nothing is auto-penalised). In every mode it aggregates
class/zone **VNEI** engagement (aggregate-only, k ≥ 5 suppression — never per student).
Frames are processed in memory and **never stored**. Data lives in Supabase
(Postgres + pgvector + Auth/RLS + Realtime).

> Privacy invariants (enforced in schema + code): embeddings-only identity, raw frames
> discarded after inference, engagement is class/zone aggregate-only, no emotion labels,
> proctor flags are review items (never penalties), hash-chained audit, cascade delete.

---

## Quick start (runs immediately, no ML downloads)

Two terminals. **Backend:**

```bash
cd backend
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# macOS/Linux:         . .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

**Frontend:**

```bash
cd apps/web
npm install
npm run dev
```

Open **http://localhost:5173** → on the login screen press **Enter console** (demo mode
works without any account) → go to **Capture** → **Start session**. Grant camera access;
the laptop webcam turns on and the live roster fills as faces are recognised. Every
dashboard (Teacher, Management, Admin, Me, Proctor, Trends) is populated with the real
4MCA-B class.

Your Supabase publishable key is already wired in (`apps/web/.env.local`); it is
RLS-protected and safe in the browser.

> **Recognition note:** out of the box the backend uses the dependency-free **stub**
> vision backend (it recognises solid-colour cards, not faces) so the whole loop runs on
> any machine. To recognise the **real students**, do the one-time enrolment below.

---

## Go fully live (one-time hand-off steps)

### 1. Real face recognition (SCRFD + ArcFace)

```bash
cd backend
pip install -e ".[insightface]"      # downloads the pretrained buffalo_l pack (~300 MB)
# Enrol the whole class from the per-register-number photo folders (photos are
# never modified or deleted). Windows PowerShell:
$env:VISION_BACKEND="insightface"; python -m enroll.enroll_class --photos-dir "C:/Users/namrp/Downloads/sensepro-enrollment/sensepro-enrollment/photos" --out enrollments.json
# macOS/Linux:
VISION_BACKEND=insightface python -m enroll.enroll_class --photos-dir "/path/to/photos" --out enrollments.json
```

Then start the backend with `VISION_BACKEND=insightface`. The webcam now recognises the
real class. (No training — this only computes and stores 512-d embeddings; the source
photos stay put.)

### 2. Live Supabase persistence + live dashboards

1. In the Supabase SQL editor for your project, run each migration in
   order: `supabase/migrations/0001_init.sql` … `0007_phase3_read_paths.sql`.
2. Then run `supabase/seed.sql` (inserts the 53 students, consent records, the
   browser-capture device, and an open demo session). Idempotent — safe to re-run.
3. Put your **service-role** key in `backend/.env` as `SUPABASE_SECRET_KEY=...`
   (Supabase → Project Settings → API keys). This is server-side only — never commit it.

Now presence, proctor flags, and VNEI aggregates persist, and the dashboards read them
live via RLS + Realtime (they fall back to the class demo data until seeded).

### 3. Exam-mode proctoring with real object detection

```bash
cd backend
pip install -e ".[proctor]"          # pretrained YOLOv8n (COCO)
# set PROCTOR_BACKEND=yolo in backend/.env, then open the capture page in exam mode:
# http://localhost:5173/capture?mode=exam
```

### 4. (Optional) Honest evaluation numbers

```bash
cd backend
python -m eval.run --clip exam.mp4 --truth truth.json --mode exam
# reports recognition accuracy, presence-duration error, and proctor false-positive
# rate with the gaze-down filter ON vs OFF (see eval/harness.py for the truth JSON shape)
```

---

## Tests & lint

```bash
cd backend && pytest -q          # 43 tests, dependency-free stub backend
cd backend && ruff check .       # clean
cd apps/web && npm run build     # type-safe production build
```

## Repo layout

```
apps/web/       React + TypeScript + Vite + TanStack Router PWA (all dashboards + capture)
backend/        FastAPI app, vision pipeline, presence FSM, proctor, engagement, enrol, eval
  app/          FastAPI (ws capture endpoint, sessions API, presence write-path, roster names)
  vision/       detector/embedder/matcher + tracker + stub/insightface backends
  proctor/      YOLO phone/person detection + gaze-down suppression + review-queue engine
  engagement/   VNEI zone aggregation (k>=5) + behavioural signals
  enroll/       enrolment pipeline + single-student CLI + batch class enrol
  eval/         honest evaluation harness (accuracy, duration error, proctor FPR)
supabase/       Postgres migrations (schema, RLS, audit chain) + seed.sql (4MCA-B roster)
docs/           PRD, ADRs, architecture, PRD_CHECKLIST.md
scripts/        gen_roster.py (regenerates the roster artefacts from one source)
```

See `docs/PRD_CHECKLIST.md` for feature-by-feature status against the PRD, and
`docs/SensePro_PRD_v1.md` / `ENGINEERING.md` for the full spec and invariants.
