import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import RiskCheckPage from "./pages/RiskCheckPage";
import DatasetAnalyzerPage from "./pages/DatasetAnalyzerPage";
import MyRiskHistoryPage from "./pages/MyRiskHistoryPage";
import RetryPredictorPage from "./pages/RetryPredictorPage";
import TransactionHistoryPage from "./pages/TransactionHistoryPage";
import RecoveryTrackingPage from "./pages/RecoveryTrackingPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import SpikeWarningPage from "./pages/SpikeWarningPage";
import BankPairAnalysisPage from "./pages/BankPairAnalysisPage";
import AnomalyDetectionPage from "./pages/AnomalyDetectionPage";
import NotFoundPage from "./pages/NotFoundPage";
import RequireAdmin from "./components/RequireAdmin";
import RequireUser from "./components/RequireUser";
import { useAuth } from "./context/AuthContext";
import { useAdminAuth } from "./context/AdminAuthContext";

export default function App() {
  // Restored from localStorage on startup, so every page renders the account
  // that actually signed in. Null until somebody logs in.
  const { user } = useAuth();
  const { admin } = useAdminAuth();
  const adminUser = admin ? { name: "Admin", role: "admin" } : null;

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* User dashboard section */}
      <Route element={<RequireUser />}>
        <Route path="/dashboard" element={<DashboardPage user={user} />} />
        <Route path="/risk-check" element={<RiskCheckPage user={user} />} />
        <Route path="/dataset-analyzer" element={<DatasetAnalyzerPage user={user} />} />
        <Route path="/my-risk-history" element={<MyRiskHistoryPage user={user} />} />
        <Route path="/retry-predictor" element={<RetryPredictorPage user={user} />} />
        <Route path="/history" element={<TransactionHistoryPage user={user} />} />
        <Route path="/recovery" element={<RecoveryTrackingPage user={user} />} />
        <Route path="/warnings" element={<SpikeWarningPage user={user} />} />
        <Route path="/bank-pair-analysis" element={<BankPairAnalysisPage user={user} />} />
        <Route path="/anomaly-detection" element={<AnomalyDetectionPage user={user} />} />
      </Route>

      {/* Admin section */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route path="/admin" element={<AdminDashboardPage user={adminUser} />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
