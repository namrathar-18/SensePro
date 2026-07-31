// One static QR check-in for the session. Students the camera couldn't verify
// scan this single QR, land on /verify, and mark themselves present. The teacher
// sees who is still pending; as each student checks in, presence updates over
// Realtime and they drop off this list. Enabled by the admin toggle
// (see lib/qr-settings).

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Users } from "lucide-react";

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
  const checkInUrl =
    typeof window !== "undefined" && sessionId
      ? `${window.location.origin}/verify?session=${encodeURIComponent(sessionId)}`
      : "";

  useEffect(() => {
    if (!checkInUrl) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(checkInUrl, {
      margin: 1,
      width: 240,
      color: { dark: "#0B1120", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => {});
  }, [checkInUrl]);

  return (
    <section className="glass-panel overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)]">
          <QrCode className="h-4 w-4 text-[color:var(--primary)]" />
        </div>
        <div className="min-w-0">
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            QR check-in · unverified ({students.length})
          </div>
          <div className="text-[13px] text-[color:var(--ink)]">
            Students the camera couldn't verify scan this to mark themselves present
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[240px_1fr]">
        {/* The single session QR */}
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
          <div className="text-center font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Scan to check in
          </div>
        </div>

        {/* Who still needs to check in */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
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
