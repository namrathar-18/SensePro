# SensePro+ — Phase 1 Prompt Pack (Week 1: Foundations + the recognition loop)

**For:** Namratha R + team · **Goal of Phase 1:** repo + environments live, the board-camera capture→recognition→presence loop proven end-to-end, the enrollment quality-gap fixed, the API contract frozen, and the first "overpowered" UI shell standing. **No model training — enrollment only.**

> **How to read this pack**
> - 🧑 **YOU DO** — a human action (no AI). Do it exactly as written.
> - 🤖 **PASTE TO `<tool>`** — copy the fenced block verbatim into that tool.
> - ✅ **DONE WHEN** — the checkpoint that proves the step worked before you move on.
> - Order matters. Do steps top to bottom. Steps 0→1 gate everything; do not skip the spike.
> - Every UI tool gets the **same Design System block (§DS)** pasted in first, so v0, Lovable, Claude Design and React Bits all produce one coherent look instead of three.

---

## §DS · The Design System block (paste this at the TOP of every UI prompt)

```
DESIGN SYSTEM — SensePro+ "Command Center". Use this exactly; do not invent new tokens.
Aesthetic: a calm, premium operations console — dark, high-contrast, cinematic, confident.
Think mission-control meets modern SaaS. Restrained motion, never busy.

Color tokens (CSS variables):
  --bg:#0B1120; --surface:#111A2E; --surface-2:#16213B; --line:#22304D;
  --ink:#E8EEF7; --muted:#8094B0;
  --primary:#3B82F6;  --primary-deep:#1D4ED8;   /* electric cobalt */
  --accent:#22D3EE;   /* single cyan accent, used sparingly for live/active */
  --ok:#34D399; --warn:#FBBF24; --bad:#F87171;
Type: display = "Archivo" (700–900); body = Inter; data/labels = "IBM Plex Mono".
Surfaces: glassy panels (bg surface @ ~92% + 1px --line), 14px radius, soft shadow.
Background: --bg with a faint 32px dot/grid and one slow cobalt radial glow top-left.
Data style: monospace labels, animated count-up numbers, a small pulsing dot for "live".
Motion: framer-motion; 150–250ms ease-out transitions; respect prefers-reduced-motion.
Accents: use React Bits sparingly (one hero/background effect + count-up + a spotlight card).
Accessibility: AA contrast, visible focus rings, keyboard reachable.
Stack: React + TypeScript + Vite + Tailwind + shadcn/ui. No HTML <form> posts — handlers only.
Do NOT over-animate data tables or the live capture view; the camera feed is the spectacle.
```

---

## Pre-flight — 🧑 YOU DO (15 min, lead)

1. Download and unzip the **`sensepro_starter.zip`** I built; it is your repo seed (backend runs, tests pass).
2. Confirm accounts ready: GitHub (private org/repo), Supabase (free), Vercel (free), Claude Code (your Pro/Opus 4.8), Devin (free), v0, Lovable, Figma, Claude Design, reactbits.dev.
3. Decide and write down the three locked facts from our plan so every tool prompt can cite them:
   *enrollment = iPhone 13 Pro (one operator); raw video = local-only on your laptop; live recognition = SensePro board camera.*

---

## Step 0 · Repo + environment for all three — 🧑 + 🤖

**0a — 🧑 YOU DO (each member, once):**
```
# set your identity so commits are yours (never a bot's)
git config --global user.name "Your Real Name"
git config --global user.email "you@christuniversity.in"
```
**0b — 🧑 YOU DO (lead):** create a **private** GitHub repo `sensepro`, push the unzipped starter to `main`.
**0c — 🧑 YOU DO (each member):** clone it, then:
```
cd sensepro/backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest -q            # expect: 9 passed
uvicorn app.main:app --reload --port 8000            # leave running
```
**0d — 🤖 PASTE TO Claude Code** (run inside the `sensepro` repo so it reads `CLAUDE.md`):
```
Read CLAUDE.md, README.md, and docs/adr/0001 and 0002 in full before doing anything.
Then give me, in plain language: (1) a 6-line map of how a frame flows from web/capture.html
through app/ws.py and vision/pipeline.py to the presence FSM and back; (2) the exact env vars
that control behaviour and their defaults; (3) confirmation that no code path trains a model or
stores a raw frame. Do not change any code yet — this is an orientation pass. End with the single
command to run the test suite.
```
✅ **DONE WHEN** all three see `9 passed`, the server responds at `http://localhost:8000/health`, and Claude Code's summary matches the README.

---

## Step 1 · The validation spike — 🧑 YOU DO (gating; 2–3 days) — DO NOT SKIP

