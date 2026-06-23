# SensePro+ — Team Build Checklist

## Week 1 — Foundations & Recognition Loop (make-or-break)

### Day 1 (Vishwas — lead)
- [ ] Create GitHub org, repo (private), branch protection (`main`)
- [ ] Add `.github/pull_request_template.md`
- [ ] Every team member: `git config user.name` + `git config user.email`
- [ ] Create Supabase project, note URL + keys
- [ ] Apply `supabase/migrations/0001_init.sql` + `0002_rls.sql` + `0003_helpers.sql`
- [ ] Add `.env` files (never commit, add to `.gitignore`)
- [ ] Assign slices A/B/C to team members

### Slice A (Vishwas) — Capture & Recognition
- [ ] `backend/` runs: `uvicorn app.main:app --reload`
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] Enrollment CLI works end-to-end on one team member's face video
- [ ] `/ws/capture` accepts WebSocket connection, responds to `init` message
- [ ] Browser `/capture?session=X` opens camera (getUserMedia)
- [ ] Frame sent over WebSocket → SCRFD detects a face → returns bbox
- [ ] ArcFace identifies enrolled team member by name
- [ ] **WEEK 1 EXIT: Live camera names an enrolled face on screen ✓**

### Slice B (Member 2) — Attendance & Auth (can start Day 3)
- [ ] Supabase Auth configured, 4 roles set up in `profiles`
- [ ] Login page works for teacher + admin users
- [ ] React router + role guards working
- [ ] `PresenceFSM` unit tests pass (`pytest tests/test_presence_fsm.py`)

### Slice C (Member 3) — Proctor & Engagement (can start Day 3)
- [ ] `VNEIAggregator` unit tests pass (`pytest tests/test_vnei.py`)
- [ ] k-suppression confirmed: zone with <5 students → `vnei_score = null`
- [ ] Zone assignment logic tested

### Week 1 Done-definition
```
Live demo: open browser → /capture?session=<uuid> → camera opens →
face detected → name of enrolled team member appears in overlay
```

---

## Week 2 — Attendance + Data + Auth + Teacher Dashboard

### Slice A
- [ ] ByteTrack integrated — stable track IDs across frames
- [ ] Re-ID runs every `REID_INTERVAL_S` seconds per track (not every frame)
- [ ] Cosine threshold calibrated on team's faces; document chosen value in CHANGELOG

### Slice B
- [ ] `POST /api/v1/sessions/start` creates session, returns UUID
- [ ] `POST /api/v1/sessions/{id}/stop` closes session
- [ ] `GET /api/v1/sessions/{id}/roster` returns per-student presence state
- [ ] `GET /api/v1/sessions/{id}/report.pdf` returns downloadable PDF
- [ ] Teacher dashboard (`/teacher`): class list, start/stop session buttons
- [ ] Live roster table updates via Supabase Realtime subscription
- [ ] Hash-chained audit log: start session → stop session → audit entries visible in DB
- [ ] Student-lite portal (`/me`): own attendance history + consent status

### Slice C
- [ ] `EngagementSignal` being built and sent to `VNEIAggregator` per frame
- [ ] VNEI aggregates written to `engagement_zone_aggregates` every 60s
- [ ] Coverage badge component in management dashboard (even if not wired yet)

### Week 2 Done-definition
```
Start session in teacher dashboard → open /capture in another tab →
walk an enrolled face in front of camera → roster shows PRESENT →
stop session → export PDF opens with correct name + duration
```

---

## Week 3 — Proctor + VNEI + Remaining Dashboards

### Slice A
- [ ] Exam mode switch: faster sampling + YOLOv8n enabled
- [ ] `phone_detected` flag fires and appears in teacher review queue
- [ ] Gaze-down suppression: demo with writing student → NO flag generated
- [ ] Gaze-down suppression: demo with sideways student → flag after ~5s
- [ ] Before/after FPR number documented (target: ≥50% reduction)

### Slice B
- [ ] `POST /proctor-flags/{id}/review` marks flag reviewed (no auto-penalty)
- [ ] Review queue visible in teacher dashboard
- [ ] Admin dashboard: enrollment UI, user list, consent registry, audit log tabs

### Slice C
- [ ] VNEI bias chart renders in management dashboard
- [ ] Naive mean vs VNEI weighted shown side by side
- [ ] Zone detail table with coverage ratio bars
- [ ] Management dashboard shows cross-session attendance trends

### Week 3 Done-definition
```
Exam mode: place phone on desk → proctor_flag appears in teacher review queue
           → teacher reviews it → "Mark Reviewed" works
VNEI: bias chart shows front zone coverage 95% vs back 45%,
      VNEI weighted ≠ naive mean
```

---

## Week 4 — Integration, Evaluation, Report, Viva

### Feature freeze (bugs only after Monday)

### Evaluation session (with 10–15 consented volunteers)
- [ ] Book room, recruit volunteers from your own batch
- [ ] Print + collect consent forms (`eval/ground_truth_template.json` for structure)
- [ ] Run `python eval/run_evaluation.py --session-id UUID --ground-truth eval/ground_truth.json`
- [ ] Document honest numbers including failures in report

### Report (8 chapters)
- [ ] Ch1: Introduction & Problem Statement
- [ ] Ch2: Literature Review (face recognition, attendance systems, VNEI in education)
- [ ] Ch3: System Design (architecture diagram from `docs/architecture.md`)
- [ ] Ch4: Implementation (3 slices, tech stack, key code excerpts)
- [ ] Ch5: DPDP/EU AI Act compliance + ethics (quote the invariants from CLAUDE.md)
- [ ] Ch6: Evaluation Results (honest numbers from eval script)
- [ ] Ch7: Discussion (what worked, what didn't, future work)
- [ ] Ch8: Conclusion

### Demo preparation
- [ ] Record backup demo video (20–30 min, full flow)
- [ ] Rehearse live demo twice, timed (target: 45 min with 0 crashes)
- [ ] Every team member can explain any merged line of code at viva

### Repo cleanup
- [ ] `README.md` accurate with one-command setup
- [ ] No secrets in history (`git log --all --full-diff -p | grep -i key`)
- [ ] All tests pass (`pytest tests/ -v`)
- [ ] `CHANGELOG.md` generated from commits
- [ ] Tag release: `git tag v1.0.0 && git push --tags`

---

## Viva talking points (per CLAUDE.md invariants)

1. **"Why browser capture?"** — simpler logistics, 1-month build, common pattern (Zoom/Meet), honest trade-off: frames briefly transit network but processed in memory + never stored.

2. **"Why no training?"** — models (ArcFace, SCRFD, YOLO) pretrained on millions of faces. We enroll (embed once) and match (cosine compare). Training on 50 students would overfit catastrophically.

3. **"How does VNEI prevent bias?"** — coverage ratio weights each zone; back row students counted equally even if camera sees them less clearly. k≥5 suppression admits what we can't measure.

4. **"What about privacy?"** — embeddings only (no raw frames stored), consent before enrollment, right-to-deletion, DPDP-aligned, no emotion labels, aggregate-only engagement.

5. **"What if a proctor flag is wrong?"** — it can't auto-penalise. `auto_action` is a generated always-NULL column. Every flag goes to teacher review. Human decides.

6. **"What are the limitations?"** — accuracy degrades past 5–6m (documented), single camera can't see all zones equally (VNEI coverage badge shows this), free-tier hosting needs keep-alive.
