import { useCallback, useEffect, useState } from "react";
import { Flag, Smartphone, WifiOff, Users2, Eye } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchFlags, reviewFlag, subscribeFlags } from "@/lib/data/proctor";
import type { FlagType, ProctorFlagRow } from "@/lib/data/proctor";
import { useSessionUser } from "@/hooks/use-session-user";
import { cn } from "@/lib/utils";

const TYPE_META: Record<FlagType, { icon: typeof Flag; label: string }> = {
  phone: { icon: Smartphone, label: "Handheld device visible" },
  extra_person: { icon: Users2, label: "Additional person in frame" },
  head_pose: { icon: Eye, label: "Sustained off-screen orientation" },
  other: { icon: Flag, label: "Flagged event" },
};

function FlagIcon({ type }: { type: FlagType }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--warn)]">
      <Icon className="h-4 w-4" />
    </div>
  );
}

interface Props {
  sessionId: string | null;
  studentNames: Map<string, string>;
  onPendingCount?: (n: number) => void;
}

export function ProctorReviewPanel({ sessionId, studentNames, onPendingCount }: Props) {
  const { user } = useSessionUser();
  const [flags, setFlags] = useState<ProctorFlagRow[]>([]);
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [live, setLive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const upsert = useCallback((row: ProctorFlagRow) => {
    setFlags((prev) => {
      const next = prev.filter((f) => f.id !== row.id);
      next.push(row);
      next.sort((a, b) => Date.parse(b.flagged_at) - Date.parse(a.flagged_at));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setFlags([]);
      setLoad("ready");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchFlags(sessionId);
        if (!cancelled) {
          setFlags(rows);
          setLoad("ready");
        }
      } catch {
        if (!cancelled) setLoad("error");
      }
    })();
    const unsubscribe = subscribeFlags(sessionId, upsert, setLive);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId, upsert]);

  const pending = flags.filter((f) => f.review_status === "pending");
  useEffect(() => {
    onPendingCount?.(pending.length);
  }, [pending.length, onPendingCount]);

  const review = async (flag: ProctorFlagRow, status: "dismissed" | "upheld") => {
    if (!user) return;
    setBusyId(flag.id);
    const before = flag;
    upsert({ ...flag, review_status: status, reviewed_by: user.id });
    try {
      await reviewFlag(flag.id, status, user.id);
    } catch {
      upsert(before);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="glass-panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-4">
        <div>
          <div className="font-mono-nums text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Proctor review
          </div>
          <div className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
            Awaiting review
          </div>
          <div className="mt-0.5 max-w-md text-[11px] text-[color:var(--muted)]">
            Phones the camera flagged this session — you dismiss or uphold each. The system never
            penalises on its own.
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">
            {pending.length} open · human decision required
          </div>
          {sessionId && live ? (
            <span className="flex items-center gap-1.5 font-mono-nums text-[10px] text-[color:var(--ok)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--ok)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--ok)]" />
              </span>
              live
            </span>
          ) : sessionId ? (
            <span className="flex items-center gap-1.5 font-mono-nums text-[10px] text-[color:var(--warn)]">
              <WifiOff className="h-3 w-3" /> reconnecting...
            </span>
          ) : null}
        </div>
      </header>
      
      {load === "loading" ? (
        <p className="px-5 py-8 text-center font-mono text-[12.5px] text-[color:var(--muted)]">loading queue…</p>
      ) : load === "error" ? (
        <div className="flex flex-col items-center justify-center py-12 text-[color:var(--muted)]">
          <WifiOff className="mb-4 h-8 w-8 opacity-50" />
          <div className="font-display text-lg font-medium text-[color:var(--ink)]">Could not load queue</div>
          <p className="mt-1 text-sm">Check your connection and role, then reload.</p>
        </div>
      ) : flags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[color:var(--muted)]">
          <Flag className="mb-4 h-8 w-8 opacity-50" />
          <div className="font-display text-lg font-medium text-[color:var(--ink)]">No flags in this session</div>
          <p className="mt-1 text-sm">Exam-mode capture raises candidate events here.</p>
        </div>
      ) : (
        <div className="max-h-[560px] space-y-3 overflow-y-auto p-4">
          <AnimatePresence initial={false}>
            {flags.map((f) => {
              const who = f.student_id ? (studentNames.get(f.student_id) ?? "Unknown student") : "—";
              return (
                <motion.article
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={cn(
                    "rounded-lg border p-4",
                    f.review_status === "pending"
                      ? "border-[color:var(--warn)]/40 bg-[color:var(--surface-2)]/60"
                      : "border-[color:var(--line)] bg-[color:var(--surface-2)]/30 opacity-60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <FlagIcon type={f.flag_type} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[color:var(--ink)]">
                        {who} · {TYPE_META[f.flag_type].label}
                      </div>
                      <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">
                        {new Date(f.flagged_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "font-mono-nums text-[10px] uppercase tracking-wider",
                        f.review_status === "pending" && "text-[color:var(--warn)]",
                        f.review_status === "dismissed" && "text-[color:var(--muted)]",
                        f.review_status === "upheld" && "text-[color:var(--bad)]",
                      )}
                    >
                      {f.review_status.replace("_", " ")}
                    </span>
                  </div>
                  {f.review_status === "pending" && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => review(f, "dismissed")}
                        disabled={busyId === f.id}
                        className="sp-focus h-12 flex-1 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] text-xs font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--surface)]"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => review(f, "upheld")}
                        disabled={busyId === f.id}
                        className="sp-focus h-12 flex-1 rounded-md bg-[color:var(--primary)] text-xs font-semibold text-white transition-colors hover:bg-[color:var(--primary-deep)]"
                      >
                        Uphold
                      </button>
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
