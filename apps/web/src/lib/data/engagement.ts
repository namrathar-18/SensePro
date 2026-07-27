/** VNEI zone aggregates: direct RLS reads of engagement_zone_aggregates.
 *  Aggregate-only by schema — there is no student column to select, and a
 *  window that fell below k=5 simply has no row (suppressed at the source,
 *  never estimated). The UI renders that absence explicitly. */

import { supabase } from "@/lib/supabase";
import type { Zone } from "@/lib/types";

export interface ZoneAggregateRow {
  id: string;
  session_id: string;
  window_start: string;
  window_s: number;
  zone: Zone | "class";
  n_tracked: number;
  enrolled_in_zone: number;
  coverage: number; // 0..1: tracked / enrolled in the zone
  vnei: number; // 0..1: visibility-normalised engagement index
  signals: Record<string, number>; // rates only, e.g. phone_rate
}

export async function fetchZoneAggregates(sessionId: string): Promise<ZoneAggregateRow[]> {
  const { data, error } = await supabase
    .from("engagement_zone_aggregates")
    .select(
      "id, session_id, window_start, window_s, zone, n_tracked, enrolled_in_zone, coverage, vnei, signals",
    )
    .eq("session_id", sessionId)
    .order("window_start", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Rows of the newest window, keyed by zone. Zones missing from the map were
 *  suppressed (k<5) for that window. */
export function latestWindow(rows: ZoneAggregateRow[]): {
  windowStart: string | null;
  byZone: Map<string, ZoneAggregateRow>;
} {
  const windowStart = rows.length ? rows[rows.length - 1].window_start : null;
  const byZone = new Map<string, ZoneAggregateRow>();
  if (windowStart) {
    for (const row of rows) if (row.window_start === windowStart) byZone.set(row.zone, row);
  }
  return { windowStart, byZone };
}
