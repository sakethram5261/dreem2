import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Mic, MicOff, ImagePlus, X, Loader2 } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useVoiceRecording } from '../hooks/useChat';

interface ChatInputProps {
  onSend: (message: string, imageData?: string) => void;
  loading: boolean;
}

export function ChatInput({ onSend, loading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { ui } = useChatStore();
  const { startRecording, stopRecording } = useVoiceRecording();

  const handleSend = () => {
    const message = input.trim();
    if (!message && !pendingImage) return;

    onSend(message, pendingImage || undefined);
    setInput('');
    setPendingImage(null);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setPendingImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const handleRecordClick = async () => {
    if (ui.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const placeholder = ui.isRecording 
    ? "Listening..." 
    : ui.isTranscribing 
    ? "Processing..." 
    : "What's on your mind?";

  return (
    <div className="chat-input-container">
      {pendingImage && (
        <div className="image-preview">
          <img src={pendingImage} alt="Preview" />
          <span className="image-preview-text">Image ready to send</span>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setPendingImage(null)}
            aria-label="Remove image"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="chat-input-wrapper">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />

        <button
          className="btn btn-ghost btn-icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          aria-label="Add image"
          title="Add image"
          style={{ color: pendingImage ? 'var(--color-accent-primary)' : undefined }}
        >
          <ImagePlus size={20} />
        </button>

        <button
          className="btn btn-ghost btn-icon"
          onClick={handleRecordClick}
          disabled={loading || ui.isTranscribing}
          aria-label={ui.isRecording ? 'Stop recording' : 'Start recording'}
          title={ui.isRecording ? 'Stop recording' : 'Voice input'}
          style={{ color: ui.isRecording ? 'var(--color-accent-primary)' : undefined }}
        >
          {ui.isTranscribing ? (
            <Loader2 size={20} className="animate-spin" />
          ) : ui.isRecording ? (
            <MicOff size={20} />
          ) : (
            <Mic size={20} />
          )}
        </button>

        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={loading || ui.isRecording || ui.isTranscribing}
        />

        <button
          className="btn btn-primary btn-icon"
          onClick={handleSend}
          disabled={loading || (!input.trim() && !pendingImage)}
          aria-label="Send message"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
        </button>
      </div>
    </div>
  );
}
