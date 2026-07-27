# ADR 0001 — Browser capture + server-side inference

**Context.** Classroom camera access is via the web app (getUserMedia), like Zoom/Meet; no
dedicated on-board edge device is available, and the timeline is ~1 month.

**Decision.** The browser captures and downscales frames and streams them over a WebSocket to a
Python/FastAPI backend that runs the full vision pipeline (SCRFD/ByteTrack/ArcFace, later YOLO).
Frames are processed in memory and never stored. This supersedes the earlier on-board-ONNX design.

**Consequences.** (+) No hardware procurement; one place for CV logic; easy to test/debug.
(−) Frames briefly leave the device and bandwidth/latency matter — acceptable for one classroom;
on-device/in-browser inference is the privacy-and-scale path for future work.
