import type {
  AttendanceRecord,
  AuditEntry,
  ConsentRecord,
  DeviceRow,
  ProctorFlag,
  RosterEntry,
  Session,
  UserRow,
  ZoneAggregate,
} from "./types";
import { CLASS_ROSTER, CLASS_SECTION } from "./class-roster";

// Demo data is sourced from the real 4MCA-B class roster (see class-roster.ts)
// so every dashboard shows the actual class before live Supabase data is
// seeded. Each mock is annotated // SWAP: for the real backend cutover.

// Deterministic pseudo-random so the demo looks identical on every render
// (no hydration flicker, stable screenshots for the report).
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function mockRoster(): RosterEntry[] {
  // SWAP: supabase query — select roster for active session
  return CLASS_ROSTER.map((s, i) => {
    const r = seeded(i + 1);
    const state: RosterEntry["state"] =
      r < 0.68 ? "PRESENT" : r < 0.85 ? "UNVERIFIED" : "ABSENT";
    return {
      student_id: s.reg_no,
      name: s.full_name,
      reg_no: s.reg_no,
      state,
      last_seen:
        state === "PRESENT"
          ? new Date(Date.now() - Math.floor(seeded(i + 100) * 180_000)).toISOString()
          : null,
    };
  });
}

export function mockSessions(): Session[] {
  // SWAP: supabase query — recent sessions
  const now = Date.now();
  const total = CLASS_ROSTER.length;
  const classes = [
    `${CLASS_SECTION} · Distributed Systems`,
    `${CLASS_SECTION} · Machine Learning`,
    `${CLASS_SECTION} · Cloud Native`,
    `${CLASS_SECTION} · DBMS`,
    `${CLASS_SECTION} · Software Engineering`,
  ];
  return classes.map((c, i) => ({
    id: `sess_${i + 1}`,
    class_name: c,
    room: `Room ${201 + i}`,
    started_at: new Date(now - (i + 1) * 3600_000).toISOString(),
    ended_at: i === 0 ? null : new Date(now - (i + 1) * 3600_000 + 55 * 60_000).toISOString(),
    present_count: Math.round(total * (0.6 + seeded(i + 3) * 0.28)),
    total_count: total,
    vnei: +(0.58 + seeded(i + 7) * 0.28).toFixed(2),
  }));
}

export function mockFlags(): ProctorFlag[] {
  // SWAP: supabase query — flags for sessions the teacher owns
  const now = Date.now();
  const types: ProctorFlag["type"][] = ["phone", "extra_person", "head_pose"];
  return Array.from({ length: 6 }).map((_, i) => ({
    id: `flag_${i + 1}`,
    session_id: `sess_${(i % 3) + 1}`,
    type: types[i % 3],
    ts: new Date(now - i * 12 * 60_000).toISOString(),
    clip_seconds: 6 + (i % 4),
    status: "awaiting_review",
  }));
}

export function mockZones(): ZoneAggregate[] {
  // SWAP: supabase query — aggregated per session (k>=5 enforced, coverage shown)
  return [
    { zone: "front", vnei: 0.74, naive_mean: 0.81, coverage: 0.82, n_tracked: 18, n_visible: 18 },
    { zone: "mid", vnei: 0.61, naive_mean: 0.68, coverage: 0.67, n_tracked: 18, n_visible: 14 },
    { zone: "back", vnei: 0.38, naive_mean: 0.52, coverage: 0.41, n_tracked: 17, n_visible: 7 },
  ];
}

export function mockVneiTrend() {
  // SWAP: supabase query — VNEI over last N sessions
  return Array.from({ length: 10 }).map((_, i) => ({
    session: `S-${i + 1}`,
    vnei: +(0.5 + Math.sin(i / 1.7) * 0.15 + seeded(i + 11) * 0.08).toFixed(2),
  }));
}

export function mockConsents(): ConsentRecord[] {
  // SWAP: supabase query — consent registry
  return CLASS_ROSTER.map((s, i) => ({
    student_id: s.reg_no,
    name: s.full_name,
    reg_no: s.reg_no,
    version: "v1",
    signed_at: new Date(Date.now() - i * 3600_000).toISOString(),
    status: "active",
  }));
}

export function mockAudit(): AuditEntry[] {
  // SWAP: supabase query — audit log with hash chain
  const actions = [
    "session.start", "session.end", "roster.export", "flag.dismiss",
    "flag.uphold", "consent.sign", "user.role.grant", "deletion.request",
  ];
  const entries: AuditEntry[] = [];
  let prev = "000000000000";
  for (let i = 0; i < 14; i++) {
    const hash = randHash(i);
    entries.push({
      seq: 1000 + i,
      ts: new Date(Date.now() - (13 - i) * 7 * 60_000).toISOString(),
      actor:
        i % 3 === 0
          ? "sys"
          : i % 3 === 1
            ? "teacher@christuniversity.in"
            : "admin@christuniversity.in",
      action: actions[i % actions.length],
      hash,
      prev_hash: prev,
    });
    prev = hash;
  }
  return entries.reverse(); // newest first
}

export function mockDevices(): DeviceRow[] {
  // SWAP: supabase query — capture clients
  return [
    { id: "cap_laptop", label: "Laptop webcam · 4MCA-B", room: "4MCA-B classroom", last_seen: new Date(Date.now() - 8_000).toISOString(), status: "online" },
    { id: "cap_201", label: "Board · Room 201", room: "Room 201", last_seen: new Date(Date.now() - 90_000).toISOString(), status: "idle" },
    { id: "cap_lab1", label: "Lab-1 Kiosk", room: "Lab 1", last_seen: new Date(Date.now() - 20 * 60_000).toISOString(), status: "offline" },
  ];
}

export function mockUsers(): UserRow[] {
  // SWAP: supabase query — users + roles
  return [
    { id: "u1", name: "Dr. Neha Singhal", email: "neha.singhal@christuniversity.in", role: "teacher" },
    { id: "u2", name: "Dr. Tegil J John", email: "tegil.john@christuniversity.in", role: "teacher" },
    { id: "u3", name: "Ms. Sharmila", email: "sharmila@christuniversity.in", role: "management" },
    { id: "u4", name: "Dr. Binayak Dutta", email: "binayak.dutta@christuniversity.in", role: "admin" },
  ];
}

export function mockMyAttendance(): AttendanceRecord[] {
  // SWAP: supabase query — /me attendance
  const now = Date.now();
  const subjects = ["Distributed Systems", "Machine Learning", "Cloud Native", "DBMS"];
  return Array.from({ length: 28 }).map((_, i) => {
    const r = seeded(i + 21);
    const state = r < 0.78 ? "PRESENT" : r < 0.9 ? "UNVERIFIED" : "ABSENT";
    return {
      session_id: `sess_${i}`,
      class_name: subjects[i % 4],
      date: new Date(now - i * 86400_000).toISOString(),
      state,
    };
  });
}

function randHash(seed: number) {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 12; i++) s += chars[Math.floor(seeded(seed * 17 + i) * 16)];
  return s;
}
