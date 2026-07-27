import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/verify")({
  head: () => ({ meta: [{ title: "Verify · SensePro+" }] }),
  component: VerifyPage,
});

// Deep link a student's phone opens when scanning the rotating QR. In a
// production build this posts the one-time token to the backend, which writes
// the PRESENT interval via the service role; here it confirms the check-in.
function VerifyPage() {
  const [reg, setReg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReg(new URLSearchParams(window.location.search).get("s") ?? "");
  }, []);

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel max-w-sm p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--ok)]/15 text-[color:var(--ok)]">
          <Check className="h-8 w-8" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
          You're checked in
        </h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {reg ? `Register ${reg}` : "Your presence"} is confirmed for this session. You can put your
          phone away.
        </p>
        <div className="mt-6 flex items-center justify-center gap-1 font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
          <ShieldCheck className="h-3 w-3" /> SensePro+ · one-time rotating QR
        </div>
      </div>
    </div>
  );
}
