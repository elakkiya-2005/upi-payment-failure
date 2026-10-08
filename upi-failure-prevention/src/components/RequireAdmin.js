import { Navigate, Outlet } from "react-router-dom";

import { useAdminAuth } from "../context/AdminAuthContext";

export default function RequireAdmin() {
  const { admin } = useAdminAuth();

  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
