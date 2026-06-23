import { useEffect, useState } from 'react'
import { supabase, ZoneAggregate } from '../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from 'recharts'
import { Info } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export default function ManagementPage() {
  const [sessions, setSessions]   = useState<any[]>([])
  const [selected, setSelected]   = useState('')
  const [engagement, setEngagement] = useState<any>(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    supabase.from('class_sessions')
      .select('id, started_at, ended_at, mode, classes(name)')
      .order('started_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setSessions(data || []); if (data?.length) setSelected(data[0].id) })
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token
      const res = await fetch(`${API}/sessions/${selected}/engagement`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setEngagement(await res.json())
      setLoading(false)
    })
  }, [selected])

  // Build bias chart data: naive vs VNEI per zone
  const biasData = engagement?.aggregates
    ? (() => {
        // Latest window per zone
        const byZone: Record<string, ZoneAggregate> = {}
        for (const a of engagement.aggregates as ZoneAggregate[]) {
          byZone[a.zone] = a  // last write wins
        }
        return Object.entries(byZone).map(([zone, a]) => ({
          zone: zone.charAt(0).toUpperCase() + zone.slice(1),
          'Raw Score':   a.vnei_score ?? 0,
          'VNEI (coverage-weighted)': a.vnei_score
            ? +(a.vnei_score * a.coverage_ratio).toFixed(3) : 0,
          coverage: +(a.coverage_ratio * 100).toFixed(0),
          students: a.student_count,
        }))
      })()
    : []

  // Time-series VNEI
  const timeData = engagement?.aggregates
    ? (engagement.aggregates as ZoneAggregate[])
        .filter(a => a.vnei_score !== null)
        .map(a => ({
          time: new Date(a.window_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          [a.zone]: +((a.vnei_score ?? 0) * 100).toFixed(1),
        }))
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Management Dashboard</h1>
        <p className="text-sm text-gray-500">Class-level engagement analytics · Zone-level only · No per-student data</p>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Session picker */}
        <div className="card">
          <label className="block text-sm text-gray-600 mb-2">Select Session</label>
          <select
            value={selected} onChange={e => setSelected(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full max-w-md"
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.classes?.name} · {new Date(s.started_at).toLocaleString()} · {s.mode}
              </option>
            ))}
          </select>
        </div>

        {loading && <div className="text-center text-gray-400 py-12">Loading engagement data…</div>}

        {engagement && !loading && (
          <>
            {/* Bias comparison — the headline VNEI chart */}
            <div className="card">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="font-semibold text-gray-800">VNEI vs Naive Mean — Bias Comparison</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Naive mean over-weights front-row students. VNEI corrects for camera coverage.
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div>Naive Mean: <span className="font-bold text-orange-600">{(engagement.bias_chart.naive_mean * 100).toFixed(1)}%</span></div>
                  <div>VNEI Weighted: <span className="font-bold text-blue-600">{(engagement.bias_chart.vnei_weighted * 100).toFixed(1)}%</span></div>
                  <div className="text-xs text-gray-400">
                    Δ = {engagement.bias_chart.bias_delta > 0 ? '+' : ''}{(engagement.bias_chart.bias_delta * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={biasData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="zone" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0,1]} tickFormatter={v => `${(v*100).toFixed(0)}%`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${(v*100).toFixed(1)}%`} />
                  <Legend />
                  <Bar dataKey="Raw Score" fill="#f97316" radius={[4,4,0,0]} />
                  <Bar dataKey="VNEI (coverage-weighted)" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                <Info size={14} className="shrink-0 mt-0.5" />
                <span>
                  Zones with &lt;5 students are suppressed (no score shown). Coverage ratios: Front 95% · Middle 75% · Back 45%.
                  Signals are behavioural only (head pose, eye state, phone, stillness) — no emotion inference.
                </span>
              </div>
            </div>

            {/* Zone detail table */}
            {biasData.length > 0 && (
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-4">Zone Detail (Latest Window)</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Zone</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Students Visible</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Camera Coverage</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">VNEI Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {biasData.map(z => (
                      <tr key={z.zone} className="border-b border-gray-50">
                        <td className="py-2 px-3 font-medium">{z.zone}</td>
                        <td className="py-2 px-3">{z.students}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${z.coverage}%` }} />
                            </div>
                            <span className="text-gray-500">{z.coverage}%</span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          {z['VNEI (coverage-weighted)']
                            ? <span className="font-medium text-blue-600">{(z['VNEI (coverage-weighted)'] * 100).toFixed(1)}%</span>
                            : <span className="text-gray-300">Suppressed (k&lt;5)</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
