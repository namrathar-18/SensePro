// SensePro+ typed data layer. Mock implementations live in ./mock.ts.
// Every mock is annotated with // SWAP: supabase query for the real backend cutover.

export type AttendanceState = "PRESENT" | "UNVERIFIED" | "ABSENT";

export interface Student {
  id: string;
  name: string;
  reg_no: string;
}

export interface RosterEntry {
  student_id: string;
  name: string;
  reg_no: string;
  state: AttendanceState;
  last_seen: string | null; // ISO
}

export interface Session {
  id: string;
  class_name: string;
  room: string;
  started_at: string;
  ended_at: string | null;
  present_count: number;
  total_count: number;
  vnei: number;
}

export type ProctorFlagType = "phone" | "extra_person" | "head_pose";

export interface ProctorFlag {
  id: string;
  session_id: string;
  type: ProctorFlagType;
  ts: string;
  clip_seconds: number;
  status: "awaiting_review" | "dismissed" | "upheld";
  note?: string;
}

export interface ZoneAggregate {
  zone: string;
  vnei: number;
  naive_mean: number;
  coverage: number; // 0..1
  n_tracked: number;
  n_visible: number;
  suppressed?: boolean;
}

export interface ConsentRecord {
  student_id: string;
  name: string;
  reg_no: string;
  version: string;
  signed_at: string;
  status: "active" | "withdrawn";
}

export interface AuditEntry {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  hash: string;
  prev_hash: string;
}

export interface DeviceRow {
  id: string;
  label: string;
  room: string;
  last_seen: string;
  status: "online" | "idle" | "offline";
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "management" | "admin" | "student";
}

export interface AttendanceRecord {
  session_id: string;
  class_name: string; // the class/cohort, e.g. "4MCA-B"
  subject: string; // the session subject, e.g. "OS mid term"
  date: string;
  state: AttendanceState;
}
