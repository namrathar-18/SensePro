import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnon)

// ─── Types ──────────────────────────────────────────────────────────────────
export type UserRole = 'teacher' | 'management' | 'admin' | 'student'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  student_id?: string
  class_id?: string
}

export interface ClassSession {
  id: string
  class_id: string
  teacher_id: string
  mode: 'attendance' | 'exam'
  started_at: string
  ended_at?: string
  classes?: { name: string }
}

export interface RosterEntry {
  student_id: string
  full_name: string
  student_number: string
  current_state: 'PRESENT' | 'UNVERIFIED' | 'ABSENT'
  present_s: number
  unverified_s: number
  last_seen?: string
}

export interface ProctorFlag {
  id: string
  session_id: string
  flag_type: 'phone_detected' | 'extra_person' | 'gaze_sustained'
  confidence: number
  zone?: string
  detected_at: string
  reviewed_at?: string
  review_note?: string
}

export interface ZoneAggregate {
  zone: string
  window_start: string
  window_end: string
  student_count: number
  vnei_score: number | null
  coverage_ratio: number
  head_pose_avg: number
  eye_closure_avg: number
  phone_rate: number
  stillness_avg: number
}
