import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage          from './pages/LoginPage.jsx'
import SetupPage          from './pages/SetupPage.jsx'
import QuestionPage       from './pages/QuestionPage.jsx'
import FeedbackPage       from './pages/FeedbackPage.jsx'
import DashboardPage      from './pages/DashboardPage.jsx'

/**
 * App — root router
 * Route order: /login → /setup → /question → /feedback → /dashboard
 */
export default function App() {
  return (
    <Routes>
      <Route path="/"          element={<Navigate to="/login" replace />} />
      <Route path="/login"     element={<LoginPage />} />
      <Route path="/setup"     element={<SetupPage />} />
      <Route path="/question"  element={<QuestionPage />} />
      <Route path="/feedback"  element={<FeedbackPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  )
}
