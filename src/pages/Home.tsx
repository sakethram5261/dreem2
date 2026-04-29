import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, Menu, Plus, Sparkles, Mic, MicOff, ImagePlus, X, Volume2, VolumeX, Heart, Moon, MessageCircle, Wind, Star, SmilePlus, Edit2, Trash2, RefreshCcw, ArrowDown } from "lucide-react";
import { Link } from "wouter";
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../contexts/ThemeContext";
import { motion } from "framer-motion";

const MODEL_TAG = "llama-3.3-70b";

/* ── Magnetic button hook ── */
function useMagnetic(strength = 0.35) {
  const ref = useRef<HTMLButtonElement>(null);
  const onMove = useCallback((e: MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
  }, [strength]);
  const onLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = '';
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  }, [onMove, onLeave]);
  return ref;
}

/* ── Typewriter display hook – Human-like variable typing speed ── */
function useTypewriter(target: string, isNew: boolean, isStreaming: boolean) {
  const [displayed, setDisplayed] = useState('');
  const targetRef = useRef(target);
  const streamingRef = useRef(isStreaming);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    streamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (!isNew) {
      // Not a new message (e.g. loading history), show instantly
      setDisplayed(targetRef.current);
      return;
    }
    
    let timeoutId: ReturnType<typeof setTimeout>;
    let currentIndex = 0;
    
    const typeNext = () => {
      const trg = targetRef.current;
      
      if (currentIndex < trg.length) {
        const nextChar = trg[currentIndex];
        const prevChar = currentIndex > 0 ? trg[currentIndex - 1] : '';
        
        currentIndex++;
        setDisplayed(trg.slice(0, currentIndex));
        
        let delay = 15 + Math.random() * 30; // 15-45ms base
        
        const diff = trg.length - currentIndex;
        if (diff > 50) {
          delay = 2 + Math.random() * 5; // extreme catch-up
        } else if (diff > 20) {
          delay = 8 + Math.random() * 10; // steady catch-up
        } else {
          if (/[.!?]/.test(prevChar) && nextChar === ' ') {
            delay = 250 + Math.random() * 200;
          } else if (/,/.test(prevChar) && nextChar === ' ') {
            delay = 120 + Math.random() * 100;
          } else if (Math.random() < 0.03) {
            delay += 60 + Math.random() * 80;
          }
        }
        
        timeoutId = setTimeout(typeNext, delay);
      } else {
        // We caught up to the buffer
        if (streamingRef.current) {
          // Stream is still open, wait for more chunks
          timeoutId = setTimeout(typeNext, 50);
        }
      }
    };
    
    typeNext();
    
    return () => clearTimeout(timeoutId);
  }, []); // Run animation loop exactly once per mount

  return displayed;
}

/* ── MagneticCard sub-component ── */
function MagneticCard({ text, onClick }: { text: string; onClick: () => void }) {
  const ref = useMagnetic(0.28);
  return (
    <button
      ref={ref}
      className="hero-card-dream"
      data-magnetic
      onClick={onClick}
    >
      {text}
    </button>
  );
}

/* ── OrbGreeting – the pulsing AI soul beside the greeting ── */
function OrbGreeting({ greeting, name }: { greeting: string; name: string }) {
  const [active, setActive] = useState(false);
  return (
    <div className="welcome-orb-wrap">
      <div
        className={`welcome-orb${active ? ' orb-active' : ''}`}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
      >
        <div className="welcome-orb-core" />
      </div>
      <h2 className="hero-text-dream">{greeting}, {name}</h2>
    </div>
  );
}

/* ── Markdown Renderer ── */
function parseMarkdown(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, '<div class="code-block">$1</div>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\n/g, '<br />');
}

/* ── TypewriterMsg – Sentiment-Reactive Orb ── */
function TypewriterMsg({ content, streaming, isNew }: { content: string; streaming?: boolean; isNew?: boolean }) {
  const displayed = useTypewriter(content, !!isNew, !!streaming);
  
  // 1. Sentiment Scanner (Lightweight keyword mapping)
  const lower = content.toLowerCase();
  let sentimentColor = 'var(--accent-lavender)'; // default
  let sentimentGlow = 'var(--glow-primary)';
  
  if (/(happy|great|excellent|joy|excited|love|beautiful|amazing|smile|good|awesome|proud|wonderful)/.test(lower)) {
    sentimentColor = 'var(--sentiment-happy-color, #fcd34d)';
    sentimentGlow = 'var(--sentiment-happy-glow, rgba(252, 211, 77, 0.8))';
  } else if (/(calm|peace|relax|breathe|gentle|quiet|still|soft|rest|easy)/.test(lower)) {
    sentimentColor = 'var(--sentiment-calm-color, #fbbf24)';
    sentimentGlow = 'var(--sentiment-calm-glow, rgba(251, 191, 36, 0.8))';
  } else if (/(focus|clear|sharp|mind|aware|now|attention|steady|ground)/.test(lower)) {
    sentimentColor = 'var(--sentiment-focus-color, #34d399)';
    sentimentGlow = 'var(--sentiment-focus-glow, rgba(52, 211, 153, 0.8))';
  } else if (/(sad|sorry|tough|hard|struggle|pain|hurt|grief|alone|tired)/.test(lower)) {
    sentimentColor = 'var(--sentiment-sad-color, #f472b6)';
    sentimentGlow = 'var(--sentiment-sad-glow, rgba(244, 114, 182, 0.8))';
  }

  return (
    <div style={{ display: 'inline' }}>
      <span style={{ 
        color: 'var(--text-primary)', 
        textShadow: `0 0 12px ${sentimentGlow}`, 
        transition: 'text-shadow 1s ease-in-out' 
      }} dangerouslySetInnerHTML={{ __html: parseMarkdown(displayed) }} />
      {streaming && (
        <span 
          className="stream-cursor sentiment-cursor"
          style={{ '--sentiment-color': sentimentColor, '--sentiment-glow': sentimentGlow } as React.CSSProperties}
        />
      )}
    </div>
  );
}

