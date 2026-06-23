# SensePro+

**Browser-based attendance, proctoring & fairness-aware engagement analytics**  
MCA Major Project · CHRIST University · Team of 3 · 4-week build

---

## One-command setup (after cloning)

```bash
# 1. Clone
git clone https://github.com/YOUR_ORG/sensepro.git && cd sensepro

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase credentials

# 3. Frontend
cd ../frontend
npm install
cp .env.example .env.local   # fill in Supabase + API URL

# 4. DB migrations (Supabase CLI)
cd ..
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# 5. Run
# Terminal A — backend
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal B — frontend
cd frontend && npm run dev
```

Open: http://localhost:5173

---

## Architecture

```
Browser (getUserMedia)
  │ JPEG frames @ 1–2 fps over WebSocket
  ▼
FastAPI backend (Python 3.11)
  ├── SCRFD face detection      (InsightFace)
  ├── ByteTrack tracking
  ├── ArcFace re-ID             (cosine match vs pgvector)
  ├── Presence FSM              (PRESENT → UNVERIFIED → ABSENT)
  ├── YOLOv8n proctor mode      (phone / extra person)
  ├── Gaze-down suppression     (writing students never flagged)
  └── VNEI engagement           (zone-level, k≥5, coverage-weighted)
  │
  ▼
Supabase (Postgres + pgvector + Auth/RLS + Realtime)
  │
  ▼
React PWA (4 role dashboards: teacher / management / admin / student-lite)
```

**Key invariant:** Raw frames are **never stored**. Processed in memory and discarded.

---

## Routes

| URL | Who | What |
|-----|-----|------|
| `/login` | All | Sign in |
| `/capture?session=UUID&mode=attendance` | Teacher/Admin | Classroom camera kiosk |
| `/teacher` | Teacher | Live roster, session control, proctor queue, PDF export |
| `/management` | Management | VNEI bias chart, zone engagement trends |
| `/admin` | Admin | Enrollment, users, consent registry, audit log |
| `/me` | Student | Own attendance, consent status, data deletion request |

---

## API (FastAPI auto-docs at `/docs`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/v1/sessions/start` | Teacher | Start session |
| `POST /api/v1/sessions/{id}/stop` | Teacher | Stop session |
| `GET  /api/v1/sessions/{id}/roster` | Teacher | Live roster |
| `GET  /api/v1/sessions/{id}/report.pdf` | Teacher | Export PDF |
| `GET  /api/v1/sessions/{id}/proctor-flags` | Teacher | Review queue |
| `POST /api/v1/sessions/{id}/proctor-flags/{fid}/review` | Teacher | Mark reviewed |
| `GET  /api/v1/sessions/{id}/engagement` | Management | VNEI aggregates + bias |
| `POST /api/v1/enrollment/enroll/{student_id}` | Admin | Upload enrollment video |
| `POST /api/v1/enrollment/verify/{student_id}` | Admin | Verify recognition |
| `DELETE /api/v1/enrollment/unenroll/{student_id}` | Admin | DPDP data deletion |
| `WS /ws/capture` | System | Frame streaming + recognition |

---

## Running tests

```bash
cd backend
pytest tests/ -v
```

---

## Deployment

| Component | Platform | Notes |
|-----------|----------|-------|
| Frontend | Vercel | `vercel deploy` from `/frontend` |
| Backend | Render / Railway / Fly.io | Needs always-on CPU; set keep-alive ping |
| Database | Supabase Cloud | Free tier OK; Pro for demo weeks |

> **Before demo week:** Verify free-tier limits. Add a keep-alive ping to prevent Supabase project pausing.

---

## Privacy & Ethics

- **DPDP Act (India):** Signed consent before enrollment; right-to-deletion endpoint; embeddings only (no raw frames stored)
- **EU AI Act Article 5(1)(f):** No emotion inference. Signals are behavioural: head pose, eye state, phone detection, stillness
- **k≥5 suppression:** Zone engagement hidden if fewer than 5 students visible
- **Human-in-the-loop:** Every proctor flag is a review item. Zero auto-penalties. Ever.
- **Audit log:** Append-only, hash-chained. Cannot be deleted or modified

---

## Team & slice ownership

| Slice | Owner | Scope |
|-------|-------|-------|
| A — Capture & Recognition | Vishwas (lead) | WS pipeline, SCRFD/ArcFace/ByteTrack, enrollment CLI, /capture |
| B — Attendance & Identity | Member 2 | Presence FSM, Auth/RLS, teacher + student dashboards |
| C — Proctor & Engagement | Member 3 | YOLO, gaze filter, VNEI, management + admin dashboards |

---

## Week exit criteria

| Week | Exit gate |
|------|-----------|
| 1 | Live browser camera names an enrolled face end-to-end |
| 2 | Start session → roster fills live → export PDF |
| 3 | Exam mode flags phone (not writing student); VNEI bias chart renders |
| 4 | Bound report + rehearsed demo + backup video + clean repo |

---

*v1 · browser-capture + server-inference · attendance + proctor + VNEI · 4-week MVP-laddered plan*