This proves the two riskiest assumptions before you build anything on top of them.

**1a — Board camera in a browser (the gating unknown).**
- Open `web/capture.html` **on the SensePro board's own browser**.
- Set server to `ws://<your-laptop-LAN-ip>:8000/ws/capture` (board and laptop on the same Wi-Fi).
- Click **Start**. Watch for the camera permission prompt and a live video frame.
- ✅ **DONE WHEN** the board's camera shows video in the page **and** boxes draw when a face/colour card is on screen.
- ⚠️ **IF THE BOARD BROWSER CANNOT REACH ITS CAMERA** (some Android boards lock the camera to a native app): switch the live-capture device to a laptop webcam or your iPhone positioned in the room, and tell me — the rest of the plan adapts. Record what resolution the board reports (open the browser console; `track.getSettings()` logs width/height).

**1b — 3-person enroll-and-recognize at distance (the quality-gap test).** *(after Step 2 adds degrade-aug, but do a first pass now with the plain CLI)*
- On the iPhone (see §Enrollment SOP for settings), record you + 2 teammates, ~25s each.
- Transcode if needed, run `sensepro-enroll` for each (Step 2 covers the exact command), then stand in front of the **board camera** at **2 m, 4 m, 6 m** and watch recognition in `capture.html`.
- 🧑 Write down the distance where names stop being reliable. That number sets your demo framing and threshold.
- ✅ **DONE WHEN** at least the 2 m and 4 m cases recognise all three correctly.

---

## Step 2 · Fix the iPhone→board quality gap (degrade-augmentation) — 🤖 PASTE TO Claude Code

```
Goal: close the domain gap between sharp iPhone enrollment frames and the lower-res SensePro
board camera used at live recognition, WITHOUT any model training.

In backend/enroll/pipeline.py, add an optional "degrade augmentation" step to Enroller:
- Add a constructor flag `degrade: bool = True` and params `degrade_heights=(96, 64)` (target
  face-crop pixel heights approximating board-cam distance) and `jpeg_quality=40`.
- For each accepted face crop that we embed, ALSO produce, for each height in degrade_heights:
  resize the aligned crop down to that face height (keep aspect), apply JPEG re-encode at
  jpeg_quality, optional mild Gaussian blur (sigma ~0.6), upscale back, then embed that variant
  too. Store all variants as embeddings for the same student (multi-template).
- Keep the existing pose-bin selection; degrade-augment the SELECTED frames only (not all).
- Make it deterministic and covered by a test: extend backend/tests to assert that with degrade=True
  a single clean synthetic frame yields strictly MORE embeddings than with degrade=False, and that
  every embedding is L2-normalised (norm ≈ 1.0).
Add a `--no-degrade` flag to enroll/cli.py (default: degrade ON). Update README + CLAUDE.md notes.
Constraints from CLAUDE.md still hold: no training, raw frames deleted after embedding, embeddings only.
Run ruff + pytest; show me the diff and the new test output before finalising.
```
✅ **DONE WHEN** `pytest -q` is green with the new test, and re-running Step 1b recognition at 4–6 m improves.
**🧑 YOU DO after:** re-enroll the 3 test people with degrade ON; re-test at distance; record the new reliable-distance number.

---

## Step 3 · Freeze the API contract — 🤖 PASTE TO Claude Code

```
Create packages/contracts/openapi.yaml describing the Phase-1 + near-term API as the single source
of truth (frontend will consume ONLY this). Include:
- GET /health
- WS /ws/capture  (document the JSON message contract both directions, copied from app/ws.py:
  client->server {type:"frame",ts,jpg_b64} and {type:"end",ts}; server->client the result object
  with faces[], transitions[], present[], plus error and session_ended messages)
- REST stubs we will implement in Week 2 (define schemas now so the UI can mock them):
  POST /v1/sessions {class_section,subject,mode} -> session; POST /v1/sessions/{id}/end;
  GET  /v1/sessions/{id} -> session + live roster snapshot;
  GET  /v1/students -> roster; GET /v1/students/{id}/attendance.
Use components/schemas for Student, Session, PresenceInterval, Face, RosterEntry. Add a one-paragraph
"frozen contract" note at the top: changes require an ADR. Do not implement the REST routes yet —
just the contract + the existing health/ws. Validate the YAML. Then write docs/adr/0003-api-contract.md.
```
✅ **DONE WHEN** `openapi.yaml` validates and the WS section matches `app/ws.py` exactly. **This contract is now frozen for Phase 1** — UI tools mock against it.

---

