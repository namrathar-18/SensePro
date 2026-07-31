import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Camera, GraduationCap, ShieldAlert, Presentation, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CLASS_SECTION } from "@/lib/data/class-roster";

export const Route = createFileRoute("/_shell/start")({
  head: () => ({ meta: [{ title: "Start session · SensePro+" }] }),
  component: StartSessionPage,
});

type Mode = "lecture" | "exam" | "workshop";

const MODES: { id: Mode; label: string; icon: typeof Camera; hint: string }[] = [
  { id: "lecture", label: "Lecture", icon: GraduationCap, hint: "Attendance + class engagement" },
  { id: "exam", label: "Exam", icon: ShieldAlert, hint: "Attendance + proctoring flags" },
  { id: "workshop", label: "Workshop", icon: Presentation, hint: "Attendance + engagement" },
];

import { apiBase } from "@/lib/api-config";

function StartSessionPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("lecture");
  const [section, setSection] = useState(CLASS_SECTION);
  const [title, setTitle] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);

  const isExam = mode === "exam";
  const titleLabel = isExam ? "Examination name" : "Subject / topic";
  const titlePlaceholder = isExam ? "e.g. Mid-Term — Distributed Systems" : "e.g. Distributed Systems";

  async function launch() {
    if (!section.trim()) {
      toast.error("Enter a class / section");
      return;
    }
    setBusy(true);
    const subject = title.trim() || (isExam ? "Examination" : "Lecture");
    let sessionId: string | null = null;
    try {
      const res = await fetch(`${apiBase()}/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_section: section.trim(), subject, mode }),
      });
      if (res.ok) sessionId = (await res.json()).id;
    } catch {
      /* backend offline — capture still runs live, just without persistence */
    }
    const params = new URLSearchParams({ mode, title: subject, section: section.trim() });
    if (room.trim()) params.set("room", room.trim());
    if (sessionId) params.set("session_id", sessionId);
    if (!sessionId) toast.info("Backend not persisting — running the camera live only.");
    nav({ to: "/capture", search: Object.fromEntries(params) as never });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="sp-eyebrow text-[11px]">Step 1 of 2 · Configure</div>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
          Create a session, then open the camera
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Name the class or exam and pick a mode. The camera starts on the next screen.
        </p>
      </div>

      <div className="glass-panel space-y-7 p-6 sm:p-8">
        {/* Mode */}
        <div>
          <div className="mb-2 sp-eyebrow text-[10px]">Session mode</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-pressed={active}
                  className={cn(
                    "sp-focus flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
                    active
                      ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10"
                      : "border-[color:var(--line)] bg-[color:var(--surface-2)] hover:border-[color:var(--muted)]",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      active ? "text-[color:var(--primary)]" : "text-[color:var(--muted)]",
                    )}
                  />
                  <div className="font-display text-sm font-bold text-[color:var(--ink)]">{m.label}</div>
                  <div className="font-mono-nums text-[10px] leading-tight text-[color:var(--muted)]">
                    {m.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Class / Section">
            <input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="4MCA-B"
              className="sp-input"
            />
          </Field>
          <Field label={titleLabel}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={titlePlaceholder}
              className="sp-input"
            />
          </Field>
          <Field label="Room (optional)">
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. Room 201"
              className="sp-input"
            />
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-lg border border-dashed border-[color:var(--line)] bg-[color:var(--surface-2)]/50 px-4 py-3 font-mono-nums text-[11px] leading-relaxed text-[color:var(--muted)]">
              {isExam
                ? "Exam mode adds phone / extra-person proctoring — every flag is a review item, never an auto-penalty."
                : "Class engagement (VNEI) is aggregated per zone, never per student."}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 border-t border-[color:var(--line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">
            Camera opens on the next screen · frames processed in memory, never stored
          </div>
          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={busy}
            onClick={launch}
            className="sp-focus flex h-12 items-center justify-center gap-2 rounded-lg bg-[color:var(--primary)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--primary-deep)] disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
            {busy ? "Creating…" : "Open camera & begin"}
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      <style>{`
        .sp-input {
          width: 100%; height: 48px; padding: 0 14px; border-radius: 10px;
          background: var(--surface-2); border: 1px solid var(--line);
          color: var(--ink); font-family: var(--font-mono); font-size: 13px;
          outline: none; transition: border-color .15s ease, box-shadow .15s ease;
        }
        .sp-input::placeholder { color: var(--muted); }
        .sp-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-glow); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 sp-eyebrow text-[10px]">{label}</div>
      {children}
    </label>
  );
}
