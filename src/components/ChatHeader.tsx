import { Menu, Volume2, VolumeX, Sparkles, Wind } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';

const MODEL_TAG = 'llama-3.3-70b';

export function ChatHeader() {
  const { ui, toggleSidebar, toggleTTS, toggleBreathing } = useChatStore();

  return (
    <header className="chat-header">
      <div className="chat-header-left">
        <button
          className="btn btn-ghost btn-icon"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu size={22} />
        </button>

        <div className="chat-header-logo">
          <div className="chat-header-logo-icon">
            <Sparkles size={20} color="white" />
          </div>
          <span className="chat-header-logo-text">Lumina</span>
        </div>
      </div>

      <div className="chat-header-right">
        <div className="model-badge">{MODEL_TAG}</div>
        
        <button
          className="btn btn-ghost btn-icon"
          onClick={toggleBreathing}
          aria-label="Breathing exercise"
          title="Breathing exercise"
        >
          <Wind size={18} />
        </button>

        <button
          className="btn btn-ghost btn-icon"
          onClick={toggleTTS}
          aria-label={ui.ttsEnabled ? 'Disable voice' : 'Enable voice'}
          title={ui.ttsEnabled ? 'Disable voice' : 'Enable voice'}
          style={{ color: ui.ttsEnabled ? 'var(--color-accent-primary)' : undefined }}
        >
          {ui.ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>
    </header>
  );
}
