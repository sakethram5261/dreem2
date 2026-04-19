import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Menu, Plus, Sparkles, Mic, MicOff, ImagePlus, X, Volume2, VolumeX, Star } from "lucide-react";
import { Link } from "wouter";
// ─── CLERK & FIREBASE IMPORTS ───
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";

const MODEL_TAG = "llama-3.3-70b · Groq";

const PROMPTS = [
  "I've been feeling a bit overwhelmed lately...",
  "How can I practice more self-compassion today?",
  "I need help processing a difficult conversation.",
  "Can we do a quick grounding exercise?",
];

interface Msg {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  displayText?: string; // for messages with images, the text part to show
  imagePreview?: string; // base64 preview URL
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

  // ─── VOICE STATE ───
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ─── IMAGE STATE ───
  const [pendingImage, setPendingImage] = useState<string | null>(null); // base64
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          const data = userSnap.data();
          setCredits(data.credits);
        } else {
          await setDoc(userRef, {
            email: user.primaryEmailAddress?.emailAddress,
            credits: 10,
            createdAt: new Date(),
          });
          setCredits(10);
        }

        setScreen("chat");
        setMsgs([]);
      } catch (error) {
        console.error("Firebase Sync Error:", error);
      }
    };

    syncUser();
  }, [user]);

  // ─── 2. LOCAL HISTORY ───
  useEffect(() => {
    const saved = localStorage.getItem("lumina_history");
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("lumina_history", JSON.stringify(history));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, msgs]);

  // ─── 3. TTS: Speak Lumina's response ───
  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.95;
    utt.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes("Samantha") || v.name.includes("Google UK English Female") || v.name.includes("Karen")
    );
    if (preferred) utt.voice = preferred;
    window.speechSynthesis.speak(utt);
  }, [ttsEnabled]);

  // ─── 4. VOICE RECORDING ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsTranscribing(true);

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");

        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: formData });
          const data = await res.json();
          if (data.text) {
            setInput(data.text);
          }
        } catch (err) {
          console.error("Transcription error:", err);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access denied. Please allow mic permissions.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // ─── 5. IMAGE HANDLING ───
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ─── 6. SEND FUNCTION ───
  // ─── 6. SEND FUNCTION ───
  const send = useCallback(async (text: string, imageBase64?: string) => {
    const t = text.trim();
    if ((!t && !imageBase64) || loading) return;

    if (credits !== null && credits <= 0) {
      alert("Your cosmic energy is depleted. Upgrade for more visions.");
      return;
    }

    let userMsgContent: Msg["content"];
    let displayText = t;

    if (imageBase64) {
      userMsgContent = [
        ...(t ? [{ type: "text", text: t }] : []),
        { type: "image_url", image_url: { url: imageBase64 } },
      ];
    } else {
      userMsgContent = t;
    }

    const userMsg: Msg = { role: "user", content: userMsgContent, displayText, imagePreview: imageBase64 };

    const nextMsgs = [...msgs, userMsg];
    setMsgs(nextMsgs);
    setInput("");
    setPendingImage(null); 
    setLoading(true);

    let accumulated = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMsgs.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          })),
          userName: user?.firstName || "Dreamer",
          hasImage: !!imageBase64,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        setMsgs(prev => [...prev, { role: "assistant", content: "", streaming: true }]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            const jsonString = trimmed.replace(/^data:\s*/, "");

try {
  const parsed = JSON.parse(jsonString);
  const content = parsed.choices[0]?.delta?.content || "";
  
  if (content) {
    // Instead of adding the whole chunk at once, we loop through every letter
    for (let i = 0; i < content.length; i++) {
      accumulated += content[i];
      
      setMsgs(prev => {
        const updated = [...prev];
        if (updated[updated.length - 1]) {
          updated[updated.length - 1] = { 
            ...updated[updated.length - 1], 
            content: accumulated 
          };
        }
        return updated;
      });

      // ⏱️ The Speed Limit: 30ms per character
      // Adjust this number higher (e.g., 50) for a slower, more "zen" feel
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
} catch (e) { continue; }
          }
        }
      }

      setHistory(prev => {
        const existingIdx = prev.findIndex(h => h.id === activeId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx].msgs = [...nextMsgs, { role: "assistant", content: accumulated }];
          return updated;
        }
        return prev;
      });

    } catch (err: any) {
      console.error("Lumina Error:", err);
    } finally {
      setLoading(false);
      setMsgs(prev => {
        const updated = [...prev];
        if (updated[updated.length - 1]) updated[updated.length - 1].streaming = false;
        return updated;
      });
    }
  }, [msgs, loading, user, credits, activeId, speak]);

  const handleSend = () => send(input, pendingImage || undefined);

  const getMsgText = (msg: Msg): string => {
    if (msg.displayText !== undefined) return msg.displayText;
    if (typeof msg.content === "string") return msg.content;
    const textPart = (msg.content as any[]).find(p => p.type === "text");
    return textPart?.text || "";
  };

  return (
    <div className="app-container">
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
        <div className="welcome-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', textAlign: 'center', position: 'relative', zIndex: 10 }}>
          <div className="logo-orb"><div className="logo-orb-inner"></div></div>
          <h1 className="welcome-title">Lumina</h1>
          <p className="welcome-sub" style={{ margin: '0 auto 2rem auto' }}>Your personal cosmic oracle. Start a vision to begin.</p>
          <button className="start-btn" onClick={() => setScreen("chat")}>Start Chatting <Sparkles size={18} /></button>
        </div>
      ) : (
        <>
          <aside className={`sidebar-dream ${isSidebarOpen ? "open" : "closed"}`}>
            <div className="mobile-sidebar-header">
              <span className="sidebar-label">Menu</span>
              <button className="close-sidebar-btn" onClick={() => setIsSidebarOpen(false)}><Menu size={20} /></button>
            </div>
            <button className="new-chat-btn-dream" onClick={() => { setMsgs([]); setActiveId(Date.now().toString()); if (window.innerWidth <= 768) setIsSidebarOpen(false); }}>
              <Plus size={18} /> New Chat
            </button>
            <Link href="/constellation" className="sidebar-link">Explore the stars</Link>
            <div className="sidebar-section">
              <p className="sidebar-label">Recent Conversations</p>
              {history.length === 0 && <div className="history-empty">No past visions yet.</div>}
              {history.map(chat => (
                <div key={chat.id} className={`history-item-dream ${activeId === chat.id ? "active" : ""}`} onClick={() => { setActiveId(chat.id); setMsgs(chat.msgs); if (window.innerWidth <= 768) setIsSidebarOpen(false); }}>
                  <Sparkles size={14} className={activeId === chat.id ? "cyan-glow-text" : ""} />
                  <span className="history-text">{chat.title}</span>
                </div>
              ))}
            </div>
            <div className="sidebar-footer">
              <SignedOut><SignInButton mode="modal"><button className="new-chat-btn-dream" style={{ width: '100%', justifyContent: 'center' }}>Sign In</button></SignInButton></SignedOut>
              <SignedIn>
                <div className="user-profile-mini">
                  <UserButton afterSignOutUrl="/" />
                  <div className="user-info">
                    <p className="u-name">{user?.firstName || "Dreamer"}</p>
                    <p className="u-status" style={{ color: credits !== null && credits < 3 ? '#ff4b2b' : '#00f2fe' }}>{credits ?? 0} Visions Left</p>
                  </div>
                </div>
              </SignedIn>
            </div>
          </aside>

          {isSidebarOpen && typeof window !== "undefined" && window.innerWidth <= 768 && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />}

          <main className="main-content-dream">
            <header className="chat-header">
              <button className="menu-toggle-dream" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><Menu /></button>
              <div className="chat-header-orb"><div className="chat-header-orb-inner"></div></div>
              <span className="chat-header-name">Lumina AI</span>
              <div className="model-tag">{MODEL_TAG}</div>
              <button onClick={() => { window.speechSynthesis?.cancel(); setTtsEnabled(p => !p); }} title={ttsEnabled ? "Mute Lumina's voice" : "Unmute Lumina's voice"} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: ttsEnabled ? '#00f2fe' : '#666', padding: '4px 8px' }}>
                {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </header>

            <div className="chat-messages">
              {msgs.length === 0 ? (
                <div className="chat-empty">
                  <h2 className="chat-empty-title">Hello, {user?.firstName || "Dreamer"}</h2>
                  <p className="chat-empty-sub">How can I assist your vision today?</p>
                  <div className="prompt-chips">{PROMPTS.map((p, i) => <button key={i} className="prompt-chip" onClick={() => send(p)}>{p}</button>)}</div>
                </div>
              ) : (
                msgs.map((m, i) => (
                  <div key={i} className={`msg-row ${m.role}`}>
                    <div className={`msg-bubble ${m.role} ${m.streaming ? 'streaming' : ''}`}>
                      <div className="msg-label"><div className="msg-label-dot"></div>{m.role === 'user' ? 'YOU' : 'LUMINA'}</div>
                      {m.imagePreview && <img src={m.imagePreview} alt="shared" style={{ maxWidth: '220px', borderRadius: '10px', marginBottom: '8px', display: 'block' }} />}
                      
                      {/* 🎨 ANIMATED THINKING & TYPING CURSOR */}
                      {m.streaming && !m.content ? (
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', height: '20px', paddingLeft: '4px' }}>
                          <span className="w-2 h-2 bg-[#00f2fe] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-[#00f2fe] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-[#00f2fe] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                      ) : (
                        <p style={{ display: 'inline', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
  {getMsgText(m)}
  {m.streaming && (
    <span className="cursor-blink">|</span>
  )}
</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-area">
              {pendingImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px' }}>
                  <img src={pendingImage} alt="pending" style={{ height: '48px', borderRadius: '8px', border: '1px solid #00f2fe44' }} />
                  <button onClick={() => setPendingImage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><X size={16} /></button>
                </div>
              )}

              <div className="input-wrap">
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
                <button className="voice-btn" onClick={() => fileInputRef.current?.click()} title="Attach image" disabled={loading} style={{ color: pendingImage ? '#00f2fe' : undefined }}><ImagePlus size={18} /></button>
                <button className={`voice-btn ${isRecording ? 'recording' : ''}`} onClick={isRecording ? stopRecording : startRecording} disabled={loading || isTranscribing} title={isRecording ? "Stop recording" : "Speak to Lumina"}>
                  {isTranscribing ? <Loader2 size={18} className="animate-spin" /> : isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <input className="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder={isRecording ? "Listening..." : isTranscribing ? "Transcribing..." : "Ask Lumina..."} />
                <button className="send-btn" onClick={handleSend} disabled={loading || (!input.trim() && !pendingImage)}>
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