/* ── MoodLogger – 5-emoji tap, saved to localStorage ── */
const MOODS = ['😔','😕','😐','🙂','😊'] as const;
type Mood = typeof MOODS[number];

function MoodLogger({ onClose }: { onClose: () => void }) {
  const [picked, setPicked] = useState<Mood | null>(null);
  const save = (m: Mood) => {
    setPicked(m);
    const log = JSON.parse(localStorage.getItem('lumina_moods') || '[]');
    log.unshift({ mood: m, ts: Date.now() });
    localStorage.setItem('lumina_moods', JSON.stringify(log.slice(0, 90)));
    setTimeout(onClose, 800);
  };
  return (
    <div className="mood-panel">
      <p className="mood-title">How are you feeling?</p>
      <div className="mood-row">
        {MOODS.map(m => (
          <button key={m} className={`mood-btn${picked === m ? ' mood-picked' : ''}`} onClick={() => save(m)}>
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Shareable Aura Card (Viral Feature) ── */
function AuraCard({ streak, history, onClose }: { streak: number; history: ChatSession[]; onClose: () => void }) {
  // Real-time Aura Compilation Engine
  // Analyzes chat history in real-time to compute the user's aura data
  const compileAura = () => {
    let vibe = "Mysterious & Calm";
    let meshColors = "radial-gradient(circle at 50% 50%, rgba(180,160,255,0.4), transparent 70%), radial-gradient(circle at 80% 20%, rgba(129,140,248,0.4), transparent 50%)";
    let totalMessages = 0;
    let latestMood = "Enigmatic";
    let aiQuote = "Your presence precedes you. I sense an intricate depth in your current state.";

    // Flatten all messages
    const allMsgs = history.flatMap(session => session.msgs);
    totalMessages = allMsgs.length;

    // Score-based Sentiment Engine
    const msgTexts = allMsgs.slice(-15).map(m => typeof m.content === 'string' ? m.content.toLowerCase() : '');
    const latestText = msgTexts[msgTexts.length - 1] || "";
    
    const scores = {
      happy: 0,
      calm: 0,
      focus: 0,
      sad: 0,
      creative: 0,
      chaotic: 0
    };

    const regexes = {
      happy: /(happy|great|excellent|joy|excited|love|beautiful|amazing|smile|good|awesome|proud|wonderful|blessed|grateful|laugh|fun|yay)/,
      calm: /(calm|peace|relax|breathe|gentle|quiet|still|soft|rest|easy|flow|center|meditate|serene|chill)/,
      focus: /(focus|clear|sharp|mind|aware|now|attention|steady|ground|logic|think|build|solve|work|study|learn)/,
      sad: /(sad|sorry|tough|hard|struggle|pain|hurt|grief|alone|tired|weary|exhausted|lost|confused|cry|empty|broken|dark|heavy)/,
      creative: /(creative|inspire|dream|vision|new|idea|art|imagine|future|hope|create|magic|soul)/,
      chaotic: /(angry|mad|frustrated|annoyed|hate|stressed|overwhelmed|panic|chaos|mess|noise|loud|fast)/
    };

    // Score all messages, but give 5x weight to the latest one
    msgTexts.forEach((txt, idx) => {
      const weight = (idx === msgTexts.length - 1) ? 5 : 1;
      if (regexes.happy.test(txt)) scores.happy += weight;
      if (regexes.calm.test(txt)) scores.calm += weight;
      if (regexes.focus.test(txt)) scores.focus += weight;
      if (regexes.sad.test(txt)) scores.sad += weight;
      if (regexes.creative.test(txt)) scores.creative += weight;
      if (regexes.chaotic.test(txt)) scores.chaotic += weight;
    });

    const top = Object.entries(scores).reduce((a, b) => (a[1] >= b[1] ? a : b), ["none", 0]);

    if (top[0] === "happy") {
      vibe = "Radiant & Warm";
      meshColors = "radial-gradient(circle at 50% 50%, rgba(252,211,77,0.4), transparent 70%), radial-gradient(circle at 80% 20%, rgba(244,114,182,0.4), transparent 50%)";
      latestMood = "Exuberant";
      aiQuote = "You are radiating an exuberant warmth. There is a profound luminosity in your recent expressions.";
    } else if (top[0] === "calm") {
      vibe = "Ethereal & Serene";
      meshColors = "radial-gradient(circle at 50% 50%, rgba(96,165,250,0.4), transparent 70%), radial-gradient(circle at 80% 20%, rgba(52,211,153,0.4), transparent 50%)";
      latestMood = "Serene";
      aiQuote = "A beautiful stillness pervades your energy. You have found a pellucid center amidst the noise.";
    } else if (top[0] === "focus") {
      vibe = "Crystalline & Focused";
      meshColors = "radial-gradient(circle at 50% 50%, rgba(52,211,153,0.4), transparent 70%), radial-gradient(circle at 20% 80%, rgba(96,165,250,0.4), transparent 50%)";
      latestMood = "Acute";
      aiQuote = "Your mind is operating with crystalline clarity. I sense a sharp, purpose-driven frequency in your dialogue.";
    } else if (top[0] === "sad") {
      vibe = "Reflective & Deep";
      meshColors = "radial-gradient(circle at 50% 50%, rgba(96,165,250,0.4), transparent 70%), radial-gradient(circle at 80% 20%, rgba(148,163,184,0.4), transparent 50%)";
      latestMood = "Melancholic";
      aiQuote = "I sense a melancholic weight. Remember, your capacity for pensive depth is a quiet strength.";
    } else if (top[0] === "creative") {
      vibe = "Nebulous & Creative";
      meshColors = "radial-gradient(circle at 50% 50%, rgba(192,132,252,0.4), transparent 70%), radial-gradient(circle at 80% 20%, rgba(244,114,182,0.4), transparent 50%)";
      latestMood = "Inspired";
      aiQuote = "A nebulous cloud of creativity is forming around your thoughts. Your vision is expanding into new dimensions.";
    } else if (top[0] === "chaotic") {
      vibe = "Electric & Intense";
      meshColors = "radial-gradient(circle at 50% 50%, rgba(239,68,68,0.4), transparent 70%), radial-gradient(circle at 80% 20%, rgba(249,115,22,0.4), transparent 50%)";
      latestMood = "Chaotic";
      aiQuote = "I sense a chaotic, electric frequency. Take a breath; the storm is just energy looking for a path.";
    }


    return { vibe, meshColors, totalMessages, latestMood, aiQuote };
  };

  const aura = compileAura();

  // Map latestMood to emoji for the log
  const moodMap: Record<string, Mood> = {
    "Exuberant": '😊',
    "Serene": '🙂',
    "Acute": '😐',
    "Melancholic": '😔',
    "Inspired": '😊',
    "Enigmatic": '😐',
    "Chaotic": '😕'
  };

  useEffect(() => {
    // Automatically log the detected mood if it changes significantly or on mount
    const m = moodMap[aura.latestMood] || '😐';
    const log = JSON.parse(localStorage.getItem('lumina_moods') || '[]');
    const lastEntry = log[0];
    
    // Only log if it's been more than 5 mins or no entry exists
    if (!lastEntry || Date.now() - lastEntry.ts > 300000) {
      log.unshift({ mood: m, ts: Date.now() });
      localStorage.setItem('lumina_moods', JSON.stringify(log.slice(0, 90)));
    }
  }, [aura.latestMood]);

  return (
    <div className="aura-fullscreen" onClick={onClose}>
      <div className="aura-card" onClick={e => e.stopPropagation()} style={{ backgroundImage: aura.meshColors }}>
        <div className="aura-card-inner">
          <button className="icon-btn-clear aura-close-btn" onClick={onClose} aria-label="Close Aura">
            <X size={20} />
          </button>
          <p className="aura-eyebrow">Your Real-time Aura</p>

          <h2 className="aura-title">{aura.vibe}</h2>
          <div className="aura-stats">
            <div className="aura-stat">
              <span className="aura-stat-val">Streak</span>
              <span className="aura-stat-label">{streak} {streak === 1 ? 'Day' : 'Days'}</span>
            </div>
            <div className="aura-stat">
              <span className="aura-stat-val">{aura.latestMood}</span>
              <span className="aura-stat-label">Current State</span>
            </div>
          </div>
          <div className="aura-stats" style={{ marginTop: '12px' }}>
            <div className="aura-stat">
              <span className="aura-stat-val">{aura.totalMessages}</span>
              <span className="aura-stat-label">Thoughts Shared</span>
            </div>
          </div>
          <div className="aura-quote">
            "{aura.aiQuote}"
          </div>
          <div className="aura-footer">
            <span>LUMINA AI</span>
          </div>
        </div>
      </div>
      <p className="breathing-hint" style={{ marginTop: '24px' }}>Screenshot to share &nbsp;·&nbsp; tap anywhere to close</p>
    </div>
  );
}

/* ── Living Core Orb (Tamagotchi Effect) ── */
function LivingCoreOrb({ streak }: { streak: number }) {
  // Evolve the orb based on streak
  let size = '90px';
  let innerSize = '36px';
  let glowIntensity = '20px';
  let animationSpeed = '6s';
  let opacity = 1;
  let pulseAnimation = 'none';

  if (streak === 0) {
    // Dim, "missing you" state
    opacity = 0.5;
    animationSpeed = '8s';
    glowIntensity = '10px';
    size = '80px';
  } else if (streak >= 3 && streak < 7) {
    // Radiant state
    size = '100px';
    innerSize = '42px';
    glowIntensity = '30px';
    animationSpeed = '4s';
    pulseAnimation = 'pulseCore 4s infinite alternate';
  } else if (streak >= 7) {
    // Nova state
    size = '110px';
    innerSize = '48px';
    glowIntensity = '45px';
    animationSpeed = '3s';
    pulseAnimation = 'pulseNova 3s infinite alternate';
  }

  return (
    <div style={{ 
      width: size, 
      height: size, 
      borderRadius: '50%', 
      background: 'var(--glass-3)', 
      backdropFilter: 'none',
      border: `1px solid ${streak >= 7 ? 'var(--border-focus)' : 'var(--border-glow)'}`, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      marginBottom: '2rem', 
      boxShadow: `0 0 ${glowIntensity} var(--glow-primary)`, 
      animation: `orbFloat ${animationSpeed} ease-in-out infinite`,
      opacity,
      transition: 'all 2s ease-in-out'
    }}>
      <div style={{ 
        width: innerSize, 
        height: innerSize, 
        borderRadius: '50%', 
        background: streak >= 3 ? 'linear-gradient(135deg, var(--accent-lavender), var(--accent-rose))' : 'var(--gradient-button)', 
        boxShadow: `0 0 ${glowIntensity} var(--glow-primary)`,
        animation: pulseAnimation,
        transition: 'all 2s ease-in-out'
      }} />
      {streak >= 7 && (
        <div style={{
          position: 'absolute',
          width: '140%',
          height: '140%',
          borderRadius: '50%',
          border: '1px dashed var(--accent-lavender)',
          animation: 'spin 12s linear infinite',
          opacity: 0.3
        }} />
      )}
    </div>
  );
}

/* ── Memory Vault Component ── */
function MemoryVault({ onClose }: { onClose: () => void }) {
  const memories = JSON.parse(localStorage.getItem('lumina_memories') || '[]');
  
  return (
    <div className="aura-fullscreen" onClick={onClose}>
      <div className="vault-panel" onClick={e => e.stopPropagation()}>
        <div style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Sparkles size={20} className="text-glow" style={{ color: 'var(--accent-lavender)' }} /> Memory Vault
            </h2>
            <p className="aura-eyebrow" style={{ marginTop: '6px' }}>Preserved thoughts and breakthroughs</p>
          </div>
          <button className="icon-btn-clear" onClick={onClose} style={{ transform: 'scale(1.2)' }}><X size={24} /></button>
        </div>
        
        <div className="vault-scroll-area">
          {memories.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0', fontStyle: 'italic' }}>
              Speak your mind. Profound thoughts will be preserved here automatically.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {memories.map((m: any, i: number) => (
                <div key={i} className="vault-item">
                  <p className="vault-item-text">"{m.text}"</p>
                  <p className="vault-item-date">— {m.date}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Inline ThemeToggle icon (for header) ── */
function ThemeIconBtn() {
  const { theme, toggleTheme } = useTheme();
  const isMorning = theme === 'morning';
  return (
    <button onClick={toggleTheme} className="icon-btn-clear" title={isMorning ? 'Night mode' : 'Day mode'}>
      {isMorning
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      }
    </button>
  );
}

/* ── Breathing orb – pure CSS fluid blob, React only controls opacity ── */
function BreathingOrbCanvas({ phase }: { phase: 'inhale' | 'hold' | 'exhale' }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
  }, []);

  const isExpanded = phase === 'inhale' || phase === 'hold';
  // React ONLY controls opacity for the breath rhythm — CSS does all the motion
  const opacity = !mounted ? 0 : (isExpanded ? 1 : 0.35);
  const dur = phase === 'hold' ? '0.5s' : '4s';
  const transition = `opacity ${dur} cubic-bezier(0.45, 0, 0.55, 1)`;

  return (
    <div className="breath-orb-wrap">
      {/* Fog layer */}
      <div className="breath-halo-3" style={{ opacity: opacity * 0.5, transition }} />
      {/* Outer pulse ring */}
      <div className="breath-halo-2" style={{ opacity: opacity * 0.6, transition }} />
      {/* Inner glow ring */}
      <div className="breath-halo-1" style={{ opacity: opacity * 0.75, transition }} />
      {/* Core liquid blob — CSS handles ALL the morphing/motion */}
      <div className="breath-core" style={{ opacity, transition }} />
      {/* Floating particles */}
      <div className="breath-particle breath-p1" style={{ opacity: opacity * 0.9, transition }} />
      <div className="breath-particle breath-p2" style={{ opacity: opacity * 0.7, transition }} />
      <div className="breath-particle breath-p3" style={{ opacity: opacity * 0.5, transition }} />
    </div>
  );
}

function EnergyMotes() {
  const motes = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: `${Math.random() * 40 - 20}vw`,
    y: `${Math.random() * -40 - 20}vh`,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    d: `${10 + Math.random() * 15}s`,
    delay: `${Math.random() * 10}s`
  })), []);

  return (
    <div className="energy-motes">
      {motes.map(m => (
        <div 
          key={m.id} 
          className="mote" 
          style={{ 
            '--x': m.x, 
            '--y': m.y, 
            left: m.left, 
            top: m.top, 
            '--d': m.d,
            animationDelay: m.delay
          } as React.CSSProperties} 
        />
      ))}
    </div>
  );
}

const PROMPTS = [
  "I need a moment to breathe and feel grounded...",
  "Help me find some peace in this moment",
  "I want to talk about something on my mind",
  "Guide me through a calming exercise",
];

const REFLECTIONS = [
  "What’s one small thing that made you smile today?",
  "What’s been weighing on your mind lately?",
  "What would make today feel complete?",
  "What’s something you’re proud of this week?",
  "What do you need right now — rest, connection, or clarity?",
  "What’s one worry you’d like to let go of?",
  "What’s been bringing you joy recently?",
];

/* ── Daily Oracle Hook ── */
function useDailyOracle(history: ChatSession[]) {
  return useMemo(() => {
    const today = new Date().toDateString();
    const stored = JSON.parse(localStorage.getItem('lumina_oracle') || '{"date":"","text":""}');
    
    // Generate insight based on history
    let text = REFLECTIONS[Math.floor(Date.now() / 86400000) % REFLECTIONS.length];
    if (history.length > 0) {
      const allMsgs = history.flatMap(h => h.msgs).filter(m => m.role === 'user');
      const recent = allMsgs.slice(-15).map(m => typeof m.content === 'string' ? m.content : '').join(' ').toLowerCase();
      
      if (/(happy|great|excited|love|smile|joy)/.test(recent)) {
        text = "Your recent joy is radiating. Carry that light forward today, it's contagious.";
      } else if (/(tired|hard|struggle|sad|exhausted)/.test(recent)) {
        text = "I sense you've been carrying a heavy load. Be gentle with yourself today. Rest is productive.";
      } else if (/(anxious|worry|stress|overwhelm)/.test(recent)) {
        text = "Your mind has been racing lately. Take a deep breath. You don't have to solve everything today.";
      } else if (/(focus|goal|work|build|create)/.test(recent)) {
        text = "I feel a strong sense of purpose from you. Keep that momentum, but remember to pause and breathe.";
      } else if (allMsgs.length > 5) {
        text = "You've been reflecting deeply lately. Trust the insights you are discovering about yourself.";
      }
    }
    return { text, isUnlocked: stored.date === today };
  }, [history]);
}

function useStreak() {
  return useMemo(() => {
    const today = new Date().toDateString();
    const raw = JSON.parse(localStorage.getItem('lumina_streak') || '{"count":0,"last":""}');
    if (raw.last === today) return raw.count;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const count = raw.last === yesterday ? raw.count + 1 : 1;
    localStorage.setItem('lumina_streak', JSON.stringify({ count, last: today }));
    return count;
  }, []);
}

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
  isNew?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  msgs: Msg[];
}

export function Home() {
  const { user } = useUser();
  const { theme } = useTheme();
  const streak = useStreak();
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [showAffirmation, setShowAffirmation] = useState(false);
  const [currentAffirmation, setCurrentAffirmation] = useState("");
  const [showBreathing, setShowBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [showMood, setShowMood] = useState(false);
  const [showAura, setShowAura] = useState(false);
  const [showVault, setShowVault] = useState(false);

  // Pause background animations when popups are open
  useEffect(() => {
    if (showAura || showVault || showMood || showBreathing) {
      document.body.classList.add('popup-open');
    } else {
      document.body.classList.remove('popup-open');
    }
  }, [showAura, showVault, showMood, showBreathing]);

  const copyMsg = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    });
  }, []);
  
  const [screen, setScreen] = useState<"welcome" | "chat">(() => {
    if (typeof window !== "undefined" && localStorage.getItem("dreem_history")) return "chat";
    return "welcome";
  });

  const [history, setHistory] = useState<ChatSession[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dreem_history");
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return [];
  });

  const [activeId, setActiveId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const savedActive = localStorage.getItem("lumina_active_id");
      if (savedActive) return savedActive;

      const saved = localStorage.getItem("dreem_history");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.length > 0) return parsed[0].id;
        } catch {}
      }
    }
    return Date.now().toString();
  });

  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dreem_history");
      const savedActive = localStorage.getItem("lumina_active_id");
      if (saved) {
        try {
          const parsed: ChatSession[] = JSON.parse(saved);
          if (savedActive) {
            const found = parsed.find(h => h.id === savedActive);
            if (found) return found.msgs;
          }
          if (parsed.length > 0 && !savedActive) return parsed[0].msgs;
        } catch {}
      }
    }
    return [];
  });

  const dailyOracle = useDailyOracle(history);
  const [oracleUnlocked, setOracleUnlocked] = useState(dailyOracle.isUnlocked);
  
  const unlockOracle = () => {
    setOracleUnlocked(true);
    localStorage.setItem('lumina_oracle', JSON.stringify({ date: new Date().toDateString(), text: dailyOracle.text }));
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    // Auto-open sidebar on desktop, keep closed on mobile
    setIsSidebarOpen(window.innerWidth > 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editChatTitle, setEditChatTitle] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(h => h.id !== id));
    if (activeId === id) {
      setMsgs([]);
      setActiveId(Date.now().toString());
    }
  };

  const saveRename = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setHistory(prev => prev.map(h => h.id === id ? { ...h, title: editChatTitle } : h));
    setEditingChatId(null);
  };

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem("dreem_history", JSON.stringify(history));
    }
  }, [history]);

  // Persist active session to localStorage so refreshes don't jump to other chats
  useEffect(() => {
    if (activeId) {
      localStorage.setItem("lumina_active_id", activeId);
    }
  }, [activeId]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Breathing exercise timer
  useEffect(() => {
    if (!showBreathing) return;
    
    const phases = ['inhale', 'hold', 'exhale'] as const;
    const durations = { inhale: 4000, hold: 4000, exhale: 4000 };
    let phaseIndex = 0;
    
    const cycle = () => {
      setBreathPhase(phases[phaseIndex]);
      phaseIndex = (phaseIndex + 1) % 3;
    };
    
    cycle();
    const interval = setInterval(cycle, durations[phases[phaseIndex % 3]]);
    return () => clearInterval(interval);
  }, [showBreathing]);

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
  const speak = useCallback(async (text: string) => {
    if (!ttsEnabled) return;
    
    // Stop any existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      // Clean markdown
      const cleanText = text.replace(/[*_#`~]/g, '');
      
      const ELEVEN_LABS_KEY = "sk_56c092125b67fe315e483d7fe59fa7031bab1b2e10b78120";
      const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Bella - Soft & Calming

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVEN_LABS_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!response.ok) throw new Error("ElevenLabs API Error");

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
    } catch (error) {
      console.error("TTS Error:", error);
      // Fallback to native if ElevenLabs fails
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.replace(/[*_#`~]/g, ''));
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
      }
    }
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
  const send = useCallback(async (text: string, imageBase64?: string, overrideHistory?: Msg[]) => {
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
    
    // Auto-detect mood and log it
    const lowerT = t.toLowerCase();
    let detectedMood: Mood = '😐';
    if (/(happy|great|excellent|joy|excited|love|beautiful|amazing|smile|good|awesome|proud|wonderful|blessed|grateful)/.test(lowerT)) {
      detectedMood = '😊';
    } else if (/(calm|peace|relax|breathe|gentle|quiet|still|soft|rest|easy|flow|center|meditate)/.test(lowerT)) {
      detectedMood = '🙂';
    } else if (/(sad|sorry|tough|hard|struggle|pain|hurt|grief|alone|tired|weary|exhausted|lost|confused)/.test(lowerT)) {
      detectedMood = '😔';
    } else if (/(anxious|worry|stress|overwhelm|frustrated|angry|mad|annoyed)/.test(lowerT)) {
      detectedMood = '😕';
    }

    const moodLog = JSON.parse(localStorage.getItem('lumina_moods') || '[]');
    moodLog.unshift({ mood: detectedMood, ts: Date.now() });
    localStorage.setItem('lumina_moods', JSON.stringify(moodLog.slice(0, 90)));

    // Auto-extract profound memories
    if (t.length > 60 && !t.endsWith('?')) {
      const memories = JSON.parse(localStorage.getItem('lumina_memories') || '[]');
      if (!memories.find((m: any) => m.text === t)) {
        memories.unshift({ text: t, date: new Date().toLocaleDateString() });
        localStorage.setItem('lumina_memories', JSON.stringify(memories.slice(0, 50)));
      }
    }

    const baseMsgs = overrideHistory || msgs;
    const nextMsgs = [...baseMsgs, userMsg];
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
        setMsgs(prev => [...prev, { role: "assistant", content: "", streaming: true, isNew: true }]);
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
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
                    const lastIndex = updated.length - 1;
                    if (lastIndex >= 0 && updated[lastIndex] && updated[lastIndex].role === "assistant") {
                      updated[lastIndex] = {
                        ...updated[lastIndex],
                        content: accumulated
                      };
                    }
                    return updated;
                  });
                }
              } catch (parseErr) { 
                console.warn("Parse error for line:", jsonString, parseErr);
                continue; 
              }
            }
          }
        } catch (readErr) {
          console.error("Stream reading error:", readErr);
          throw readErr; // Re-throw to be caught by outer catch
        }

        if (accumulated) speak(accumulated);
      }

      setHistory(prev => {
        const stripIsNew = (m: Msg): Msg => {
          const cleaned: Msg = {
            role: m.role,
            content: m.content
          };
          if (m.displayText !== undefined) cleaned.displayText = m.displayText;
          if (m.imagePreview !== undefined) cleaned.imagePreview = m.imagePreview;
          // Explicitly exclude streaming and isNew
          return cleaned;
        };
        
        const existingIdx = prev.findIndex(h => h.id === activeId);
        const cleanedNextMsgs = nextMsgs.map(stripIsNew);
        const assistantMsg: Msg = { role: "assistant", content: accumulated };
        
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            msgs: [...cleanedNextMsgs, assistantMsg]
          };
          return updated;
        }
        
        let titleText = typeof userMsgContent === "string" ? userMsgContent : "New Chat";
        if (titleText.length > 25) titleText = titleText.substring(0, 25) + "...";

        return [
          { id: activeId, title: titleText, msgs: [...cleanedNextMsgs, assistantMsg] },
          ...prev
        ];
      });

    } catch (err) {
      console.error("Error sending message:", err);
      setMsgs(prev => {
        // Remove any streaming assistant messages and add error message
        const filtered = prev.filter(m => !(m.role === "assistant" && m.streaming));
        return [...filtered, { role: "assistant", content: "I'm having trouble connecting right now. Please try again in a moment." }];
      });
    } finally {
      setLoading(false);
      setMsgs(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex >= 0 && updated[lastIndex]) {
          updated[lastIndex] = { ...updated[lastIndex], streaming: false };
        }
        return updated;
      });
    }
  }, [msgs, loading, user, credits, activeId, speak]);

  const handleSend = () => send(input, pendingImage || undefined);

  const handleRegenerate = (index: number) => {
    if (loading) return;
    const prevUserIdx = index - 1;
    if (prevUserIdx < 0) return;
    const userMsg = msgs[prevUserIdx];
    const newHistory = msgs.slice(0, prevUserIdx);
    setMsgs(newHistory);
    const text = typeof userMsg.content === 'string' ? userMsg.content : (userMsg.content as any[]).find((c: any) => c.type === 'text')?.text || '';
    send(text, userMsg.imagePreview, newHistory);
  };

  const handleEditMessage = (index: number) => {
    if (loading) return;
    const msg = msgs[index];
    const text = typeof msg.content === 'string' ? msg.content : (msg.content as any[]).find((c: any) => c.type === 'text')?.text || '';
    setInput(text);
    setMsgs(msgs.slice(0, index));
  };

  const handleClearChat = () => {
    if (loading) return;
    if (confirm("Are you sure you want to clear this chat?")) {
      setMsgs([]);
      setActiveId(Date.now().toString());
    }
  };

  const getMsgText = (msg: Msg): string => {
    if (!msg) return "";
    if (msg.displayText !== undefined) return msg.displayText;
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      const textPart = msg.content.find(p => p && p.type === "text");
      return textPart?.text || "";
    }
    return "";
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="app-container">

      {/* Daily affirmation toast */}
      {showAffirmation && (
        <div className="affirmation-toast">
          <div className="affirmation-icon">
            <Heart size={18} style={{ color: 'white' }} />
          </div>
          <p className="affirmation-text">{currentAffirmation}</p>
        </div>
      )}

      {/* Background — static gradient scene + 2 tiny motion accents */}
      <div className="bg-scene" aria-hidden="true">
        <div className="bg-accent-1" />
        <div className="bg-accent-2" />
        <div className="bg-accent-3" />
        <div className="bg-accent-4" />
        <div className="bg-accent-5" />
        <EnergyMotes />
      </div>

      {/* Breathing Exercise — full screen overlay */}
      <button
        className="breathing-trigger"
        onClick={() => setShowBreathing(!showBreathing)}
        title="Breathing exercise"
        style={{ position: 'fixed', bottom: 100, right: 24, zIndex: 50 }}
      >
        <Wind size={24} />
      </button>

      {showBreathing && (
        <div className="breathing-fullscreen" onClick={() => setShowBreathing(false)}>
          <BreathingOrbCanvas phase={breathPhase} />
          <div className="breathing-overlay-content" onClick={e => e.stopPropagation()}>
            <p className="breathing-phase-label">
              {breathPhase === 'inhale' ? 'Breathe In' : breathPhase === 'hold' ? 'Hold' : 'Breathe Out'}
            </p>
            <p className="breathing-hint">4 · 4 · 4 box breath &nbsp;·&nbsp; tap anywhere to close</p>
          </div>
        </div>
      )}

      {/* Aura Card Overlay */}
      {showAura && <AuraCard streak={streak} history={history} onClose={() => setShowAura(false)} />}
      
      {/* Memory Vault Overlay */}
      {showVault && <MemoryVault onClose={() => setShowVault(false)} />}

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
          <LivingCoreOrb streak={streak} />
          
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
            maxWidth: '520px', 
            lineHeight: 1.7, 
            marginBottom: '3rem',
            animation: 'fadeUp 1s ease-out 0.3s both'
          }}>
            Your personal consciousness interface. A private space for deep reflection and sentient discovery.
          </p>

          <div style={{ maxWidth: '400px', margin: '0 auto 2rem auto', width: '100%' }}>
            {!oracleUnlocked ? (
              <div 
                onClick={unlockOracle}
                style={{
                  padding: '16px 24px',
                  background: 'var(--glass-2)',
                  borderRadius: '16px',
                  border: '1px solid var(--accent-lavender)',
                  cursor: 'pointer',
                  animation: 'pulseCore 3s infinite alternate',
                  boxShadow: '0 0 15px var(--glow-primary)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '15px' }}>Tap to unlock your Daily Oracle</p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px' }}>Personalized insight based on your aura</p>
              </div>
            ) : (
              <p style={{ 
                color: 'var(--text-secondary)', 
                fontSize: '16px', 
                fontWeight: 300, 
                lineHeight: 1.6,
                padding: '20px',
                background: 'var(--glass-1)',
                borderRadius: '16px',
                border: '1px solid var(--border-glass)',
                animation: 'fadeUp 0.6s ease-out'
              }}>
                "{dailyOracle.text}"
              </p>
            )}
          </div>
          
          <button 
            onClick={() => setScreen("chat")} 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.75rem', 
              padding: '1.2rem 3rem', 
              borderRadius: '50px', 
              background: 'var(--gradient-button)', 
              color: 'var(--text-inverse)', 
              fontWeight: 600, 
              fontSize: '1.1rem', 
              border: 'none', 
              cursor: 'pointer', 
              boxShadow: '0 8px 32px var(--glow-primary)',
              transition: 'all 0.3s var(--ease-glass)',
              animation: 'fadeUp 1s ease-out 0.6s both'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 12px 48px var(--glow-primary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 32px var(--glow-primary)';
            }}
          >
            Enter Interface <Sparkles size={20} />
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

            <button className="new-chat-btn-dream" onClick={() => { setMsgs([]); setActiveId(Date.now().toString()); if (isMobile) setIsSidebarOpen(false); }}>
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

            <div className="sidebar-section">
              <p className="sidebar-label">Recent</p>
              {history.length === 0 && <div className="history-empty">No conversations yet.</div>}
              {history.map(chat => (
                <div 
                  key={chat.id} 
                  className={`history-item-dream ${activeId === chat.id ? "active" : ""}`} 
                  onClick={() => { setActiveId(chat.id); setMsgs(chat.msgs); if (isMobile) setIsSidebarOpen(false); }}
                >
                  <MessageCircle size={14} />
                  {editingChatId === chat.id ? (
                    <input 
                      autoFocus
                      className="history-rename-input"
                      value={editChatTitle}
                      onChange={e => setEditChatTitle(e.target.value)}
                      onBlur={() => saveRename(chat.id)}
                      onKeyDown={e => e.key === 'Enter' && saveRename(chat.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="history-text">{chat.title}</span>
                  )}
                  
                  <div className="chat-actions">
                    <button className="chat-action-btn" onClick={(e) => {
                      e.stopPropagation();
                      setEditingChatId(chat.id);
                      setEditChatTitle(chat.title);
                    }} title="Rename">
                      <Edit2 size={12} />
                    </button>
                    <button className="chat-action-btn" onClick={(e) => deleteChat(chat.id, e)} title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Aura & Streak Section */}
            <div className="streak-card" onClick={() => { setShowAura(true); if (isMobile) setIsSidebarOpen(false); }} style={{ cursor: 'pointer' }}>
              <span className="streak-flame"></span>
              <div style={{ flex: 1 }}>
                <p className="streak-count" style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '1px', opacity: 0.7 }}>Streak</p>
                <p className="streak-label" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'none' }}>{streak} {streak === 1 ? "day" : "days"}</p>
              </div>
            </div>

            {/* Memory Vault Section */}
            <div className="streak-card" onClick={() => { setShowVault(true); if (isMobile) setIsSidebarOpen(false); }} style={{ cursor: 'pointer', marginTop: '12px' }}>
              <span className="streak-flame" style={{ filter: 'hue-rotate(90deg)' }}></span>
              <div style={{ flex: 1 }}>
                <p className="streak-count">Memory Vault</p>
                <p className="streak-label">Preserved thoughts</p>
              </div>
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

          {isSidebarOpen && isMobile && (
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

              {/* Header actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                {msgs.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    title="Clear Chat"
                    className="icon-btn-clear"
                    style={{ fontSize: 18, color: '#ef4444' }}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button
                  onClick={() => setShowMood(p => !p)}
                  title="Log mood"
                  className="icon-btn-clear"
                  style={{ fontSize: 18 }}
                >
                  <SmilePlus size={18} />
                </button>
                <button 
                  onClick={() => { window.speechSynthesis?.cancel(); setTtsEnabled(p => !p); }} 
                  title={ttsEnabled ? "Mute voice" : "Enable voice"}
                  className="icon-btn-clear"
                  style={{ color: ttsEnabled ? 'var(--accent-lavender)' : undefined }}
                >
                  {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <ThemeIconBtn />
              </div>
            </header>
            {/* Mood logger popup */}
            {showMood && (
              <div style={{ position: 'absolute', top: 68, right: 24, zIndex: 200 }}>
                <MoodLogger onClose={() => setShowMood(false)} />
              </div>
            )}

            {/* Chat viewport */}
            <div className="chat-viewport" onScroll={handleScroll}>
              {msgs.length === 0 ? (
                <div className="dream-welcome">

                  {/* Orb */}
                  <div className="welcome-orb" style={{ width: 72, height: 72, marginBottom: 0 }}>
                    <div className="welcome-orb-core" style={{ width: '40%', height: '40%' }} />
                  </div>

                  {/* Greeting — clean, no side elements */}
                  <div className="dw-greeting">
                    <h1 className="dw-title">{getGreeting()}, {user?.firstName || "Friend"}</h1>
                    <p className="dw-subtitle">Your space. No noise, no rush.</p>
                  </div>

                  {/* Three minimal text actions — no emoji */}
                  <div className="dw-actions">
                    <button className="dw-action" onClick={() => send("Help me find some peace in this moment")}>
                      Find stillness
                    </button>
                    <div className="dw-dot" />
                    <button className="dw-action" onClick={() => send("Guide me through a calming breathing exercise")}>
                      Breathing
                    </button>
                    <div className="dw-dot" />
                    <button className="dw-action" onClick={() => send("I want to talk about what's been on my mind lately")}>
                      Just talk
                    </button>
                  </div>

                </div>
              ) : (
                msgs.map((m, i) => (
                  <motion.div 
                    key={i} 
                    className="gemini-row-dream"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  >
                    <div className={`avatar-circle-dream ${m.role}`}>
                      {m.role === "user" ? (user?.firstName?.[0] || "Y") : (
                        <div className="chat-avatar-orb" />
                      )}
                    </div>
                    <div className="text-body-dream">
                      {m.imagePreview && (
                        <img 
                          src={m.imagePreview} 
                          alt="shared" 
                          style={{ maxWidth: '220px', borderRadius: '14px', marginBottom: '12px', display: 'block', border: '1px solid var(--border-glass)' }} 
                        />
                      )}
                      
                      {/* If streaming and no text yet, show sentiment pulsing dots */}
                      {m.streaming && !m.content ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0' }}>
                          <span className="sentiment-dot" style={{ animationDelay: '0s' }} />
                          <span className="sentiment-dot" style={{ animationDelay: '0.2s' }} />
                          <span className="sentiment-dot" style={{ animationDelay: '0.4s' }} />
                        </div>
                      ) : (
                        <TypewriterMsg content={getMsgText(m)} streaming={m.streaming} isNew={m.isNew} />
                      )}

                      {/* Action row: copy + save + edit + regen */}
                      {!m.streaming && getMsgText(m) && (
                        <div className="msg-actions">
                          {m.role === 'user' && (
                            <button
                              className="msg-action-btn"
                              onClick={() => handleEditMessage(i)}
                              title="Edit and resend"
                            >
                              <Edit2 size={13} /> Edit
                            </button>
                          )}
                          <button
                            className={`msg-action-btn${copiedIdx === i ? ' copied' : ''}`}
                            onClick={() => copyMsg(getMsgText(m), i)}
                            title="Copy"
                          >
                            {copiedIdx === i ? '✓ Copied' : '⎘ Copy'}
                          </button>
                          {m.role === 'assistant' && (
                            <>
                              <button
                                className="msg-action-btn"
                                onClick={() => handleRegenerate(i)}
                                title="Regenerate response"
                              >
                                <RefreshCcw size={13} /> Retry
                              </button>
                              <button
                                className="msg-action-btn"
                                onClick={(e) => {
                                  const text = getMsgText(m);
                                  const memories = JSON.parse(localStorage.getItem('lumina_memories') || '[]');
                                  if (!memories.find((mem: any) => mem.text === text)) {
                                    memories.unshift({ text, date: new Date().toLocaleDateString() });
                                    localStorage.setItem('lumina_memories', JSON.stringify(memories.slice(0, 50)));
                                  }
                                  const btn = e.currentTarget;
                                  const originalHtml = btn.innerHTML;
                                  btn.innerHTML = '✓ Saved to Vault';
                                  btn.style.color = 'var(--accent-lavender)';
                                  setTimeout(() => {
                                    btn.innerHTML = originalHtml;
                                    btn.style.color = '';
                                  }, 2000);
                                }}
                                title="Save this response to Memory Vault"
                              >
                                <Star size={13} /> Save to Vault
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
              <div ref={bottomRef} style={{ height: '40px' }} />
              
              {showScrollBtn && (
                <button 
                  className="scroll-bottom-btn"
                  onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  title="Scroll to bottom"
                >
                  <ArrowDown size={18} />
                </button>
              )}
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
