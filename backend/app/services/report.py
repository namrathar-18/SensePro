"""
SensePro+ — PDF Attendance Report Generator
Uses ReportLab to generate a printable attendance report.
"""
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT


def generate_attendance_pdf(session: dict, roster: list[dict]) -> bytes:
    """
    Generate a PDF attendance report for a session.
    Returns PDF bytes.
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=18, spaceAfter=6, alignment=TA_CENTER,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"],
        fontSize=10, spaceAfter=4, alignment=TA_CENTER, textColor=colors.grey,
    )
    note_style = ParagraphStyle(
        "Note", parent=styles["Normal"],
        fontSize=8, textColor=colors.grey, alignment=TA_CENTER,
    )

    elements = []

    # ─── Header ────────────────────────────────────────────────────────────
    elements.append(Paragraph("SensePro+ Attendance Report", title_style))

    class_name = session.get("classes", {}).get("name", "Unknown Class")
    started_at = session.get("started_at", "")
    ended_at   = session.get("ended_at", "In progress")
    mode       = session.get("mode", "attendance")

    elements.append(Paragraph(f"{class_name} · {mode.title()} Mode", subtitle_style))
    elements.append(Paragraph(f"Session: {started_at} → {ended_at}", subtitle_style))
    elements.append(Spacer(1, 0.3*cm))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    elements.append(Spacer(1, 0.3*cm))

    # ─── Summary ────────────────────────────────────────────────────────────
    present_count = sum(1 for r in roster if r.get("current_state") == "PRESENT")
    absent_count  = sum(1 for r in roster if r.get("current_state") == "ABSENT")
    total_count   = len(roster)

    summary_data = [
        ["Total Students", "Present", "Absent / Unverified"],
        [str(total_count), str(present_count), str(total_count - present_count)],
    ]
    summary_table = Table(summary_data, colWidths=[5*cm, 5*cm, 5*cm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, -1), 11),
        ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
        ("GRID",        (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.5*cm))

    # ─── Roster table ────────────────────────────────────────────────────────
    headers = ["#", "Name", "Student ID", "Status", "Present Duration", "Notes"]
    data = [headers]

    for i, r in enumerate(sorted(roster, key=lambda x: x.get("full_name", "")), 1):
        state       = r.get("current_state", "ABSENT")
        present_min = round(r.get("present_s", 0) / 60, 1)
        unv_min     = round(r.get("unverified_s", 0) / 60, 1)

        state_label = {
            "PRESENT":    "Present",
            "UNVERIFIED": "Unverified",
            "ABSENT":     "Absent",
        }.get(state, state)

        notes = f"+{unv_min}m unverified" if unv_min > 0 else ""

        data.append([
            str(i),
            r.get("full_name", "Unknown"),
            r.get("student_number", ""),
            state_label,
            f"{present_min} min",
            notes,
        ])

    col_widths = [1*cm, 5.5*cm, 3*cm, 2.5*cm, 3*cm, 3*cm]
    roster_table = Table(data, colWidths=col_widths, repeatRows=1)
    roster_table.setStyle(TableStyle([
        # Header
        ("BACKGROUND",  (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, -1), 9),
        ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",        (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f9fa")]),
        # Color-code status column
        *[
            ("TEXTCOLOR", (3, i+1), (3, i+1),
             colors.HexColor("#16a34a") if data[i+1][3] == "Present"
             else colors.HexColor("#dc2626") if data[i+1][3] == "Absent"
             else colors.HexColor("#d97706"))
            for i in range(len(data) - 1)
        ],
        ("FONTNAME", (3, 1), (3, -1), "Helvetica-Bold"),
    ]))
    elements.append(roster_table)
    elements.append(Spacer(1, 0.5*cm))

    # ─── Footer disclaimer ───────────────────────────────────────────────────
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
    elements.append(Spacer(1, 0.2*cm))
    elements.append(Paragraph(
        "This report is generated automatically by SensePro+. "
        "Attendance is computed from face recognition confidence ≥ 0.45. "
        "All processing complies with India's DPDP Act. "
        "No emotion data or per-student engagement scores exist in this system. "
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        note_style,
    ))

    doc.build(elements)
    return buf.getvalue()
