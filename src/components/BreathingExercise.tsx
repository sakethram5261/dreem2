import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';

export function BreathingExercise() {
  const { ui, toggleBreathing, setUIState } = useChatStore();
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');

  useEffect(() => {
    if (!ui.showBreathingExercise) return;

    const phases: Array<'inhale' | 'hold' | 'exhale'> = ['inhale', 'hold', 'exhale'];
    const durations = { inhale: 4000, hold: 4000, exhale: 4000 };
    let currentPhaseIndex = 0;

    const cycle = () => {
      setPhase(phases[currentPhaseIndex]);
      setUIState({ breathPhase: phases[currentPhaseIndex] });
      currentPhaseIndex = (currentPhaseIndex + 1) % 3;
    };

    cycle();

    const interval = setInterval(() => {
      cycle();
    }, durations[phases[currentPhaseIndex % 3]]);

    return () => clearInterval(interval);
  }, [ui.showBreathingExercise, setUIState]);

  if (!ui.showBreathingExercise) return null;

  return (
    <div className="breathing-overlay" onClick={toggleBreathing}>
      <div className="breathing-container" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn btn-ghost btn-icon"
          onClick={toggleBreathing}
          style={{ position: 'absolute', top: 'var(--space-6)', right: 'var(--space-6)' }}
          aria-label="Close breathing exercise"
        >
          <X size={24} />
        </button>

        <div className={`breathing-circle ${phase}`} />
        
        <div className="breathing-instruction">{phase}</div>
        
        <p style={{ 
          color: 'var(--color-text-secondary)', 
          textAlign: 'center',
          maxWidth: '400px',
          lineHeight: 1.6
        }}>
          Follow the circle's rhythm. Breathe deeply and let tension release with each exhale.
        </p>
      </div>
    </div>
  );
}
