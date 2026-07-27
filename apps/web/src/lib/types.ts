// Shared domain types used across the live data layer + auth.

export type Role = "teacher" | "management" | "admin" | "student";

export type PresenceState = "PRESENT" | "UNVERIFIED" | "ABSENT";

export type Zone = "front" | "mid" | "back" | "class";

/** Folded live roster entry (see lib/data/roster.ts::deriveRoster). */
export interface RosterEntry {
  student_id: string; // register number
  full_name: string;
  state: PresenceState;
  last_seen_ts: number | null; // seconds since last state change
  present_seconds: number;
}
