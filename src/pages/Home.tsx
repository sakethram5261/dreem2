import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";

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
  const [screen, setScreen] = useState<"welcome" | "chat">("welcome");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        body: JSON.stringify({ messages: nextMsgs }),
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
          } catch { /* wait for buffer */ }
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
  }, [msgs, loading]);

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
          <p className="welcome-sub">
            An AI that actually gets you. Ask it anything — it writes, thinks,
            explains, and creates alongside you.
          </p>

          <button className="start-btn" onClick={() => setScreen("chat")}>
            <span>Start chatting</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {screen === "chat" && (
        <div className="chat-screen screen-enter">
          <div className="chat-header">
            <div className="chat-header-orb">
              <div className="chat-header-orb-inner" />
            </div>
            <span className="chat-header-name">Lumina AI</span>
            <span className="model-tag">{MODEL_TAG}</span>
          </div>

          <div className="chat-messages">
            {msgs.length === 0 && !loading && (
              <div className="chat-empty">
                <p className="chat-empty-title">What's on your mind?</p>
                <p className="chat-empty-sub">Pick a starter or write your own</p>
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
                    <div className="msg-label">
                      <span className="msg-label-dot" />
                      Lumina
                    </div>
                  )}
                  {m.content}
                  {m.streaming && m.content && <span className="stream-cursor" aria-hidden />}
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
                placeholder="Say something..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                disabled={loading}
                maxLength={4000}
                autoComplete="off"
              />
              <button
                className="send-btn"
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                aria-label="Send message"
              >
                {loading
                  ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  : <Send size={16} />
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
