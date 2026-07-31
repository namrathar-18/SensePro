import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ShieldCheck, LoaderCircle } from "lucide-react";
import { fetchActiveSession } from "@/lib/data/roster";
import { overridePresence } from "@/lib/data/attendance";

export const Route = createFileRoute("/verify")({
  head: () => ({ meta: [{ title: "Check in · SensePro+" }] }),
  component: VerifyPage,
});

// The page a student's phone opens after scanning the session QR. They enter
// their register number and mark themselves present; the write goes through the
// backend (service role), which validates the reg_no against the roster.
function VerifyPage() {
  const [reg, setReg] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "submitting" | "done" | "error">(
    "loading",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setReg(params.get("s") ?? "");
    const fromUrl = params.get("session");
    if (fromUrl) {
      setSessionId(fromUrl);
      setStatus("idle");
      return;
    }
    // No session in the link — fall back to the current live session.
    fetchActiveSession()
      .then((s) => {
        setSessionId(s?.id ?? null);
        setStatus("idle");
      })
      .catch(() => setStatus("idle"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reg.trim()) {
      setError("Enter your register number");
      return;
    }
    if (!sessionId) {
      setError("No live session right now — ask your teacher");
      return;
    }
    setStatus("submitting");
    setError("");
    try {
      await overridePresence(sessionId, reg.trim(), "PRESENT");
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Couldn't check you in. Check your register number and try again.");
    }
  }

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel w-full max-w-sm p-8 text-center">
        {status === "done" ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--ok)]/15 text-[color:var(--ok)]">
              <Check className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
              You're checked in
            </h1>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Register {reg} is marked present for this session. You can put your phone away.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--primary)]/15 text-[color:var(--primary)]">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
              Check in
            </h1>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Enter your register number to mark yourself present for this session.
            </p>
            <form onSubmit={submit} className="mt-6 space-y-3 text-left">
              <input
                value={reg}
                onChange={(e) => setReg(e.target.value)}
                inputMode="numeric"
                placeholder="Register number"
                className="sp-focus h-12 w-full rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 text-center font-mono-nums text-base text-[color:var(--ink)] outline-none focus:border-[color:var(--primary)]"
              />
              {error && (
                <div className="rounded-md border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 px-3 py-2 text-center text-xs text-[color:var(--bad)]">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={status === "submitting" || status === "loading"}
                className="sp-focus flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[color:var(--primary)] text-sm font-semibold text-white transition-colors hover:bg-[color:var(--primary-deep)] disabled:opacity-50"
              >
                {status === "submitting" && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {status === "submitting" ? "Marking present…" : "Mark me present"}
              </button>
            </form>
          </>
        )}
        <div className="mt-6 flex items-center justify-center gap-1 font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
          <ShieldCheck className="h-3 w-3" /> SensePro+ · QR check-in
        </div>
      </div>
    </div>
  );
}
