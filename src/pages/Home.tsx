import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Menu, Plus, Sparkles } from "lucide-react";
// ─── CLERK & FIREBASE IMPORTS ───
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import { db } from "../firebase"; // Double check this path matches your folder
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";

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
  const { user } = useUser();
  const [credits, setCredits] = useState<number | null>(null);
  const [screen, setScreen] = useState<"welcome" | "chat">(() => {
    if (typeof window !== "undefined" && localStorage.getItem("lumina_history")) return "chat";
    return "welcome";
  });

  const [history, setHistory] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>(() => Date.now().toString());
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(typeof window !== "undefined" ? window.innerWidth > 768 : true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── 1. SYNC FIREBASE CREDITS ───
useEffect(() => {
    if (!user) return;

    const syncUser = async () => {
      try {
        const userRef = doc(db, "users", user.id);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          // 1. Get existing credits from Firebase
          const data = userSnap.data();
          setCredits(data.credits);
        } else {
          // 2. New User: Create them in Firebase with 10 credits
          await setDoc(userRef, {
            email: user.primaryEmailAddress?.emailAddress,
            credits: 10,
            createdAt: new Date(),
          });
          setCredits(10);
        }
        
        // 3. AUTO-SKIP: Jump to chat screen once synced
        setScreen("chat");
        
        // 4. CLEAN START: Clear messages so you see the "Hello" screen
        setMsgs([]); 

      } catch (error) {
        console.error("Firebase Sync Error:", error);
      }
    };

    syncUser();
  }, [user]);
  // ─── 2. LOCAL HISTORY LOGIC ───
  useEffect(() => {
    const saved = localStorage.getItem("lumina_history");
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("lumina_history", JSON.stringify(history));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, msgs]);

  // ─── 3. SEND FUNCTION (With Credit Deduction) ───
  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;

    if (credits !== null && credits <= 0) {
      alert("Your cosmic energy is depleted. Upgrade for more visions.");
      return;
    }

    const userMsg: Msg = { role: "user", content: t };
    const nextMsgs = [...msgs, userMsg];
    setMsgs(nextMsgs);
    setInput("");
    setLoading(true);

    const assistantIdx = nextMsgs.length;
    setMsgs(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: nextMsgs.slice(-10).map(m => ({ role: m.role, content: m.content })),
          userName: user?.firstName || "Dreamer",
        }),
        signal: ctrl.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
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
                await new Promise(r => setTimeout(r, 15));
              }
            } catch { }
          }
        }
      }

      if (user) {
        const userRef = doc(db, "users", user.id);
        await updateDoc(userRef, { credits: increment(-1) });
        setCredits(prev => (prev !== null ? prev - 1 : 0));
      }

      setMsgs(prev => {
        const updated = [...prev];
        if (updated[assistantIdx]) updated[assistantIdx].streaming = false;
        return updated;
      });

      setHistory(prev => {
        const existingIdx = prev.findIndex(h => h.id === activeId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx].msgs = [...nextMsgs, { role: "assistant", content: accumulated }];
          return updated;
        } else {
          return [{ id: activeId, title: t.slice(0, 24), msgs: [...nextMsgs, { role: "assistant", content: accumulated }] }, ...prev];
        }
      });

    } catch (e: any) {
      if (e.name !== "AbortError") console.error(e);
    } finally {
      setLoading(false);
    }
  }, [msgs, loading, user, credits, activeId]);

  return (
    <div className="app-container">
      {/* ─── FULL BACKGROUND SYSTEM ─── */}
      <div className="bg-scene" aria-hidden="true">
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <div className="bg-orb bg-orb-3"></div>
        <div className="bg-aurora"></div>
        <div className="particle-field">
          {PARTICLES.map((p, i) => (
            <div key={i} className="particle" style={{ width: `${p.size}px`, height: `${p.size}px`, left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }} />
          ))}
        </div>
      </div>

{screen === "welcome" ? (
        <div className="welcome-screen" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          textAlign: 'center',
          position: 'relative',
          zIndex: 10
        }}>
          <div className="logo-orb">
            <div className="logo-orb-inner"></div>
          </div>
          <h1 className="welcome-title">Lumina</h1>
          <p className="welcome-sub" style={{ margin: '0 auto 2rem auto' }}>
            Your personal cosmic oracle. Start a vision to begin.
          </p>
          <button className="start-btn" onClick={() => setScreen("chat")}>
            Start Chatting <Sparkles size={18} />
          </button>
        </div>
      ) : (
        <>
          {/* ─── SIDEBAR ─── */}
          <aside className={`sidebar-dream ${isSidebarOpen ? "open" : "closed"}`}>
            <button className="new-chat-btn-dream" onClick={() => { setMsgs([]); setActiveId(Date.now().toString()); }}>
              <Plus size={18} /> New Chat
            </button>
            
            <div className="sidebar-section">
              <p className="sidebar-label">Recent Conversations</p>
              {history.length === 0 && <div className="history-empty">No past visions yet.</div>}
              {history.map(chat => (
                <div key={chat.id} className={`history-item-dream ${activeId === chat.id ? "active" : ""}`} onClick={() => { setActiveId(chat.id); setMsgs(chat.msgs); }}>
                  <Sparkles size={14} className={activeId === chat.id ? "cyan-glow-text" : ""} /> 
                  <span className="history-text">{chat.title}</span>
                </div>
              ))}
            </div>

            <div className="sidebar-footer">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="new-chat-btn-dream" style={{ width: '100%', justifyContent: 'center' }}>Sign In</button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <div className="user-profile-mini">
                  <UserButton afterSignOutUrl="/" />
                  <div className="user-info">
                    <p className="u-name">{user?.firstName || "Dreamer"}</p>
                    <p className="u-status" style={{ color: credits !== null && credits < 3 ? '#ff4b2b' : '#00f2fe' }}>
                      {credits ?? 0} Visions Left
                    </p>
                  </div>
                </div>
              </SignedIn>
            </div>
          </aside>

          {/* ─── MAIN CHAT ─── */}
          <main className="main-content-dream">
            <header className="chat-header">
              <button className="menu-toggle-dream" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><Menu /></button>
              <div className="chat-header-orb"><div className="chat-header-orb-inner"></div></div>
              <span className="chat-header-name">Lumina AI</span>
              <div className="model-tag">{MODEL_TAG}</div>
            </header>

            <div className="chat-messages">
              {msgs.length === 0 ? (
                <div className="chat-empty">
                  <h2 className="chat-empty-title">Hello, {user?.firstName || "Dreamer"}</h2>
                  <p className="chat-empty-sub">How can I assist your vision today?</p>
                  <div className="prompt-chips">
                    {PROMPTS.map((p, i) => (
                      <button key={i} className="prompt-chip" onClick={() => send(p)}>{p}</button>
                    ))}
                  </div>
                </div>
              ) : (
                msgs.map((m, i) => (
                  <div key={i} className={`msg-row ${m.role}`}>
                    <div className={`msg-bubble ${m.role} ${m.streaming ? 'streaming' : ''}`}>
                      <div className="msg-label">
                        <div className="msg-label-dot"></div>
                        {m.role === 'user' ? 'YOU' : 'LUMINA'}
                      </div>
                      {m.content}
                      {m.streaming && <span className="stream-cursor"></span>}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-area">
              <div className="input-wrap">
                <input 
                  className="chat-input" 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && send(input)} 
                  placeholder="Ask Lumina..." 
                />
                <button className="send-btn" onClick={() => send(input)} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
              </div>
            </div>
          </main>
        </>
      )}
    </div>
  );
}
