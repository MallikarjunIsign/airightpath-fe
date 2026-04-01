import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRbac } from '@/hooks/useRbac';
import { Layout, PublicLayout } from '@/components/layout/Layout';
import { ExamLayout } from '@/components/layout/ExamLayout';
import { InterviewLayout } from '@/components/layout/InterviewLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ROUTES } from '@/config/routes';

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { ChangePasswordPage } from '@/pages/auth/ChangePasswordPage';

// Admin pages
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { JobPostFormPage } from '@/pages/admin/JobPostFormPage';
import { CandidateDetailsPage } from '@/pages/admin/CandidateDetailsPage';
import { UserListPage } from '@/pages/admin/UserListPage';
import { AtsScreeningPage } from '@/pages/admin/AtsScreeningPage';
import { AtsBatchPage } from '@/pages/admin/AtsBatchPage';
import { AssignAssessmentPage } from '@/pages/admin/AssignAssessmentPage';
import { UploadQuestionPaperPage } from '@/pages/admin/UploadQuestionPaperPage';
import { ResultsPage } from '@/pages/admin/ResultsPage';
import { CandidateResultDetailPage } from '@/pages/admin/CandidateResultDetailPage';
import { InterviewSchedulerPage } from '@/pages/admin/InterviewSchedulerPage';
import { InterviewResultsPage } from '@/pages/admin/InterviewResultsPage';
import { JobPromptPage } from '@/pages/admin/JobPromptPage';

// Candidate pages
import { CandidateDashboardPage } from '@/pages/candidate/CandidateDashboardPage';
import { ProfilePage } from '@/pages/candidate/ProfilePage';
import { ResumePage } from '@/pages/candidate/ResumePage';
import { EventsPage } from '@/pages/candidate/EventsPage';
import { MyApplicationsPage } from '@/pages/candidate/MyApplicationsPage';
import { JobApplicationPage } from '@/pages/candidate/JobApplicationPage';
import { AssessmentListPage } from '@/pages/candidate/AssessmentListPage';
import { ExamInstructionsPage } from '@/pages/candidate/ExamInstructionsPage';
import { AptitudeAssessmentPage } from '@/pages/candidate/AptitudeAssessmentPage';
import { CodingAssessmentPage } from '@/pages/candidate/CodingAssessmentPage';
import { InterviewListPage } from '@/pages/candidate/InterviewListPage';
import { InterviewPage } from '@/pages/candidate/InterviewPage';
import { InterviewSummaryPage } from '@/pages/candidate/InterviewSummaryPage';
import { ResultsListPage } from '@/pages/candidate/ResultsListPage';
import { ResultDetailPage } from '@/pages/candidate/ResultDetailPage';

// Public pages
import { HomePage } from '@/pages/public/HomePage';
import { AboutPage } from '@/pages/public/AboutPage';
import { ContactPage } from '@/pages/public/ContactPage';

// Error pages
import { NotFoundPage } from '@/pages/errors/NotFoundPage';
import { ForbiddenPage } from '@/pages/errors/ForbiddenPage';
import { UnauthorizedPage } from '@/pages/errors/UnauthorizedPage';

function App() {
  const { isAuthenticated } = useAuth();
  const { hasAnyRole } = useRbac();

  const getDefaultDashboard = () => {
    if (hasAnyRole(['ADMIN', 'SUPER_ADMIN'])) return ROUTES.ADMIN.DASHBOARD;
    return ROUTES.CANDIDATE.DASHBOARD;
  };

  return (
    <Routes>
      {/* Public routes */}
      <Route path={ROUTES.PUBLIC.HOME} element={<HomePage />} />
      <Route path={ROUTES.PUBLIC.ABOUT} element={<AboutPage />} />
      <Route path={ROUTES.PUBLIC.CONTACT} element={<ContactPage />} />

      {/* Auth routes (redirect if already authenticated) */}
      <Route
        path={ROUTES.PUBLIC.LOGIN}
        element={isAuthenticated ? <Navigate to={getDefaultDashboard()} /> : <LoginPage />}
      />
      <Route
        path={ROUTES.PUBLIC.REGISTER}
        element={isAuthenticated ? <Navigate to={getDefaultDashboard()} /> : <RegisterPage />}
      />
      <Route path={ROUTES.PUBLIC.FORGOT_PASSWORD} element={<ForgotPasswordPage />} />
      <Route path={ROUTES.PUBLIC.RESET_PASSWORD} element={<ResetPasswordPage />} />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="jobs/create" element={<JobPostFormPage />} />
        <Route path="candidates" element={<CandidateDetailsPage />} />
        <Route path="users" element={<UserListPage />} />
        <Route path="ats" element={<AtsScreeningPage />} />
        <Route path="ats/batch" element={<AtsBatchPage />} />
        <Route path="assessments/assign" element={<AssignAssessmentPage />} />
        <Route path="assessments/upload" element={<UploadQuestionPaperPage />} />
        <Route path="assessments/results" element={<ResultsPage />} />
        <Route path="assessments/results/:jobPrefix/:email" element={<CandidateResultDetailPage />} />
        <Route path="interviews/schedule" element={<InterviewSchedulerPage />} />
        <Route path="interviews/results" element={<InterviewResultsPage />} />
        <Route path="prompts" element={<JobPromptPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="change-password" element={<ChangePasswordPage />} />
      </Route>

      {/* Exam routes (no sidebar/navbar — lockdown mode) */}
      <Route
        path="/candidate/exam"
        element={
          <ProtectedRoute>
            <ExamLayout />
          </ProtectedRoute>
        }
      >
        <Route path="aptitude" element={<AptitudeAssessmentPage />} />
        <Route path="coding" element={<CodingAssessmentPage />} />
      </Route>

      {/* Interview routes (no sidebar/navbar — lockdown mode) */}
      <Route
        path="/candidate/interview"
        element={
          <ProtectedRoute>
            <InterviewLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<InterviewPage />} />
        <Route path="summary" element={<InterviewSummaryPage />} />
      </Route>

      {/* Candidate routes */}
      <Route
        path="/candidate"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<CandidateDashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="change-password" element={<ChangePasswordPage />} />
        <Route path="resume" element={<ResumePage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="applications" element={<MyApplicationsPage />} />
        <Route path="apply" element={<JobApplicationPage />} />
        <Route path="assessments" element={<AssessmentListPage />} />
        <Route path="instructions" element={<ExamInstructionsPage />} />
        <Route path="interviews" element={<InterviewListPage />} />
        <Route path="results" element={<ResultsListPage />} />
        <Route path="results/:id" element={<ResultDetailPage />} />
      </Route>

      {/* Error routes */}
      <Route path={ROUTES.ERRORS.UNAUTHORIZED} element={<UnauthorizedPage />} />
      <Route path={ROUTES.ERRORS.FORBIDDEN} element={<ForbiddenPage />} />

      {/* Catch-all */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
