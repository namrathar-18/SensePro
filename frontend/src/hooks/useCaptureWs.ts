import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface FaceResult {
  bbox: [number, number, number, number]
  identity: string | null
  identity_score: number
  det_score: number
}

export interface PresenceSummary {
  PRESENT: number
  UNVERIFIED: number
  ABSENT: number
}

export interface WsState {
  connected: boolean
  latencyMs: number
  faces: FaceResult[]
  presenceSummary: PresenceSummary
  proctorFlags: Array<{ flag_type: string; confidence: number; zone: string }>
  frameCount: number
  error: string | null
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/capture'
const FPS    = 2   // frames per second to send

export function useCaptureWs(sessionId: string | null, mode: 'attendance' | 'exam' = 'attendance') {
  const wsRef        = useRef<WebSocket | null>(null)
  const videoRef     = useRef<HTMLVideoElement | null>(null)
  const canvasRef    = useRef<HTMLCanvasElement | null>(null)
  const intervalRef  = useRef<number | null>(null)
  const [state, setState] = useState<WsState>({
    connected: false, latencyMs: 0, faces: [],
    presenceSummary: { PRESENT: 0, UNVERIFIED: 0, ABSENT: 0 },
    proctorFlags: [], frameCount: 0, error: null,
  })

  // Connect WS and start sending frames
  const start = useCallback(async (videoEl: HTMLVideoElement) => {
    if (!sessionId) return
    videoRef.current = videoEl

    // Get JWT token
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) { setState(s => ({ ...s, error: 'Not authenticated' })); return }

    // Set up canvas for frame capture
    const canvas = document.createElement('canvas')
    canvas.width  = 640
    canvas.height = 480
    canvasRef.current = canvas

    // Open WebSocket
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setState(s => ({ ...s, connected: true, error: null }))
      // Send init message
      ws.send(JSON.stringify({ type: 'init', session_id: sessionId, mode, token }))
    }

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'recognition') {
        setState(s => ({
          ...s,
          faces:           msg.faces,
          presenceSummary: msg.presence_summary,
          latencyMs:       msg.latency_ms,
          frameCount:      s.frameCount + 1,
        }))
      } else if (msg.type === 'proctor_flag') {
        setState(s => ({
          ...s,
          proctorFlags: [msg, ...s.proctorFlags].slice(0, 50),
        }))
      } else if (msg.type === 'error') {
        setState(s => ({ ...s, error: msg.message }))
      }
    }

    ws.onclose  = () => setState(s => ({ ...s, connected: false }))
    ws.onerror  = () => setState(s => ({ ...s, error: 'WebSocket error', connected: false }))

    // Start frame capture loop
    intervalRef.current = window.setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN || !videoRef.current || !canvasRef.current) return
      const ctx = canvasRef.current.getContext('2d')!
      ctx.drawImage(videoRef.current, 0, 0, 640, 480)
      canvasRef.current.toBlob(
        (blob) => {
          if (!blob) return
          const reader = new FileReader()
          reader.onload = () => {
            const b64 = (reader.result as string).split(',')[1]
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'frame', data: b64, ts: Date.now() / 1000 }))
            }
          }
          reader.readAsDataURL(blob)
        },
        'image/jpeg', 0.7
      )
    }, 1000 / FPS)

    // Keepalive ping every 30s
    const pingInterval = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
    }, 30_000)

    return () => clearInterval(pingInterval)
  }, [sessionId, mode])

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (wsRef.current) wsRef.current.close()
    wsRef.current = null
  }, [])

  useEffect(() => () => stop(), [stop])

  return { state, start, stop }
}