## Step 4 · UI direction — 🤖 PASTE TO Figma AI (or Claude Design)

*(Design the look once, here, before generating code. Paste §DS first, then this.)*
```
[paste the §DS Design System block here first]

Design 3 frames for "SensePro+", a classroom attendance command center, in the design system above:
1) CAPTURE / KIOSK — full-bleed live camera area with neon cobalt face bounding boxes (named =
   green, unknown = amber), a translucent right rail "Present now" list with monospace student IDs
   and a live pulse dot, a slim top bar (class name, session timer, REC dot), and a bottom Start/End
   control. Cinematic, minimal chrome.
2) TEACHER DASHBOARD (shell) — left nav, a header with 4 KPI stat cards (Present, Total, Avg
   attendance %, Flags) with count-up numbers, and a large empty "Live roster" panel placeholder.
3) LOGIN — centered glass card, role-aware, one cobalt CTA, subtle animated background.
Deliver desktop + a tablet width (the board runs ~tablet/landscape). Export color/spacing specs.
Keep it premium and restrained — this must look "overpowered" through polish and motion, not clutter.
```
✅ **DONE WHEN** you have 3 frames you like + a spec you can hand to the code tools. **🧑 YOU DO:** screenshot/export them; you'll attach them in Step 5–6.

---

## Step 5 · Capture / kiosk screen — 🤖 PASTE TO v0 *(pick ONE: v0 or Lovable — not both)*

```
[paste the §DS Design System block here first]
[attach the Step-4 CAPTURE/KIOSK frame]

Build a single React + TypeScript + Tailwind page component `CaptureKiosk.tsx` matching the attached
design and the design system. Requirements:
- Uses getUserMedia to show the live camera full-bleed; lets the user pick the camera (deviceId)
  and target send-width (default 480) and fps (default 2).
- Opens a WebSocket to a configurable URL (default ws://localhost:8000/ws/capture). Every 1/fps
  seconds it draws the current video frame to an offscreen canvas at the target width, encodes JPEG
  (quality 0.6), and sends {type:"frame", ts:<seconds since start>, jpg_b64:<base64>}.
- Renders server messages of {type:"result"}: draw bounding boxes on an overlay canvas aligned to
  the video (faces[].box is [x1,y1,x2,y2] in SENT-frame pixels — scale to displayed video size);
  named faces (student_id != null) green with "ID score", unknown amber with "#track_id".
  Maintain a "Present now" rail from result.present[] with a live pulse dot and count-up of the count.
- Start button (open cam + WS), End button (send {type:"end",ts} then stop tracks). Status line.
- IMPORTANT: keep the live view lean — no heavy animation over the video. Do not use localStorage.
  No HTML <form>. Use the exact message contract from packages/contracts/openapi.yaml (paste below).
[paste the WS message contract section from your openapi.yaml]
```
✅ **DONE WHEN** the generated page compiles and visually matches. **🧑 YOU DO:** **export/copy the code into your repo by hand and commit it as yourself — do NOT enable the tool's GitHub sync** (that is what commits under the tool's name).
**🤖 THEN PASTE TO Claude Code:**
```
I've added apps/web/src/CaptureKiosk.tsx (generated, then hand-placed). Wire it into our Vite app:
set up apps/web (Vite + TS + Tailwind + shadcn) if absent, add the §DS tokens to the Tailwind theme
+ index.css, mount CaptureKiosk at route /capture, and add a .env.example with VITE_WS_URL.
Verify it builds (npm run build). Add React Bits ONLY where the design calls for it (one background
effect on /login later, a count-up for the Present number) via `npx shadcn@latest add` from reactbits.dev.
Show me the file tree and the build output. Commit on a feat/capture-ui branch (my identity), open a PR.
```

---

## Step 6 · Login + teacher dashboard shell — 🤖 PASTE TO Lovable *(or the same one tool from Step 5)*

```
[paste the §DS Design System block here first]
[attach the Step-4 LOGIN and TEACHER DASHBOARD frames]

Build two React + TS + Tailwind + shadcn screens matching the attached designs and design system:
1) Login.tsx — centered glass card, email+password fields (handlers only, no <form> post), a role
   note, one cobalt CTA, a subtle animated background (use a React Bits background, lightweight).
   Stub the submit to call a provided onLogin(email,password) prop; no real auth yet.
2) TeacherDashboard.tsx — left nav (Capture, Roster, Reports, Settings), a top row of 4 KPI stat
   cards (Present / Total / Avg % / Flags) with animated count-up (React Bits CountUp), and a large
   "Live roster" panel that renders a list from a `roster` prop (RosterEntry[] from our contract),
   each row: avatar initials, ID (mono), name, state badge (PRESENT green / UNVERIFIED amber /
   ABSENT muted). Empty state included. All data via props/mocks — no API calls yet.
Match the contract types (paste below). Do not use localStorage. Accessible, keyboard-reachable.
[paste the Student / RosterEntry / Session schemas from openapi.yaml]
```
✅ **DONE WHEN** both screens compile and match. **🧑 YOU DO:** copy into repo, commit as yourself.
**🤖 THEN PASTE TO Claude Code:** `Mount Login at /login and TeacherDashboard at /teacher, feed TeacherDashboard mock RosterEntry data for now, ensure build passes, commit on feat/dashboard-shell (my identity), open a PR.`

