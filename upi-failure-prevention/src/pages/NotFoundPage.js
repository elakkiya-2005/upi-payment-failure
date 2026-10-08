import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import Button from "../components/Button";

export default function NotFoundPage() {
  return (
    <div className="auth-page">
      <div style={{ textAlign: "center" }}>
        <div
          className="brand-logo"
          style={{ width: 64, height: 64, margin: "0 auto 18px", borderRadius: 18 }}
        >
          <Compass size={32} />
        </div>
        <h1 style={{ fontSize: "2.4rem" }}>404</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          The page you are looking for does not exist.
        </p>
        <Link to="/">
          <Button>Back to Home</Button>
        </Link>
      </div>
    </div>
  );
}