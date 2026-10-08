// Session handling for the signed-in user.
//
// Accounts and risk history live in MySQL, so this module only keeps the
// signed-in user's profile and token in the browser. It exposes the same
// interface as before, which is why the pages and the auth context did not
// need to change. The user_id used for risk history is decided by the
// backend from the token, never sent from here.

const API_BASE = "http://localhost:5000";

const SESSION_KEY = "upi_safeguard.session";
const TOKEN_KEY = "upi_safeguard.token";

// Raw role values are stored on the session; these are the labels shown in the UI.
const ROLE_LABELS = {
  user: "Regular User",
  admin: "Administrator",
};

export const roleLabel = (role) => ROLE_LABELS[role] || ROLE_LABELS.user;

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
    // Storage can be unavailable (private mode, quota). The session then
    // lives in memory only, which degrades to "sign in again on refresh".
  }
};

const remove = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
};


// -------------------------------------------
// SESSION + TOKEN
// -------------------------------------------

// An earlier version of this app kept a whole account registry, including
// password hashes, in this key. Accounts now live only in MySQL, so the
// leftover is deleted on startup. Without this a browser that registered
// under the old build would still hold a second copy of the user data.
const LEGACY_ACCOUNTS_KEY = "upi_safeguard.accounts";

if (read(LEGACY_ACCOUNTS_KEY)) {
  remove(LEGACY_ACCOUNTS_KEY);
  console.info(
    "Removed the obsolete local account registry. Accounts are stored in MySQL."
  );
}

// Read synchronously so the first paint already shows the right name and the
// dashboard never flashes a placeholder on refresh.
export function getSessionUser() {
  const raw = read(SESSION_KEY);

  if (!raw) return null;

  try {
    const user = JSON.parse(raw);
    return user && user.name ? user : null;
  } catch {
    return null;
  }
}

export function getToken() {
  return read(TOKEN_KEY);
}

export function setSession(user, token) {
  write(SESSION_KEY, JSON.stringify(user));

  if (token) write(TOKEN_KEY, token);
}

export function clearSession() {
  remove(SESSION_KEY);
  remove(TOKEN_KEY);
}

// Attaches the token when one is present. Endpoints that accept guests
// still work without it.
export function authHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };

  const token = getToken();

  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}


// -------------------------------------------
// API CALLS
// -------------------------------------------

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

export async function registerAccount({ name, email, phone, password }) {
  const data = await post(
    "/api/auth/register",
    { name, email, phone, password },
    "Could not create the account."
  );

  setSession(data.user, data.token);

  return data.user;
}

export async function loginAccount({ email, password }) {
  const data = await post(
    "/api/auth/login",
    { email, password },
    "Could not sign you in."
  );

  setSession(data.user, data.token);

  return data.user;
}

// Confirms the stored token is still valid and refreshes the cached profile.
// Called on startup so a page reload keeps the same user, and so a revoked or
// expired session is dropped instead of leaving a stale name on screen.
export async function restoreSession() {
  const token = getToken();

  if (!token) return null;

  let response;

  try {
    response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: authHeaders(),
    });
  } catch {
    // Backend unreachable: keep the cached user so the app still renders,
    // and let the next request surface the problem.
    return getSessionUser();
  }

  if (!response.ok) {
    clearSession();
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!data.user) {
    clearSession();
    return null;
  }

  setSession(data.user, token);

  return data.user;
}
