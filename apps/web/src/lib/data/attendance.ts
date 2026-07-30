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
