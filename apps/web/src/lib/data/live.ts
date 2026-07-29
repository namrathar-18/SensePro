// Live Supabase reads that mirror the mock shapes in ./types, so pages can swap
// mockX() for the fetchX() here with no UI change. All reads go through RLS
// (staff via app_metadata role, students self-only) + the demo read policies.

import { supabase } from "@/lib/supabase";
import type {
  AttendanceRecord,
  AuditEntry,
  ConsentRecord,
  DeviceRow,
  UserRow,
  ZoneAggregate,
} from "./types";

function deviceStatus(lastSeenIso: string | null): DeviceRow["status"] {
  if (!lastSeenIso) return "offline";
  const age = Date.now() - Date.parse(lastSeenIso);
  if (age < 60_000) return "online";
  if (age < 10 * 60_000) return "idle";
  return "offline";
}

export async function fetchDevicesLive(): Promise<DeviceRow[]> {
  const { data, error } = await supabase
    .from("devices")
    .select("id, label, room, last_seen_at, created_at")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id,
    label: d.label,
    room: d.room ?? "—",
    last_seen: d.last_seen_at ?? d.created_at,
    status: deviceStatus(d.last_seen_at),
  }));
}

export async function fetchConsentsLive(): Promise<ConsentRecord[]> {
  const { data, error } = await supabase
    .from("consent_records")
    .select("consent_version, signed_at, withdrawn_at, students(reg_no, full_name)")
    .order("signed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c: Record<string, unknown>) => {
    const s = (c.students ?? {}) as { reg_no?: string; full_name?: string };
    return {
      student_id: s.reg_no ?? "",
      name: s.full_name ?? "—",
      reg_no: s.reg_no ?? "",
      version: (c.consent_version as string) ?? "v1",
      signed_at: (c.signed_at as string) ?? "",
      status: c.withdrawn_at ? "withdrawn" : "active",
    };
  });
}

export async function fetchAuditLive(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("seq, at, actor, action, hash, prev_hash")
    .order("seq", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((a) => ({
    seq: a.seq,
    ts: a.at,
    actor: a.actor,
    action: a.action,
    hash: (a.hash ?? "").slice(0, 12),
    prev_hash: (a.prev_hash ?? "").slice(0, 12),
  }));
}

const ROLE_TITLE: Record<string, string> = {
  teacher: "Teaching staff",
  management: "Management",
  admin: "Administrator",
  student: "Student",
};

export async function fetchUsersLive(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, app_role, created_at")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((u) => ({
    id: u.user_id,
    name: ROLE_TITLE[u.app_role] ?? u.app_role,
    email: `${u.user_id.slice(0, 8)}…`,
    role: u.app_role,
  }));
}

export async function fetchZonesLive(sessionId?: string): Promise<ZoneAggregate[]> {
  let q = supabase
    .from("engagement_zone_aggregates")
    .select("zone, vnei, coverage, n_tracked, enrolled_in_zone, signals, window_start")
    .order("window_start", { ascending: false });
  if (sessionId) q = q.eq("session_id", sessionId);
  const { data, error } = await q.limit(30);
  if (error) throw error;
  // newest window per zone
  const seen = new Map<string, ZoneAggregate>();
  for (const r of data ?? []) {
    if (r.zone === "class" || seen.has(r.zone)) continue;
    const headDown = (r.signals as { head_down_rate?: number })?.head_down_rate ?? 0;
    seen.set(r.zone, {
      zone: r.zone,
      vnei: r.vnei,
      naive_mean: Math.min(1, r.vnei + headDown * 0.35 + 0.06), // illustrative naive over-count
      coverage: r.coverage,
      n_tracked: r.n_tracked,
      n_visible: Math.round(r.coverage * r.enrolled_in_zone),
    });
  }
  return ["front", "mid", "back"].map((z) => seen.get(z)).filter(Boolean) as ZoneAggregate[];
}

export interface ProctorQueueRow {
  id: string;
  type: "phone" | "extra_person" | "head_pose";
  student: string;
  ts: string;
  confidence: number;
  session: string;
  status: "awaiting_review" | "dismissed" | "upheld";
}

const FLAG_CONF: Record<string, number> = { phone: 0.9, extra_person: 0.72, head_pose: 0.63, other: 0.6 };
const REVIEW_TO_STATUS: Record<string, ProctorQueueRow["status"]> = {
  pending: "awaiting_review",
  dismissed: "dismissed",
  upheld: "upheld",
};

export async function fetchProctorQueueLive(): Promise<ProctorQueueRow[]> {
  const { data, error } = await supabase
    .from("proctor_flags")
    .select("id, flag_type, review_status, flagged_at, students(full_name), class_sessions(subject)")
    .order("flagged_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((f: Record<string, unknown>) => {
    const s = (f.students ?? {}) as { full_name?: string };
    const cs = (f.class_sessions ?? {}) as { subject?: string };
    return {
      id: f.id as string,
      type: f.flag_type as ProctorQueueRow["type"],
      student: s.full_name ?? "Unknown (extra person)",
      ts: new Date(f.flagged_at as string).toLocaleTimeString(),
      confidence: FLAG_CONF[f.flag_type as string] ?? 0.7,
      session: cs.subject ?? "Session",
      status: REVIEW_TO_STATUS[f.review_status as string] ?? "awaiting_review",
    };
  });
}

export async function reviewFlagLive(id: string, verdict: "dismissed" | "upheld"): Promise<void> {
  const { error } = await supabase
    .from("proctor_flags")
    .update({ review_status: verdict, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export interface SessionRow {
  id: string;
  subject: string;
  class_section: string;
  mode: string;
  starts_at: string;
  ends_at: string | null;
  present: number; // distinct students marked PRESENT
}

/** Session history from class_sessions, newest first, with a distinct-present
 * count per session derived from presence_intervals. Staff-visible via RLS. */
export async function fetchSessionsLive(): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from("class_sessions")
    .select("id, subject, class_section, mode, starts_at, ends_at, presence_intervals(student_id, state)")
    .order("starts_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((s: Record<string, unknown>) => {
    const rows = (s.presence_intervals ?? []) as { student_id: string; state: string }[];
    const present = new Set(
      rows.filter((r) => r.state === "PRESENT").map((r) => r.student_id),
    ).size;
    return {
      id: s.id as string,
      subject: (s.subject as string) ?? "Session",
      class_section: (s.class_section as string) ?? "—",
      mode: (s.mode as string) ?? "lecture",
      starts_at: s.starts_at as string,
      ends_at: (s.ends_at as string) ?? null,
      present,
    };
  });
}

/** The signed-in student's own attendance history (RLS returns only their rows). */
export async function fetchMyAttendanceLive(): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("presence_intervals")
    .select("state, started_at, session_id, class_sessions(subject, starts_at)")
    .order("started_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  const bySession = new Map<string, AttendanceRecord>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const sid = r.session_id as string;
    if (bySession.has(sid)) continue; // latest state per session
    const cs = (r.class_sessions ?? {}) as { subject?: string; starts_at?: string };
    bySession.set(sid, {
      session_id: sid,
      class_name: cs.subject ?? "Session",
      date: cs.starts_at ?? (r.started_at as string),
      state: r.state as AttendanceRecord["state"],
    });
  }
  return [...bySession.values()];
}
