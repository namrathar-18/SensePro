/** Manual attendance override (teacher edge-case control). Writes go through
 *  the backend service-role endpoint — the frontend only reads Postgres. */

export type OverrideState = "PRESENT" | "UNVERIFIED" | "ABSENT";

function apiBase(): string {
  // Mirror the capture page: derive the HTTP origin from the WS URL, defaulting
  // to 127.0.0.1 (Windows resolves localhost to IPv6, which uvicorn misses).
  const ws = (import.meta.env.VITE_WS_URL as string) || "ws://127.0.0.1:8000/ws/capture";
  return ws.replace(/^ws/, "http").replace(/\/ws\/capture$/, "");
}

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
