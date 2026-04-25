import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Menu, Plus, Sparkles, Mic, MicOff, ImagePlus, X, Volume2, VolumeX, Heart, Moon, MessageCircle, Wind, Smile, Frown, Meh, Music, LifeBuoy, BookHeart, TrendingUp, Zap } from "lucide-react";
import { Link } from "wouter";
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../contexts/ThemeContext";

const MODEL_TAG = "llama-3.3-70b";

const PROMPTS = [
  "I need a moment to breathe and feel grounded...",
  "Help me find some peace in this moment",
  "I want to talk about something on my mind",
  "Guide me through a calming exercise",
];

const AFFIRMATIONS = [
  "You are exactly where you need to be.",
  "Your feelings are valid and worthy of attention.",
  "Take all the time you need. There is no rush here.",
  "You deserve moments of peace and gentleness.",
  "Every breath is a new beginning.",
  "It's okay to not be okay. You're still worthy of love.",
  "Your struggles don't define you. Your strength does.",
  "One small step today is enough.",
];

const MOODS = [
  { emoji: "😊", label: "Great", value: 5, color: "#9effd4" },
  { emoji: "🙂", label: "Good", value: 4, color: "#b4a0ff" },
  { emoji: "😐", label: "Okay", value: 3, color: "#ffb59e" },
  { emoji: "😔", label: "Low", value: 2, color: "#ff9eb8" },
  { emoji: "😢", label: "Struggling", value: 1, color: "#c8b8ff" },
];

const BREATHING_PATTERNS = [
  { name: "Calm (4-4-4)", inhale: 4, hold: 4, exhale: 4, description: "Gentle box breathing" },
  { name: "Relax (4-7-8)", inhale: 4, hold: 7, exhale: 8, description: "Deep relaxation" },
  { name: "Energize (4-4-6)", inhale: 4, hold: 4, exhale: 6, description: "Boost energy" },
  { name: "Quick (2-2-3)", inhale: 2, hold: 2, exhale: 3, description: "Fast calming" },
];

