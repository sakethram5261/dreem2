import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatSession, Message, UIState } from '../types';

interface ChatStore {
  // Chat sessions
  sessions: ChatSession[];
  activeSessionId: string;
  
  // UI state
  ui: UIState;
  
  // Actions
  createSession: () => string;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  updateSessionTitle: (id: string, title: string) => void;
  
  // UI actions
  setUIState: (updates: Partial<UIState>) => void;
  toggleSidebar: () => void;
  toggleTTS: () => void;
  toggleBreathing: () => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      activeSessionId: Date.now().toString(),
      ui: {
        isSidebarOpen: typeof window !== 'undefined' ? window.innerWidth > 768 : true,
        isRecording: false,
        isTranscribing: false,
        ttsEnabled: false,
        showBreathingExercise: false,
        breathPhase: 'inhale',
      },

      // Create new session
      createSession: () => {
        const id = Date.now().toString();
        const newSession: ChatSession = {
          id,
          title: 'New Conversation',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: id,
        }));
        
        return id;
      },

      // Delete session
      deleteSession: (id) => {
        set((state) => {
          const newSessions = state.sessions.filter((s) => s.id !== id);
          const newActiveId = 
            state.activeSessionId === id 
              ? (newSessions[0]?.id || Date.now().toString())
              : state.activeSessionId;
          
          return {
            sessions: newSessions,
            activeSessionId: newActiveId,
          };
        });
      },

      // Set active session
      setActiveSession: (id) => {
        set({ activeSessionId: id });
      },

      // Add message to active session
      addMessage: (message) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId
              ? {
                  ...session,
                  messages: [...session.messages, message],
                  updatedAt: Date.now(),
                }
              : session
          ),
        }));
      },

      // Update specific message
      updateMessage: (id, updates) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === id ? { ...msg, ...updates } : msg
                  ),
                  updatedAt: Date.now(),
                }
              : session
          ),
        }));
      },

      // Update session title
      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === id
              ? { ...session, title, updatedAt: Date.now() }
              : session
          ),
        }));
      },

      // UI state updates
      setUIState: (updates) => {
        set((state) => ({
          ui: { ...state.ui, ...updates },
        }));
      },

      toggleSidebar: () => {
        set((state) => ({
          ui: { ...state.ui, isSidebarOpen: !state.ui.isSidebarOpen },
        }));
      },

      toggleTTS: () => {
        set((state) => ({
          ui: { ...state.ui, ttsEnabled: !state.ui.ttsEnabled },
        }));
        
        if (get().ui.ttsEnabled) {
          window.speechSynthesis?.cancel();
        }
      },

      toggleBreathing: () => {
        set((state) => ({
          ui: { ...state.ui, showBreathingExercise: !state.ui.showBreathingExercise },
        }));
      },
    }),
    {
      name: 'lumina-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);
