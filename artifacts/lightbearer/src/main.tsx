import { setBaseUrl } from "@workspace/api-client-react";
import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App";
import "./index.css";

const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) setBaseUrl(apiBase);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100dvh",
          background: "#0d0f14",
          color: "#f0f2f5",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
          padding: "24px",
          textAlign: "center",
          gap: "16px",
        }}>
          <div style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: "0.2em", background: "linear-gradient(180deg,#f59e0b,#d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            THE LIGHTBEARER
          </div>
          <div style={{ color: "#ef4444", fontWeight: 600 }}>Something went wrong</div>
          <div style={{ color: "#9ca3af", fontSize: "0.875rem", maxWidth: "400px" }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: "8px", padding: "10px 24px", background: "#f59e0b", color: "#000", border: "none", borderRadius: "6px", fontWeight: 700, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
