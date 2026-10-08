const API_BASE = "http://localhost:5000";

const ADMIN_SESSION_KEY = "upi_safeguard.admin.session";
const ADMIN_TOKEN_KEY = "upi_safeguard.admin.token";

const read = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota).
  }
};

const remove = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
};

export function getAdminSessionUser() {
  const raw = read(ADMIN_SESSION_KEY);

  if (!raw) return null;

  try {
    const admin = JSON.parse(raw);
    return admin && admin.name ? admin : null;
  } catch {
    return null;
  }
}

export function getAdminToken() {
  return read(ADMIN_TOKEN_KEY);
}

export function setAdminSession(admin, token) {
  write(ADMIN_SESSION_KEY, JSON.stringify(admin));

  if (token) write(ADMIN_TOKEN_KEY, token);
}

export function clearAdminSession() {
  remove(ADMIN_SESSION_KEY);
  remove(ADMIN_TOKEN_KEY);
}

export function adminAuthHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };

  const token = getAdminToken();

  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

async function post(path, body, fallbackMessage) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server. Is the backend running?");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }

  return data;
}

export async function adminLogin({ email, password }) {
  const data = await post(
    "/api/auth/login",
    { email, password },
    "Could not sign you in."
  );

  if (!data.user || data.user.role !== "admin") {
    clearAdminSession();
    throw new Error(
      "These credentials do not belong to an administrator account."
    );
  }

  setAdminSession(data.user, data.token);

  return data.user;
}

export async function restoreAdminSession() {
  const token = getAdminToken();

  if (!token) return null;

  let response;

  try {
    response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: adminAuthHeaders(),
    });
  } catch {
    return getAdminSessionUser();
  }

  if (!response.ok) {
    clearAdminSession();
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!data.user || data.user.role !== "admin") {
    clearAdminSession();
    return null;
  }

  setAdminSession(data.user, token);

  return data.user;
}
