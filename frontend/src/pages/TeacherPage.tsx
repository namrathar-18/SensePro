import { useEffect, useState, useCallback } from 'react'
import { supabase, ClassSession, RosterEntry, ProctorFlag } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Play, Square, Download, ExternalLink, RefreshCw, CheckCircle, Clock, XCircle } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

function badge(state: string) {
  if (state === 'PRESENT')    return <span className="badge-present">Present</span>
  if (state === 'UNVERIFIED') return <span className="badge-unverified">Unverified</span>
  return <span className="badge-absent">Absent</span>
}

export default function TeacherPage() {
  const { profile } = useAuth()
  const [classes, setClasses]       = useState<any[]>([])
  const [session, setSession]       = useState<ClassSession | null>(null)
  const [roster, setRoster]         = useState<RosterEntry[]>([])
  const [flags, setFlags]           = useState<ProctorFlag[]>([])
  const [mode, setMode]             = useState<'attendance'|'exam'>('attendance')
  const [selectedClass, setSelectedClass] = useState('')
  const [loading, setLoading]       = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  // Load teacher's classes
  useEffect(() => {
    if (!profile) return
    supabase.from('classes').select('*').eq('teacher_id', profile.id)
      .then(({ data }) => { setClasses(data || []); if (data?.length) setSelectedClass(data[0].id) })
  }, [profile])

  // Live roster subscription
  useEffect(() => {
    if (!session) return
    fetchRoster()
    const sub = supabase
      .channel(`presence-${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presence_intervals',
          filter: `session_id=eq.${session.id}` }, fetchRoster)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [session?.id])

  const fetchRoster = useCallback(async () => {
    if (!session) return
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`${API}/sessions/${session.id}/roster`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) { const d = await res.json(); setRoster(d.roster || []) }
  }, [session])

  const fetchFlags = useCallback(async () => {
    if (!session) return
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`${API}/sessions/${session.id}/proctor-flags`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) { const d = await res.json(); setFlags(d.flags || []) }
  }, [session])

  useEffect(() => {
    if (session && mode === 'exam') {
      fetchFlags()
      const iv = setInterval(fetchFlags, 5000)
      return () => clearInterval(iv)
    }
  }, [session, mode, fetchFlags])

  async function startSession() {
    if (!selectedClass) return
    setLoading(true)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`${API}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ class_id: selectedClass, mode }),
    })
    if (res.ok) { const s = await res.json(); setSession(s) }
    setLoading(false)
  }

  async function stopSession() {
    if (!session) return
    setLoading(true)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    await fetch(`${API}/sessions/${session.id}/stop`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    })
    setSession(null); setRoster([]); setFlags([])
    setLoading(false)
  }

  async function exportPdf() {
    if (!session) return
    setExportLoading(true)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`${API}/sessions/${session.id}/report.pdf`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a'); a.href = url
      a.download = `attendance-${session.id.slice(0,8)}.pdf`; a.click()
      URL.revokeObjectURL(url)
    }
    setExportLoading(false)
  }

  async function reviewFlag(flagId: string, note: string) {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    await fetch(`${API}/sessions/${session!.id}/proctor-flags/${flagId}/review?note=${encodeURIComponent(note)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    })
    fetchFlags()
  }

  const presentCount  = roster.filter(r => r.current_state === 'PRESENT').length
  const absentCount   = roster.filter(r => r.current_state === 'ABSENT').length
  const unverifiedCount = roster.filter(r => r.current_state === 'UNVERIFIED').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Teacher Dashboard</h1>
          <p className="text-sm text-gray-500">{profile?.full_name}</p>
        </div>
        {session && (
          <a
            href={`/capture?session=${session.id}&mode=${mode}`}
            target="_blank" rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <ExternalLink size={16} /> Open Capture View
          </a>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Session controls */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Session Control</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Class</label>
              <select
                value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                disabled={!!session}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Mode</label>
              <select
                value={mode} onChange={e => setMode(e.target.value as any)}
                disabled={!!session}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="attendance">Attendance</option>
                <option value="exam">Exam / Proctor</option>
              </select>
            </div>
            {!session
              ? <button onClick={startSession} disabled={loading || !selectedClass} className="btn-primary flex items-center gap-2">
                  <Play size={16} /> Start Session
                </button>
              : <>
                  <button onClick={stopSession} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg flex items-center gap-2">
                    <Square size={16} /> Stop Session
                  </button>
                  <button onClick={exportPdf} disabled={exportLoading} className="btn-secondary flex items-center gap-2">
                    <Download size={16} /> {exportLoading ? 'Generating…' : 'Export PDF'}
                  </button>
                </>
            }
          </div>
          {session && (
            <p className="text-xs text-gray-400 mt-3">Session ID: {session.id} · Started: {new Date(session.started_at).toLocaleTimeString()}</p>
          )}
        </div>

        {session && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center">
                <CheckCircle size={28} className="text-green-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-gray-900">{presentCount}</div>
                <div className="text-sm text-gray-500">Present</div>
              </div>
              <div className="card text-center">
                <Clock size={28} className="text-yellow-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-gray-900">{unverifiedCount}</div>
                <div className="text-sm text-gray-500">Unverified</div>
              </div>
              <div className="card text-center">
                <XCircle size={28} className="text-red-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-gray-900">{absentCount}</div>
                <div className="text-sm text-gray-500">Absent</div>
              </div>
            </div>

            {/* Live roster */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Live Roster</h2>
                <button onClick={fetchRoster} className="text-gray-400 hover:text-gray-600">
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Name</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">ID</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Present Duration</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.sort((a,b) => a.full_name.localeCompare(b.full_name)).map(r => (
                      <tr key={r.student_id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium">{r.full_name}</td>
                        <td className="py-2 px-3 text-gray-500">{r.student_number}</td>
                        <td className="py-2 px-3">{badge(r.current_state)}</td>
                        <td className="py-2 px-3">{Math.round((r.present_s || 0)/60)} min</td>
                        <td className="py-2 px-3 text-gray-400 text-xs">
                          {r.last_seen ? new Date(r.last_seen).toLocaleTimeString() : '—'}
                        </td>
                      </tr>
                    ))}
                    {roster.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-gray-400">Waiting for recognitions…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Proctor review queue (exam mode) */}
            {mode === 'exam' && (
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-1">Proctor Review Queue</h2>
                <p className="text-xs text-gray-400 mb-4">
                  All flags require human review. No automatic penalties are issued.
                </p>
                {flags.length === 0
                  ? <p className="text-gray-400 text-sm">No flags yet.</p>
                  : (
                    <div className="space-y-2">
                      {flags.map(f => (
                        <div key={f.id} className={`flex items-center justify-between p-3 rounded-lg border ${f.reviewed_at ? 'bg-gray-50 border-gray-100' : 'bg-orange-50 border-orange-200'}`}>
                          <div>
                            <span className="font-medium text-sm capitalize">{f.flag_type.replace(/_/g,' ')}</span>
                            <span className="text-gray-400 text-xs ml-2">
                              Zone: {f.zone} · {(f.confidence*100).toFixed(0)}% · {new Date(f.detected_at).toLocaleTimeString()}
                            </span>
                            {f.review_note && <p className="text-xs text-gray-500 mt-0.5">Note: {f.review_note}</p>}
                          </div>
                          {!f.reviewed_at && (
                            <button
                              onClick={() => {
                                const note = prompt('Review note (optional):') ?? ''
                                reviewFlag(f.id, note)
                              }}
                              className="text-xs btn-secondary py-1"
                            >
                              Mark Reviewed
                            </button>
                          )}
                          {f.reviewed_at && <span className="text-xs text-green-600">✓ Reviewed</span>}
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
