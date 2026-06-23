import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCaptureWs, FaceResult } from '../hooks/useCaptureWs'
import { Wifi, WifiOff, Camera, AlertTriangle } from 'lucide-react'

export default function CapturePage() {
  const [params]       = useSearchParams()
  const sessionId      = params.get('session')
  const mode           = (params.get('mode') || 'attendance') as 'attendance' | 'exam'
  const videoRef       = useRef<HTMLVideoElement>(null)
  const overlayRef     = useRef<HTMLCanvasElement>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const { state, start, stop } = useCaptureWs(sessionId, mode)

  // Start camera
  useEffect(() => {
    let stream: MediaStream
    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      audio: false,
    })
    .then(s => {
      stream = s
      if (videoRef.current) {
        videoRef.current.srcObject = s
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play()
          if (sessionId) start(videoRef.current!)
        }
      }
    })
    .catch(e => setCamError(e.message))

    return () => {
      stop()
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [sessionId])

  // Draw recognition overlay
  useEffect(() => {
    const canvas = overlayRef.current
    const video  = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')!

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const scaleX = canvas.width  / 640
    const scaleY = canvas.height / 480

    state.faces.forEach((face: FaceResult) => {
      const [x1, y1, x2, y2] = face.bbox
      const color = face.identity ? '#22c55e' : '#ef4444'
      ctx.strokeStyle = color
      ctx.lineWidth   = 3
      ctx.strokeRect(x1 * scaleX, y1 * scaleY, (x2-x1) * scaleX, (y2-y1) * scaleY)
      if (face.identity) {
        ctx.fillStyle = color
        ctx.font = '14px sans-serif'
        ctx.fillText(
          `${face.identity.slice(0,8)}… (${(face.identity_score*100).toFixed(0)}%)`,
          x1 * scaleX, y1 * scaleY - 6
        )
      }
    })
  }, [state.faces])

  if (!sessionId) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="text-center">
        <Camera size={48} className="mx-auto mb-4 opacity-40" />
        <p className="text-lg">No session ID. Open from the teacher dashboard.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white text-sm">
        <div className="flex items-center gap-2">
          {state.connected
            ? <Wifi size={16} className="text-green-400" />
            : <WifiOff size={16} className="text-red-400" />}
          <span>{state.connected ? 'Connected' : 'Disconnected'}</span>
          {state.connected && <span className="text-gray-400">· {state.latencyMs}ms</span>}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-green-400 font-medium">✓ {state.presenceSummary.PRESENT} present</span>
          <span className="text-yellow-400">? {state.presenceSummary.UNVERIFIED}</span>
          <span className="text-red-400">✗ {state.presenceSummary.ABSENT}</span>
          <span className="text-gray-400">{state.frameCount} frames</span>
          {mode === 'exam' && (
            <span className="bg-orange-600 px-2 py-0.5 rounded text-xs font-bold">EXAM MODE</span>
          )}
        </div>
      </div>

      {/* Disclosure notice (DPDP compliance) */}
      <div className="bg-blue-900 text-blue-200 text-xs text-center py-1 px-4">
        📷 This session is recording and processing faces for automated attendance. Consent required. Frames are not stored.
      </div>

      {/* Camera + overlay */}
      <div className="flex-1 relative flex items-center justify-center">
        {camError ? (
          <div className="text-center text-white">
            <AlertTriangle size={48} className="mx-auto mb-4 text-yellow-400" />
            <p className="text-lg">{camError}</p>
            <p className="text-sm text-gray-400 mt-2">Grant camera permission and refresh.</p>
          </div>
        ) : (
          <div className="relative">
            <video
              ref={videoRef} autoPlay playsInline muted
              className="rounded-lg max-h-[70vh]"
              style={{ maxWidth: '100%' }}
            />
            <canvas
              ref={overlayRef}
              width={1280} height={720}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
          </div>
        )}
      </div>

      {/* Proctor flags (exam mode) */}
      {mode === 'exam' && state.proctorFlags.length > 0 && (
        <div className="bg-gray-800 border-t border-gray-700 px-4 py-3">
          <p className="text-white text-sm font-medium mb-2">⚠ Review Queue ({state.proctorFlags.length})</p>
          <div className="flex flex-wrap gap-2">
            {state.proctorFlags.slice(0, 5).map((f, i) => (
              <span key={i} className="bg-orange-800 text-orange-100 text-xs px-2 py-1 rounded">
                {f.flag_type.replace('_', ' ')} · {f.zone} · {(f.confidence*100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {state.error && (
        <div className="bg-red-900 text-red-200 text-sm text-center py-2 px-4">
          {state.error}
        </div>
      )}
    </div>
  )
}
