import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Circle, Fingerprint, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_shell/enrollment")({
  head: () => ({
    meta: [
      { title: "Enrollment · SensePro+" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EnrollmentPage,
});

const STEPS = [
  { k: "Consent", d: "Signed digital consent form filed under DPDP guidelines." },
  { k: "Capture", d: "10–20 quality frames, head-turn sequence. Never 50." },
  { k: "Quality gate", d: "Sharpness · lighting · pose diversity check." },
  { k: "Embed", d: "One 512-d ArcFace embedding stored in pgvector." },
  { k: "Purge", d: "Video + raw frames deleted from disk immediately." },
  { k: "Verify", d: "Same-session match against enrolled embedding." },
];

function EnrollmentPage() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  function advance() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      setProgress(0);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
          § enrollment station
        </div>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
          Add a student
        </h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          One capture per student. Target 10–20 quality frames — never 50. Video and frames are purged immediately after the embedding is stored.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Main panel */}
        <div className="glass-panel p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--accent)]">
              step {step + 1} / {STEPS.length}
            </span>
            <span className="font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
              {STEPS[step].k}
            </span>
          </div>

          <h3 className="font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
            {STEPS[step].k}
          </h3>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{STEPS[step].d}</p>

          <div className="mt-6 grid place-items-center rounded-xl border border-dashed border-[color:var(--line)]/70 bg-[color:var(--surface)]/50 py-14">
            <Fingerprint className="h-10 w-10 text-[color:var(--accent)]" />
            <div className="mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, var(--primary), var(--accent))",
                }}
              />
            </div>
            <p className="mt-2 font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
              {progress}% quality
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <button
              onClick={() => setProgress(Math.min(100, progress + 20))}
              className="sp-btn sp-btn-secondary"
            >
              Simulate frame batch (+20%)
            </button>
            <button
              disabled={progress < 100}
              onClick={advance}
              className="sp-btn sp-btn-primary"
            >
              Continue
            </button>
          </div>
        </div>

        {/* SOP checklist */}
        <ol className="glass-panel p-5">
          <p className="mb-3 font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
            § SOP
          </p>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={s.k} className="flex items-start gap-3 py-2.5">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-[color:var(--ok)]" />
                ) : (
                  <Circle className={`mt-0.5 h-5 w-5 ${active ? "text-[color:var(--accent)]" : "text-[color:var(--muted)]/50"}`} />
                )}
                <div>
                  <div className={`text-sm font-medium ${active ? "text-[color:var(--ink)]" : "text-[color:var(--muted)]"}`}>
                    {s.k}
                  </div>
                  <div className="text-xs text-[color:var(--muted)]">{s.d}</div>
                </div>
              </li>
            );
          })}
          <li className="mt-3 flex items-center gap-2 rounded-lg border border-[color:var(--line)]/60 bg-[color:var(--surface-2)]/50 px-3 py-2 text-xs text-[color:var(--muted)]">
            <Trash2 className="h-3.5 w-3.5" /> Raw frames are erased after step 5.
          </li>
        </ol>
      </div>
    </div>
  );
}
