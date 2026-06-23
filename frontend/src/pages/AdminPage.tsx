import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Upload, Trash2, CheckCircle, AlertTriangle, Users, Shield, FileText } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

type Tab = 'enrollment' | 'users' | 'consent' | 'audit'

export default function AdminPage() {
  const [tab, setTab]           = useState<Tab>('enrollment')
  const [students, setStudents] = useState<any[]>([])
  const [consents, setConsents] = useState<any[]>([])
  const [auditLog, setAuditLog] = useState<any[]>([])
  const [enrolling, setEnrolling] = useState<string | null>(null)
  const [msg, setMsg]           = useState<{type:'success'|'error'; text:string} | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'student').order('full_name')
      .then(({ data }) => setStudents(data || []))
    supabase.from('consent_records').select('*, profiles(full_name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setConsents(data || []))
    supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(50)
      .then(({ data }) => setAuditLog(data || []))
  }, [])

  async function handleEnroll(studentId: string) {
    if (!fileRef.current?.files?.length) return
    const file = fileRef.current.files[0]
    setEnrolling(studentId)
    setMsg(null)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const form = new FormData(); form.append('video', file)
    const res = await fetch(`${API}/enrollment/enroll/${studentId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    if (res.ok) {
      const d = await res.json()
      setMsg({ type: 'success', text: `Enrolled ${d.frames_kept} frames · Poses: ${d.pose_coverage.join(', ')}` })
    } else {
      const d = await res.json()
      setMsg({ type: 'error', text: d.detail || 'Enrollment failed' })
    }
    setEnrolling(null)
  }

  async function handleDelete(studentId: string) {
    if (!confirm(`Delete ALL data for this student? This is irreversible (DPDP right-to-deletion).`)) return
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`${API}/enrollment/unenroll/${studentId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) setMsg({ type: 'success', text: 'Student data deleted and audit logged.' })
    else setMsg({ type: 'error', text: 'Deletion failed.' })
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'enrollment', label: 'Enrollment',     icon: Upload },
    { id: 'users',      label: 'Users',           icon: Users },
    { id: 'consent',    label: 'Consent Registry',icon: Shield },
    { id: 'audit',      label: 'Audit Log',       icon: FileText },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Admin Console</h1>
        <p className="text-sm text-gray-500">Enrollment · Users · Consent · Audit</p>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
          {tabs.map(t => (
            <button
              key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 text-sm ${
            msg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={16}/> : <AlertTriangle size={16}/>}
            {msg.text}
          </div>
        )}

        {/* ─── Enrollment tab ─────────────────────────────────────────────── */}
        {tab === 'enrollment' && (
          <div className="card space-y-4">
            <div>
              <h2 className="font-semibold text-gray-800 mb-1">Student Enrollment</h2>
              <p className="text-xs text-gray-400">
                Upload a 20–30s video per student. Pipeline extracts 10–20 quality frames, embeds them with ArcFace, and deletes the video immediately.
                Consent must be signed before enrollment is permitted.
              </p>
            </div>

            <div className="border border-dashed border-gray-200 rounded-lg p-4">
              <label className="block text-sm text-gray-600 mb-2">Enrollment Video (.mp4)</label>
              <input ref={fileRef} type="file" accept="video/*" className="text-sm" />
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Student</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">ID</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Consent</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => {
                  const consent = consents.find(c => c.student_id === s.id)
                  const hasSigned = !!consent?.signed_at
                  return (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{s.full_name}</td>
                      <td className="py-2 px-3 text-gray-500">{s.student_id}</td>
                      <td className="py-2 px-3">
                        {hasSigned
                          ? <span className="badge-present">Signed</span>
                          : <span className="badge-absent">Not signed</span>
                        }
                      </td>
                      <td className="py-2 px-3 flex gap-2">
                        <button
                          onClick={() => handleEnroll(s.id)}
                          disabled={!hasSigned || enrolling === s.id}
                          className="btn-primary text-xs py-1 px-3 disabled:opacity-40"
                        >
                          {enrolling === s.id ? 'Enrolling…' : 'Enroll'}
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Delete all data (DPDP)"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Users tab ──────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4">All Users</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Role</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Student ID</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="py-2 px-3">{s.full_name}</td>
                    <td className="py-2 px-3 capitalize">{s.role}</td>
                    <td className="py-2 px-3 text-gray-500">{s.student_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Consent tab ────────────────────────────────────────────────── */}
        {tab === 'consent' && (
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-1">Consent Registry</h2>
            <p className="text-xs text-gray-400 mb-4">All consent records. Version 1.0. DPDP Act compliant.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Student</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Signed At</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Withdrawn</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Version</th>
                </tr>
              </thead>
              <tbody>
                {consents.map(c => (
                  <tr key={c.id} className="border-b border-gray-50">
                    <td className="py-2 px-3">{c.profiles?.full_name}</td>
                    <td className="py-2 px-3">{c.signed_at ? new Date(c.signed_at).toLocaleString() : <span className="text-red-400">Not signed</span>}</td>
                    <td className="py-2 px-3">{c.withdrawn_at ? new Date(c.withdrawn_at).toLocaleString() : '—'}</td>
                    <td className="py-2 px-3 text-gray-500">v{c.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Audit log tab ──────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-1">Audit Log</h2>
            <p className="text-xs text-gray-400 mb-4">Append-only, hash-chained. Cannot be modified or deleted.</p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {auditLog.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg text-xs font-mono">
                  <span className="text-gray-400 shrink-0">#{entry.id}</span>
                  <span className="font-semibold text-blue-700">{entry.action}</span>
                  <span className="text-gray-500">{entry.entity_type}/{entry.entity_id?.slice(0,8)}</span>
                  <span className="text-gray-400 ml-auto shrink-0">{new Date(entry.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
