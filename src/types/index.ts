// Core message types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string | MessageContent[];
  timestamp: number;
  streaming?: boolean;
}

export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  imagePreview?: string;
}

// Chat session types
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// User types
export interface UserData {
  id: string;
  email: string;
  credits: number;
  createdAt: number;
}

// UI State types
export interface UIState {
  isSidebarOpen: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  ttsEnabled: boolean;
  showBreathingExercise: boolean;
  breathPhase: 'inhale' | 'hold' | 'exhale';
}

// Theme types
export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}
