import { Switch, Route } from "wouter";
import { Home } from "./pages/Home";
import { Constellation } from "./pages/Constellation";
import { ThemeProvider } from "./contexts/ThemeContext";

function NotFound() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100dvh",
      flexDirection: "column",
      gap: "1.5rem",
      background: "var(--bg-primary)",
      color: "var(--text-primary)",
      textAlign: "center",
      padding: "2rem"
    }}>
      <div style={{
        width: "80px",
        height: "80px",
        borderRadius: "50%",
        background: "var(--bg-card)",
        border: "1px solid var(--border-accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "var(--shadow-glow)"
      }}>
        <span style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent-primary)" }}>404</span>
      </div>
      <div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>Page not found</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>The page you are looking for does not exist.</p>
      </div>
      <a href="/" style={{
        color: "var(--bg-primary)",
        background: "var(--gradient-button)",
        padding: "0.75rem 1.5rem",
        borderRadius: "50px",
        fontWeight: 600,
        textDecoration: "none",
        fontSize: "0.9rem",
        boxShadow: "0 4px 16px var(--accent-glow)"
      }}>
        Return Home
      </a>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/constellation" component={Constellation} />
        <Route component={NotFound} />
      </Switch>
    </ThemeProvider>
  );
}
