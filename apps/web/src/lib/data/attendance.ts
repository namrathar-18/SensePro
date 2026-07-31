/** Manual attendance override (teacher edge-case control). Writes go through
 *  the backend service-role endpoint — the frontend only reads Postgres. */

import { apiBase } from "@/lib/api-config";

export type OverrideState = "PRESENT" | "UNVERIFIED" | "ABSENT";

export async function overridePresence(
  sessionId: string,
  regNo: string,
  state: OverrideState,
): Promise<void> {
  const res = await fetch(`${apiBase()}/v1/sessions/${sessionId}/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reg_no: regNo, state }),
  });
  if (!res.ok) throw new Error(`override failed: ${res.status}`);
}

/** Mark a session ended (stamps ends_at). Used to close a session that was left
 *  open — e.g. the capture tab was shut without pressing "Save & end". */
export async function endSession(sessionId: string): Promise<void> {
  const res = await fetch(`${apiBase()}/v1/sessions/${sessionId}/end`, { method: "POST" });
  if (!res.ok) throw new Error(`could not end session: ${res.status}`);
}

/** Current rotating QR token for a session (teacher screen polls this). */
export async function fetchCheckinToken(
  sessionId: string,
): Promise<{ token: string; window_s: number }> {
  const res = await fetch(`${apiBase()}/v1/sessions/${sessionId}/checkin-token`);
  if (!res.ok) throw new Error(`token fetch failed: ${res.status}`);
  return res.json();
}

/** Student self check-in via the rotating QR. Rejected if the token is stale. */
export async function checkinPresent(
  sessionId: string,
  regNo: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${apiBase()}/v1/sessions/${sessionId}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reg_no: regNo, token }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { detail?: string }).detail ?? `check-in failed: ${res.status}`);
  }
}

export interface NewStudent {
  reg_no: string;
  full_name: string;
  class_section: string;
  seat_zone: string;
}

/** Create a student roster record (identity row). Face embedding is a separate
 *  capture step. Returns the created student's id. */
export async function createStudent(s: NewStudent): Promise<string> {
  const res = await fetch(`${apiBase()}/v1/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { detail?: string }).detail ?? `create failed: ${res.status}`);
  }
  return (await res.json()).id as string;
}
