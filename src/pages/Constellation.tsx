import { useState, useEffect, useRef, useCallback, memo } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, onSnapshot, updateDoc, doc,
  query, orderBy, serverTimestamp, increment, limit,
} from "firebase/firestore";
import { Sparkles, ArrowLeft, Loader2, Lock } from "lucide-react";
import { Link } from "wouter";

interface Secret {
  id: string;
  text: string;
  createdAt: any;
  reactions: Record<string, number>;
}

const REACTIONS = ["🌙", "💙", "🕊️", "✨", "🫂", "🌊", "🔥", "💫"];
const MAX_CHARS = 280;
const STAR_COUNT = 140;

// ─── STAR FIELD ───────────────────────────────────────────
// Perf: offscreen glow sprite, no per-frame string alloc,
//       one clearRect + batched draws
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    // Pre-bake glow sprite once
    const GS = 20;
    const gc = Object.assign(document.createElement("canvas"), { width: GS, height: GS }).getContext("2d")!;
    const gr = gc.createRadialGradient(GS/2,GS/2,0,GS/2,GS/2,GS/2);
    gr.addColorStop(0,"rgba(0,230,255,0.5)"); gr.addColorStop(1,"rgba(0,0,0,0)");
    gc.fillStyle=gr; gc.fillRect(0,0,GS,GS);
    const glowSprite = gc.canvas;

    type S = { sx:number;sy:number;x:number;y:number;cx:number;cy:number;
               r:number;drift:number;a:number;ts:number;to:number;lerp:number;ls:number;bright:boolean };
    const stars: S[] = Array.from({length:STAR_COUNT},(_,i)=>{
      const ang = (i/STAR_COUNT)*Math.PI*2+Math.random()*0.5;
      const b   = 15+Math.random()*50;
      const dx  = Math.random()*W, dy = Math.random()*H;
      const sx  = W/2+Math.cos(ang)*b, sy = H/2+Math.sin(ang)*b;
      return { sx,sy,x:dx,y:dy,cx:sx,cy:sy,
               r:Math.random()*1.2+0.3, drift:Math.random()*0.05+0.008,
               a:Math.random()*0.65+0.2, ts:Math.random()*0.016+0.004,
               to:Math.random()*Math.PI*2, lerp:0, ls:0.005+Math.random()*0.005,
               bright:Math.random()>0.72 };
    });

    const lines: [number,number][] = [];
    for(let i=0;i<stars.length;i++) for(let j=i+1;j<stars.length;j++){
      const dx=stars[i].x-stars[j].x,dy=stars[i].y-stars[j].y;
      if(dx*dx+dy*dy<8100&&Math.random()>0.84) lines.push([i,j]);
    }

    let t=0, nova=0;
    const draw = () => {
      ctx.clearRect(0,0,W,H);
      t+=0.014;
      if(nova<1){ nova=Math.min(1,nova+0.011);
        const r=nova*Math.max(W,H)*0.7, a=(1-nova)*0.13;
        const g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,r);
        g.addColorStop(0,`rgba(0,230,255,${a})`); g.addColorStop(1,"rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(W/2,H/2,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      }
      for(const s of stars){
        if(s.lerp<1){ s.lerp=Math.min(1,s.lerp+s.ls); }
        const e=s.lerp<1?1-Math.pow(1-s.lerp,3):1;
        s.cx=s.sx+(s.x-s.sx)*e; s.cy=s.sy+(s.y-s.sy)*e;
      }
      ctx.lineWidth=0.4;
      for(const [a,b] of lines){
        const p=Math.min(stars[a].lerp,stars[b].lerp); if(p<0.1) continue;
        const op=p*(0.025+0.015*Math.sin(t*0.22+a));
        ctx.beginPath(); ctx.moveTo(stars[a].cx,stars[a].cy); ctx.lineTo(stars[b].cx,stars[b].cy);
        ctx.strokeStyle=`rgba(0,220,255,${op.toFixed(3)})`; ctx.stroke();
      }
      ctx.save();
      for(const s of stars){
        const tw=s.a*(0.45+0.55*Math.sin(t*s.ts*60+s.to));
        const al=tw*s.lerp; if(al<0.03) continue;
        if(s.bright&&al>0.22){ ctx.globalAlpha=al*0.4; ctx.drawImage(glowSprite,s.cx-GS/2,s.cy-GS/2); }
        ctx.globalAlpha=al; ctx.beginPath(); ctx.arc(s.cx,s.cy,s.r,0,Math.PI*2);
        ctx.fillStyle="#d0eeff"; ctx.fill();
        if(s.lerp>=1){ s.y-=s.drift*0.16; s.cy=s.y;
          if(s.y<-2){s.y=H+2;s.x=Math.random()*W;s.sx=s.x;s.sy=s.y;s.cx=s.x;s.cy=s.y;} }
      }
      ctx.restore();
      rafRef.current=requestAnimationFrame(draw);
    };
    draw();
    const onResize=()=>{W=window.innerWidth;H=window.innerHeight;canvas.width=W;canvas.height=H;};
    window.addEventListener("resize",onResize);
    return ()=>{cancelAnimationFrame(rafRef.current);window.removeEventListener("resize",onResize);};
  },[]);

  return <canvas ref={canvasRef} style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}} />;
}

