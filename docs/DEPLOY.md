# Deploying SensePro+

Two services: the FastAPI inference backend and the React frontend. They can be
hosted separately (Render web service + static site) as long as the frontend
knows the backend's public URL and the backend allows the frontend's origin.

---

## 1 · Backend (FastAPI)

**Start command**

```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Root directory `backend/`. Bind `0.0.0.0` (not 127.0.0.1) so the platform can
route traffic to it.

**Environment**

| Variable | Value | Notes |
|---|---|---|
| `VISION_BACKEND` | `insightface` | `stub` disables real recognition |
| `PROCTOR_BACKEND` | `yolo` | needs the `.[proctor]` extra |
| `SUPABASE_URL` | your project URL | |
| `SUPABASE_SECRET_KEY` | service-role key | **secret** — set in the dashboard, never in git |
| `ALLOW_ORIGINS` | frontend origin(s), comma-separated | e.g. `https://sensepro.vercel.app` |
| `ENROLLMENT_JSON` | `enrollments.json` | face embeddings; see note below |
| `ROSTER_JSON` | `data/roster.json` | |
| `ENGAGEMENT_K_MIN` | `5` | privacy floor; lower only for a controlled demo |

**Memory:** InsightFace (~300 MB of models) plus YOLOv8n needs roughly **1 GB
RAM**. Render's free tier (512 MB) will OOM — use at least the 1 GB instance, or
run `VISION_BACKEND=stub` there and demo recognition locally.

**Cold starts:** free instances sleep. The first request after a sleep pays the
model load (~10 s). Keep the tab open, or ping `/health` periodically.

**Embeddings:** `enrollments.json` is biometric data and is gitignored. Upload it
as a secret file, or move enrolment into Supabase (`embeddings` table, pgvector)
before hosting.

---

## 2 · Frontend (React + Vite)

**Build:** `npm run build` · **Publish directory:** `dist/client`

**Environment**

| Variable | Value |
|---|---|
| `VITE_API_URL` | backend origin, e.g. `https://sensepro-api.onrender.com` |
| `VITE_SUPABASE_URL` | your project URL |
| `VITE_SUPABASE_ANON_KEY` | publishable key (safe in the client — RLS protects the data) |

`VITE_API_URL` configures both the REST calls and the capture WebSocket (the WS
URL is derived from it). Vite inlines `VITE_*` at build time, so **changing it
requires a rebuild**, not just a restart.

### This one matters for QR check-in

While `VITE_API_URL` is unset the app talks to `http://127.0.0.1:8000`, which
means *"this device"*. A student scanning the QR on their **own phone** will hit
their own phone, not your server — check-in cannot work until the backend is
hosted and `VITE_API_URL` points at it. Everything else (teacher console, manual
override, reports) works locally because it runs on the same machine.

---

## 3 · Supabase

Run in the SQL editor, in order:

1. `supabase/APPLY_ALL.sql` — schema, RLS, audit chain
2. `supabase/APPLY_ROLES.sql` — role policies via `app_metadata.app_role`
3. `supabase/APPLY_STUDENT_SESSIONS.sql` — lets a student read their own class's sessions
4. `supabase/seed.sql` — the 4MCA-B roster

---

## 4 · Before going live

- [ ] **Rotate the service-role key** if it has ever been pasted into a chat, a
      screenshot, or a commit.
- [ ] `ALLOW_ORIGINS` lists only your real frontend origin — never `*` on a
      service that holds the service-role key.
- [ ] HTTPS end to end. `getUserMedia` (the webcam) is blocked on plain HTTP
      anywhere except localhost, so the capture page **will not work** over
      `http://` once hosted.
- [ ] Confirm `/health` returns `"vision_backend_active":"InsightFaceBackend"`.
      If it says `StubDetector`, recognition is off.
- [ ] Test QR check-in from a phone on mobile data, not just office wifi.
- [ ] Consider rate limiting the check-in endpoint (see below).

## Known gaps worth closing

- **Rate limiting.** `/v1/sessions/{id}/checkin` and `/presence` are unauthenticated
  writes. The rotating token limits the window, and the class check stops
  cross-cohort marking, but a determined script could still retry. Add per-IP
  limiting (e.g. slowapi) before real use.
- **Endpoint auth.** The write endpoints trust the caller. Verifying the
  Supabase JWT on the backend would tie every override to a real staff account.
