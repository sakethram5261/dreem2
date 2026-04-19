import { Switch, Route } from "wouter";
import { Home } from "./pages/Home";
import { Constellation } from "./pages/Constellation";

function NotFound() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100dvh", flexDirection: "column", gap: "1rem",
      background: "hsl(220,40%,4%)", color: "white"
    }}>
      <h1 style={{ fontSize: "3rem", fontWeight: 700, color: "hsl(180,100%,50%)" }}>404</h1>
      <p style={{ color: "hsla(210,40%,98%,0.5)" }}>Page not found</p>
      <a href="/" style={{ color: "hsl(180,100%,50%)", fontSize: "0.9rem" }}>Go home</a>
    </div>
  );
}

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/constellation" component={Constellation} />
      <Route component={NotFound} />
    </Switch>
  );
}