// ─── FLOATERS ─────────────────────────────────────────────
const FLOATERS = Array.from({length:8},(_,i)=>{
  const s=i*97.3;
  return {left:((s*1.618)%100).toFixed(1),delay:(-(s%16)).toFixed(1),dur:((s%8)+14).toFixed(1),sz:((s%1.5)+0.8).toFixed(1)};
});

// ─── SECRET CARD ─────────────────────────────────────────
const SecretCard = memo(function SecretCard({secret,index}:{secret:Secret;index:number}) {
  const [reacted,     setReacted]     = useState<string|null>(null);
  const [justReacted, setJustReacted] = useState<string|null>(null);
  const [visible,     setVisible]     = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const t=setTimeout(()=>setVisible(true), Math.min(350,400+index*65));
    return ()=>clearTimeout(t);
  },[index]);

  useEffect(()=>{
    const el=cardRef.current; if(!el) return;
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting)setVisible(true);},{threshold:0.05});
    obs.observe(el); return ()=>obs.disconnect();
  },[]);

  const handleReact=useCallback(async(emoji:string)=>{
    if(reacted) return;
    setReacted(emoji); setJustReacted(emoji);
    setTimeout(()=>setJustReacted(null),650);
    try{ await updateDoc(doc(db,"constellation",secret.id),{[`reactions.${emoji}`]:increment(1)}); }
    catch(err){ console.error(err); }
  },[reacted,secret.id]);

  const topReactions = REACTIONS.filter(e=>(secret.reactions?.[e]||0)>0);
  const totalReactions = Object.values(secret.reactions||{}).reduce((a,b)=>a+b,0);

  return (
    <div ref={cardRef} className={`secret-card${visible?" sc-visible":""}`}
         style={{transitionDelay:`${Math.min(0.28,index*0.055)}s`}}>
      {/* top accent line */}
      <div className="sc-accent" aria-hidden="true"/>
      {/* quote mark */}
      <div className="sc-quote" aria-hidden="true">"</div>
      <p className="secret-text">{secret.text}</p>

      {/* reaction summary row — only shown emojis with counts */}
      {totalReactions>0 && (
        <div className="reaction-summary">
          {topReactions.slice(0,4).map(e=>(
            <span key={e} className="rs-chip">
              <span className="rs-emoji">{e}</span>
              <span className="rs-count">{secret.reactions[e]}</span>
            </span>
          ))}
          {totalReactions>0 && <span className="rs-total">{totalReactions} {totalReactions===1?"resonance":"resonances"}</span>}
        </div>
      )}

      {/* reaction buttons */}
      <div className="reaction-row">
        {REACTIONS.map(emoji=>{
          const count=secret.reactions?.[emoji]||0;
          const sel=reacted===emoji;
          const pop=justReacted===emoji;
          return (
            <button key={emoji}
              className={`reaction-btn${sel?" rb-sel":""}${pop?" rb-pop":""}`}
              onClick={()=>handleReact(emoji)} disabled={!!reacted}
              aria-label={`React with ${emoji}`}>
              <span>{emoji}</span>
              {count>0&&<span className="rb-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
});

// ─── COMPOSE OVERLAY ─────────────────────────────────────
// Key perf fix: backdrop-filter is on backdrop, panel has NO blur
// Panel animates with transform only — no layout reflow
function ComposeOverlay({onClose,onSubmit}:{onClose:()=>void;onSubmit:(t:string)=>Promise<void>}) {
  const [text,    setText]    = useState("");
  const [phase,   setPhase]   = useState<"idle"|"submitting"|"done">("idle");
  const [mounted, setMounted] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{
    // Use double RAF so the browser paints the backdrop first, THEN animates the panel
    // This prevents the blur+transform lag
    requestAnimationFrame(()=>requestAnimationFrame(()=>setMounted(true)));
    setTimeout(()=>taRef.current?.focus(), 300);
  },[]);

  const handleSubmit=async()=>{
    if(!text.trim()||phase!=="idle") return;
    setPhase("submitting");
    await onSubmit(text.trim());
    setPhase("done");
    setTimeout(()=>onClose(),2000);
  };

  const remaining=MAX_CHARS-text.length;
  const pct=(text.length/MAX_CHARS)*100;
  const dash=(pct/100)*75.4;
  const ringClr=remaining<30?"#ff6b6b":remaining<80?"#ffa94d":"#00e5ff";

  return (
    <div className={`compose-backdrop${mounted?" cb-visible":""}`}
         onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`compose-panel${mounted?" cp-in":""}`}>

        {phase==="done"?(
          <div className="compose-success">
            <div className="success-icon">
              <div className="si-ring"/>
              <div className="si-core"/>
            </div>
            <p className="success-title">Released into the cosmos</p>
            <p className="success-sub">Your secret now lives among the stars</p>
          </div>
        ):(
          <>
            <div className="compose-header">
              <div className="ch-icon"><Sparkles size={14}/></div>
              <div>
                <h2 className="ch-title">Share a Secret</h2>
                <p className="ch-sub">Anonymous · Eternal · Safe</p>
              </div>
              <button className="ch-close" onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className="compose-body">
              <textarea ref={taRef} className="compose-ta"
                value={text}
                onChange={e=>setText(e.target.value.slice(0,MAX_CHARS))}
                placeholder="What have you never told anyone…"
                rows={5}/>
              <div className="compose-ring-wrap">
                <svg viewBox="0 0 32 32" width="28" height="28">
                  <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5"/>
                  <circle cx="16" cy="16" r="12" fill="none"
                    stroke={ringClr} strokeWidth="2.5"
                    strokeDasharray={`${dash} 75.4`}
                    strokeLinecap="round" transform="rotate(-90 16 16)"
                    style={{transition:"stroke-dasharray .12s ease, stroke .2s ease"}}/>
                </svg>
                {remaining<50&&<span className="ring-num" style={{color:ringClr}}>{remaining}</span>}
              </div>
            </div>

            <div className="compose-footer">
              <div className="cf-privacy"><Lock size={11}/> No names, no traces</div>
              <div className="cf-actions">
                <button className="btn-cancel" onClick={onClose}>Cancel</button>
                <button className="btn-release" onClick={handleSubmit}
                        disabled={!text.trim()||phase==="submitting"}>
                  {phase==="submitting"
                    ?<Loader2 size={14} className="animate-spin"/>
                    :<><Sparkles size={13}/>Release</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────
export function Constellation() {
  const [secrets,     setSecrets]     = useState<Secret[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const [ready,       setReady]       = useState(false);

  useEffect(()=>{
    const t=setTimeout(()=>setReady(true),80);
    return ()=>clearTimeout(t);
  },[]);

  useEffect(()=>{
    const q=query(collection(db,"constellation"),orderBy("createdAt","desc"),limit(60));
    return onSnapshot(q,snap=>{
      setSecrets(snap.docs.map(d=>({id:d.id,...d.data()} as Secret)));
    });
  },[]);

  const handleSubmit=useCallback(async(text:string)=>{
    await addDoc(collection(db,"constellation"),{text,createdAt:serverTimestamp(),reactions:{}});
  },[]);

  return (
    <div className={`constellation-page${ready?" cp-ready":""}`}>
      <div className="bg-scene" aria-hidden="true">
        <div className="bg-orb bg-orb-1"/><div className="bg-orb bg-orb-2"/><div className="bg-orb bg-orb-3"/>
        <div className="bg-aurora"/>
        <div className="particle-field">
          {FLOATERS.map((p,i)=>(
            <div key={i} className="particle"
              style={{width:`${p.sz}px`,height:`${p.sz}px`,left:`${p.left}%`,
                      animationDelay:`${p.delay}s`,animationDuration:`${p.dur}s`}}/>
          ))}
        </div>
      </div>

      <StarField/>

      {/* Entry title — pure CSS, no JS */}
      <div className="entry-overlay" aria-hidden="true">
        <div className="entry-title">✦ Constellation ✦</div>
        <div className="entry-sub">Where secrets become stars</div>
      </div>

      <header className="constellation-header">
        <Link href="/"><button className="back-btn"><ArrowLeft size={16}/><span>Lumina</span></button></Link>
        <div className="chead-center">
          <div className="constellation-orb"><div className="constellation-orb-inner"/></div>
          <div>
            <h1 className="constellation-title">Constellation</h1>
            <p className="constellation-tagline">Anonymous secrets, floating in the cosmos</p>
          </div>
        </div>
        <div className="constellation-count"><Sparkles size={11}/>{secrets.length}</div>
      </header>

      <main className="constellation-feed">
        {secrets.length===0?(
          <div className="feed-empty">
            <div className="feed-empty-orb"><div className="feed-empty-orb-inner"/></div>
            <p className="feed-empty-title">The cosmos awaits your first secret</p>
            <p className="feed-empty-sub">Be the first to release something into the stars</p>
          </div>
        ):(
          <div className="secrets-grid">
            {secrets.map((s,i)=><SecretCard key={s.id} secret={s} index={i}/>)}
          </div>
        )}
      </main>

      <button className="constellation-fab" onClick={()=>setShowCompose(true)}>
        <Sparkles size={18}/><span>Share a Secret</span>
      </button>

      {showCompose&&<ComposeOverlay onClose={()=>setShowCompose(false)} onSubmit={handleSubmit}/>}
    </div>
  );
}
