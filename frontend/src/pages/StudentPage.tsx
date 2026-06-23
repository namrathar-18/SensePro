import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Clock, CheckCircle, XCircle, AlertTriangle, Trash2 } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export default function StudentPage() {
  const { profile, signOut } = useAuth()
  const [intervals, setIntervals] = useState<any[]>([])
  const [consent, setConsent]     = useState<any>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    // Load own attendance intervals
    supabase.from('presence_intervals')
      .select('*, class_sessions(started_at, ended_at, classes(name))')
      .eq('student_id', profile.id)
      .order('started_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setIntervals(data || []))

    // Load consent
    supabase.from('consent_records')
      .select('*').eq('student_id', profile.id).single()
      .then(({ data }) => setConsent(data))
  }, [profile])

  // Aggregate by session
  const sessionMap: Record<string, { name: string; started_at: string; present_s: number; absent: boolean }> = {}
  for (const iv of intervals) {
    const sid = iv.session_id
    if (!sessionMap[sid]) {
      sessionMap[sid] = {
        name: iv.class_sessions?.classes?.name || 'Unknown',
        started_at: iv.class_sessions?.started_at,
        present_s: 0,
        absent: true,
      }
    }
    if (iv.state === 'PRESENT') {
      sessionMap[sid].present_s += iv.duration_s || 0
      sessionMap[sid].absent = false
    }
  }
  const sessions = Object.values(sessionMap).sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  )

  async function requestDeletion() {
    if (!confirm('This will permanently delete your biometric data, attendance records, and consent records. Proceed?')) return
    setDeleteLoading(true)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`${API}/enrollment/unenroll/${profile!.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      setMsg('Your data has been deleted. You will be signed out.')
      setTimeout(() => signOut(), 2000)
    } else {
      setMsg('Deletion failed — contact admin.')
    }
    setDeleteLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">My Attendance</h1>
            <p className="text-sm text-gray-500">{profile?.full_name} · {profile?.student_id}</p>
          </div>
          <button onClick={signOut} className="btn-secondary text-sm">Sign Out</button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {msg && (
          <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {msg}
          </div>
        )}

        {/* Consent status */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">Consent Status</h2>
          {consent?.signed_at ? (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle size={18} />
              <span className="text-sm">Consent signed on {new Date(consent.signed_at).toLocaleDateString()}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600">
              <XCircle size={18} />
              <span className="text-sm">Consent not yet signed. Contact your administrator.</span>
            </div>
          )}
          {consent?.withdrawn_at && (
            <p className="text-xs text-gray-400 mt-2">Withdrawn: {new Date(consent.withdrawn_at).toLocaleDateString()}</p>
          )}
        </div>

        {/* Attendance history */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Attendance History</h2>
          {sessions.length === 0 ? (
            <p className="text-gray-400 text-sm">No sessions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                  <div>
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-gray-400">{new Date(s.started_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    {s.absent
                      ? <span className="badge-absent">Absent</span>
                      : <span className="badge-present">{Math.round(s.present_s / 60)} min present</span>
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Data deletion (DPDP right-to-deletion) */}
        <div className="card border-red-100">
          <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <Trash2 size={16} className="text-red-500" /> Right to Deletion (DPDP Act)
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            You can request permanent deletion of all your biometric data (face embeddings),
            attendance records, and consent records. This cannot be undone.
          </p>
          <button
            onClick={requestDeletion}
            disabled={deleteLoading}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {deleteLoading ? 'Deleting…' : 'Request Data Deletion'}
          </button>
        </div>
      </div>
    </div>
  )
}