const CRISIS_RESOURCES = [
  { name: "988 Suicide & Crisis Lifeline", number: "988", description: "24/7 support" },
  { name: "Crisis Text Line", number: "Text HOME to 741741", description: "Free 24/7 text support" },
  { name: "SAMHSA Helpline", number: "1-800-662-4357", description: "Mental health & substance abuse" },
  { name: "NAMI Helpline", number: "1-800-950-6264", description: "Mental health information" },
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

export function Home() {
  const { user } = useUser();
  const { theme } = useTheme();
  const [credits, setCredits] = useState<number | null>(null);
  const [showAffirmation, setShowAffirmation] = useState(false);
  const [currentAffirmation, setCurrentAffirmation] = useState("");
  const [showBreathing, setShowBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [breathPattern, setBreathPattern] = useState(BREATHING_PATTERNS[0]);
  
  // New wellness features
  const [showMoodTracker, setShowMoodTracker] = useState(false);
  const [showCrisisSupport, setShowCrisisSupport] = useState(false);
  const [showGratitude, setShowGratitude] = useState(false);
  const [showSoundscape, setShowSoundscape] = useState(false);
  const [moodHistory, setMoodHistory] = useState<Array<{date: string; mood: number; note?: string}>>([]);
  const [gratitudeEntries, setGratitudeEntries] = useState<Array<{date: string; text: string}>>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [soundscapeVolume, setSoundscapeVolume] = useState(0.3);
  const [activeSoundscape, setActiveSoundscape] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
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

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Breathing exercise timer
  useEffect(() => {
    if (!showBreathing) return;
    
    const phases = ['inhale', 'hold', 'exhale'] as const;
    const durations = { 
      inhale: breathPattern.inhale * 1000, 
      hold: breathPattern.hold * 1000, 
      exhale: breathPattern.exhale * 1000 
    };
    let phaseIndex = 0;
    
    const cycle = () => {
      setBreathPhase(phases[phaseIndex]);
      phaseIndex = (phaseIndex + 1) % 3;
    };
    
    cycle();
    const interval = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % 3;
      setBreathPhase(phases[phaseIndex]);
    }, durations[phases[phaseIndex]]);
    
    return () => clearInterval(interval);
  }, [showBreathing, breathPattern]);

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
              const content = parsed.choices?.[0]?.delta?.content || "";

              if (content) {
                accumulated += content;
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
              }
            } catch { continue; }
          }
        }

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
      setMsgs(prev => [...prev.slice(0, -1), { role: "assistant", content: "I'm having trouble connecting right now. Please try again in a moment." }]);
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
            <Heart size={18} style={{ color: 'white' }} />
          </div>
          <p className="affirmation-text">{currentAffirmation}</p>
        </div>
      )}

      {/* Wellness Toolkit */}
      <div className="wellness-toolkit">
        {/* Breathing Exercise */}
        <button 
          className="wellness-trigger" 
          onClick={() => setShowBreathing(!showBreathing)}
          title="Breathing exercise"
          style={{ background: showBreathing ? 'var(--glass-active)' : undefined }}
        >
          <Wind size={20} />
        </button>
        
        {/* Mood Tracker */}
        <button 
          className="wellness-trigger" 
          onClick={() => setShowMoodTracker(!showMoodTracker)}
          title="Track your mood"
          style={{ background: showMoodTracker ? 'var(--glass-active)' : undefined }}
        >
          <Smile size={20} />
        </button>
        
        {/* Crisis Support */}
        <button 
          className="wellness-trigger crisis-btn" 
          onClick={() => setShowCrisisSupport(!showCrisisSupport)}
          title="Crisis support"
        >
          <LifeBuoy size={20} />
        </button>
        
        {/* Gratitude Journal */}
        <button 
          className="wellness-trigger" 
          onClick={() => setShowGratitude(!showGratitude)}
          title="Gratitude journal"
          style={{ background: showGratitude ? 'var(--glass-active)' : undefined }}
        >
          <Heart size={20} />
        </button>
      </div>

      {/* Breathing Panel */}
      {showBreathing && (
        <div className="wellness-panel breathing-panel-enhanced">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 className="panel-title">Breathe</h3>
            <button onClick={() => setShowBreathing(false)} className="panel-close">
              <X size={18} />
            </button>
          </div>
          
          <div className="breathing-circle">
            <span style={{ 
              color: 'white', 
              fontWeight: 600, 
              fontSize: '16px',
              textTransform: 'capitalize',
              textShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}>
              {breathPhase === 'inhale' ? 'In' : breathPhase === 'hold' ? 'Hold' : 'Out'}
            </span>
          </div>
          
          <p className="breathing-instruction" style={{ marginBottom: '16px' }}>
            {breathPattern.description}
          </p>
          
          <div className="pattern-selector">
            {BREATHING_PATTERNS.map((pattern, idx) => (
              <button
                key={idx}
                className={`pattern-btn ${breathPattern.name === pattern.name ? 'active' : ''}`}
                onClick={() => setBreathPattern(pattern)}
              >
                {pattern.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mood Tracker Panel */}
      {showMoodTracker && (
        <div className="wellness-panel mood-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 className="panel-title">How are you feeling?</h3>
            <button onClick={() => setShowMoodTracker(false)} className="panel-close">
              <X size={18} />
            </button>
          </div>
          
          <div className="mood-grid">
            {MOODS.map((mood) => (
              <button
                key={mood.value}
                className="mood-btn"
                onClick={() => {
                  const today = new Date().toLocaleDateString();
                  const newEntry = { date: today, mood: mood.value };
                  setMoodHistory(prev => [...prev.filter(e => e.date !== today), newEntry]);
                  setShowMoodTracker(false);
                  
                  // Show encouraging message
                  const messages = {
                    5: "That's wonderful! Keep embracing the good moments.",
                    4: "Glad you're feeling good today!",
                    3: "It's okay to be in the middle. Take care of yourself.",
                    2: "I see you. It's okay to have tough days.",
                    1: "You're not alone. Please reach out if you need support."
                  };
                  setCurrentAffirmation(messages[mood.value as keyof typeof messages]);
                  setShowAffirmation(true);
                  setTimeout(() => setShowAffirmation(false), 5000);
                }}
                style={{ borderColor: mood.color }}
              >
                <span className="mood-emoji">{mood.emoji}</span>
                <span className="mood-label">{mood.label}</span>
              </button>
            ))}
          </div>
          
          {moodHistory.length > 0 && (
            <div className="mood-history">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <TrendingUp size={14} color="var(--accent-lavender)" />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {moodHistory.length} check-in{moodHistory.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="mood-timeline">
                {moodHistory.slice(-7).map((entry, idx) => {
                  const mood = MOODS.find(m => m.value === entry.mood);
                  return (
                    <div key={idx} className="mood-dot" style={{ background: mood?.color }} title={entry.date} />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Crisis Support Panel */}
      {showCrisisSupport && (
        <div className="wellness-panel crisis-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 className="panel-title">You're Not Alone</h3>
            <button onClick={() => setShowCrisisSupport(false)} className="panel-close">
              <X size={18} />
            </button>
          </div>
          
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.6 }}>
            If you're in crisis or need immediate support, these resources are here 24/7:
          </p>
          
          <div className="crisis-resources">
            {CRISIS_RESOURCES.map((resource, idx) => (
              <a 
                key={idx}
                href={`tel:${resource.number.replace(/\D/g, '')}`}
                className="crisis-resource-card"
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {resource.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {resource.description}
                  </div>
                </div>
                <div style={{ 
                  fontSize: '15px', 
                  fontWeight: 600, 
                  color: 'var(--accent-rose)',
                  fontFamily: 'monospace'
                }}>
                  {resource.number}
                </div>
              </a>
            ))}
          </div>
          
          <div style={{ 
            marginTop: '16px', 
            padding: '14px', 
            background: 'var(--glass-2)', 
            borderRadius: '12px',
            border: '1px solid var(--border-glass)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5
          }}>
            💜 Remember: Asking for help is a sign of strength, not weakness.
          </div>
        </div>
      )}

      {/* Gratitude Journal Panel */}
      {showGratitude && (
        <div className="wellness-panel gratitude-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 className="panel-title">Gratitude</h3>
            <button onClick={() => setShowGratitude(false)} className="panel-close">
              <X size={18} />
            </button>
          </div>
          
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            What's one thing you're grateful for today?
          </p>
          
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Type something you appreciate..."
              className="gratitude-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  const today = new Date().toLocaleDateString();
                  setGratitudeEntries(prev => [...prev, { date: today, text: e.currentTarget.value.trim() }]);
                  e.currentTarget.value = '';
                  setCurrentAffirmation("Thank you for taking a moment to appreciate the good. 🌸");
                  setShowAffirmation(true);
                  setTimeout(() => setShowAffirmation(false), 4000);
                }
              }}
            />
          </div>
          
          {gratitudeEntries.length > 0 && (
            <div className="gratitude-history">
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Recent entries ({gratitudeEntries.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {gratitudeEntries.slice(-5).reverse().map((entry, idx) => (
                  <div key={idx} className="gratitude-entry">
                    <BookHeart size={14} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '13px', lineHeight: 1.4 }}>{entry.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Background clouds */}
      <div className="bg-scene" aria-hidden="true">
        <div className="bg-cloud bg-cloud-1" />
        <div className="bg-cloud bg-cloud-2" />
        <div className="bg-cloud bg-cloud-3" />
        <div className="bg-cloud bg-cloud-4" />
        <div className="bg-refraction" />
        <div className="bg-noise" />
      </div>

      {screen === "welcome" ? (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh', 
          width: '100vw', 
          textAlign: 'center', 
          position: 'relative', 
          zIndex: 10, 
          padding: '2rem' 
        }}>
          <div style={{ 
            width: '90px', 
            height: '90px', 
            borderRadius: '50%', 
            background: 'var(--glass-3)', 
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border-glow)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            marginBottom: '2rem', 
            boxShadow: 'var(--shadow-glow)', 
            animation: 'orbFloat 6s ease-in-out infinite' 
          }}>
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '50%', 
              background: 'var(--gradient-button)', 
              boxShadow: '0 0 20px var(--glow-primary)' 
            }} />
          </div>
          
          <h1 style={{ 
            fontSize: 'clamp(3rem, 10vw, 5rem)', 
            fontWeight: 700, 
            background: 'var(--gradient-text)', 
            backgroundSize: '300% 300%', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent', 
            backgroundClip: 'text', 
            marginBottom: '1rem', 
            animation: 'gradientShift 8s ease-in-out infinite', 
            letterSpacing: '-0.03em' 
          }}>
            Lumina
          </h1>
          
          <p style={{ 
            fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', 
            color: 'var(--text-secondary)', 
            maxWidth: '440px', 
            lineHeight: 1.7, 
            marginBottom: '2.5rem' 
          }}>
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
              color: 'var(--text-inverse)', 
              fontWeight: 600, 
              fontSize: '1rem', 
              border: 'none', 
              cursor: 'pointer', 
              boxShadow: '0 4px 24px var(--glow-primary)',
              transition: 'all 0.3s var(--ease-glass)'
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

            <Link href="/constellation" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              padding: '14px 18px', 
              borderRadius: '14px', 
              background: 'var(--glass-2)', 
              border: '1px solid var(--border-glass)', 
              color: 'var(--text-secondary)', 
              textDecoration: 'none', 
              marginBottom: '20px', 
              transition: 'all 0.2s var(--ease-glass)', 
              fontSize: '14px' 
            }}>
              <Moon size={16} /> Constellation
            </Link>

            {/* Wellness Streak Tracker */}
            {(moodHistory.length > 0 || gratitudeEntries.length > 0) && (
              <div className="wellness-streak">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={16} style={{ color: 'var(--accent-lavender)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Wellness Streak
                    </span>
                  </div>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-lavender)' }}>
                    {Math.max(moodHistory.length, gratitudeEntries.length)}
                  </span>
                </div>
                <div style={{ 
                  height: '6px', 
                  background: 'var(--glass-2)', 
                  borderRadius: '3px', 
                  overflow: 'hidden',
                  border: '1px solid var(--border-glass)'
                }}>
                  <div style={{ 
                    height: '100%', 
                    background: 'var(--gradient-button)', 
                    width: `${Math.min(100, ((moodHistory.length + gratitudeEntries.length) / 30) * 100)}%`,
                    transition: 'width 0.8s var(--ease-glass)',
                    boxShadow: '0 0 10px var(--glow-primary)'
                  }} />
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Keep going! Daily check-ins build resilience.
                </p>
              </div>
            )}

            <div className="sidebar-section">
              <p className="sidebar-label">Recent</p>
              {history.length === 0 && <div className="history-empty">No conversations yet.</div>}
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
                    Sign In to Save
                  </button>
                </SignInButton>
              </SignedOut>
              
              <SignedIn>
                <div className="clickable-footer">
                  <div className="user-profile-mini">
                    <UserButton afterSignOutUrl="/" />
                    <div className="user-info">
                      <p className="u-name">{user?.firstName || "Friend"}</p>
                      <p className="u-status">{credits ?? 0} sessions</p>
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
                  <div className="chat-header-orb-inner" />
                </div>
                <span className="chat-header-name">Lumina</span>
              </div>
              
              <span className="model-badge-dream">{MODEL_TAG}</span>
              
              <button 
                onClick={() => { window.speechSynthesis?.cancel(); setTtsEnabled(p => !p); }} 
                title={ttsEnabled ? "Mute voice" : "Enable voice"}
                className="icon-btn-clear"
                style={{ color: ttsEnabled ? 'var(--accent-lavender)' : undefined }}
              >
                {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </header>

            <div className="chat-viewport">
              {msgs.length === 0 ? (
                <div className="dream-welcome">
                  <h2 className="hero-text-dream">{getGreeting()}, {user?.firstName || "Friend"}</h2>
                  <p className="hero-sub">
                    This is your space. Share what&apos;s on your mind, or choose a starting point below.
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
                          style={{ maxWidth: '220px', borderRadius: '14px', marginBottom: '12px', display: 'block', border: '1px solid var(--border-glass)' }} 
                        />
                      )}
                      
                      {m.streaming && !m.content ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0' }}>
                          <span style={{ width: '8px', height: '8px', background: 'var(--accent-lavender)', borderRadius: '50%', animation: 'orbPulse 1.5s ease-in-out infinite' }} />
                          <span style={{ width: '8px', height: '8px', background: 'var(--accent-lavender)', borderRadius: '50%', animation: 'orbPulse 1.5s ease-in-out infinite', animationDelay: '0.2s' }} />
                          <span style={{ width: '8px', height: '8px', background: 'var(--accent-lavender)', borderRadius: '50%', animation: 'orbPulse 1.5s ease-in-out infinite', animationDelay: '0.4s' }} />
                        </div>
                      ) : (
                        <>
                          {getMsgText(m)}
                          {m.streaming && <span className="stream-cursor" />}
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
                <div className="image-preview-row">
                  <div className="img-preview-box">
                    <img src={pendingImage} alt="pending" />
                    <span>Image ready</span>
                    <button className="rm-img-btn" onClick={() => setPendingImage(null)}>
                      <X size={16} />
                    </button>
                  </div>
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
                  style={{ color: pendingImage ? 'var(--accent-lavender)' : undefined }}
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
                  placeholder={isRecording ? "Listening..." : isTranscribing ? "Processing..." : "What's on your mind?"} 
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
