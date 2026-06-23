# SensePro+ — Architecture

## System overview

```
┌────────────────────────────────────────────────────────────────┐
│  CLASSROOM DEVICE — Browser (laptop / smart-board)             │
│  getUserMedia() → capture @ 1–2 fps, downscaled to 640px       │
│  /capture kiosk view: live video + recognition overlay          │
│  WebSocket client: send JPEG frames, receive recognition JSON   │
└───────────────────────┬────────────────────────▲───────────────┘
                        │ frames (WS, JPEG b64)  │ results (JSON)
┌───────────────────────▼────────────────────────┴───────────────┐
│  BACKEND — FastAPI + WebSocket (Python 3.11)                   │
│                                                                 │
│  Frame intake (websocket_handler.py)                           │
│    └─► SCRFD detect (InsightFace)                              │
│    └─► ByteTrack track                                         │
│    └─► ArcFace embed → cosine match vs pgvector cache          │
│    └─► Presence FSM (PRESENT/UNVERIFIED/ABSENT)                │
│                                                                 │
│  Exam mode (proctor.py)                                        │
│    └─► YOLOv8n: phone / extra person detection                 │
│    └─► GazeTracker: sustained lateral gaze (writing suppressed)│
│    └─► All flags → review queue (NEVER auto-penalise)          │
│                                                                 │
│  Engagement (vnei.py)                                          │
│    └─► Head pose (solvePnP) + EAR + phone + stillness          │
│    └─► VNEI: coverage-weighted zone aggregate                   │
│    └─► k≥5 suppression enforced before any write               │
│                                                                 │
│  Enrollment (enrollment.py)                                    │
│    └─► ffmpeg extract → quality gate → pose-bin select         │
│    └─► ArcFace embed → pgvector store → video DELETE           │
└───────────────────────┬────────────────────────────────────────┘
                        │ persist / query / realtime
┌───────────────────────▼────────────────────────────────────────┐
│  SUPABASE                                                       │
│  Postgres + pgvector (512-d embeddings, IVFFlat index)         │
│  Auth + Row-Level Security (4 roles)                           │
│  Realtime (live roster push to teacher dashboard)              │
│  Storage (encrypted PDF exports)                               │
│  Audit log (append-only, hash-chained, no-delete rule)         │
└───────────────────────┬────────────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────────────┐
│  FRONTEND — React + TypeScript PWA (Vercel)                    │
│  /login        — Auth                                          │
│  /capture      — Classroom kiosk (WebSocket client)            │
│  /teacher      — Live roster, session ctrl, proctor queue, PDF │
│  /management   — VNEI bias chart, zone trends                  │
│  /admin        — Enrollment, users, consent, audit log         │
│  /me           — Student attendance + data deletion            │
└────────────────────────────────────────────────────────────────┘
```

## Data flow — one frame

1. Browser grabs frame from camera (`drawImage` to canvas → `toBlob` JPEG)
2. Base64-encode → WebSocket send `{type:"frame", data:"...", ts:N}`
3. Backend decodes JPEG → numpy array
4. InsightFace: detect faces → extract 512-d embeddings + landmarks
5. Cosine match each embedding vs in-memory store loaded from pgvector
6. Best match above threshold (0.45) → identity assigned
7. Presence FSM updated for each identity
8. Head pose (solvePnP) + EAR computed from landmarks
9. Engagement signals queued for VNEI window
10. Exam mode: YOLOv8n run on same frame → flags if needed
11. Frame array deleted from memory
12. JSON result sent back: `{faces:[...], presence_summary:{...}, latency_ms:N}`
13. Frontend draws overlay on canvas; Supabase Realtime pushes to dashboards

## Key design decisions

See `docs/adr/decisions.md` for rationale on:
- Browser capture over edge device (ADR 001)
- InsightFace buffalo_l (ADR 002)
- No per-student engagement (ADR 003)
- Supabase as single service (ADR 004)
- Human-in-the-loop for proctor flags (ADR 005)

## Performance targets

| Metric | Target |
|--------|--------|
| ID accuracy ≤4m | ≥95% |
| Frame→dashboard latency | <3s |
| Proctor FPR reduction (gaze filter) | ≥50% |
| Demo stability | 0 crashes in 45 min |
| Auto-penalties | 0 (hard invariant) |
