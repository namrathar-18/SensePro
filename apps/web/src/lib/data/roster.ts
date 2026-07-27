/** Live roster: direct Postgres reads via RLS + a Realtime subscription on
 *  presence_intervals. No backend read endpoint, no polling (ADR 0006). */

import { supabase } from "@/lib/supabase";
import type { PresenceState, RosterEntry } from "@/lib/types";

export interface ActiveSession {
  id: string;
  class_section: string;
  subject: string | null;
  starts_at: string;
}

interface StudentRow {
  id: string;
  reg_no: string;
  full_name: string;
}

export interface IntervalRow {
  id: string;
  session_id: string;
  student_id: string; // uuid -> students.id
  state: PresenceState;
  started_at: string;
  ended_at: string | null;
}

/** Latest open session, or null when nothing is live. */
export async function fetchActiveSession(): Promise<ActiveSession | null> {
  const { data, error } = await supabase
    .from("class_sessions")
    .select("id, class_section, subject, starts_at")
    .is("ends_at", null)
    .order("starts_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function fetchStudents(): Promise<StudentRow[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, reg_no, full_name")
    .order("reg_no");
  if (error) throw error;
  return data ?? [];
}

export async function fetchIntervals(sessionId: string): Promise<IntervalRow[]> {
  const { data, error } = await supabase
    .from("presence_intervals")
    .select("id, session_id, student_id, state, started_at, ended_at")
    .eq("session_id", sessionId)
    .order("started_at");
  if (error) throw error;
  return data ?? [];
}

/** Fold interval rows into per-student roster entries. The newest interval
 *  determines state; PRESENT time sums closed intervals plus the open one. */
export function deriveRoster(students: StudentRow[], intervals: IntervalRow[]): RosterEntry[] {
  const now = Date.now();
  const byStudent = new Map<string, IntervalRow[]>();
  for (const iv of intervals) {
    const list = byStudent.get(iv.student_id) ?? [];
    list.push(iv);
    byStudent.set(iv.student_id, list);
  }
  return students.map((s) => {
    const ivs = byStudent.get(s.id) ?? [];
    const latest = ivs[ivs.length - 1];
    let present_seconds = 0;
    for (const iv of ivs) {
      if (iv.state !== "PRESENT") continue;
      const start = Date.parse(iv.started_at);
      const end = iv.ended_at ? Date.parse(iv.ended_at) : now;
      present_seconds += Math.max(0, (end - start) / 1000);
    }
    return {
      student_id: s.reg_no,
      full_name: s.full_name,
      state: latest?.state ?? "ABSENT",
      last_seen_ts: latest ? Math.max(0, (now - Date.parse(latest.started_at)) / 1000) : null,
      present_seconds,
    };
  });
}

/** Subscribe to presence changes for one session. Returns an unsubscribe fn.
 *  onStatus lets the UI show a stale watermark and resubscribe on drops. */
export function subscribePresence(
  sessionId: string,
  onChange: (row: IntervalRow) => void,
  onStatus?: (live: boolean) => void,
): () => void {
  const channel = supabase
    .channel(`presence-${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "presence_intervals",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const row = payload.new as IntervalRow;
        if (row?.id) onChange(row); // DELETE events carry an empty payload.new
      },
    )
    .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
  return () => {
    void supabase.removeChannel(channel);
  };
}
