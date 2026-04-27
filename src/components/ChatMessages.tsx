import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useChatStore } from '../stores/chatStore';
import type { Message } from '../types';

const STARTER_PROMPTS = [
  "I need a moment to breathe and feel grounded...",
  "Help me find some peace in this moment",
  "I want to talk about something on my mind",
  "Guide me through a calming exercise",
];

interface ChatMessagesProps {
  onSendMessage: (content: string) => void;
}

export function ChatMessages({ onSendMessage }: ChatMessagesProps) {
  const { user } = useUser();
  const { sessions, activeSessionId } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (messages.length === 0) {
    return (
      <div className="chat-messages">
        <div className="chat-empty-state">
          <div>
            <h1 className="chat-empty-greeting">
              {getGreeting()}, {user?.firstName || 'Friend'}
            </h1>
            <p className="chat-empty-description">
              This is your space. Share what's on your mind, or choose a starting point below.
            </p>
          </div>

          <div className="prompt-grid">
            {STARTER_PROMPTS.map((prompt, index) => (
              <button
                key={index}
                className="prompt-card"
                onClick={() => onSendMessage(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-messages">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const { user } = useUser();

  const getAvatarText = () => {
    if (message.role === 'user') {
      return user?.firstName?.[0]?.toUpperCase() || 'Y';
    }
    return 'L';
  };

  const getMessageText = () => {
    if (typeof message.content === 'string') {
      return message.content;
    }
    
    return message.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('');
  };

  return (
    <div className="message">
      <div className={`message-avatar ${message.role}`}>
        {getAvatarText()}
      </div>
      
      <div className="message-content">
        {message.streaming && !message.content ? (
          <div className="typing-indicator">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        ) : (
          <div className="message-text">
            {getMessageText()}
            {message.streaming && <span className="streaming-cursor" />}
          </div>
        )}
      </div>
    </div>
  );
}
