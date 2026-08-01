// Rotating QR check-in for the session. The QR carries a server-issued token
// that changes every window; a scan is accepted only if its token is current
// (see backend /checkin), so a screenshot forwarded to an absent student goes
// stale — the anti-cheat property. One QR for the whole session (not per
// student); unverified students scan it and mark themselves present on /verify.
// Enabled by the admin toggle (see lib/qr-settings).

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Users } from "lucide-react";
import { fetchCheckinToken } from "@/lib/data/attendance";

interface Item {
  student_id: string;
  full_name: string;
}

export function QrVerification({
  sessionId,
  students,
}: {
  sessionId: string | null;
  students: Item[];
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [windowS, setWindowS] = useState(20);
  const [remaining, setRemaining] = useState(20);
  const tokenRef = useRef<string>("");

  // Poll the current token and re-render the QR each window.
  useEffect(() => {
    if (!sessionId || typeof window === "undefined") {
      setDataUrl("");
      return;
    }
    let cancelled = false;
    let pollId: number | undefined;

    const refresh = async () => {
      try {
        const { token, window_s } = await fetchCheckinToken(sessionId);
        if (cancelled) return;
        tokenRef.current = token;
        setWindowS(window_s);
        setRemaining(window_s);
        const url = `${window.location.origin}/verify?session=${encodeURIComponent(
          sessionId,
        )}&t=${encodeURIComponent(token)}`;
        const img = await QRCode.toDataURL(url, {
          margin: 1,
          width: 240,
          color: { dark: "#0B1120", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(img);
      } catch {
        /* transient — the next poll retries */
      }
    };

    void refresh();
    pollId = window.setInterval(refresh, windowS * 1000);
    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
    };
    // windowS is set from the first response; re-run to lock the correct cadence.
  }, [sessionId, windowS]);

  // Countdown ticker for the progress bar.
  useEffect(() => {
    const id = window.setInterval(
      () => setRemaining((r) => (r <= 1 ? windowS : r - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [windowS]);

  const pct = (remaining / windowS) * 100;

  return (
    <section className="glass-panel overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)]">
          <QrCode className="h-4 w-4 text-[color:var(--primary)]" />
        </div>
        <div className="min-w-0">
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
            QR check-in · unverified ({students.length})
          </div>
          <div className="text-[13px] text-[color:var(--ink)]">
            Rotating QR — students scan the code on screen to mark themselves present
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[240px_1fr]">
        {/* The rotating session QR */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-[240px] w-[240px] items-center justify-center rounded-md bg-white p-2">
            {dataUrl ? (
              <img src={dataUrl} alt="Session check-in QR" className="h-full w-full" />
            ) : (
              <div className="px-4 text-center font-mono-nums text-[11px] text-[color:var(--muted)]">
                {sessionId ? "generating…" : "Start a session to enable QR check-in"}
              </div>
            )}
          </div>
          {sessionId && (
            <div className="w-[240px]">
              <div className="mb-1 flex items-center justify-between font-mono-nums text-[11px] uppercase tracking-wider text-[color:var(--muted)]">
                <span>refreshes {windowS}s</span>
                <span>{remaining}s</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--line)]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: "var(--primary)" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Who still needs to check in */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 font-mono-nums text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
            <Users className="h-3.5 w-3.5" /> Awaiting check-in
          </div>
          {students.length === 0 ? (
            <div className="rounded-md border border-dashed border-[color:var(--line)] p-6 text-center font-mono-nums text-[11px] text-[color:var(--muted)]">
              Everyone is verified — no pending check-ins.
            </div>
          ) : (
            <ul className="flex max-h-[220px] flex-col gap-1 overflow-y-auto pr-1">
              {students.map((s) => (
                <li
                  key={s.student_id}
                  className="flex items-center justify-between rounded-md border border-[color:var(--line)]/60 bg-[color:var(--surface-2)]/50 px-3 py-2"
                >
                  <span className="truncate text-[14px] text-[color:var(--ink)]">{s.full_name}</span>
                  <span className="ml-2 shrink-0 font-mono-nums text-[11px] text-[color:var(--muted)]">
                    {s.student_id}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
