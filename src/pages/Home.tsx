import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Trash2, MessageSquare, Plus, Menu, X, Sparkles } from "lucide-react";

const MODEL_TAG = "llama-3.3-70b · Groq";

const PROMPTS = [
  "Explain something complex in simple words",
  "Help me write a short, punchy bio",
  "What should I know about learning to code?",
  "Give me a creative name for my project",
];

interface Msg {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const seed = i * 137.508;
  return {
    size: ((seed % 3) + 1.5).toFixed(1),
    left: ((seed * 1.618) % 100).toFixed(1),
    delay: (-(seed % 12)).toFixed(1),
    duration: ((seed % 6) + 7).toFixed(1),
  };
});

export function Home() {
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lumina_v1_history");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [userName, setUserName] = useState(() => {
    return (typeof window !== "undefined") ? localStorage.getItem("lumina_v1_user") || "" : "";
  });

  const [userInterests, setUserInterests] = useState(() => {
    return (typeof window !== "undefined") ? localStorage.getItem("lumina_v1_interests") || "" : "";
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    localStorage.setItem("lumina_v1_history", JSON.stringify(msgs));
    localStorage.setItem("lumina_v1_user", userName);
    localStorage.setItem("lumina_v1_interests", userInterests);
  }, [msgs, userName, userInterests]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const clearChat = () => {
    if (window.confirm("Start a new chat?")) {
      setMsgs([]);
      localStorage.removeItem("lumina_v1_history");
    }
  };

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;

    const userMsg: Msg = { role: "user", content: t };
    const nextMsgs = [...msgs, userMsg];
    setMsgs(nextMsgs);
    setInput("");
    setLoading(true);
    setError(null);

    const assistantIdx = nextMsgs.length;
    setMsgs(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: nextMsgs.slice(-10),
          userName,
          userInterests
        }),
        signal: ctrl.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      if (!reader) throw new Error("Connection failed.");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; 
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              accumulated += parsed.text;
              setMsgs(prev => {
                const updated = [...prev];
                updated[assistantIdx] = { role: "assistant", content: accumulated, streaming: true };
                return updated;
              });
            }
          } catch { }
        }
      }
      setMsgs(prev => {
        const updated = [...prev];
        if (updated[assistantIdx]) updated[assistantIdx].streaming = false;
        return updated;
      });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setError("AI link severed.");
    } finally {
      setLoading(false);
    }
  }, [msgs, loading, userName, userInterests]);

  return (
    <div className="app-container">
      {/* ── Dreamy Background Layer ── */}
      <div className="bg-scene" aria-hidden>
        <div className="bg-aurora" />
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="particle-field">
            {PARTICLES.map((p, i) => (
              <div key={i} className="particle" style={{
                width: `${p.size}px`, height: `${p.size}px`,
                left: `${p.left}%`, bottom: "-10px",
                animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
              }} />
            ))}
        </div>
      </div>

      {/* ── Frosted Sidebar ── */}
      <aside className={`sidebar-dream ${isSidebarOpen ? "open" : "closed"}`}>
        <button className="new-chat-btn-dream" onClick={clearChat}>
          <Plus size={18} />
          <span>New Chat</span>
        </button>
        
        <div className="sidebar-section">
          <p className="sidebar-label">Recent Conversations</p>
          <div className="history-item-dream active">
            <Sparkles size={14} className="cyan-glow-text" />
            <span>Current Vision</span>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-profile-mini">
            <div className="avatar-dream">{userName?.charAt(0) || "U"}</div>
            <div className="user-info">
              <p className="u-name">{userName || "Dreamer"}</p>
              <p className="u-status">Lumina Oracle</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Chat Area ── */}
      <main className="main-content-dream">
        <header className="dream-header">
          <button className="menu-toggle-dream" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="logo-section">
            <div className="chat-header-orb"><div className="chat-header-orb-inner" /></div>
            <span className="lumina-logo-text">Lumina</span>
          </div>
          <div className="model-badge-dream">{MODEL_TAG}</div>
        </header>

        <div className="chat-viewport">
          {msgs.length === 0 ? (
            <div className="dream-welcome">
              <h1 className="hero-text-dream">Hello, {userName || "friend"}</h1>
              <p className="hero-sub">What shall we create in the ether today?</p>
              <div className="hero-grid">
                {PROMPTS.map((p, i) => (
                  <button key={i} className="hero-card-dream" onClick={() => send(p)}>
                    <p>{p}</p>
                    <Plus size={14} className="card-icon" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-list-dream">
              {msgs.map((m, i) => (
                <div key={i} className={`gemini-row-dream ${m.role}`}>
                  <div className={`avatar-circle-dream ${m.role}`}>
                    {m.role === "user" ? (userName?.charAt(0) || "U") : <Sparkles size={16} />}
                  </div>
                  <div className="gemini-content">
                    <p className="sender-name-dream">{m.role === "user" ? "You" : "Lumina"}</p>
                    <div className="text-body-dream">{m.content}</div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="dream-input-container">
          <div className="dream-input-wrapper">
            <input
              ref={inputRef}
              className="dream-input"
              placeholder="Ask Lumina anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
            />
            <button className="dream-send" onClick={() => send(input)} disabled={!input.trim() || loading}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
          <p className="footer-disclaimer-dream">Lumina's visions may be imperfect. Verify the essence.</p>
        </div>
      </main>
    </div>
  );
}
