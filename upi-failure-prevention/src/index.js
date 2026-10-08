import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/pages.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { AuthProvider } from "./context/AuthContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AdminAuthProvider>
          <App />
        </AdminAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();