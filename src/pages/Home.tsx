import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Trash2, Plus, Menu, X, Sparkles, Settings } from "lucide-react";

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

interface ChatSession {
  id: string;
  title: string;
  msgs: Msg[];
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
  // ─── NEW: Welcome Screen State ───
  const [screen, setScreen] = useState<"welcome" | "chat">(() => {
    if (typeof window !== "undefined") {
      const savedHistory = localStorage.getItem("lumina_history");
      const savedMsgs = localStorage.getItem("lumina_v1_history");
      // Skip welcome screen ONLY if they have past conversations
      if ((savedHistory && JSON.parse(savedHistory).length > 0) || (savedMsgs && JSON.parse(savedMsgs).length > 0)) {
        return "chat";
      }
    }
    return "welcome";
  });

  // ─── MEMORY & HISTORY STATES ───
  const [history, setHistory] = useState<ChatSession[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lumina_history");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [activeId, setActiveId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lumina_active_id") || Date.now().toString();
    }
    return Date.now().toString();
  });

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

  // ─── MOBILE FIX: Close sidebar by default on phones ───
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth > 768; 
    }
    return true;
  });

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    localStorage.setItem("lumina_v1_history", JSON.stringify(msgs));
    localStorage.setItem("lumina_history", JSON.stringify(history));
    localStorage.setItem("lumina_active_id", activeId);
    localStorage.setItem("lumina_v1_user", userName);
    localStorage.setItem("lumina_v1_interests", userInterests);
  }, [msgs, history, activeId, userName, userInterests]);

  useEffect(() => {
    if (msgs.length > 0) {
      setHistory(prev => {
        const existingIdx = prev.findIndex(h => h.id === activeId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], msgs };
          return updated;
        } else {
          const title = msgs[0].content.slice(0, 28) + (msgs[0].content.length > 28 ? "..." : "");
          return [{ id: activeId, title, msgs }, ...prev];
        }
      });
    }
  }, [msgs, activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const startNewChat = () => {
    setActiveId(Date.now().toString());
    setMsgs([]);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const loadChat = (id: string) => {
    const chat = history.find(h => h.id === id);
    if (chat) {
      setActiveId(id);
      setMsgs(chat.msgs);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    }
  };

  const deleteCurrentChat = () => {
    if (window.confirm("Delete this specific conversation?")) {
      setHistory(prev => prev.filter(h => h.id !== activeId));
      setMsgs([]);
      setActiveId(Date.now().toString());
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

    const apiMessages = nextMsgs.slice(-10).map(m => ({ 
      role: m.role, 
      content: m.content 
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: apiMessages,
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
      {/* ── BACKGROUND (Always Visible) ── */}
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

      {/* ── CONDITION 1: WELCOME SCREEN ── */}
      {screen === "welcome" ? (
        <div className="welcome-screen screen-enter" style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
          <div className="logo-orb"><div className="logo-orb-inner" /></div>
          <h1 className="welcome-title">Meet Lumina</h1>
          <p className="welcome-sub">
            An AI that actually gets you. Ask it anything — it writes, thinks,
            explains, and creates alongside you.
          </p>
          <button className="start-btn" onClick={() => setScreen("chat")}>
            <span>Start chatting</span>
            <Sparkles size={16} />
          </button>
        </div>
      ) : (
        /* ── CONDITION 2: MAIN DASHBOARD ── */
        <>
          <aside className={`sidebar-dream ${isSidebarOpen ? "open" : "closed"}`}>
            <button className="new-chat-btn-dream" onClick={startNewChat}>
              <Plus size={18} />
              <span>New Chat</span>
            </button>
            
            <div className="sidebar-section">
              <p className="sidebar-label">Recent Conversations</p>
              {history.length === 0 && (
                <div className="history-empty">No past visions yet.</div>
              )}
              {history.map(chat => (
                <div 
                  key={chat.id} 
                  className={`history-item-dream ${activeId === chat.id ? "active" : ""}`}
                  onClick={() => loadChat(chat.id)}
                >
                  <Sparkles size={14} className={activeId === chat.id ? "cyan-glow-text" : ""} />
                  <span className="history-text">{chat.title}</span>
                </div>
              ))}
            </div>

            <div className="sidebar-footer clickable-footer" onClick={() => setIsProfileOpen(true)}>
              <div className="user-profile-mini">
                <div className="avatar-dream">{userName?.charAt(0) || "U"}</div>
                <div className="user-info">
                  <p className="u-name">{userName || "Dreamer"}</p>
                  <p className="u-status">Lumina Oracle</p>
                </div>
                <Settings size={18} className="settings-icon" />
              </div>
            </div>
          </aside>

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
              <button className="icon-btn-clear" onClick={deleteCurrentChat} title="Delete this chat">
                <Trash2 size={16} />
              </button>
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
        </>
      )}

      {/* ── SETTINGS MODAL OVERLAY ── */}
      {isProfileOpen && (
        <div className="profile-overlay" onClick={() => setIsProfileOpen(false)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Identity Matrix</h2>
              <button onClick={() => setIsProfileOpen(false)} className="close-modal"><X size={20} /></button>
            </div>
            <p className="modal-sub">Tune Lumina's perception of you.</p>
            
            <div className="modal-inputs">
              <div className="input-group">
                <label>Known As</label>
                <input 
                  type="text" 
                  value={userName} 
                  onChange={e => setUserName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="input-group">
                <label>Current Fascinations</label>
                <input 
                  type="text" 
                  value={userInterests} 
                  onChange={e => setUserInterests(e.target.value)}
                  placeholder="e.g. Space, Philosophy, Coding"
                />
              </div>
            </div>

            <button className="save-modal-btn" onClick={() => setIsProfileOpen(false)}>
              Synchronize
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
