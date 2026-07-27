/** Proctor review queue: direct RLS reads + Realtime on proctor_flags, and
 *  the one staff write this app makes — moving a flag through review_status.
 *  Language rule: a pending flag is "awaiting review". Nothing here (or
 *  anywhere) auto-decides; the trigger + column-scoped grant in migrations
 *  0002/0006/0007 hold staff writes to exactly the review columns. */

import { supabase } from "@/lib/supabase";

export type FlagType = "phone" | "extra_person" | "head_pose" | "other";
export type ReviewStatus = "pending" | "dismissed" | "upheld";

export interface ProctorFlagRow {
  id: string;
  session_id: string;
  student_id: string | null; // students.id, when the flag could be attributed
  flag_type: FlagType;
  suppressed: boolean;
  flagged_at: string;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

const COLUMNS =
  "id, session_id, student_id, flag_type, suppressed, flagged_at, review_status, reviewed_by, reviewed_at";

export async function fetchFlags(sessionId: string): Promise<ProctorFlagRow[]> {
  const { data, error } = await supabase
    .from("proctor_flags")
    .select(COLUMNS)
    .eq("session_id", sessionId)
    .order("flagged_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** A human review. Sets who and when alongside the status — the only three
 *  columns staff may touch. */
export async function reviewFlag(
  id: string,
  status: Exclude<ReviewStatus, "pending">,
  reviewerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("proctor_flags")
    .update({
      review_status: status,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

/** Live queue for one session; returns an unsubscribe fn (same pattern as
 *  subscribePresence). */
export function subscribeFlags(
  sessionId: string,
  onChange: (row: ProctorFlagRow) => void,
  onStatus?: (live: boolean) => void,
): () => void {
  const channel = supabase
    .channel(`proctor-${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "proctor_flags",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const row = payload.new as ProctorFlagRow;
        if (row?.id) onChange(row); // DELETE events carry an empty payload.new
      },
    )
    .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
  return () => {
    void supabase.removeChannel(channel);
  };
}
