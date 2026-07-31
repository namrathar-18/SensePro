import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, Maximize2, Minimize2, Play, Settings2, X, ShieldAlert, Save, CheckCircle2, Activity,
} from "lucide-react";
import { ConnectionBadge, type ConnState } from "@/components/sp/ConnectionBadge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/capture")({
  head: () => ({
    meta: [{ title: "Capture · SensePro+" }],
  }),
  component: CapturePage,
});

// ---- Types matching the frozen WS contract ----
interface WsFace {
  box: [number, number, number, number];
  student_id: string | null;
  score: number;
  track_id: number;
}
interface WsPresentRow {
  student_id: string;
  name: string;
  reg_no: string;
  first_seen_ts: number;
}
interface WsTransition {
  kind: "enter" | "leave" | "recognised";
  student_id?: string;
  name?: string;
  reg_no?: string;
  track_id?: number;
  ts: number;
}
interface WsProctorDet {
  label: string; // "cell phone" | "person"
  box: [number, number, number, number];
  confidence: number;
  student_id?: string | null; // reg_no of the likely owner (nearest face)
  student_name?: string | null;
}
interface WsProctorFlag {
  flag_type: string; // "phone" | "extra_person"
  student_id?: string | null;
  student_name?: string | null;
}
interface WsProctor {
  detections: WsProctorDet[];
  flags: WsProctorFlag[]; // flags raised this frame, with attributed student
}
interface WsEngagement {
  visible: number; // tracks whose head pose could be read
  attending: number;
  head_down: number; // disengagement / "sleeping" proxy
  looking_away: number; // head turned away from the board
  phone: number; // distraction proxy (phone next to a face)
  vnei: number | null; // attending / visible, 0..1 (class-level)
  k_min: number;
  suppressed: boolean; // below the k-anonymity floor → hidden
}
interface WsResult {
  type: "result";
  ts: number;
  faces: WsFace[];
  present: WsPresentRow[];
  transitions: WsTransition[];
  proctor?: WsProctor;
  engagement?: WsEngagement;
  sent_size: { w: number; h: number };
}
interface ProctorAlert {
  id: string;
  type: string; // "phone" | "extra_person"
  name: string | null; // attributed student, if known
  ts: number;
}

function CapturePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const startEpochRef = useRef<number>(0);
  // Per-track visualisation state for smooth lerp between results.
  interface TrackVis {
    prev: [number, number, number, number];
    target: [number, number, number, number];
    targetTs: number;
    appearTs: number;
    labelAppearTs: number;
    student_id: string | null;
    score: number;
    track_id: number;
    lastSeenTs: number;
  }
  const tracksRef = useRef<Map<number, TrackVis>>(new Map());
  const sentRef = useRef<{ w: number; h: number }>({ w: 480, h: 270 });
  const lastResultAtRef = useRef<number>(0);
  // Live proctor detections for the overlay (exam mode). `atMs` lets the draw
  // loop fade the boxes out when the phone leaves frame.
  const proctorRef = useRef<{ dets: WsProctorDet[]; atMs: number }>({ dets: [], atMs: 0 });
  // Save-and-end flow: `stoppingRef` stops the socket auto-reconnecting after an
  // intentional end; `endAckRef` is the finalize callback fired when the server
  // acks the end (or on a timeout fallback).
  const stoppingRef = useRef(false);
  const endAckRef = useRef<null | (() => void)>(null);
  // Mirrors `present` for the save handler (avoids a stale closure on click).
  const presentRef = useRef<WsPresentRow[]>([]);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  // 720 (not 480): at low resolution several faces spread across the frame each
  // become too small for the detector, so only the ~3 nearest are found. Higher
  // = more students detected at once, at more bandwidth/CPU. Raise for a dense
  // classroom (up to 1280 in settings); lower if the socket lags.
  const [sendWidth, setSendWidth] = useState(720);
  // Exam mode also runs YOLO per frame on CPU (~1s/frame); sending 2fps piles
  // frames up and lags the socket, so default exam to 1fps. Lecture is
  // recognition-only and keeps up at 2fps. Adjustable in settings either way.
  const [fps, setFps] = useState(() => {
    if (typeof window === "undefined") return 2;
    return new URLSearchParams(window.location.search).get("mode") === "exam" ? 1 : 2;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [conn, setConn] = useState<ConnState>("OFFLINE");
  const [stale, setStale] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [present, setPresent] = useState<WsPresentRow[]>([]);
  const [toasts, setToasts] = useState<{ id: string; text: string; kind: WsTransition["kind"] }[]>([]);
  // Exam-mode proctoring surfaced to the operator: a running log of raised
  // flags and whether a phone / extra person is on screen *right now*.
  const [proctorFlags, setProctorFlags] = useState<ProctorAlert[]>([]);
  const [proctorLive, setProctorLive] = useState<{
    phone: boolean;
    phoneOwner: string | null;
  }>({ phone: false, phoneOwner: null });
  // Live class-level engagement (aggregate; null until the server sends it).
  const [engagement, setEngagement] = useState<WsEngagement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Set when a session is saved & ended — drives the confirmation overlay.
  const [savedSummary, setSavedSummary] = useState<{ present: number; total: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [rosterHint] = useState({ enrolled: 53 });
  const sessionIdRef = useRef<string | null>(null);

  // Session context comes from the setup screen (/start) via the URL. Opening
  // /capture directly falls back to sensible defaults.
  const [sessionInfo] = useState(() => {
    const p =
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);
    return {
      title: p.get("title") || "Live session",
      mode: (p.get("mode") === "exam" ? "exam" : "lecture") as "lecture" | "exam",
      section: p.get("section") || "4MCA-B",
      room: p.get("room") || "Laptop webcam",
    };
  });

  // Adopt a session id created on the setup screen so we don't open a second one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sid = new URLSearchParams(window.location.search).get("session_id");
    if (sid) sessionIdRef.current = sid;
  }, []);

  // Demo helper: ?demo=stale seeds a frozen roster + reconnecting state so the
  // stale-roster watermark can be reviewed without a real inference server.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("demo") !== "stale") return;
    setRunning(true);
    setConn("RECONNECTING");
    setStale(true);
    lastResultAtRef.current = performance.now() - 8_000;
    startEpochRef.current = Date.now() - 214_000;
    setPresent([
      { student_id: "23MCA1042", name: "Aarav Sharma", reg_no: "23MCA1042", first_seen_ts: Date.now() / 1000 - 180 },
      { student_id: "23MCA1043", name: "Diya Patel", reg_no: "23MCA1043", first_seen_ts: Date.now() / 1000 - 160 },
      { student_id: "23MCA1044", name: "Ishaan Nair", reg_no: "23MCA1044", first_seen_ts: Date.now() / 1000 - 120 },
      { student_id: "23MCA1045", name: "Ananya Reddy", reg_no: "23MCA1045", first_seen_ts: Date.now() / 1000 - 90 },
      { student_id: "23MCA1046", name: "Vihaan Iyer", reg_no: "23MCA1046", first_seen_ts: Date.now() / 1000 - 40 },
    ]);
  }, []);

  // Enumerate cameras
  useEffect(() => {
    (async () => {
      try {
        const list = await navigator.mediaDevices?.enumerateDevices?.();
        if (list) {
          const cams = list.filter((d) => d.kind === "videoinput");
          setCameras(cams);
          if (!deviceId && cams[0]) setDeviceId(cams[0].deviceId);
        }
      } catch {}
    })();
  }, [deviceId]);

  // Timer tick
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startEpochRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [running]);

  // Overlay resize + redraw
  useEffect(() => {
    const draw = () => {
      const overlay = overlayRef.current;
      const video = videoRef.current;
      if (!overlay || !video) return;
      const rect = video.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w === 0 || h === 0) return;
      if (overlay.width !== w) overlay.width = w;
      if (overlay.height !== h) overlay.height = h;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const sx = w / sentRef.current.w;
      const sy = h / sentRef.current.h;
      const now = performance.now();

      // --- Phone overlay: a detected phone gets a pulsing box + confidence,
      // drawn before faces so it shows even with no track. Red in exam mode
      // (proctor flag), amber in lecture (distraction / engagement signal). ---
      const pv = proctorRef.current;
      if (pv.dets.length && now - pv.atMs < 1200) {
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 190));
        const isExam = sessionInfo.mode === "exam";
        const col = isExam ? "244,63,94" : "251,191,36"; // red vs amber
        ctx.font = '700 12px "IBM Plex Mono", monospace';
        for (const d of pv.dets) {
          if (d.label !== "cell phone") continue; // person boxes would shadow the student's own body
          const [x0, y0, x1, y1] = d.box;
          const rx = x0 * sx, ry = y0 * sy, rw = (x1 - x0) * sx, rh = (y1 - y0) * sy;
          ctx.lineWidth = 3;
          ctx.strokeStyle = `rgba(${col},${pulse.toFixed(3)})`;
          ctx.strokeRect(rx, ry, rw, rh);
          // Name the likely owner (nearest recognised face) when known.
          const who = d.student_name ? ` · ${d.student_name}` : "";
          const suffix = isExam ? "" : " · distraction";
          const label = `PHONE ${(d.confidence * 100).toFixed(0)}%${who}${suffix}`;
          const tw = ctx.measureText(label).width + 12;
          ctx.fillStyle = `rgba(${col},0.94)`;
          ctx.fillRect(rx, Math.max(0, ry - 20), tw, 20);
          ctx.fillStyle = isExam ? "#fff" : "#1a1205";
          ctx.fillText(label, rx + 6, Math.max(12, ry - 6));
        }
      }

      const tracks = tracksRef.current;
      if (tracks.size === 0) return;
      ctx.lineWidth = 2;
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      for (const v of tracks.values()) {
        // Drop stale tracks (no update in ~1s)
        if (now - v.targetTs > 1000) continue;
        // Lerp prev -> target over 120ms
        const kt = Math.min(1, (now - v.targetTs) / 120);
        const k = easeOut(kt);
        const bx0 = v.prev[0] + (v.target[0] - v.prev[0]) * k;
        const by0 = v.prev[1] + (v.target[1] - v.prev[1]) * k;
        const bx1 = v.prev[2] + (v.target[2] - v.prev[2]) * k;
        const by1 = v.prev[3] + (v.target[3] - v.prev[3]) * k;
        const rx = bx0 * sx;
        const ry = by0 * sy;
        const rw = (bx1 - bx0) * sx;
        const rh = (by1 - by0) * sy;

        const known = !!v.student_id;
        // Cobalt -> green fade for recognised tracks (first 400ms after recognition)
        const rec = Math.min(1, (now - v.labelAppearTs) / 400);
        const boxAlpha = Math.min(1, (now - v.appearTs) / 180);
        let color: string;
        if (known) {
          // interp from cobalt(59,130,246) -> green(52,211,153)
          const r0 = 59 + (52 - 59) * rec;
          const g0 = 130 + (211 - 130) * rec;
          const b0 = 246 + (153 - 246) * rec;
          color = `rgba(${r0.toFixed(0)},${g0.toFixed(0)},${b0.toFixed(0)},${(0.95 * boxAlpha).toFixed(3)})`;
        } else {
          color = `rgba(251,191,36,${(0.95 * boxAlpha).toFixed(3)})`;
        }
        ctx.strokeStyle = color;
        // rounded rect
        const r = 6;
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + rw - r, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
        ctx.lineTo(rx + rw, ry + rh - r);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
        ctx.lineTo(rx + r, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
        ctx.lineTo(rx, ry + r);
        ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.closePath();
        ctx.stroke();
        // label (fade in ~220ms after first appear / recognition change)
        const labelAlpha = Math.min(1, (now - v.labelAppearTs) / 220);
        if (labelAlpha <= 0.01) continue;
        const label = known
          ? `${v.student_id} · ${v.score.toFixed(2)}`
          : `#${v.track_id}`;
        const pad = 6;
        const tw = ctx.measureText(label).width + pad * 2;
        const th = 20;
        ctx.fillStyle = `rgba(11,17,32,${(0.78 * labelAlpha).toFixed(3)})`;
        ctx.fillRect(rx, Math.max(0, ry - th), tw, th);
        const [lr, lg, lb] = known ? [52, 211, 153] : [251, 191, 36];
        ctx.fillStyle = `rgba(${lr},${lg},${lb},${labelAlpha.toFixed(3)})`;
        ctx.fillText(label, rx + pad, Math.max(12, ry - 6));
      }
    };
    const raf = () => {
      draw();
      rafId = requestAnimationFrame(raf);
    };
    let rafId = requestAnimationFrame(raf);
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const pushToast = useCallback((text: string, kind: WsTransition["kind"]) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-3), { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const handleWsMessage = useCallback(
    (ev: MessageEvent) => {
      try {
        const data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        // The server acked our end request — attendance intervals are closed.
        if (data?.type === "session_ended") {
          if (endAckRef.current) {
            endAckRef.current();
            endAckRef.current = null;
          }
          return;
        }
        if (data?.type !== "result") return;
        const msg = data as WsResult;
        sentRef.current = msg.sent_size;
        lastResultAtRef.current = performance.now();
        const now = performance.now();
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
        const seen = new Set<number>();
        for (const f of msg.faces) {
          seen.add(f.track_id);
          const cur = tracksRef.current.get(f.track_id);
          if (!cur) {
            tracksRef.current.set(f.track_id, {
              prev: [...f.box] as [number, number, number, number],
              target: [...f.box] as [number, number, number, number],
              targetTs: now,
              appearTs: now,
              labelAppearTs: now,
              student_id: f.student_id,
              score: f.score,
              track_id: f.track_id,
              lastSeenTs: now,
            });
          } else {
            // Snapshot the currently-interpolated position as the new prev.
            const kt = Math.min(1, (now - cur.targetTs) / 120);
            const k = easeOut(kt);
            cur.prev = [
              cur.prev[0] + (cur.target[0] - cur.prev[0]) * k,
              cur.prev[1] + (cur.target[1] - cur.prev[1]) * k,
              cur.prev[2] + (cur.target[2] - cur.prev[2]) * k,
              cur.prev[3] + (cur.target[3] - cur.prev[3]) * k,
            ];
            cur.target = [...f.box] as [number, number, number, number];
            cur.targetTs = now;
            cur.lastSeenTs = now;
            // Re-fade the label whenever identity transitions unknown -> known.
            if (!cur.student_id && f.student_id) cur.labelAppearTs = now;
            cur.student_id = f.student_id;
            cur.score = f.score;
          }
        }
        // Drop tracks the server hasn't emitted for a while.
        for (const [id, v] of tracksRef.current) {
          if (!seen.has(id) && now - v.lastSeenTs > 800) tracksRef.current.delete(id);
        }
        setStale(false);
        if (msg.present) {
          setPresent(msg.present);
          presentRef.current = msg.present;
        }
        for (const t of msg.transitions ?? []) {
          if (t.kind === "enter" && t.name) pushToast(`${t.name} entered`, "enter");
          else if (t.kind === "recognised" && t.name) pushToast(`${t.name} recognised`, "recognised");
          else if (t.kind === "leave" && t.name) pushToast(`${t.name} left`, "leave");
        }

        // Proctor (exam mode): stash detections for the overlay, reflect live
        // phone/extra-person state (and WHO holds the phone), and log any flag
        // the engine actually raised — with the attributed student.
        const proctor = msg.proctor;
        if (proctor) {
          const dets = proctor.detections ?? [];
          proctorRef.current = { dets, atMs: now };
          const phoneDet = dets.find((d) => d.label === "cell phone");
          setProctorLive({
            phone: !!phoneDet,
            phoneOwner: phoneDet?.student_name ?? null,
          });
          for (const f of proctor.flags ?? []) {
            // Name comes from the detection attribution (reg_no→name); the flag
            // row itself carries the DB UUID, not a nameable reg_no.
            const name = phoneDet?.student_name ?? null;
            setProctorFlags((prev) => [
              { id: crypto.randomUUID(), type: f.flag_type, name, ts: Date.now() / 1000 },
              ...prev.slice(0, 49),
            ]);
            const who = name ? ` · ${name}` : "";
            pushToast(`Phone flagged${who}`, "leave");
          }
        }

        // Class-level engagement (aggregate; head_down = sleeping/disengagement).
        if (msg.engagement && typeof msg.engagement.visible === "number") {
          setEngagement(msg.engagement);
        }
      } catch {}
    },
    [pushToast],
  );

  const openSocket = useCallback(() => {
    try {
      setConn("RECONNECTING");
      const params = new URLSearchParams();
      params.set("mode", captureMode());
      if (sessionIdRef.current) params.set("session_id", sessionIdRef.current);
      const ws = new WebSocket(`${wsBase()}?${params.toString()}`);
      wsRef.current = ws;
      ws.onopen = () => setConn("LIVE");
      ws.onmessage = handleWsMessage;
      ws.onclose = () => {
        setConn("OFFLINE");
        setStale(true);
        // Don't reconnect if we're intentionally ending the session.
        if (running && !stoppingRef.current) {
          if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = window.setTimeout(openSocket, 2500);
        }
      };
      ws.onerror = () => {
        setConn("OFFLINE");
      };
    } catch {
      setConn("OFFLINE");
    }
  }, [handleWsMessage, running]);

  const startSending = useCallback(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const period = 1000 / Math.max(1, fps);
    const tick = async () => {
      const video = videoRef.current;
      const ws = wsRef.current;
      if (video && video.videoWidth > 0 && ws && ws.readyState === WebSocket.OPEN && ctx) {
        const w = sendWidth;
        const h = Math.round((video.videoHeight / video.videoWidth) * w);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        const b64 = dataUrl.split(",")[1] ?? "";
        const ts = (Date.now() - startEpochRef.current) / 1000;
        try {
          ws.send(JSON.stringify({ type: "frame", ts, jpg_b64: b64 }));
        } catch {}
      }
    };
    sendTimerRef.current = window.setInterval(tick, period);
  }, [fps, sendWidth]);

  const start = useCallback(async () => {
    setPermError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      startEpochRef.current = Date.now();
      setElapsed(0);
      setPresent([]);
      presentRef.current = [];
      setProctorFlags([]);
      setProctorLive({ phone: false, phoneOwner: null });
      setEngagement(null);
      proctorRef.current = { dets: [], atMs: 0 };
      setSavedSummary(null);
      stoppingRef.current = false;
      endAckRef.current = null;
      setRunning(true);
      // Reuse the session created on the setup screen; only open one here if the
      // user came straight to /capture. Failing quietly keeps the camera live
      // (recognition still runs) even when the backend isn't persisting.
      if (!sessionIdRef.current) {
        try {
          const res = await fetch(`${apiBase()}/v1/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              class_section: sessionInfo.section,
              subject: sessionInfo.title,
              mode: sessionInfo.mode,
            }),
          });
          sessionIdRef.current = res.ok ? (await res.json()).id : null;
        } catch {
          sessionIdRef.current = null;
        }
      }
      openSocket();
      startSending();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Camera unavailable";
      setPermError(message);
    }
  }, [deviceId, openSocket, startSending, sessionInfo]);

  // Tear the session down: stop timers, camera, and socket. Does NOT send an
  // end frame — callers decide whether to persist first (saveAndEnd) or not.
  const teardown = useCallback(() => {
    stoppingRef.current = true;
    if (sendTimerRef.current) {
      window.clearInterval(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    wsRef.current = null;
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRunning(false);
    setConn("OFFLINE");
    tracksRef.current.clear();
  }, []);

  // Unmount / abrupt stop: fire an end frame if we can, then tear down. No
  // confirmation UI — that's the saveAndEnd path below.
  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "end", ts: (Date.now() - startEpochRef.current) / 1000 }));
      } catch {}
    }
    teardown();
  }, [teardown]);

  // "Save & end attendance": persist by sending the end frame, wait for the
  // server's session_ended ack (or a short timeout), then tear down and show
  // the saved-summary overlay. Attendance rows are written live as students are
  // recognised; the end frame closes their open intervals server-side.
  const saveAndEnd = useCallback(() => {
    const present = presentRef.current.length;
    const total = rosterHint.enrolled;
    const finalize = () => {
      teardown();
      setSavedSummary({ present, total });
    };
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      stoppingRef.current = true; // stop the reconnect loop while we close out
      endAckRef.current = finalize;
      try {
        ws.send(JSON.stringify({ type: "end", ts: (Date.now() - startEpochRef.current) / 1000 }));
      } catch {}
      // Fallback: if no ack arrives (socket already degraded), finalize anyway —
      // the live-written rows are already saved.
      window.setTimeout(() => {
        if (endAckRef.current) {
          endAckRef.current = null;
          finalize();
        }
      }, 3500);
    } else {
      finalize();
    }
  }, [teardown, rosterHint.enrolled]);

  useEffect(() => () => stop(), [stop]);

  const toggleFs = useCallback(async () => {
    const el = wrapRef.current;
    if (!document.fullscreenElement && el) {
      await el.requestFullscreen?.().catch(() => {});
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.().catch(() => {});
      setFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const time = useMemo(() => {
    const h = Math.floor(elapsed / 3600).toString().padStart(2, "0");
    const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0");
    const s = Math.floor(elapsed % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  }, [elapsed]);

  return (
    <div ref={wrapRef} className="app-bg relative flex h-screen w-screen flex-col overflow-hidden">
      {/* Top HUD */}
      <header className="relative z-30 flex h-20 shrink-0 items-center gap-6 border-b border-[color:var(--line)] bg-[color:var(--bg)]/85 px-8 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--line)]"
            style={{ background: "linear-gradient(135deg, var(--primary-deep), var(--primary))" }}
          >
            <Camera className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
                {sessionInfo.section} · {sessionInfo.title}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 font-mono-nums text-[9px] uppercase tracking-[0.14em]",
                  sessionInfo.mode === "exam"
                    ? "bg-[color:var(--bad)]/15 text-[color:var(--bad)]"
                    : "bg-[color:var(--primary)]/15 text-[color:var(--primary)]",
                )}
              >
                {sessionInfo.mode}
              </span>
            </div>
            <div className="truncate font-mono-nums text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
              {sessionInfo.room} · SensePro+
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          {running && (
            <div className="flex items-center gap-2 rounded-md border border-[color:var(--bad)]/50 bg-[color:var(--bad)]/10 px-3 py-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full bg-[color:var(--bad)]"
                style={{ animation: "sensepro-pulse 1.4s ease-in-out infinite" }}
              />
              <span className="font-mono-nums text-xs uppercase tracking-[0.2em] text-[color:var(--bad)]">
                Rec
              </span>
            </div>
          )}
          <div className="glass-panel-2 px-4 py-2">
            <div className="font-mono-nums text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Session
            </div>
            <div className="font-mono-nums text-[26px] font-semibold leading-none text-[color:var(--ink)]">
              {time}
            </div>
          </div>
          <ConnectionBadge state={conn} />
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex h-12 w-12 items-center justify-center rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
            aria-label="Settings"
          >
            <Settings2 className="h-5 w-5" />
          </button>
          <button
            onClick={toggleFs}
            className="flex h-12 w-12 items-center justify-center rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]"
            aria-label="Fullscreen"
          >
            {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1">
        {/* Video stage */}
        <div className="relative flex min-h-0 flex-1 flex-col p-6">
          <div className="relative flex-1 overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-black shadow-[var(--shadow-cobalt)]">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />

            {/* Scan line while running */}
            {running && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div
                  className="absolute left-0 right-0 h-[2px]"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(34,211,238,0.9), transparent)",
                    boxShadow: "0 0 24px rgba(34,211,238,0.6)",
                    animation: "sensepro-scan 4.5s linear infinite",
                  }}
                />
              </div>
            )}

            {/* Reconnecting / offline banner over the stage */}
            {running && conn !== "LIVE" && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center"
              >
                <div
                  className={cn(
                    "glass-panel-2 flex items-center gap-3 px-4 py-2.5",
                    conn === "RECONNECTING"
                      ? "border-[color:var(--warn)]/50"
                      : "border-[color:var(--bad)]/60",
                  )}
                >
                  {conn === "RECONNECTING" ? (
                    <span
                      className="h-3 w-3 rounded-full border-2 border-[color:var(--warn)] border-t-transparent"
                      style={{ animation: "sensepro-spin 0.9s linear infinite" }}
                    />
                  ) : (
                    <span
                      className="h-2.5 w-2.5 rounded-full bg-[color:var(--bad)]"
                      style={{ animation: "sensepro-pulse 1.4s ease-in-out infinite" }}
                    />
                  )}
                  <div className="leading-tight">
                    <div
                      className={cn(
                        "font-mono-nums text-[11px] uppercase tracking-[0.22em]",
                        conn === "RECONNECTING"
                          ? "text-[color:var(--warn)]"
                          : "text-[color:var(--bad)]",
                      )}
                    >
                      {conn === "RECONNECTING"
                        ? "Reconnecting to inference"
                        : "Inference socket unreachable"}
                    </div>
                    <div className="font-mono-nums text-[10px] tracking-wider text-[color:var(--muted)]">
                      {conn === "RECONNECTING"
                        ? "Roster shown below is the last verified state · session continues"
                        : `${import.meta.env.VITE_WS_URL || "VITE_WS_URL unset"} · will auto-retry`}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Live phone alert. Exam = red proctor violation; lecture = amber
                distraction (engagement) signal, not a review flag. */}
            {running && proctorLive.phone && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center"
              >
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-5 py-3 shadow-lg",
                    sessionInfo.mode === "exam"
                      ? "border-[color:var(--bad)] bg-[color:var(--bad)]/90 text-white"
                      : "border-[color:var(--warn)] bg-[color:var(--warn)]/90 text-black",
                  )}
                  style={{ animation: "sensepro-pulse 1.2s ease-in-out infinite" }}
                >
                  <ShieldAlert className="h-5 w-5" />
                  <span className="font-mono-nums text-sm font-bold uppercase tracking-[0.14em]">
                    {`Phone${proctorLive.phoneOwner ? ` · ${proctorLive.phoneOwner}` : ""}${
                      sessionInfo.mode === "exam" ? "" : " · distraction"
                    }`}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Empty / permission states */}
            {!running && !permError && <IdleState />}
            {permError && <ErrorState message={permError} onRetry={start} />}

            {/* Toasts */}
            <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2">
              <AnimatePresence>
                {toasts.map((t) => (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={cn(
                      "glass-panel-2 px-3 py-2 font-mono-nums text-xs",
                      t.kind === "leave" ? "text-[color:var(--muted)]" : "text-[color:var(--ink)]",
                    )}
                  >
                    <span className={cn(
                      "mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle",
                      t.kind === "enter" && "bg-[color:var(--accent)]",
                      t.kind === "recognised" && "bg-[color:var(--ok)]",
                      t.kind === "leave" && "bg-[color:var(--muted)]",
                    )} />
                    {t.text}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right rail: PRESENT NOW */}
        <aside className={cn(
          "relative flex w-[360px] shrink-0 flex-col border-l border-[color:var(--line)] bg-[color:var(--surface)]/70 backdrop-blur transition-opacity",
          stale && "opacity-95",
        )}>
          {/* Diagonal STALE ROSTER watermark */}
          {stale && running && (
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
              <div
                aria-hidden
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(135deg, transparent 0 22px, rgba(251,191,36,0.06) 22px 24px)",
                }}
              >
                <div
                  className="font-display text-4xl font-black uppercase tracking-[0.35em] text-[color:var(--warn)]/25"
                  style={{ transform: "rotate(-24deg)" }}
                >
                  Stale · Roster
                </div>
              </div>
              <div className="absolute inset-x-3 top-3 rounded-md border border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 px-3 py-2">
                <div className="font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--warn)]">
                  Roster frozen · awaiting inference
                </div>
                <div className="mt-0.5 font-mono-nums text-[10px] text-[color:var(--muted)]">
                  Last update {lastResultAtRef.current
                    ? `${Math.floor((performance.now() - lastResultAtRef.current) / 1000)}s ago`
                    : "—"}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between border-b border-[color:var(--line)] px-6 py-5">
            <div>
              <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Present now
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="font-display text-4xl font-extrabold leading-none tracking-tight text-[color:var(--ink)]">
                  {present.length.toString().padStart(2, "0")}
                </div>
                <div className="font-mono-nums text-sm text-[color:var(--muted)]">
                  / {rosterHint.enrolled}
                </div>
              </div>
            </div>
            {running && <span className="pulse-dot" />}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {present.length === 0 ? (
              <div className="mx-3 mt-6 rounded-md border border-dashed border-[color:var(--line)] p-6 text-center">
                <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Awaiting recognitions
                </div>
                <div className="mt-2 text-sm text-[color:var(--muted)]">
                  Once faces are matched they appear here in real time.
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                <AnimatePresence initial={false}>
                  {present.map((p) => (
                    <motion.li
                      key={p.student_id}
                      layout
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="flex items-center gap-3 rounded-md border border-transparent px-3 py-2.5 hover:border-[color:var(--line)] hover:bg-[color:var(--surface-2)]/60"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[color:var(--line)] font-mono-nums text-xs font-semibold text-[color:var(--ink)]"
                        style={{ background: "linear-gradient(135deg, var(--surface-2), var(--surface))" }}
                      >
                        {initials(p.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[18px] font-medium text-[color:var(--ink)]">
                          {p.name}
                        </div>
                        <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">
                          {p.reg_no}
                        </div>
                      </div>
                      <div className="font-mono-nums text-[11px] text-[color:var(--ok)]">
                        {tsAgo(p.first_seen_ts)}
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

          {/* Class engagement panel (all modes): aggregate attention + the
              head-down / "sleeping" count. Hidden below the k-anonymity floor. */}
          {engagement && (
            <div className="border-t border-[color:var(--line)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  <Activity className="h-3.5 w-3.5" /> Class engagement
                </div>
                {!engagement.suppressed && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-[0.14em]",
                      engagement.head_down > 0 || engagement.looking_away > 0 || engagement.phone > 0
                        ? "bg-[color:var(--warn)]/15 text-[color:var(--warn)]"
                        : "bg-[color:var(--ok)]/15 text-[color:var(--ok)]",
                    )}
                  >
                    {engagement.head_down > 0
                      ? "head-down"
                      : engagement.looking_away > 0
                        ? "looking away"
                        : engagement.phone > 0
                          ? "distracted"
                          : "attentive"}
                  </span>
                )}
              </div>
              {engagement.suppressed ? (
                <div className="mt-2 font-mono-nums text-[11px] leading-relaxed text-[color:var(--muted)]">
                  Hidden — engagement is class-aggregate only and needs ≥{" "}
                  {engagement.k_min} visible {engagement.k_min === 1 ? "face" : "faces"} (privacy floor).
                </div>
              ) : (
                <>
                  <div className="mt-3 flex items-baseline gap-2">
                    <div className="font-display text-2xl font-extrabold text-[color:var(--ink)]">
                      {engagement.vnei == null ? "—" : `${Math.round(engagement.vnei * 100)}%`}
                    </div>
                    <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">
                      attention (class)
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-nums text-[11px]">
                    <span className="text-[color:var(--ok)]">
                      {engagement.attending} attending
                    </span>
                    <span className={engagement.head_down > 0 ? "text-[color:var(--warn)]" : "text-[color:var(--muted)]"}>
                      {engagement.head_down} head-down
                    </span>
                    <span className={engagement.looking_away > 0 ? "text-[color:var(--warn)]" : "text-[color:var(--muted)]"}>
                      {engagement.looking_away} looking away
                    </span>
                    <span className={engagement.phone > 0 ? "text-[color:var(--warn)]" : "text-[color:var(--muted)]"}>
                      {engagement.phone} on phone
                    </span>
                    <span className="text-[color:var(--muted)]">{engagement.visible} visible</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Proctor panel (exam mode only): live status + flags raised for the
              review queue this session. */}
          {sessionInfo.mode === "exam" && (
            <div className="border-t border-[color:var(--line)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  <ShieldAlert className="h-3.5 w-3.5" /> Proctor
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-[0.14em]",
                    proctorLive.phone
                      ? "bg-[color:var(--bad)]/15 text-[color:var(--bad)]"
                      : "bg-[color:var(--ok)]/15 text-[color:var(--ok)]",
                  )}
                >
                  {proctorLive.phone ? "phone" : "clear"}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <div className="font-display text-2xl font-extrabold text-[color:var(--ink)]">
                  {proctorFlags.length.toString().padStart(2, "0")}
                </div>
                <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">
                  flag{proctorFlags.length === 1 ? "" : "s"} sent to review
                </div>
              </div>
              {proctorFlags.length > 0 && (
                <ul className="mt-3 flex max-h-28 flex-col gap-1 overflow-y-auto">
                  {proctorFlags.slice(0, 6).map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between font-mono-nums text-[11px] text-[color:var(--muted)]"
                    >
                      <span className="text-[color:var(--ink)]">
                        Phone
                        {f.name ? <span className="text-[color:var(--muted)]"> · {f.name}</span> : null}
                      </span>
                      <span>{tsAgo(f.ts)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        {/* Settings sheet */}
        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute right-6 top-24 z-40 w-[380px] glass-panel p-5"
            >
              <div className="flex items-center justify-between">
                <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Capture settings
                </div>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="text-[color:var(--muted)] hover:text-[color:var(--ink)]"
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-1 font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
                    Camera
                  </div>
                  <select
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    className="sp-focus h-12 w-full rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 font-mono-nums text-xs text-[color:var(--ink)] outline-none focus:border-[color:var(--primary)]"
                  >
                    {cameras.length === 0 && <option value="">System default</option>}
                    {cameras.map((c) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label || c.deviceId.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
                <NumberRow label="Send width (px)" value={sendWidth} onChange={setSendWidth} min={240} max={1280} step={40} />
                <NumberRow label="Frames / second" value={fps} onChange={setFps} min={1} max={8} step={1} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Disclosure line */}
      <div className="border-t border-[color:var(--line)] bg-[color:var(--surface)]/60 px-8 py-2 text-center font-mono-nums text-[11px] tracking-wider text-[color:var(--muted)]">
        This classroom uses camera-based attendance. Frames are processed in memory and never stored. Details from your teacher.
      </div>

      {/* Bottom bar */}
      <footer className="flex h-24 shrink-0 items-center justify-between border-t border-[color:var(--line)] bg-[color:var(--bg)]/85 px-8 backdrop-blur">
        <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
          {running ? "Session in progress" : "Session idle"}
        </div>
        <div className="flex items-center gap-3">
          {!running ? (
            <button
              onClick={start}
              className="flex h-14 items-center gap-3 rounded-md bg-[color:var(--primary)] px-8 text-base font-semibold tracking-wide text-white transition-colors hover:bg-[color:var(--primary-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            >
              <Play className="h-5 w-5" fill="currentColor" />
              Start session
            </button>
          ) : (
            <button
              onClick={saveAndEnd}
              className="flex h-14 items-center gap-3 rounded-md bg-[color:var(--ok)] px-8 text-base font-semibold tracking-wide text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ok)]"
            >
              <Save className="h-5 w-5" />
              Save &amp; end attendance
            </button>
          )}
        </div>
      </footer>

      {/* Saved-summary overlay — shown after Save & end attendance */}
      <AnimatePresence>
        {savedSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="glass-panel w-[min(92vw,460px)] p-8 text-center"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10">
                <CheckCircle2 className="h-8 w-8 text-[color:var(--ok)]" />
              </div>
              <div className="mt-5 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
                Attendance saved
              </div>
              <div className="mt-2 text-sm text-[color:var(--muted)]">
                {sessionInfo.section} · {sessionInfo.title}
              </div>
              <div className="mt-6 flex items-baseline justify-center gap-2">
                <span className="font-display text-5xl font-extrabold text-[color:var(--ok)]">
                  {savedSummary.present}
                </span>
                <span className="font-mono-nums text-lg text-[color:var(--muted)]">
                  / {savedSummary.total} present
                </span>
              </div>
              <p className="mt-4 font-mono-nums text-[11px] leading-relaxed tracking-wide text-[color:var(--muted)]">
                Records written to the session history. Absent students are everyone not marked present.
              </p>
              <div className="mt-7 flex items-center justify-center gap-3">
                <a
                  href="/sessions"
                  className="flex h-12 items-center gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-5 text-sm font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                >
                  View sessions
                </a>
                <button
                  onClick={() => setSavedSummary(null)}
                  className="flex h-12 items-center gap-2 rounded-md bg-[color:var(--primary)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--primary-deep)]"
                >
                  <Play className="h-4 w-4" fill="currentColor" />
                  New session
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IdleState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/40 via-black/20 to-black/40">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full border border-[color:var(--line)]"
        style={{ background: "linear-gradient(135deg, var(--surface-2), var(--surface))" }}
      >
        <Camera className="h-7 w-7 text-[color:var(--muted)]" />
      </div>
      <div className="font-display text-3xl font-extrabold tracking-tight text-[color:var(--ink)]">
        Kiosk standby
      </div>
      <div className="max-w-md text-center text-sm text-[color:var(--muted)]">
        Press <span className="font-mono-nums text-[color:var(--ink)]">Start session</span> to open
        the camera and connect the inference socket.
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center">
      <div className="font-mono-nums text-[11px] uppercase tracking-[0.22em] text-[color:var(--bad)]">
        Camera unavailable
      </div>
      <div className="max-w-lg text-[color:var(--ink)]">{message}</div>
      <div className="max-w-md text-sm text-[color:var(--muted)]">
        Check camera permission for this browser, then retry. If no camera is attached, plug in the
        board's USB feed.
      </div>
      <button
        onClick={onRetry}
        className="mt-2 flex h-12 items-center gap-2 rounded-md bg-[color:var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--primary-deep)]"
      >
        Retry
      </button>
    </div>
  );
}

function NumberRow({
  label, value, onChange, min, max, step,
}: {
  label: string; value: number; onChange: (n: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
          {label}
        </div>
        <div className="font-mono-nums text-xs text-[color:var(--ink)]">{value}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`Decrease ${label}`}
          className="sp-focus h-12 w-12 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
        >−</button>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="sp-focus h-2 flex-1 accent-[color:var(--primary)]"
        />
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          aria-label={`Increase ${label}`}
          className="sp-focus h-12 w-12 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
        >+</button>
      </div>
    </div>
  );
}

function wsBase() {
  // 127.0.0.1, not localhost: Windows resolves localhost to IPv6 (::1) but
  // uvicorn listens on IPv4, which silently breaks the capture WebSocket.
  return (import.meta.env.VITE_WS_URL as string) || "ws://127.0.0.1:8000/ws/capture";
}
function apiBase() {
  return wsBase().replace(/^ws/, "http").replace(/\/ws\/capture$/, "");
}
function captureMode(): "lecture" | "exam" {
  if (typeof window === "undefined") return "lecture";
  return new URLSearchParams(window.location.search).get("mode") === "exam" ? "exam" : "lecture";
}

function initials(n: string) {
  return n
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function tsAgo(t: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}
