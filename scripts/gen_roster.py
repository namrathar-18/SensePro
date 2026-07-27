"""Generate the 4MCA-B roster artefacts from one source of truth (the 4MCAB.pdf
register list). Produces: backend/data/roster.json, the frontend class-roster.ts,
and supabase/seed.sql. Names are the authoritative ones from the 4MCAB sheet."""
import hashlib
import json
from pathlib import Path

REPO = Path(r"C:/Users/namrp/AppData/Local/Temp/claude/D--Projects-sensepro/6fc68360-adc3-43e3-87d7-537c06477d04/scratchpad/SensePro-build")
CLASS_SECTION = "4MCA-B"
CONSENT_VERSION = "v1"

# (register_no, full_name) — authoritative 4MCA-B list (53 students)
ROSTER = [
    ("2547201", "Aadharsh Krishnaa G"),
    ("2547203", "Abhinav Jain"),
    ("2547204", "Aimee Susan Joseph"),
    ("2547205", "Ajanya Vinayan"),
    ("2547206", "Akashdeep Dey"),
    ("2547208", "Alan Sojan"),
    ("2547209", "Albin Thomas"),
    ("2547210", "Alok Tayal"),
    ("2547211", "Amogh Venkat D"),
    ("2547212", "Anaamika KS"),
    ("2547213", "Angel Blessy"),
    ("2547216", "Annette Elizabeth Shoney"),
    ("2547217", "Annie Neena A.A"),
    ("2547218", "B K Vishnu"),
    ("2547219", "Bhavya Dhanuka"),
    ("2547220", "Dinu Devees George"),
    ("2547221", "Ekta Singh"),
    ("2547222", "Emima J"),
    ("2547223", "Enrita Fernandes"),
    ("2547224", "Evan John Mathew"),
    ("2547225", "Evana Joseph"),
    ("2547226", "Hanna Joshy"),
    ("2547227", "Blessy I"),
    ("2547228", "Jai Pareek"),
    ("2547229", "Karun Nagaraj"),
    ("2547230", "Kuheli Begum"),
    ("2547231", "Kunnal"),
    ("2547232", "Mahamat Tahir Souleymane"),
    ("2547233", "Mohammed Rehan"),
    ("2547234", "Namratha R"),
    ("2547236", "Nirupama Vincent"),
    ("2547237", "Omkaar Chakraborty"),
    ("2547238", "Paavan Gupta"),
    ("2547239", "Prajwal K T"),
    ("2547240", "Pranav MR"),
    ("2547241", "R Karan"),
    ("2547242", "Rahul Gupta"),
    ("2547243", "Rishi Raj"),
    ("2547244", "Roy Mathew"),
    ("2547245", "Sachin D"),
    ("2547246", "Saurabh Burnwal"),
    ("2547247", "Sharon Mathew"),
    ("2547249", "Slaven Derick Pais"),
    ("2547250", "Sneha Varghese"),
    ("2547252", "Sudeepa Santhanam"),
    ("2547254", "Varun Singh"),
    ("2547255", "Vishwas Vashishtha"),
    ("2547256", "Xavier Amith J"),
    ("2547257", "Yash Barjatya"),
    ("2547259", "Ananya M"),
    ("2547260", "Mistry Jamis"),
    ("2547261", "Maniarasan J"),
    ("2547262", "Anushka Singh"),
]

ZONES = ["front", "mid", "back"]


def seat_zone(i: int) -> str:
    return ZONES[i % 3]


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


# 1) backend/data/roster.json  (reg_no -> full_name; the pipeline maps ids->names)
roster_map = {reg: name for reg, name in ROSTER}
out = REPO / "backend" / "data" / "roster.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(roster_map, indent=2, ensure_ascii=False), encoding="utf-8")
print("wrote", out, f"({len(roster_map)} students)")

