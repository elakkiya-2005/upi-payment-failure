import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  adminLogin,
  clearAdminSession,
  getAdminSessionUser,
  restoreAdminSession,
} from "../utils/adminAuth";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => getAdminSessionUser());
  const [restoring, setRestoring] = useState(() =>
    Boolean(getAdminSessionUser())
  );

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const current = await restoreAdminSession();

        if (active) setAdmin(current);
      } finally {
        if (active) setRestoring(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const account = await adminLogin(credentials);
    setAdmin(account);
    return account;
  }, []);

  const logout = useCallback(() => {
    clearAdminSession();
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      restoring,
      isAuthenticated: Boolean(admin),
      login,
      logout,
    }),
    [admin, restoring, login, logout]
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used inside an AdminAuthProvider");
  }
  return context;
}
