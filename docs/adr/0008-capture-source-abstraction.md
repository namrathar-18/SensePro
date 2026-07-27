# ADR 0008 — Capture is source-agnostic; the pipeline sees frames, not transports

**Context.** Phase 1 fed the pipeline from a browser over WebSocket. Phase 3 added a CP Plus
camera over RTSP and an evaluation path that replays recorded clips. None of that touched
detection, tracking, re-ID, or the presence FSM — and this ADR records why that was possible
so it stays possible.

**Decision.** The entire vision stack depends on exactly one entry point:
`SessionPipeline.process_frame(frame_bgr, ts)` with `ts` in seconds since session start.
Everything upstream of that call is a *transport*, and transports adapt to the pipeline —
never the reverse.

Transports come in two honest flavours, because they answer different questions:
- **Live sources are latest-wins.** The WS endpoint takes whatever frame the browser just
  sent; `RtspSource` drains the camera on a thread and keeps only the newest frame
  (`latest()`), because a classroom display that lags reality is worse than one that skips
  frames. Consumers sample at their own rate (`SAMPLE_FPS_*`); backlog is discarded by
  construction, never queued.
- **Recorded sources are exhaustive.** `eval.harness.iter_clip` yields every frame with
  deterministic `ts = index / fps`, because evaluation needs reproducibility, not liveness.

The session runner (`capture.run_session`) depends only on a two-method `FrameSource`
protocol (`latest()`, `stop()`), which is how its tests drive a whole session from a list of
synthetic frames with zero network. Downstream consumers (presence recorder, proctor engine,
engagement aggregator) hang off the same loop as observers and read `pipeline.last_tracks` —
adding RTSP did not change them, and adding a fourth transport (file playback for demos, a
second camera) would not either.

**Consequences.**
- (+) Each transport is testable without its medium: WS via TestClient, RTSP via a fake
  `cv2.VideoCapture` factory, eval via frame lists.
- (+) The frozen API contract (ADR 0004) is untouched by new sources — capture transports are
  not API surface.
- (−) Two flavours means one abstraction doesn't literally cover both; the seam they share is
  `process_frame(frame, ts)`, and that is the line that must not blur.
- (−) Latest-wins sampling makes live presence durations approximate at the sample rate;
  the eval harness quantifies exactly how approximate (presence-duration error).
