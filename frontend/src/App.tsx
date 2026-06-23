import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage      from './pages/LoginPage'
import CapturePage    from './pages/CapturePage'
import TeacherPage    from './pages/TeacherPage'
import ManagementPage from './pages/ManagementPage'
import AdminPage      from './pages/AdminPage'
import StudentPage    from './pages/StudentPage'
import NotFoundPage   from './pages/NotFoundPage'

function RoleRouter() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>
  if (!profile) return <Navigate to="/login" replace />
  switch (profile.role) {
    case 'teacher':    return <Navigate to="/teacher" replace />
    case 'management': return <Navigate to="/management" replace />
    case 'admin':      return <Navigate to="/admin" replace />
    case 'student':    return <Navigate to="/me" replace />
    default:           return <Navigate to="/login" replace />
  }
}

function RequireAuth({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (!profile) return <Navigate to="/login" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"  element={<LoginPage />} />
        <Route path="/capture" element={
          <RequireAuth roles={['teacher','admin']}>
            <CapturePage />
          </RequireAuth>
        } />
        <Route path="/teacher" element={
          <RequireAuth roles={['teacher','admin']}>
            <TeacherPage />
          </RequireAuth>
        } />
        <Route path="/management" element={
          <RequireAuth roles={['management','admin']}>
            <ManagementPage />
          </RequireAuth>
        } />
        <Route path="/admin" element={
          <RequireAuth roles={['admin']}>
            <AdminPage />
          </RequireAuth>
        } />
        <Route path="/me" element={
          <RequireAuth>
            <StudentPage />
          </RequireAuth>
        } />
        <Route path="/"    element={<RoleRouter />} />
        <Route path="*"    element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}
