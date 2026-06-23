import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-6xl font-bold text-gray-200 mb-4">404</div>
        <h1 className="text-xl font-semibold text-gray-700 mb-2">Page Not Found</h1>
        <button onClick={() => navigate('/')} className="btn-primary mt-4">Go Home</button>
      </div>
    </div>
  )
}
