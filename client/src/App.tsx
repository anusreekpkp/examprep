import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
// Imported for its side effect: registers the cold-start handler with axios.
import '@/stores/serverStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import ExamsPage from '@/pages/ExamsPage';
import ExamNewPage from '@/pages/ExamNewPage';
import SyllabusPage from '@/pages/SyllabusPage';

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // One silent refresh on load restores the session from the httpOnly cookie.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exams"
        element={
          <ProtectedRoute>
            <ExamsPage />
          </ProtectedRoute>
        }
      />
      {/* Before /exams/:examId so "new" is not read as an exam id. */}
      <Route
        path="/exams/new"
        element={
          <ProtectedRoute>
            <ExamNewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exams/:examId"
        element={
          <ProtectedRoute>
            <SyllabusPage />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
