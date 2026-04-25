import { useState, useEffect, useRef, useCallback, memo } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, onSnapshot, updateDoc, doc,
  query, orderBy, serverTimestamp, increment, limit,
} from "firebase/firestore";
import { Sparkles, ArrowLeft, Loader2, Lock, Heart } from "lucide-react";
import { Link } from "wouter";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../contexts/ThemeContext";

interface Secret {
  id: string;
  text: string;
  createdAt: any;
  reactions: Record<string, number>;
}

// Warm, comforting reactions
const REACTIONS = ["💜", "🤍", "🌙", "✨", "🫂", "🌸", "💫", "🕊️"];
const MAX_CHARS = 280;
const STAR_COUNT = 100;

// Star Field with theme-aware colors
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    // Theme-aware colors
    const isMorning = theme === "morning";
    const starColor = isMorning ? "rgba(245, 158, 11, 0.6)" : "rgba(196, 181, 253, 0.5)";
    const glowColor = isMorning ? "rgba(251, 113, 133, 0.3)" : "rgba(244, 167, 185, 0.3)";
    const lineColor = isMorning ? "rgba(245, 158, 11," : "rgba(196, 181, 253,";
    const starFill = isMorning ? "#fef3c7" : "#e9d5ff";

    // Pre-bake glow sprite
    const GS = 24;
    const gc = Object.assign(document.createElement("canvas"), { width: GS, height: GS }).getContext("2d")!;
    const gr = gc.createRadialGradient(GS/2, GS/2, 0, GS/2, GS/2, GS/2);
    gr.addColorStop(0, starColor);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    gc.fillStyle = gr;
    gc.fillRect(0, 0, GS, GS);
    const glowSprite = gc.canvas;

    type S = {
      sx: number; sy: number; x: number; y: number; cx: number; cy: number;
      r: number; drift: number; a: number; ts: number; to: number; lerp: number; ls: number; bright: boolean;
    };
    
    const stars: S[] = Array.from({ length: STAR_COUNT }, (_, i) => {
      const ang = (i / STAR_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const b = 15 + Math.random() * 50;
      const dx = Math.random() * W, dy = Math.random() * H;
      const sx = W / 2 + Math.cos(ang) * b, sy = H / 2 + Math.sin(ang) * b;
      return {
        sx, sy, x: dx, y: dy, cx: sx, cy: sy,
        r: Math.random() * 1.4 + 0.4,
        drift: Math.random() * 0.04 + 0.006,
        a: Math.random() * 0.6 + 0.25,
        ts: Math.random() * 0.014 + 0.003,
        to: Math.random() * Math.PI * 2,
        lerp: 0,
        ls: 0.004 + Math.random() * 0.004,
        bright: Math.random() > 0.75
      };
    });

    const lines: [number, number][] = [];
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
        if (dx * dx + dy * dy < 10000 && Math.random() > 0.86) lines.push([i, j]);
      }
    }

    let t = 0, nova = 0;
    
    const draw = () => {
      // Only clear what's needed
      ctx.clearRect(0, 0, W, H);
      t += 0.012;
      
      // Nova effect - only during intro
      if (nova < 1) {
        nova = Math.min(1, nova + 0.015);
        const r = nova * Math.max(W, H) * 0.6;
        const a = (1 - nova) * 0.1;
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
        g.addColorStop(0, `rgba(196, 181, 253, ${a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      
      // Batch star position updates
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (s.lerp < 1) {
          s.lerp = Math.min(1, s.lerp + s.ls);
          const e = 1 - Math.pow(1 - s.lerp, 3);
          s.cx = s.sx + (s.x - s.sx) * e;
          s.cy = s.sy + (s.y - s.sy) * e;
        } else {
          // Drift
          s.y -= s.drift * 0.14;
          s.cy = s.y;
          if (s.y < -2) {
            s.y = H + 2;
            s.x = Math.random() * W;
            s.sx = s.x;
            s.sy = s.y;
            s.cx = s.x;
            s.cy = s.y;
          }
        }
      }
      
      // Draw lines in one pass
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      for (let i = 0; i < lines.length; i++) {
        const [a, b] = lines[i];
        const p = Math.min(stars[a].lerp, stars[b].lerp);
        if (p < 0.1) continue;
        const op = p * (0.02 + 0.012 * Math.sin(t * 0.2 + a));
        ctx.strokeStyle = `${lineColor}${op.toFixed(3)})`;
        ctx.moveTo(stars[a].cx, stars[a].cy);
        ctx.lineTo(stars[b].cx, stars[b].cy);
        ctx.stroke();
        ctx.beginPath();
      }
      
      // Draw stars in batches
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const tw = s.a * (0.4 + 0.6 * Math.sin(t * s.ts * 55 + s.to));
        const al = tw * s.lerp;
        if (al < 0.03) continue;
        
        if (s.bright && al > 0.2) {
          ctx.globalAlpha = al * 0.35;
          ctx.drawImage(glowSprite, s.cx - GS / 2, s.cy - GS / 2);
        }
        
        ctx.globalAlpha = al;
        ctx.fillStyle = starFill;
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    
    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;
    };
    
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [theme]);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

// Secret Card Component
const SecretCard = memo(function SecretCard({ secret, index }: { secret: Secret; index: number }) {
  const [reacted, setReacted] = useState<string | null>(null);
  const [justReacted, setJustReacted] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), Math.min(350, 400 + index * 60));
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVisible(true);
    }, { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleReact = useCallback(async (emoji: string) => {
    if (reacted) return;
    setReacted(emoji);
    setJustReacted(emoji);
    setTimeout(() => setJustReacted(null), 650);
    try {
      await updateDoc(doc(db, "constellation", secret.id), { [`reactions.${emoji}`]: increment(1) });
    } catch (err) {
      console.error(err);
    }
  }, [reacted, secret.id]);

  const topReactions = REACTIONS.filter(e => (secret.reactions?.[e] || 0) > 0);
  const totalReactions = Object.values(secret.reactions || {}).reduce((a, b) => a + b, 0);

  return (
    <div
      ref={cardRef}
      className={`secret-card${visible ? " sc-visible" : ""}`}
      style={{ transitionDelay: `${Math.min(0.25, index * 0.05)}s` }}
    >
      <div className="sc-accent" aria-hidden="true" />
      <div className="sc-quote" aria-hidden="true">"</div>
      <p className="secret-text">{secret.text}</p>

      {totalReactions > 0 && (
        <div className="reaction-summary">
          {topReactions.slice(0, 4).map(e => (
            <span key={e} className="rs-chip">
              <span className="rs-emoji">{e}</span>
              <span className="rs-count">{secret.reactions[e]}</span>
            </span>
          ))}
          {totalReactions > 0 && (
            <span className="rs-total">{totalReactions} {totalReactions === 1 ? "heart" : "hearts"}</span>
          )}
        </div>
      )}

      <div className="reaction-row">
        {REACTIONS.map(emoji => {
          const count = secret.reactions?.[emoji] || 0;
          const sel = reacted === emoji;
          const pop = justReacted === emoji;
          return (
            <button
              key={emoji}
              className={`reaction-btn${sel ? " rb-sel" : ""}${pop ? " rb-pop" : ""}`}
              onClick={() => handleReact(emoji)}
              disabled={!!reacted}
              aria-label={`React with ${emoji}`}
            >
              <span>{emoji}</span>
              {count > 0 && <span className="rb-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
});

// Compose Overlay
function ComposeOverlay({ onClose, onSubmit }: { onClose: () => void; onSubmit: (t: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "done">("idle");
  const [mounted, setMounted] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    setTimeout(() => taRef.current?.focus(), 300);
  }, []);

  const handleSubmit = async () => {
    if (!text.trim() || phase !== "idle") return;
    setPhase("submitting");
    await onSubmit(text.trim());
    setPhase("done");
    setTimeout(() => onClose(), 2200);
  };

  const remaining = MAX_CHARS - text.length;

  return (
    <div
      className={`compose-backdrop${mounted ? " cb-visible" : ""}`}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={`compose-panel${mounted ? " cp-in" : ""}`}>
        {phase === "done" ? (
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', margin: '0 auto 20px', borderRadius: '50%', background: 'var(--gradient-button)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-glow)', animation: 'orb-breathe 2s ease-in-out infinite' }}>
              <Heart size={28} style={{ color: 'var(--bg-primary)' }} />
            </div>
            <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Shared with the stars
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Your words now float among the constellation
            </p>
          </div>
        ) : (
          <>
            <div className="compose-header">
              <div className="ch-icon"><Sparkles size={16} style={{ color: 'var(--accent-primary)' }} /></div>
              <div className="ch-text">
                <h3>Share Something</h3>
                <p>Anonymous, gentle, safe</p>
              </div>
              <button className="ch-close" onClick={onClose} aria-label="Close">
                <span style={{ fontSize: '18px' }}>×</span>
              </button>
            </div>

            <div className="compose-body">
              <textarea
                ref={taRef}
                className="compose-textarea"
                value={text}
                onChange={e => setText(e.target.value.slice(0, MAX_CHARS))}
                placeholder="What would you like to release into the stars..."
                rows={5}
              />
              <p className={`char-count ${remaining < 30 ? (remaining < 0 ? 'over' : 'warn') : ''}`}>
                {remaining} characters remaining
              </p>
            </div>

            <div className="compose-footer">
              <button className="cf-cancel" onClick={onClose}>Cancel</button>
              <button
                className="cf-submit"
                onClick={handleSubmit}
                disabled={!text.trim() || phase === "submitting"}
              >
                {phase === "submitting" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <Sparkles size={14} style={{ marginRight: '6px' }} />
                    Release
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Main Constellation Page
export function Constellation() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "constellation"), orderBy("createdAt", "desc"), limit(60));
    return onSnapshot(q, snap => {
      setSecrets(snap.docs.map(d => ({ id: d.id, ...d.data() } as Secret)));
    });
  }, []);

  const handleSubmit = useCallback(async (text: string) => {
    await addDoc(collection(db, "constellation"), { text, createdAt: serverTimestamp(), reactions: {} });
  }, []);

  return (
    <div className={`constellation-page${ready ? " cp-ready" : ""}`}>
      <ThemeToggle />
      
      {/* Background */}
      <div className="bg-scene" aria-hidden="true">
        <div className="bg-cloud bg-cloud-1" />
        <div className="bg-cloud bg-cloud-2" />
        <div className="bg-cloud bg-cloud-3" />
        <div className="bg-cloud bg-cloud-4" />
        <div className="bg-refraction" />
        <div className="bg-noise" />
      </div>

      <StarField />

      {/* Entry overlay */}
      <div className="entry-overlay" aria-hidden="true">
        <div className="entry-title">Constellation</div>
        <div className="entry-sub">where hearts find each other</div>
      </div>

      {/* Header */}
      <header className="constellation-header">
        <Link href="/">
          <button className="back-btn">
            <ArrowLeft size={16} />
            <span>Home</span>
          </button>
        </Link>
        
        <div className="chead-center">
          <div className="constellation-orb">
            <div className="constellation-orb-inner" />
          </div>
          <div>
            <h1 className="constellation-title">Constellation</h1>
            <p className="constellation-tagline">Anonymous words, shared gently</p>
          </div>
        </div>
        
        <div className="constellation-count">
          <Heart size={12} />
          {secrets.length}
        </div>
      </header>

      {/* Feed */}
      <main className="constellation-feed">
        {secrets.length === 0 ? (
          <div className="feed-empty">
            <div className="feed-empty-orb">
              <div className="feed-empty-orb-inner" />
            </div>
            <p className="feed-empty-title">The stars are waiting</p>
            <p className="feed-empty-sub">Be the first to share something with the constellation</p>
          </div>
        ) : (
          <div className="secrets-grid">
            {secrets.map((s, i) => <SecretCard key={s.id} secret={s} index={i} />)}
          </div>
        )}
      </main>

      {/* FAB */}
      <button className="constellation-fab" onClick={() => setShowCompose(true)}>
        <Sparkles size={18} />
        <span>Share Something</span>
      </button>

      {showCompose && <ComposeOverlay onClose={() => setShowCompose(false)} onSubmit={handleSubmit} />}
    </div>
  );
}