# 2) frontend class-roster.ts
ts_lines = [
    "// Auto-generated from the 4MCA-B register list (4MCAB.pdf). Single source of",
    "// truth for the demo roster the dashboards render before live Supabase data",
    "// is seeded. Regenerate via scripts/gen_roster.py.",
    "",
    "export interface ClassStudent {",
    "  reg_no: string;",
    "  full_name: string;",
    '  seat_zone: "front" | "mid" | "back";',
    "}",
    "",
    'export const CLASS_SECTION = "4MCA-B";',
    "",
    "export const CLASS_ROSTER: ClassStudent[] = [",
]
for i, (reg, name) in enumerate(ROSTER):
    ts_lines.append(
        f'  {{ reg_no: "{reg}", full_name: "{name.replace(chr(34), chr(92)+chr(34))}", seat_zone: "{seat_zone(i)}" }},'
    )
ts_lines.append("];")
ts_lines.append("")
ts = REPO / "apps" / "web" / "src" / "lib" / "data" / "class-roster.ts"
ts.write_text("\n".join(ts_lines), encoding="utf-8")
print("wrote", ts)

# 3) supabase/seed.sql
sql = []
sql.append("-- SensePro+ seed data — 4MCA-B class roster (53 students).")
sql.append("-- Run AFTER migrations 0001..0007 in the Supabase SQL editor.")
sql.append("-- Idempotent: re-running upserts the same rows (reg_no / device_key unique).")
sql.append("")
sql.append("-- 1) Students -------------------------------------------------------------")
sql.append("insert into students (reg_no, full_name, class_section, seat_zone) values")
rows = []
for i, (reg, name) in enumerate(ROSTER):
    rows.append(f"  ('{reg}', '{sql_escape(name)}', '{CLASS_SECTION}', '{seat_zone(i)}')")
sql.append(",\n".join(rows))
sql.append("on conflict (reg_no) do update set")
sql.append("  full_name = excluded.full_name,")
sql.append("  class_section = excluded.class_section,")
sql.append("  seat_zone = excluded.seat_zone;")
sql.append("")
sql.append("-- 2) Consent records (v1, signed) ----------------------------------------")
sql.append("-- signature_hash is a sha256 placeholder; the signed form scans are kept")
sql.append("-- offline (DPDP: only the hash lives in the DB).")
sql.append("insert into consent_records (student_id, consent_version, signature_hash)")
sql.append("select s.id, '%s', encode(digest(s.reg_no || ':%s', 'sha256'), 'hex')" % (CONSENT_VERSION, CONSENT_VERSION))
sql.append("from students s")
sql.append("where s.class_section = '%s'" % CLASS_SECTION)
sql.append("  and not exists (select 1 from consent_records c where c.student_id = s.id);")
sql.append("")
sql.append("-- 3) Browser-capture device (the laptop webcam client) -------------------")
sql.append("insert into devices (device_key, label, room) values")
sql.append("  ('browser-capture', 'Laptop webcam capture client', '4MCA-B classroom')")
sql.append("on conflict (device_key) do nothing;")
sql.append("")
sql.append("-- 4) An open demo session so the teacher dashboard has a live session ----")
sql.append("insert into class_sessions (device_id, class_section, subject, mode, starts_at)")
sql.append("select d.id, '%s', 'Live demo session', 'lecture', now()" % CLASS_SECTION)
sql.append("from devices d")
sql.append("where d.device_key = 'browser-capture'")
sql.append("  and not exists (")
sql.append("    select 1 from class_sessions cs where cs.class_section = '%s' and cs.ends_at is null" % CLASS_SECTION)
sql.append("  );")
sql.append("")
seed = REPO / "supabase" / "seed.sql"
seed.write_text("\n".join(sql), encoding="utf-8")
print("wrote", seed)
print("done — front/mid/back:",
      sum(1 for i in range(len(ROSTER)) if seat_zone(i) == "front"),
      sum(1 for i in range(len(ROSTER)) if seat_zone(i) == "mid"),
      sum(1 for i in range(len(ROSTER)) if seat_zone(i) == "back"))
