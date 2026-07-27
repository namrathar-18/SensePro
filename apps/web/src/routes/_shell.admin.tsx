import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Link2, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mockAudit, mockConsents, mockDevices, mockUsers,
} from "@/lib/data/mock";

export const Route = createFileRoute("/_shell/admin")({
  head: () => ({
    meta: [{ title: "Admin · SensePro+" }],
  }),
  component: AdminPage,
});

const TABS = ["Devices", "Users & roles", "Consent", "Deletion queue", "Audit chain"] as const;
type Tab = (typeof TABS)[number];

function AdminPage() {
  const [tab, setTab] = useState<Tab>("Devices");
  const devices = useMemo(() => mockDevices(), []);
  const users = useMemo(() => mockUsers(), []);
  const consents = useMemo(() => mockConsents(), []);
  const audit = useMemo(() => mockAudit(), []);
  const [deletionQ, setDeletionQ] = useState(
    consents.slice(0, 3).map((c) => ({ ...c, requested_at: new Date(Date.now() - 3600_000).toISOString() })),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "sp-focus min-h-12 rounded px-4 font-mono-nums text-[11px] uppercase tracking-wider transition-colors",
              tab === t
                ? "bg-[color:var(--primary)] text-white"
                : "text-[color:var(--muted)] hover:text-[color:var(--ink)]",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Devices" && (
        <Panel title="Capture clients" hint="Board kiosks + lab kiosks with SensePro capture">
          <Table
            head={["Label", "Room", "Last seen", "Status"]}
            rows={devices.map((d) => [
              d.label,
              <span className="font-mono-nums text-xs text-[color:var(--muted)]">{d.room}</span>,
              <span className="font-mono-nums text-xs text-[color:var(--muted)]">
                {new Date(d.last_seen).toLocaleTimeString()}
              </span>,
              <StatusDot status={d.status} />,
            ])}
          />
        </Panel>
      )}

      {tab === "Users & roles" && (
        <Panel title="Users & roles" hint="Roles are stored in a separate table; RLS enforced">
          <Table
            head={["Name", "Email", "Role"]}
            rows={users.map((u) => [
              <span className="text-[color:var(--ink)]">{u.name}</span>,
              <span className="font-mono-nums text-xs text-[color:var(--muted)]">{u.email}</span>,
              <span className="rounded border border-[color:var(--line)] bg-[color:var(--surface)] px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-wider text-[color:var(--accent)]">
                {u.role}
              </span>,
            ])}
          />
        </Panel>
      )}

      {tab === "Consent" && (
        <Panel title="Consent registry" hint="Version-tracked, signed on device">
          <Table
            head={["Reg no", "Name", "Version", "Signed", "Status"]}
            rows={consents.map((c) => [
              <span className="font-mono-nums text-xs text-[color:var(--muted)]">{c.reg_no}</span>,
              <span className="text-[color:var(--ink)]">{c.name}</span>,
              <span className="font-mono-nums text-xs text-[color:var(--muted)]">{c.version}</span>,
              <span className="font-mono-nums text-xs text-[color:var(--muted)]">
                {new Date(c.signed_at).toLocaleDateString()}
              </span>,
              <span
                className={cn(
                  "rounded border px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-wider",
                  c.status === "active"
                    ? "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]"
                    : "border-[color:var(--muted)]/40 bg-[color:var(--surface)] text-[color:var(--muted)]",
                )}
              >
                {c.status}
              </span>,
            ])}
          />
        </Panel>
      )}

      {tab === "Deletion queue" && (
        <Panel
          title="Deletion requests"
          hint="Approve to purge biometric templates + linked derivatives · two-step confirm"
        >
          {deletionQ.length === 0 ? (
            <div className="p-10 text-center font-mono-nums text-xs text-[color:var(--muted)]">
              Queue empty.
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--line)]/60">
              {deletionQ.map((c) => (
                <DeletionRow
                  key={c.student_id}
                  reg_no={c.reg_no}
                  name={c.name}
                  requested_at={c.requested_at}
                  onResolve={() =>
                    setDeletionQ((prev) => prev.filter((x) => x.student_id !== c.student_id))
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "Audit chain" && (
        <Panel
          title="Audit chain"
          hint="Append-only · each entry's prev_hash equals the previous entry's hash"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[color:var(--line)]">
                  {["Seq", "Time", "Actor", "Action", "prev_hash", "", "hash", "Chain"].map((h, i) => (
                    <th
                      key={i}
                      className="px-3 py-2 text-left font-mono-nums text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono-nums text-xs">
                {audit.map((a, i) => {
                  // audit is newest-first; the entry that "produced" prev_hash is the one BELOW this row
                  const parent = audit[i + 1];
                  const ok = !parent || parent.hash === a.prev_hash;
                  return (
                    <tr
                      key={a.seq}
                      className="border-b border-[color:var(--line)]/60 hover:bg-[color:var(--surface-2)]/40"
                    >
                      <td className="px-3 py-2 text-[color:var(--muted)]">#{a.seq}</td>
                      <td className="px-3 py-2 text-[color:var(--muted)]">
                        {new Date(a.ts).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2 text-[color:var(--ink)]">{a.actor}</td>
                      <td className="px-3 py-2 text-[color:var(--accent)]">{a.action}</td>
                      <td className="px-3 py-2">
                        <HashPrefix hash={a.prev_hash} muted />
                      </td>
                      <td className="px-1 py-2 text-center text-[color:var(--line)]">
                        <Link2 className="inline h-3.5 w-3.5" />
                      </td>
                      <td className="px-3 py-2">
                        <HashPrefix hash={a.hash} />
                      </td>
                      <td className="px-3 py-2">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 rounded border border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[color:var(--ok)]">
                            <ShieldCheck className="h-3 w-3" /> linked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[color:var(--bad)]">
                            <AlertTriangle className="h-3 w-3" /> broken
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-4">
        <div className="font-display text-lg font-extrabold tracking-tight text-[color:var(--ink)]">
          {title}
        </div>
        {hint && <div className="font-mono-nums text-[11px] text-[color:var(--muted)]">{hint}</div>}
      </header>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[color:var(--line)]">
            {head.map((h) => (
              <th
                key={h}
                className="px-4 py-2 text-left font-mono-nums text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[color:var(--line)]/60 hover:bg-[color:var(--surface-2)]/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-sm">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusDot({ status }: { status: "online" | "idle" | "offline" }) {
  const color =
    status === "online" ? "var(--ok)" : status === "idle" ? "var(--warn)" : "var(--muted)";
  return (
    <span className="inline-flex items-center gap-2 font-mono-nums text-[11px] uppercase tracking-wider" style={{ color }}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

function HashPrefix({ hash, muted }: { hash: string; muted?: boolean }) {
  return (
    <span
      title={hash}
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px]",
        muted
          ? "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--muted)]"
          : "border-[color:var(--primary)]/40 bg-[color:var(--primary)]/10 text-[color:var(--ink)]",
      )}
    >
      <span className="opacity-50">0x</span>
      {hash.slice(0, 8)}
      <span className="opacity-40">…</span>
    </span>
  );
}

function DeletionRow({
  reg_no,
  name,
  requested_at,
  onResolve,
}: {
  reg_no: string;
  name: string;
  requested_at: string;
  onResolve: () => void;
}) {
  const [stage, setStage] = useState<"idle" | "confirm">("idle");

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="rounded border border-[color:var(--line)] bg-[color:var(--surface)] px-2 py-0.5 font-mono-nums text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
              {reg_no}
            </span>
            <span className="font-medium text-[color:var(--ink)]">{name}</span>
          </div>
          <div className="mt-1 font-mono-nums text-[11px] text-[color:var(--muted)]">
            requested · {new Date(requested_at).toLocaleString()}
          </div>
        </div>

        {stage === "idle" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onResolve}
              className="sp-focus h-12 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 text-xs text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
            >
              Reject
            </button>
            <button
              onClick={() => setStage("confirm")}
              className="sp-focus h-12 rounded-md border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 px-4 text-xs font-semibold text-[color:var(--bad)] transition-colors hover:bg-[color:var(--bad)]/20"
            >
              Approve & purge…
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono-nums text-[11px] uppercase tracking-wider text-[color:var(--bad)]">
              <AlertTriangle className="h-3.5 w-3.5" /> irreversible
            </span>
            <button
              onClick={() => setStage("idle")}
              className="sp-focus inline-flex h-12 items-center gap-1 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 text-xs text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              onClick={onResolve}
              className="sp-focus inline-flex h-12 items-center gap-1 rounded-md bg-[color:var(--bad)] px-4 text-xs font-semibold text-white transition-colors hover:brightness-110"
            >
              <Check className="h-3.5 w-3.5" /> Confirm purge
            </button>
          </div>
        )}
      </div>
      {stage === "confirm" && (
        <div className="mt-3 rounded-md border border-[color:var(--bad)]/30 bg-[color:var(--bad)]/5 px-3 py-2 font-mono-nums text-[11px] text-[color:var(--muted)]">
          Confirms deletion of biometric templates, embeddings, and linked attendance derivatives for
          <span className="text-[color:var(--ink)]"> {reg_no}</span>. Audit entry will be appended.
        </div>
      )}
    </li>
  );
}
