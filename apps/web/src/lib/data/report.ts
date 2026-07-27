/** Client-side session report PDF (no backend route). Branded per
 *  docs/design-system.md: cobalt header, mono data, one clean page. */

import type { RosterEntry } from "@/lib/types";
import { fmtDuration } from "@/lib/utils";

export async function exportSessionPdf(opts: {
  section: string;
  subject: string | null;
  roster: RosterEntry[];
}): Promise<void> {
  // Loaded on demand: the PDF libs are heavy and only needed on export.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
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
  doc.setTextColor(21, 32, 46);
  doc.setFontSize(10);
  doc.text(
    `Present ${present} / ${opts.roster.length} · attendance measured by presence intervals, embeddings-only identity, no images stored`,
    14,
    38,
  );

  autoTable(doc, {
    startY: 44,
    head: [["Reg no", "Name", "State", "Time present"]],
    body: opts.roster.map((r) => [
      r.student_id,
      r.full_name,
      r.state,
      fmtDuration(r.present_seconds),
    ]),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [29, 78, 216], textColor: 255 }, // --primary-deep
    alternateRowStyles: { fillColor: [244, 247, 252] },
  });

  doc.save(`sensepro-${opts.section}-${now.toISOString().slice(0, 10)}.pdf`);
}
