# ADR 0002 — Vision backend abstraction (stub vs insightface)

**Context.** The CI/dev environment cannot host heavy ML models or a camera, but the team needs
the full pipeline runnable and tested anywhere; production needs real SCRFD + ArcFace.

**Decision.** Define Detector/Embedder/Matcher protocols. Ship a deterministic dependency-free
`stub` backend (a solid-colour card is a "face") for dev/CI/tests, and an `insightface` backend
for production, selected by `VISION_BACKEND`. The pipeline depends only on the protocols.

**Consequences.** (+) End-to-end tests run with no models; clean swap to production; honest seam.
(−) The stub is not a face recogniser — accuracy claims require the insightface backend on real data.
