/**
 * Captures unhandled errors thrown during SSR that h3 swallows into
 * generic 500 JSON responses. Stores the last error so the server
 * entry can retrieve it for proper logging.
 */

let lastCapturedError: unknown = null;

if (typeof globalThis !== "undefined") {
  globalThis.addEventListener?.("unhandledrejection", (event: PromiseRejectionEvent) => {
    lastCapturedError = event.reason;
  });
}

export function consumeLastCapturedError(): unknown {
  const err = lastCapturedError;
  lastCapturedError = null;
  return err;
}
