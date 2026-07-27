# ADR 0007 — VNEI engagement: behavioural signals, zone aggregates only

**Context.** Phase 3 adds the engagement layer (privacy tier T2). The PRD's red lines are
absolute: no per-student engagement score anywhere, no emotion labels, aggregates suppressed
below k=5. The schema has enforced this since 0001 (`engagement_zone_aggregates` with a
`n_tracked >= 5` CHECK and no student column, plus the comment "There is intentionally NO
per-student engagement table"). This ADR records how the compute side honours the same lines.

**Decision.**
- **Signals (backend/engagement/signals.py)** are per-frame, per-track, and transient — they
  exist only inside one aggregation call and are never written anywhere. Four behaviours, all
  derived from artefacts the pipeline already produces: *attending / head-down* (the proctor
  pitch heuristic over the detector's eye landmarks, ADR-level honesty: backends without
  landmarks yield `None`, not a guess), *phone-nearby* (the proctor detector's phone boxes and
  its nearest-track adjacency rule, reused rather than reimplemented), *stillness* (box-centre
  movement below 2% of the frame diagonal — resolution-independent).
- **Eye closure is omitted, on purpose.** An EAR needs eyelid landmarks; InsightFace kps carry
  eye centres only. Faking it from what we have would be dishonest signal inflation. If it is
  ever wanted, MediaPipe FaceMesh is the documented path — as another optional backend.
- **No emotion labels, ever.** The EU AI Act (Art. 5(1)(f)) prohibits emotion inference in
  education; beyond legality, affect labels ("bored", "confused") are scientifically shaky and
  pedagogically toxic. Behavioural observation ("head down", "phone nearby") states only what a
  camera can actually see. Nothing in this layer names a feeling.
- **Zones are fixed horizontal frame bands** (bottom third front, top third back, else mid —
  camera at the front of the room, nearer rows sit lower in frame). Geometry, not seat maps:
  crude, stable, and cheap to explain at a viva. Band fractions are config.
- **VNEI = attending observations / all pitch-capable observations of *visible* tracks**, per
  zone per 60s window. The visibility normalisation is the honesty mechanism: a back row the
  camera barely sees contributes only what was actually observed, and the thinness of that
  evidence is *declared* via `coverage` (= distinct tracks seen / enrolled in zone) instead of
  silently deflating or inflating the index. The UI must render low coverage as low confidence
  (Prompt 4 renders coverage < 50% hatched).
- **k>=5 twice**: the aggregator refuses to emit a zone window with fewer than 5 distinct
  tracks (logged as suppressed), and the DB CHECK would reject such a row anyway. Belt and
  braces, same philosophy as grants-vs-RLS in ADR 0006.
- Aggregate rows carry rates only (`phone_rate`, `head_down_rate`, `still_rate`) in the
  `signals` jsonb. A test pins the payload to exactly the schema's columns; **any change that
  wants a student identifier on an engagement record is a design violation and must stop here.**

**Consequences.**
- (+) Engagement can be shown to management with a defensible fairness story: normalised by
  visibility, floored by k-anonymity, no individual ever scored.
- (+) Signals reuse proctor/vision machinery — no new models, no training, nothing persisted.
- (−) Frame-band zones misassign students on the band edges; acceptable at classroom scale and
  documented rather than hidden.
- (−) VNEI measures *observable posture*, not attention. The name says index, not truth; the
  coverage badge and this ADR keep that caveat attached.
