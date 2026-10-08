import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("react-router/dom", () => ({ RouterProvider: () => null }), {
  virtual: true,
});

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { clearAdminSession, setAdminSession } from "./utils/adminAuth";
import Sidebar from "./components/Sidebar";
import Footer from "./components/Footer";

const adminUser = {
  id: 1,
  name: "Root Admin",
  email: "root@example.com",
  role: "admin",
};

function mockFetch() {
  global.fetch = jest.fn((url, options = {}) => {
    const headers = options.headers || {};
    const token = String(headers.Authorization || "").replace("Bearer ", "");
    const isAdminToken = token === "admin-token";
    const target = String(url);

    if (target.includes("/api/auth/me")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            user: isAdminToken
              ? adminUser
              : { id: 9, name: "ELAKKIYA K", email: "user@example.com", role: "user" },
          }),
      });
    }

    if (/-analysis$/.test(target) || target.includes("hourly-analysis")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AdminAuthProvider>
          <App />
        </AdminAuthProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mockFetch();
});

test("/admin redirects to the admin login when nobody signed in", async () => {
  renderAt("/admin");

  expect(await screen.findByText("Admin Access")).toBeInTheDocument();
});

test("a normal user session does not unlock /admin", async () => {
  window.localStorage.setItem(
    "upi_safeguard.session",
    JSON.stringify({ name: "ELAKKIYA K", role: "user" })
  );
  window.localStorage.setItem("upi_safeguard.token", "user-token");

  renderAt("/admin");

  expect(await screen.findByText("Admin Access")).toBeInTheDocument();
});

test("an admin session opens the dashboard as Admin / Administrator", async () => {
  setAdminSession(adminUser, "admin-token");

  renderAt("/admin");

  expect((await screen.findAllByText("Admin Dashboard")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  expect(screen.getByText("Administrator")).toBeInTheDocument();
});

test("an already signed in admin skips the admin login page", async () => {
  setAdminSession(adminUser, "admin-token");

  renderAt("/admin/login");

  expect((await screen.findAllByText("Admin Dashboard")).length).toBeGreaterThan(0);
});

test("the admin session is stored under its own keys", async () => {
  window.localStorage.setItem(
    "upi_safeguard.session",
    JSON.stringify({ name: "ELAKKIYA K", role: "user" })
  );
  window.localStorage.setItem("upi_safeguard.token", "user-token");

  setAdminSession(adminUser, "admin-token");

  expect(window.localStorage.getItem("upi_safeguard.admin.token")).toBe("admin-token");
  expect(window.localStorage.getItem("upi_safeguard.token")).toBe("user-token");

  clearAdminSession();

  expect(window.localStorage.getItem("upi_safeguard.admin.session")).toBeNull();
  expect(window.localStorage.getItem("upi_safeguard.session")).not.toBeNull();
  expect(window.localStorage.getItem("upi_safeguard.token")).toBe("user-token");
});

test("the user login page offers no admin entry", async () => {
  renderAt("/login");

  expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  expect(screen.queryByText("Admin Access")).toBeNull();
  expect(screen.queryByText("Admin Dashboard")).toBeNull();
});

test("a signed in normal user sees no admin option anywhere", async () => {
  window.localStorage.setItem(
    "upi_safeguard.session",
    JSON.stringify({ name: "ELAKKIYA K", role: "user" })
  );
  window.localStorage.setItem("upi_safeguard.token", "user-token");

  renderAt("/dashboard");

  expect(await screen.findByText("Check Transaction Risk")).toBeInTheDocument();
  expect(screen.queryByText("Admin Dashboard")).toBeNull();
  expect(screen.queryByText("Admin Access")).toBeNull();
});

test("the user sidebar keeps every link except the admin one", () => {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Sidebar
          user={{ name: "ELAKKIYA K", role: "user" }}
          open
          onClose={() => {}}
        />
      </AuthProvider>
    </MemoryRouter>
  );

  expect(screen.getByText("Anomaly Detection")).toBeInTheDocument();
  expect(screen.getByText("Failure Spike Warnings")).toBeInTheDocument();
  expect(screen.queryByText("Admin Dashboard")).toBeNull();
});

test("the admin sidebar shows only the Admin Dashboard link", () => {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Sidebar
          user={{ name: "Admin", role: "admin" }}
          open
          onClose={() => {}}
          adminView
        />
      </AuthProvider>
    </MemoryRouter>
  );

  expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
  expect(screen.queryByText("Dashboard")).toBeNull();
  expect(screen.queryByText("Check Transaction Risk")).toBeNull();
  expect(screen.queryByText("Dataset Analyzer")).toBeNull();
  expect(screen.queryByText("My Risk History")).toBeNull();
  expect(screen.queryByText("Anomaly Detection")).toBeNull();
  expect(screen.queryByText("Failure Spike Warnings")).toBeNull();
});

