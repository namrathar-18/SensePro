// Rotating-QR check-in for UNVERIFIED students. Each student gets a QR that
// rotates every few seconds (so it can't be screenshotted / shared) and a 30s
// window: scan it to confirm PRESENT, otherwise they roll to ABSENT. Enabled by
// the admin toggle (see lib/qr-settings). The QR encodes a /verify deep link.

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrCode, ScanLine, Check } from "lucide-react";

const WINDOW_S = 30; // scan window before auto-absent
const ROTATE_MS = 5000; // QR value refreshes this often

interface Item {
  student_id: string;
  full_name: string;
}

export function QrVerification({
  students,
  onResolve,
}: {
  students: Item[];
  onResolve: (studentId: string, state: "PRESENT" | "ABSENT") => void;
}) {
  if (students.length === 0) return null;
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
            Rotating QR · scan within {WINDOW_S}s or auto-marked absent
          </div>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {students.map((s) => (
          <QrCard key={s.student_id} student={s} onResolve={onResolve} />
        ))}
      </div>
    </section>
  );
}

function QrCard({
  student,
  onResolve,
}: {
  student: Item;
  onResolve: (studentId: string, state: "PRESENT" | "ABSENT") => void;
}) {
  const [remaining, setRemaining] = useState(WINDOW_S);
  const [bucket, setBucket] = useState(0);
  const [dataUrl, setDataUrl] = useState("");
  const [scanned, setScanned] = useState(false);
  const done = useRef(false);

  // 30s countdown -> auto absent
  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      const left = WINDOW_S - Math.floor((Date.now() - start) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0 && !done.current) {
        done.current = true;
        window.clearInterval(id);
        onResolve(student.student_id, "ABSENT");
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [student.student_id, onResolve]);

  // rotate the QR value
  useEffect(() => {
    const id = window.setInterval(() => setBucket((b) => b + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  const token = useMemo(
    () => btoa(`${student.student_id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bucket, student.student_id],
  );

  useEffect(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/verify?s=${encodeURIComponent(student.student_id)}&t=${encodeURIComponent(token)}`;
    QRCode.toDataURL(url, { margin: 1, width: 168, color: { dark: "#0B1120", light: "#ffffff" } })
      .then(setDataUrl)
      .catch(() => {});
  }, [token, student.student_id]);

  function simulateScan() {
    if (done.current) return;
    done.current = true;
    setScanned(true);
    setTimeout(() => onResolve(student.student_id, "PRESENT"), 500);
  }

  const pct = (remaining / WINDOW_S) * 100;
  const low = remaining <= 10;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)]/50 p-4">
      <div className="w-full min-w-0 text-center">
        <div className="truncate text-[14px] font-medium text-[color:var(--ink)]">{student.full_name}</div>
        <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">{student.student_id}</div>
      </div>

      <div className="relative flex h-[168px] w-[168px] items-center justify-center rounded-md bg-white p-1">
        {scanned ? (
          <div className="flex flex-col items-center gap-2 text-[color:var(--ok)]">
            <Check className="h-10 w-10" />
            <span className="font-mono-nums text-xs">Verified</span>
          </div>
        ) : dataUrl ? (
          <img src={dataUrl} alt={`QR for ${student.full_name}`} className="h-full w-full" />
        ) : (
          <div className="h-full w-full animate-pulse rounded bg-[color:var(--surface-2)]" />
        )}
      </div>

      <div className="w-full">
        <div className="mb-1 flex items-center justify-between font-mono-nums text-[10px] uppercase tracking-wider">
          <span className="text-[color:var(--muted)]">rotates 5s</span>
          <span className={low ? "text-[color:var(--bad)]" : "text-[color:var(--muted)]"}>{remaining}s left</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--line)]">
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${pct}%`, background: low ? "var(--bad)" : "var(--primary)" }}
          />
        </div>
      </div>

      <button
        onClick={simulateScan}
        disabled={scanned}
        className="sp-focus flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] text-[11px] font-medium text-[color:var(--ink)] transition-colors hover:border-[color:var(--primary)] disabled:opacity-50"
      >
        <ScanLine className="h-3.5 w-3.5" /> Simulate scan
      </button>
    </div>
  );
}
