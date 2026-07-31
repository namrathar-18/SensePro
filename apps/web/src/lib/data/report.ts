/** Client-side session report PDF (no backend route). Branded per
 *  docs/design-system.md: cobalt header, mono data, one clean page. */

import type { RosterEntry } from "@/lib/types";
import { fmtDuration } from "@/lib/utils";

export interface ReportFlag {
  student: string; // resolved name, or "Unattributed"
  type: string;
  at: string; // ISO
  status: string;
}

export interface ReportEngagement {
  windows: number;
  avgVnei: number | null; // 0..1 across windows
  peakVnei: number | null;
  lowVnei: number | null;
  byZone: { zone: string; vnei: number; coverage: number; tracked: number }[];
  signals: { label: string; rate: number }[]; // e.g. head-down rate
}

export async function exportSessionPdf(opts: {
  section: string;
  subject: string | null;
  roster: RosterEntry[];
  mode?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  flags?: ReportFlag[];
  engagement?: ReportEngagement | null;
}): Promise<void> {
  // Loaded on demand: the PDF libs are heavy and only needed on export. A failed
  // chunk load here is almost always a stale dev/deploy asset cache, so say that
  // rather than surfacing an opaque "could not generate" (see vite optimizeDeps).
  type AutoTableFn = typeof import("jspdf-autotable").default;
  let jsPDF: typeof import("jspdf").jsPDF;
  let autoTable: AutoTableFn;
  try {
    const [pdfMod, tableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    jsPDF = pdfMod.jsPDF;
    // jspdf-autotable ships CJS. Depending on who does the interop (Vite's
    // pre-bundle in dev vs the Rollup build), the callable lands either on
    // `default` or double-wrapped on `default.default` — resolve whichever is
    // actually a function instead of assuming one shape.
    const candidate = tableMod.default as unknown;
    autoTable = (
      typeof candidate === "function"
        ? candidate
        : (candidate as { default?: unknown })?.default
    ) as AutoTableFn;
  } catch {
    throw new Error("PDF library failed to load — refresh the page and try again");
  }
  if (typeof autoTable !== "function") {
    throw new Error("PDF table plugin failed to initialise — refresh and try again");
  }
  const doc = new jsPDF();
  const now = new Date();

  doc.setFillColor(11, 17, 32); // --bg
  doc.rect(0, 0, 210, 30, "F");
  doc.setTextColor(232, 238, 247); // --ink
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("SensePro+ — Session report", 14, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(128, 148, 176); // --muted
  doc.text(
    `${opts.section}${opts.subject ? " · " + opts.subject : ""} · ${now.toLocaleString("en-IN")}`,
    14,
    21,
  );

  const present = opts.roster.filter((r) => r.state === "PRESENT").length;
  const unverified = opts.roster.filter((r) => r.state === "UNVERIFIED").length;
  const absent = opts.roster.filter((r) => r.state === "ABSENT").length;
  const pct = opts.roster.length ? Math.round((present / opts.roster.length) * 100) : 0;

  // Session duration from the real start/end stamps (falls back to "in progress").
  let duration = "—";
  if (opts.startedAt) {
    const start = Date.parse(opts.startedAt);
    const end = opts.endedAt ? Date.parse(opts.endedAt) : Date.now();
    if (!Number.isNaN(start) && end >= start) {
      duration = fmtDuration((end - start) / 1000) + (opts.endedAt ? "" : " (in progress)");
    }
  }

  doc.setTextColor(21, 32, 46);
  doc.setFontSize(10);
  doc.text(
    `Mode ${opts.mode ?? "lecture"} · Duration ${duration} · Present ${present}/${opts.roster.length} (${pct}%)`,
    14,
    38,
  );
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Unverified ${unverified} · Absent ${absent} · embeddings-only identity, frames never stored`,
    14,
    43.5,
  );

  const tableStyles = { fontSize: 8.5, cellPadding: 2 } as const;
  const headStyles = { fillColor: [29, 78, 216] as [number, number, number], textColor: 255 };
  const altStyles = { fillColor: [244, 247, 252] as [number, number, number] };

  // --- 1 · Attendance -----------------------------------------------------
  section(doc, "1 · Attendance", 50);
  autoTable(doc, {
    startY: 54,
    head: [["Reg no", "Name", "State", "Time present"]],
    body: opts.roster.map((r) => [
      r.student_id,
      r.full_name,
      r.state,
      fmtDuration(r.present_seconds),
    ]),
    styles: tableStyles,
    headStyles,
    alternateRowStyles: altStyles,
  });

  // --- 2 · Exam proctoring ------------------------------------------------
  if (opts.flags) {
    let y = afterTable(doc) + 10;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    section(doc, "2 · Exam proctoring", y);
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      opts.flags.length === 0
        ? "No candidate events raised in this session."
        : `${opts.flags.length} candidate event(s). Flags are review items, never verdicts — a human confirms or dismisses each.`,
      14,
      y + 5,
    );
    if (opts.flags.length > 0) {
      autoTable(doc, {
        startY: y + 10,
        head: [["Student", "Event", "Time", "Review status"]],
        body: opts.flags.map((f) => [
          f.student,
          f.type === "phone" ? "Phone visible" : f.type,
          new Date(f.at).toLocaleTimeString("en-IN"),
          f.status,
        ]),
        styles: tableStyles,
        headStyles: { fillColor: [190, 40, 60], textColor: 255 },
        alternateRowStyles: altStyles,
      });
    }
  }

  // --- 3 · Class engagement ----------------------------------------------
  const eng = opts.engagement;
  if (eng) {
    let y = afterTable(doc) + 10;
    if (y > 235) {
      doc.addPage();
      y = 20;
    }
    section(doc, "3 · Class engagement (VNEI)", y);
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "Aggregate only — no per-student engagement score exists. Zones under 5 tracked faces are suppressed.",
      14,
      y + 5,
    );

    if (eng.avgVnei == null) {
      doc.setFontSize(9);
      doc.setTextColor(21, 32, 46);
      doc.text(
        "No engagement windows recorded (below the k-anonymity floor for this session).",
        14,
        y + 12,
      );
    } else {
      autoTable(doc, {
        startY: y + 10,
        head: [["Metric", "Value"]],
        body: [
          ["Average attention (VNEI)", `${Math.round(eng.avgVnei * 100)}%`],
          ["Peak attention", eng.peakVnei == null ? "—" : `${Math.round(eng.peakVnei * 100)}%`],
          ["Lowest attention", eng.lowVnei == null ? "—" : `${Math.round(eng.lowVnei * 100)}%`],
          ["Windows measured", String(eng.windows)],
          ...eng.signals.map((s) => [s.label, `${Math.round(s.rate * 100)}%`]),
        ],
        styles: tableStyles,
        headStyles: { fillColor: [16, 122, 87], textColor: 255 },
        alternateRowStyles: altStyles,
      });

      if (eng.byZone.length > 0) {
        autoTable(doc, {
          startY: afterTable(doc) + 6,
          head: [["Zone", "Attention (VNEI)", "Coverage", "Tracked"]],
          body: eng.byZone.map((z) => [
            z.zone,
            `${Math.round(z.vnei * 100)}%`,
            `${Math.round(z.coverage * 100)}%`,
            String(z.tracked),
          ]),
          styles: tableStyles,
          headStyles: { fillColor: [16, 122, 87], textColor: 255 },
          alternateRowStyles: altStyles,
        });
      }
    }
  }

  doc.save(`sensepro-${opts.section}-${now.toISOString().slice(0, 10)}.pdf`);
}

/** Section heading in the report body. */
function section(doc: InstanceType<typeof import("jspdf").jsPDF>, title: string, y: number): void {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(21, 32, 46);
  doc.text(title, 14, y);
  doc.setFont("helvetica", "normal");
}

/** Y position just below the last autoTable. */
function afterTable(doc: unknown): number {
  return (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 60;
}
