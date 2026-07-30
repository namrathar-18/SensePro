import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Circle, Fingerprint, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createStudent } from "@/lib/data/attendance";

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

function AddStudentForm() {
  const [regNo, setRegNo] = useState("");
  const [fullName, setFullName] = useState("");
  const [section, setSection] = useState("4MCA-B");
  const [zone, setZone] = useState("mid");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!regNo.trim() || !fullName.trim()) {
      toast.error("Register number and name are required");
      return;
    }
    setBusy(true);
    try {
      await createStudent({
        reg_no: regNo.trim(),
        full_name: fullName.trim(),
        class_section: section.trim() || "4MCA-B",
        seat_zone: zone,
      });
      toast.success(`Added ${fullName.trim()} (${regNo.trim()})`);
      setAdded((prev) => [`${regNo.trim()} · ${fullName.trim()}`, ...prev].slice(0, 8));
      setRegNo("");
      setFullName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the student");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-panel p-6">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-[color:var(--primary)]" />
        <div className="font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
          Add a student record
        </div>
      </div>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        Creates the roster identity in the database. Capture their face afterwards to enable
        recognition.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Field label="Register number" className="lg:col-span-1">
          <input
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            placeholder="2547263"
            className="sp-focus h-12 w-full rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 font-mono-nums text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--primary)]"
          />
        </Field>
        <Field label="Full name" className="lg:col-span-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="sp-focus h-12 w-full rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--primary)]"
          />
        </Field>
        <Field label="Class section">
          <input
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="sp-focus h-12 w-full rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 font-mono-nums text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--primary)]"
          />
        </Field>
        <Field label="Seat zone">
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="sp-focus h-12 w-full rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 font-mono-nums text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--primary)]"
          >
            {["front", "mid", "back"].map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </Field>
        <button type="submit" disabled={busy} className="sp-btn sp-btn-primary h-12 lg:col-span-5">
          <UserPlus className="h-4 w-4" /> {busy ? "Adding…" : "Add student"}
        </button>
      </form>
      {added.length > 0 && (
        <div className="mt-4 border-t border-[color:var(--line)] pt-3">
          <div className="font-mono-nums text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Added this session
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {added.map((a, i) => (
              <li key={i} className="rounded-full border border-[color:var(--ok)]/30 bg-[color:var(--ok)]/10 px-3 py-1 font-mono-nums text-[11px] text-[color:var(--ok)]">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <div className="mb-1 font-mono-nums text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
        {label}
      </div>
      {children}
    </label>
  );
}

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
          First create the student's roster record below. Then capture their face (10–20 quality
          frames — never 50); video and frames are purged immediately after the embedding is stored.
        </p>
      </header>

      {/* Real add-student form: creates the roster identity row. Face embedding
          is the separate capture flow below. */}
      <AddStudentForm />

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
