import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { ShieldAlert, Check, X, ChevronRight, AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export const Route = createFileRoute("/_shell/proctor")({
  head: () => ({
    meta: [
      { title: "Proctor Queue · SensePro+" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProctorPage,
});

interface Flag {
  id: string;
  type: "phone" | "extra_person" | "head_pose";
  student: string;
  ts: string;
  confidence: number;
  session: string;
  status: "awaiting_review" | "dismissed" | "upheld";
}

function mockFlags(): Flag[] {
  return [
    { id: "PF-001", type: "phone", student: "Aarav K.", ts: "10:14:32", confidence: 0.87, session: "Data Structures", status: "awaiting_review" },
    { id: "PF-002", type: "extra_person", student: "Meera D.", ts: "10:18:45", confidence: 0.72, session: "Data Structures", status: "awaiting_review" },
    { id: "PF-003", type: "head_pose", student: "Rohan S.", ts: "10:21:11", confidence: 0.64, session: "Data Structures", status: "awaiting_review" },
    { id: "PF-004", type: "phone", student: "Priya N.", ts: "10:24:58", confidence: 0.91, session: "Data Structures", status: "awaiting_review" },
    { id: "PF-005", type: "head_pose", student: "Ishaan V.", ts: "10:32:05", confidence: 0.55, session: "Data Structures", status: "awaiting_review" },
  ];
}

const TYPE_LABELS: Record<string, string> = {
  phone: "Phone detected",
  extra_person: "Extra person",
  head_pose: "Suspicious gaze",
};

function ProctorPage() {
  const [flags, setFlags] = useState<Flag[]>(() => mockFlags());
  const [selected, setSelected] = useState<string | null>(null);
  const pending = useMemo(() => flags.filter((f) => f.status === "awaiting_review"), [flags]);
  const current = flags.find((f) => f.id === selected) ?? pending[0];

  function resolve(id: string, verdict: "dismissed" | "upheld") {
    setFlags((prev) => prev.map((f) => (f.id === id ? { ...f, status: verdict } : f)));
    if (selected === id) setSelected(null);
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
          § human-in-the-loop
        </div>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[color:var(--ink)]">
          Proctor review queue
        </h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Every flag requires human review. The system flags — you decide. Dismissed flags are logged for audit.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Flag list */}
        <div className="glass-panel overflow-hidden">
          <div className="border-b border-[color:var(--line)] px-4 py-3">
            <div className="font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
              {pending.length} pending review
            </div>
          </div>
          <div className="max-h-[65vh] overflow-y-auto">
            <AnimatePresence>
              {pending.map((f) => (
                <motion.button
                  key={f.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  onClick={() => setSelected(f.id)}
                  className={`sp-focus w-full border-b border-[color:var(--line)]/50 px-4 py-3 text-left transition-colors ${
                    current?.id === f.id ? "bg-[color:var(--surface-2)]" : "hover:bg-[color:var(--surface-2)]/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-[color:var(--ink)]">
                      <ShieldAlert className="h-3.5 w-3.5 text-[color:var(--warn)]" />
                      {f.student}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[color:var(--muted)]">
                    <span className="font-mono-nums">{f.ts}</span>
                    <span>·</span>
                    <span>{TYPE_LABELS[f.type]}</span>
                  </div>
                  <div className="mt-1.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-[0.16em] ${
                      f.confidence >= 0.8
                        ? "border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 text-[color:var(--bad)]"
                        : f.confidence >= 0.6
                          ? "border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 text-[color:var(--warn)]"
                          : "border-[color:var(--muted)]/40 bg-[color:var(--surface-2)] text-[color:var(--muted)]"
                    }`}>
                      {Math.round(f.confidence * 100)}% conf
                    </span>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
            {pending.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Check className="mx-auto h-8 w-8 text-[color:var(--ok)]" />
                <p className="mt-2 text-sm text-[color:var(--muted)]">All flags reviewed</p>
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="glass-panel p-6">
          {current ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono-nums text-[10px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
                    {current.id} · {current.session}
                  </div>
                  <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight text-[color:var(--ink)]">
                    {TYPE_LABELS[current.type]}
                  </h3>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    Flagged for {current.student} at {current.ts}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono-nums text-[10px] uppercase tracking-[0.16em] ${
                  current.confidence >= 0.8
                    ? "border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 text-[color:var(--bad)]"
                    : "border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 text-[color:var(--warn)]"
                }`}>
                  {Math.round(current.confidence * 100)}% confidence
                </span>
              </div>

              {/* Mock frame placeholder */}
              <div className="mt-6 grid place-items-center rounded-xl border border-dashed border-[color:var(--line)]/70 bg-[color:var(--surface)]/50 py-20">
                <AlertTriangle className="h-8 w-8 text-[color:var(--warn)]" />
                <p className="mt-2 font-mono-nums text-[11px] text-[color:var(--muted)]">
                  Frame clip would render here from inference server
                </p>
              </div>

              {/* Reminder */}
              <div className="mt-4 rounded-md border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/5 p-3 text-xs text-[color:var(--warn)]">
                <strong>Reminder:</strong> This flag is a suggestion, not a verdict. Only you can escalate or dismiss.
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => resolve(current.id, "dismissed")}
                  className="sp-btn sp-btn-secondary"
                >
                  <X className="h-4 w-4" /> Dismiss
                </button>
                <button
                  onClick={() => resolve(current.id, "upheld")}
                  className="sp-btn sp-btn-destructive"
                >
                  <ShieldAlert className="h-4 w-4" /> Uphold flag
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center text-center">
              <div>
                <Check className="mx-auto h-10 w-10 text-[color:var(--ok)]" />
                <p className="mt-3 text-sm text-[color:var(--muted)]">Select a flag to review</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