test("the landing page footer has no admin link", () => {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );

  expect(screen.getByText("Transaction History")).toBeInTheDocument();
  expect(screen.queryByText("Admin Dashboard")).toBeNull();
});

test("a protected user page bounces to the user login without a session", async () => {
  renderAt("/dashboard");

  expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  expect(screen.queryByText("Total Transactions")).toBeNull();
  expect(screen.queryByText("Check Transaction Risk")).toBeNull();
});

test("every user feature page requires a session", async () => {
  const first = renderAt("/risk-check");
  expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  first.unmount();

  const second = renderAt("/my-risk-history");
  expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  second.unmount();

  const third = renderAt("/anomaly-detection");
  expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  third.unmount();
});

test("the signed in user's name shows once and no admin info appears", async () => {
  window.localStorage.setItem(
    "upi_safeguard.session",
    JSON.stringify({ name: "ELAKKIYA K", role: "user" })
  );
  window.localStorage.setItem("upi_safeguard.token", "user-token");

  renderAt("/dashboard");

  expect(await screen.findByText("Check Transaction Risk")).toBeInTheDocument();
  expect(screen.getAllByText("ELAKKIYA K")).toHaveLength(1);
  expect(screen.getByText("Regular User")).toBeInTheDocument();
  expect(screen.queryByText("Administrator")).toBeNull();
  expect(screen.queryByText("Admin Dashboard")).toBeNull();
});

test("admin pages show only the Admin profile", async () => {
  window.localStorage.setItem(
    "upi_safeguard.session",
    JSON.stringify({ name: "ELAKKIYA K", role: "user" })
  );
  window.localStorage.setItem("upi_safeguard.token", "user-token");
  setAdminSession(adminUser, "admin-token");

  renderAt("/admin");

  expect((await screen.findAllByText("Admin Dashboard")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  expect(screen.getByText("Administrator")).toBeInTheDocument();
  expect(screen.queryByText("ELAKKIYA K")).toBeNull();
  expect(screen.queryByText("Regular User")).toBeNull();
});

test("the admin dashboard exposes no user pages or features", async () => {
  setAdminSession(adminUser, "admin-token");

  renderAt("/admin");

  expect((await screen.findAllByText("Admin Dashboard")).length).toBeGreaterThan(0);
  expect(screen.queryByText("Check Transaction Risk")).toBeNull();
  expect(screen.queryByText("Dataset Analyzer")).toBeNull();
  expect(screen.queryByText("My Risk History")).toBeNull();
  expect(screen.queryByText("Smart Retry Predictor")).toBeNull();
  expect(screen.queryByText("Transaction History")).toBeNull();
  expect(screen.queryByText("Recovery Tracking")).toBeNull();
  expect(screen.queryByText("Failure Spike Warnings")).toBeNull();
  expect(screen.queryByText("Bank Pair Analysis")).toBeNull();
  expect(screen.queryByText("Anomaly Detection")).toBeNull();
});
