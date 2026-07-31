/** Single source of truth for where the inference backend lives.
 *
 * Deployment: set VITE_API_URL to the backend origin (e.g.
 * https://sensepro-api.onrender.com). The WebSocket URL is derived from it, so
 * one variable configures both. VITE_WS_URL is still honoured for backward
 * compatibility with existing local .env files.
 *
 * Local default is 127.0.0.1 rather than localhost: on Windows localhost
 * resolves to IPv6 (::1) while uvicorn binds IPv4, which silently breaks the
 * capture WebSocket.
 *
 * NOTE: a hosted deployment MUST set VITE_API_URL. Anything that talks to the
 * backend from a student's own phone — QR check-in above all — is unreachable
 * while this points at 127.0.0.1, because that address means "this device".
 */

const LOCAL_API = "http://127.0.0.1:8000";

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/** Backend HTTP origin, no trailing slash. */
export function apiBase(): string {
  const explicit = import.meta.env.VITE_API_URL as string | undefined;
  if (explicit) return stripTrailingSlash(explicit);
  // Fall back to deriving it from a configured WS URL.
  const ws = import.meta.env.VITE_WS_URL as string | undefined;
  if (ws) return stripTrailingSlash(ws.replace(/^ws/, "http").replace(/\/ws\/capture$/, ""));
  return LOCAL_API;
}

/** Capture WebSocket endpoint. */
export function wsBase(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  return `${apiBase().replace(/^http/, "ws")}/ws/capture`;
}

/** True when the backend address only resolves on this machine — so a QR
 *  scanned on a phone cannot reach it. Used to warn before a demo. */
export function isLocalOnlyApi(): boolean {
  return /(127\.0\.0\.1|localhost|\[::1\])/.test(apiBase());
}
