import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Menu, Plus, Sparkles, Mic, MicOff, ImagePlus, X, Volume2, VolumeX, Heart, Moon, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../contexts/ThemeContext";

const MODEL_TAG = "llama-3.3-70b";

// Warm, comforting prompts that feel safe
const PROMPTS = [
  "I need a moment to breathe and feel grounded...",
  "Help me find some peace in this moment",
  "I want to talk about something on my mind",
  "Guide me through a calming exercise",
];

// Daily affirmations for a gentle start
const AFFIRMATIONS = [
  "You are exactly where you need to be.",
  "Your feelings are valid and worthy of attention.",
  "Take all the time you need. There is no rush here.",
  "You deserve moments of peace and gentleness.",
  "Every breath is a new beginning.",
];

interface Msg {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  displayText?: string;
  imagePreview?: string;
  streaming?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  msgs: Msg[];
}

// Gentle floating particles
const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const seed = i * 137.508;
  return {
    size: ((seed % 3) + 2).toFixed(1),
    left: ((seed * 1.618) % 100).toFixed(1),
    delay: (-(seed % 10)).toFixed(1),
    duration: ((seed % 8) + 12).toFixed(1),
  };
});

export function Home() {
  const { user } = useUser();
  const { theme } = useTheme();
  const [credits, setCredits] = useState<number | null>(null);
  const [showAffirmation, setShowAffirmation] = useState(false);
  const [currentAffirmation, setCurrentAffirmation] = useState("");
  
  const [screen, setScreen] = useState<"welcome" | "chat">(() => {
    if (typeof window !== "undefined" && localStorage.getItem("dreem_history")) return "chat";
    return "welcome";
  });

  const [history, setHistory] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>(() => Date.now().toString());
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(typeof window !== "undefined" ? window.innerWidth > 768 : true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Image state
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Show affirmation on first load
  useEffect(() => {
    const lastShown = localStorage.getItem("dreem_affirmation_date");
    const today = new Date().toDateString();
    
    if (lastShown !== today) {
      const randomAffirmation = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
      setCurrentAffirmation(randomAffirmation);
      setShowAffirmation(true);
      localStorage.setItem("dreem_affirmation_date", today);
      
      setTimeout(() => setShowAffirmation(false), 5000);
    }
  }, []);

  // Sync Firebase credits
  useEffect(() => {
    if (!user) return;

    const syncUser = async () => {
      try {
        const userRef = doc(db, "users", user.id);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setCredits(userSnap.data().credits);
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

  // Local history
  useEffect(() => {
    const saved = localStorage.getItem("dreem_history");
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("dreem_history", JSON.stringify(history));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, msgs]);

  // TTS
  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.9;
    utt.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes("Samantha") || v.name.includes("Google UK English Female") || v.name.includes("Karen")
    );
    if (preferred) utt.voice = preferred;
    window.speechSynthesis.speak(utt);
  }, [ttsEnabled]);

  // Voice recording
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
          if (data.text) setInput(data.text);
        } catch (err) {
          console.error("Transcription error:", err);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      alert("Microphone access needed to use voice input.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // Image handling
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => setPendingImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Send message
  const send = useCallback(async (text: string, imageBase64?: string) => {
    const t = text.trim();
    if ((!t && !imageBase64) || loading) return;

    if (credits !== null && credits <= 0) {
      alert("You've used all your sessions for now. Take a rest, and come back soon.");
      return;
    }

    let userMsgContent: Msg["content"];
    const displayText = t;

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
          userName: user?.firstName || "Friend",
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

                  await new Promise(resolve => setTimeout(resolve, 18));
                }
              }
            } catch { continue; }
          }
        }

        // Speak the response if TTS is enabled
        if (accumulated) speak(accumulated);
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

    } catch (err) {
      console.error("Error:", err);
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="app-container">
      <ThemeToggle />
      
      {/* Daily affirmation toast */}
      {showAffirmation && (
        <div className="affirmation-toast">
          <div className="affirmation-icon">
            <Heart size={20} style={{ color: 'var(--accent-secondary)' }} />
          </div>
          <p className="affirmation-text">{currentAffirmation}</p>
        </div>
      )}

      {/* Background scene */}
      <div className="bg-scene" aria-hidden="true">
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <div className="bg-orb bg-orb-3"></div>
        <div className="bg-aurora"></div>
      </div>

      {screen === "welcome" ? (
        <div className="welcome-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', textAlign: 'center', position: 'relative', zIndex: 10, padding: '2rem' }}>
          <div className="logo-orb" style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', boxShadow: 'var(--shadow-glow)', animation: 'orb-breathe 4s ease-in-out infinite' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--gradient-button)', boxShadow: '0 0 20px var(--accent-glow)' }}></div>
          </div>
          
          <h1 style={{ fontSize: 'clamp(3rem, 8vw, 5rem)', fontWeight: 700, background: 'var(--gradient-hero)', backgroundSize: '300% 300%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: '1rem', animation: 'shimmer 6s ease-in-out infinite', letterSpacing: '-0.02em' }}>
            dreem
          </h1>
          
          <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.25rem)', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: 1.7, marginBottom: '2.5rem' }}>
            A safe space to explore your thoughts, find calm, and nurture your wellbeing.
          </p>
          
          <button 
            onClick={() => setScreen("chat")} 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.75rem', 
              padding: '1rem 2.5rem', 
              borderRadius: '50px', 
              background: 'var(--gradient-button)', 
              color: 'var(--bg-primary)', 
              fontWeight: 700, 
              fontSize: '1rem', 
              border: 'none', 
              cursor: 'pointer', 
              boxShadow: '0 4px 24px var(--accent-glow)',
              transition: 'all 0.3s ease'
            }}
          >
            Begin Your Journey <Sparkles size={18} />
          </button>
        </div>
      ) : (
        <>
          {/* Sidebar */}
          <aside className={`sidebar-dream ${isSidebarOpen ? "open" : "closed"}`}>
            <div className="mobile-sidebar-header">
              <span className="sidebar-label">Menu</span>
              <button className="close-sidebar-btn" onClick={() => setIsSidebarOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <button className="new-chat-btn-dream" onClick={() => { setMsgs([]); setActiveId(Date.now().toString()); if (window.innerWidth <= 768) setIsSidebarOpen(false); }}>
              <Plus size={18} /> New Conversation
            </button>

            <Link href="/constellation" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '20px', transition: 'all 0.25s ease', fontSize: '14px' }}>
              <Moon size={16} /> Constellation
            </Link>

            <div className="sidebar-section">
              <p className="sidebar-label">Recent Conversations</p>
              {history.length === 0 && <div className="history-empty">No conversations yet. Start one above.</div>}
              {history.map(chat => (
                <div 
                  key={chat.id} 
                  className={`history-item-dream ${activeId === chat.id ? "active" : ""}`} 
                  onClick={() => { setActiveId(chat.id); setMsgs(chat.msgs); if (window.innerWidth <= 768) setIsSidebarOpen(false); }}
                >
                  <MessageCircle size={14} />
                  <span className="history-text">{chat.title}</span>
                </div>
              ))}
            </div>

            <div className="sidebar-footer">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="new-chat-btn-dream" style={{ width: '100%', justifyContent: 'center' }}>
                    Sign In to Save Progress
                  </button>
                </SignInButton>
              </SignedOut>
              
              <SignedIn>
                <div className="clickable-footer">
                  <div className="user-profile-mini">
                    <UserButton afterSignOutUrl="/" />
                    <div className="user-info">
                      <p className="u-name">{user?.firstName || "Friend"}</p>
                      <p className="u-status">{credits ?? 0} sessions remaining</p>
                    </div>
                  </div>
                </div>
              </SignedIn>
            </div>
          </aside>

          {isSidebarOpen && typeof window !== "undefined" && window.innerWidth <= 768 && (
            <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
          )}

          {/* Main chat area */}
          <main className="main-content-dream">
            <header className="dream-header">
              <button className="menu-toggle-dream" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                <Menu size={22} />
              </button>
              
              <div className="logo-section">
                <div className="chat-header-orb">
                  <div className="chat-header-orb-inner"></div>
                </div>
                <span className="chat-header-name">dreem</span>
              </div>
              
              <span className="model-badge-dream">{MODEL_TAG}</span>
              
              <button 
                onClick={() => { window.speechSynthesis?.cancel(); setTtsEnabled(p => !p); }} 
                title={ttsEnabled ? "Mute voice" : "Enable voice"}
                className="icon-btn-clear"
                style={{ color: ttsEnabled ? 'var(--accent-primary)' : 'var(--text-muted)' }}
              >
                {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </header>

            <div className="chat-viewport">
              {msgs.length === 0 ? (
                <div className="dream-welcome">
                  <h2 className="hero-text-dream">{getGreeting()}, {user?.firstName || "Friend"}</h2>
                  <p className="hero-sub">
                    This is your space. Share what is on your mind, or choose a starting point below.
                  </p>
                  
                  <div className="hero-grid">
                    {PROMPTS.map((p, i) => (
                      <button key={i} className="hero-card-dream" onClick={() => send(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                msgs.map((m, i) => (
                  <div key={i} className="gemini-row-dream">
                    <div className={`avatar-circle-dream ${m.role}`}>
                      {m.role === "user" ? (user?.firstName?.[0] || "Y") : "D"}
                    </div>
                    <div className="text-body-dream">
                      {m.imagePreview && (
                        <img 
                          src={m.imagePreview} 
                          alt="shared" 
                          style={{ maxWidth: '240px', borderRadius: '12px', marginBottom: '12px', display: 'block', border: '1px solid var(--border-subtle)' }} 
                        />
                      )}
                      
                      {m.streaming && !m.content ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0' }}>
                          <span style={{ width: '8px', height: '8px', background: 'var(--accent-primary)', borderRadius: '50%', animation: 'gentlePulse 1.5s ease-in-out infinite' }}></span>
                          <span style={{ width: '8px', height: '8px', background: 'var(--accent-primary)', borderRadius: '50%', animation: 'gentlePulse 1.5s ease-in-out infinite', animationDelay: '0.2s' }}></span>
                          <span style={{ width: '8px', height: '8px', background: 'var(--accent-primary)', borderRadius: '50%', animation: 'gentlePulse 1.5s ease-in-out infinite', animationDelay: '0.4s' }}></span>
                        </div>
                      ) : (
                        <>
                          {getMsgText(m)}
                          {m.streaming && <span className="stream-cursor"></span>}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div className="dream-input-container">
              {pendingImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', marginBottom: '8px' }}>
                  <img src={pendingImage} alt="pending" style={{ height: '52px', borderRadius: '10px', border: '1px solid var(--border-accent)' }} />
                  <button onClick={() => setPendingImage(null)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="dream-input-wrapper">
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  onChange={handleImageSelect} 
                />
                
                <button 
                  className="voice-btn" 
                  onClick={() => fileInputRef.current?.click()} 
                  title="Share an image" 
                  disabled={loading}
                  style={{ color: pendingImage ? 'var(--accent-primary)' : undefined }}
                >
                  <ImagePlus size={20} />
                </button>
                
                <button 
                  className={`voice-btn ${isRecording ? 'recording' : ''}`} 
                  onClick={isRecording ? stopRecording : startRecording} 
                  disabled={loading || isTranscribing} 
                  title={isRecording ? "Stop recording" : "Use your voice"}
                >
                  {isTranscribing ? <Loader2 size={20} className="animate-spin" /> : isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                
                <input 
                  className="dream-input" 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()} 
                  placeholder={isRecording ? "Listening to you..." : isTranscribing ? "Processing your words..." : "What's on your mind?"} 
                />
                
                <button 
                  className="dream-send" 
                  onClick={handleSend} 
                  disabled={loading || (!input.trim() && !pendingImage)}
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </main>
        </>
      )}
    </div>
  );
}
