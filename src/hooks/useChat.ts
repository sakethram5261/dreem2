import { useCallback, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { Message } from '../types';

const API_ENDPOINT = '/api/chat';
const TRANSCRIBE_ENDPOINT = '/api/transcribe';

export function useChat() {
  const { addMessage, updateMessage, ui } = useChatStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string | Array<any>, imageData?: string) => {
    try {
      // Abort any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      addMessage(userMessage);

      // Create assistant message placeholder
      const assistantId = `assistant-${Date.now()}`;
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
      };

      addMessage(assistantMessage);

      // Prepare request
      abortControllerRef.current = new AbortController();
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content }],
          model: 'llama-3.3-70b',
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullText += content;
                  updateMessage(assistantId, { content: fullText });
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      // Mark as complete
      updateMessage(assistantId, { streaming: false });

      // Text-to-speech if enabled
      if (ui.ttsEnabled && fullText) {
        speak(fullText);
      }

      return fullText;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Chat error:', error);
        throw error;
      }
    }
  }, [addMessage, updateMessage, ui.ttsEnabled]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return { sendMessage, stopGeneration };
}

export function useVoiceRecording() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { setUIState } = useChatStore();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setUIState({ isRecording: false, isTranscribing: true });

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');

        try {
          const response = await fetch(TRANSCRIBE_ENDPOINT, {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          setUIState({ isTranscribing: false });
          
          return data.text || '';
        } catch (error) {
          console.error('Transcription error:', error);
          setUIState({ isTranscribing: false });
          throw error;
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setUIState({ isRecording: true });
    } catch (error) {
      console.error('Recording error:', error);
      alert('Microphone access is required for voice input.');
    }
  }, [setUIState]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { startRecording, stopRecording };
}

// Text-to-speech helper
function speak(text: string) {
  if (!window.speechSynthesis) return;
  
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find((v) =>
    v.name.includes('Samantha') ||
    v.name.includes('Google UK English Female') ||
    v.name.includes('Karen')
  );
  
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  
  window.speechSynthesis.speak(utterance);
}
