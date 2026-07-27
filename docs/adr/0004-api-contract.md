# ADR 0004 — Freeze the Phase-1 API contract

**Context.** Three people build vertical slices that each span frontend and backend, and the
UI tools generate against whatever shape they are told. Without a single agreed contract the
message shapes drift — a box format here, a field name there — and integration at the end of
the week becomes guesswork. The recognition loop already has a concrete wire format in
`backend/app/ws.py` and `backend/vision/pipeline.py`; the REST surface does not exist yet but
the UI needs to mock against its shapes now.

**Decision.** `packages/contracts/openapi.yaml` is the single source of truth the frontend
consumes, **frozen for Phase 1 — changes require an ADR**. It covers two surfaces:

- **Implemented today:** `GET /health` and the `/ws/capture` WebSocket channel. The WebSocket
  message schemas mirror `ws.py` + `pipeline.py` exactly (`FrameMessage`/`EndMessage` up;
  `ResultMessage`/`ErrorMessage`/`SessionEndedMessage` down; `Face.box` is `[x1,y1,x2,y2]` in
  sent-frame pixels). OpenAPI 3.1 has no native WebSocket type, so the channel is documented as
  a path whose `description` carries the full bidirectional contract and whose message schemas
  live in `components/schemas`.
- **Week-2 REST stubs** (`x-phase: 2`): `POST /v1/sessions`, `POST /v1/sessions/{id}/end`,
  `GET /v1/sessions/{id}`, `GET /v1/students`, `GET /v1/students/{id}/attendance`. Schemas are
  defined now; the routes are deliberately unimplemented. This is a small set: the backend is
  database-centric (ADR 0004's sibling decision on data access), so dashboards read directly
  from Postgres via Supabase RLS + Realtime, and these REST routes are only the narrow slice the
  UI needs beyond direct DB reads.

Enum and field names follow the database schema (`0001_init.sql`) as authoritative: zones are
`front|mid|back` (aggregates add `class`), session mode is `lecture|exam|workshop`, students
carry `reg_no`/`full_name`.

**Consequences.**
- (+) The frontend has one stable shape to build and mock against; drift becomes an explicit,
  reviewed change rather than a silent one.
- (+) The WebSocket contract is pinned to the real backend, so the capture kiosk cannot quietly
  diverge from what the server sends.
- (−) The early `apps/web` mock data was written before this freeze and drifted from it — zone
  `middle` (contract: `mid`), session mode `attendance` (contract: `lecture|exam|workshop`), and
  `name` (contract: `full_name`). Reconciled in the same change as this ADR: `apps/web/src/lib/types.ts`
  and `mock.ts` now use the contract's field names and enum values throughout.
- (−) OpenAPI 3.1 cannot type a WebSocket natively; the channel is documented as prose plus
  message schemas. Codegen tools will see a GET returning 101, not a socket — acceptable for a
  human-and-UI-facing contract.
