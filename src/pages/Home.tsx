import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Trash2 } from "lucide-react";

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
  // --- 1. STATE & STORAGE ---
  const [screen, setScreen] = useState<"welcome" | "chat">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lumina_chat_history");
      return (saved && JSON.parse(saved).length > 0) ? "chat" : "welcome";
    }
    return "welcome";
  });

  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lumina_chat_history");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // User Profile States
  const [userName, setUserName] = useState(() => {
    return (typeof window !== "undefined") ? localStorage.getItem("lumina_user_name") || "" : "";
  });
  const [userInterests, setUserInterests] = useState(() => {
    return (typeof window !== "undefined") ? localStorage.getItem("lumina_user_interests") || "" : "";
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // --- 2. EFFECTS (PERSISTENCE) ---
  useEffect(() => {
    localStorage.setItem("lumina_chat_history", JSON.stringify(msgs));
  }, [msgs]);

  useEffect(() => {
    localStorage.setItem("lumina_user_name", userName);
    localStorage.setItem("lumina_user_interests", userInterests);
  }, [userName, userInterests]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    if (screen === "chat") {
      const t = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    }
  }, [screen]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // --- 3. CORE LOGIC ---
  const clearChat = () => {
    if (window.confirm("Delete all messages? This cannot be undone.")) {
      setMsgs([]);
      localStorage.removeItem("lumina_chat_history");
      setScreen("welcome");
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
          userName: userName,
          userInterests: userInterests
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      if (!reader) throw new Error("No response stream.");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; 

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") break;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              accumulated += parsed.text;
              setMsgs(prev => {
                const updated = [...prev];
                updated[assistantIdx] = { 
                  role: "assistant", 
                  content: accumulated, 
                  streaming: true 
                };
                return updated;
              });
            }
          } catch { /* Wait for more data in buffer */ }
        }
      }

      setMsgs(prev => {
        const updated = [...prev];
        if (updated[assistantIdx]) {
          updated[assistantIdx] = { role: "assistant", content: accumulated };
        }
        return updated;
      });
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMsgs(prev => prev.filter((_, i) => i !== assistantIdx));
    } finally {
      setLoading(false);
    }
  }, [msgs, loading, userName, userInterests]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <>
      <div className="bg-scene" aria-hidden>
        <div className="bg-aurora" />
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
      </div>

      {screen === "welcome" && (
        <div className="welcome-screen screen-enter">
          <div className="particle-field" aria-hidden>
            {PARTICLES.map((p, i) => (
              <div key={i} className="particle" style={{
                width: `${p.size}px`, height: `${p.size}px`,
                left: `${p.left}%`, bottom: "-10px",
                animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
              }} />
            ))}
          </div>

          <div className="logo-orb">
            <div className="logo-orb-inner" />
          </div>

          <h1 className="welcome-title">Meet Lumina</h1>
          
          <div className="welcome-profile-setup">
            <input 
              type="text" 
              placeholder="What should I call you?" 
              className="setup-input"
              value={userName}
              onChange={e => setUserName(e.target.value)}
            />
            <input 
              type="text" 
              placeholder="What are you into? (e.g. Coding, Space)" 
              className="setup-input"
              value={userInterests}
              onChange={e => setUserInterests(e.target.value)}
            />
          </div>

          <button className="start-btn" onClick={() => setScreen("chat")}>
            <span>Start chatting</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {screen === "chat" && (
        <div className="chat-screen screen-enter">
          <div className="chat-header">
            <div className="header-left">
               <div className="chat-header-orb"><div className="chat-header-orb-inner" /></div>
               <span className="chat-header-name">Lumina AI</span>
               <span className="model-tag">{MODEL_TAG}</span>
            </div>
            <button className="icon-btn" onClick={clearChat} title="Clear Chat">
              <Trash2 size={18} />
            </button>
          </div>

          <div className="chat-messages">
            {msgs.length === 0 && !loading && (
              <div className="chat-empty">
                <p className="chat-empty-title">Welcome back{userName ? `, ${userName}` : ""}</p>
                <div className="prompt-chips">
                  {PROMPTS.map((p, i) => (
                    <button key={i} className="prompt-chip" onClick={() => send(p)}>{p}</button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={`msg-row ${m.role}`}>
                <div className={`msg-bubble ${m.role}${m.streaming ? " streaming" : ""}`}>
                  {m.role === "assistant" && (
                    <div className="msg-label"><span className="msg-label-dot" />Lumina</div>
                  )}
                  {m.content}
                  {m.streaming && m.content && <span className="stream-cursor" />}
                </div>
              </div>
            ))}

            {loading && msgs[msgs.length - 1]?.content === "" && (
              <div className="msg-row assistant">
                <div className="typing-bubble">
                  <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                </div>
              </div>
            )}

            {error && <div className="chat-error">{error}</div>}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-area">
            <div className="input-wrap">
              <input
                ref={inputRef}
                type="text"
                className="chat-input"
                placeholder="Message Lumina..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                disabled={loading}
              />
              <button className="send-btn" onClick={() => send(input)} disabled={!input.trim() || loading}>
                {loading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