---

## Step 7 · Git governance live — 🧑 + 🤖

**7a — 🤖 PASTE TO Claude Code:**
```
Create repo governance files: .github/pull_request_template.md (sections: What changed, Why, How
tested, Screenshots/clip, Checklist: tests pass / ruff clean / invariants respected / no secrets /
no bot-authored commits), CONTRIBUTING.md (GitHub Flow: protected main, short-lived feat/ branches,
conventional commits, squash-merge, 1 cross-review + green CI required, AI tools generate→human
reviews→human commits), and docs/adr/template.md. Keep them concise. Commit on docs/governance, open a PR.
```
**7b — 🧑 YOU DO (lead, GitHub settings):** Settings → Branches → protect `main`: require a PR, require 1 approval, require status checks (CI) to pass, no direct pushes. Confirm CI (`.github/workflows/ci.yml`) runs on the first PR.
✅ **DONE WHEN** a PR cannot merge without a green check + one approval, and all merges so far are authored by real names.

---

## Step 8 · Enrollment SOP (run once you have consent) — 🧑 YOU DO

**8a — iPhone 13 Pro setup (critical):** Settings → Camera → Formats → **"Most Compatible"** (records H.264, not HEVC — OpenCV-friendly). Shoot **1080p / 30fps**, NOT 4K.
**8b — Local storage layout** (on your laptop, OUTSIDE the repo):
```
~/sensepro-enrollment/        # add to .gitignore: *.mov *.mp4 frames_tmp/ _consent/
  _consent/consent_log.csv    # reg_no,name,date,signed(Y/N),filename
  _consent/forms/             # photo of each signed form
  raw_videos/                 # s001_NAME.mov ...
  enrollments.json            # the ONLY file that enters the pipeline (embeddings)
```
**8c — Per student (~30s, one at a time):** sign consent first → say the student ID aloud at the start (verbal slate) → face fills ~⅓ frame, eye level, plain wall, even light (ideally lighting like the classroom) → **center 3s → slow left to ~30° and back → right and back → slight up then down → glasses off, repeat 5s** → end a few seconds **a step further back** (feeds the degrade-aug).
**8d — Turn videos into embeddings (per student):**
```
cd sensepro/backend && source .venv/bin/activate
sensepro-enroll --student-id s001 --video ~/sensepro-enrollment/raw_videos/s001_NAME.mov --out enrollments.json
# degrade-aug is ON by default; raw video is deleted after embedding unless you pass --keep
```
**8e — Verify same-session:** stand in front of the **board camera**; confirm the student is recognised in `capture.html` at your target distance. Re-capture any failures on the spot.
✅ **DONE WHEN** every enrolled student verifies at ≤4 m and `enrollments.json` holds all of them (no raw video left behind).

---

## Phase 1 exit — Friday demo checklist

- [ ] All 3 environments run; `pytest` green; CI enforced on PRs; commits human-authored.
- [ ] Board-camera capture loop confirmed (or the documented fallback chosen).
- [ ] Degrade-augmentation in; recognition reliable to your stated distance.
- [ ] `openapi.yaml` frozen; `/capture`, `/login`, `/teacher` shells live and on-brand.
- [ ] Enrollment SOP dry-run done on ≥3 people; consent + local-storage layout in place.
- [ ] **Live demo:** open `/capture` on the board → an enrolled teammate walks in → name turns green → "Present now" updates → they leave → state decays. That single loop is the Phase-1 win.

---

### Connector notes
The prompts deliberately have **Claude Code use the Supabase + GitHub connectors itself** (apply migrations, open PRs) rather than me provisioning your cloud under this chat — Phase-1 infra must be created under **your** accounts and identity (the same reason your commits stay human-authored). If you'd rather I drive a specific connector directly from here — e.g. generate the Figma design file, or apply `supabase/migrations/0001_init.sql` to your project — say which one and I will.
