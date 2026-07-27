// Admin-controlled toggle for QR check-in of unverified students. Persisted in
// localStorage and broadcast so the teacher panel reacts the moment the admin
// flips it. (A production build would persist this per-institution in Supabase.)

import { useEffect, useState } from "react";

const KEY = "sensepro.qr_verify";
const EVT = "sensepro:qr-setting";

export function getQrEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(KEY) === "1";
}

export function setQrEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVT, { detail: on }));
}

/** Returns [enabled, setEnabled], staying in sync across routes/tabs. */
export function useQrEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(getQrEnabled);
  useEffect(() => {
    const handler = () => setOn(getQrEnabled());
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return [on, setQrEnabled];
}
