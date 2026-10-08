import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearSession,
  getSessionUser,
  loginAccount,
  registerAccount,
  restoreSession,
  roleLabel,
} from "../utils/auth";

const AuthContext = createContext(null);

// Holds the signed-in user for the whole app. The initial state is read from
// localStorage during the first render, so a browser refresh shows the right
// name immediately, and restoreSession then confirms the token with the
// backend and drops the session if it is no longer valid.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSessionUser());
  const [restoring, setRestoring] = useState(() => Boolean(getSessionUser()));

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const current = await restoreSession();

        if (active) setUser(current);
      } finally {
        if (active) setRestoring(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const account = await loginAccount(credentials);
    setUser(account);
    return account;
  }, []);

  const register = useCallback(async (details) => {
    const account = await registerAccount(details);
    setUser(account);
    return account;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      restoring,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      roleLabel,
      login,
      register,
      logout,
    }),
    [user, restoring, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
