# ADR 0003 — Multi-template degrade-augmented enrolment

**Context.** Enrolment frames come from a sharp iPhone camera held close; live recognition runs
against a lower-resolution classroom board camera several metres away. That domain gap (resolution,
JPEG artefacts, mild blur) costs recognition accuracy at distance. We cannot close it by training —
the models are pretrained and the no-training invariant forbids fine-tuning.

**Decision.** During enrolment, for each selected face crop we also embed degraded *variants* that
approximate the board-camera view: downscale the crop to a small face height (default 96 and 64 px),
re-encode as a low-quality JPEG (q=40) in memory, apply a mild Gaussian blur, upscale back, then
embed. All variants are stored as additional templates for the same student (multi-template
matching). On by default; `--no-degrade` disables it. Degradation is applied only to the frames
already chosen by the pose-bin quality gate. Each variant is produced by a fresh detect→embed so it
is correct for both backends — the InsightFace embedder returns the embedding of the most recently
detected face, so detect and embed must run on the same image.

**Consequences.**
- (+) Closes the iPhone→board domain gap with no training; expected to improve recognition at 4–6 m.
- (+) Pure in-memory image transforms; raw frames are still deleted after embedding (invariant intact).
- (−) ~3× the embeddings per student (clean + two degraded heights). This respects LD-04, which caps
  raw *frames*, not embeddings, but grows the pgvector footprint and the per-frame match cost roughly
  linearly. For ~50 students this is negligible (a few MB); revisit `degrade_heights` if the roster or
  match latency grows. Tune `degrade_heights`/`jpeg_quality` to the measured board-camera resolution.
