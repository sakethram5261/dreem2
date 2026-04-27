import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useChatStore } from '../stores/chatStore';
import { useChat } from '../hooks/useChat';
import { Sidebar } from '../components/Sidebar';
import { ChatHeader } from '../components/ChatHeader';
import { ChatMessages } from '../components/ChatMessages';
import { ChatInput } from '../components/ChatInput';
import { BreathingExercise } from '../components/BreathingExercise';
import { AffirmationToast } from '../components/AffirmationToast';

export function Home() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const { ui, toggleSidebar, updateSessionTitle } = useChatStore();
  const { sendMessage } = useChat();

  // Sync user with Firebase
  useEffect(() => {
    if (!user) return;

    const syncUser = async () => {
      try {
        const userRef = doc(db, 'users', user.id);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: user.primaryEmailAddress?.emailAddress,
            credits: 10,
            createdAt: new Date(),
          });
        }
      } catch (error) {
        console.error('Firebase sync error:', error);
      }
    };

    syncUser();
  }, [user]);

  // Handle window resize for sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && !ui.isSidebarOpen) {
        toggleSidebar();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [ui.isSidebarOpen, toggleSidebar]);

  const handleSendMessage = async (content: string, imageData?: string) => {
    if (!content.trim() && !imageData) return;

    setLoading(true);
    
    try {
      await sendMessage(content, imageData);
      
      // Generate title for new conversations
      const { sessions, activeSessionId } = useChatStore.getState();
      const activeSession = sessions.find((s) => s.id === activeSessionId);
      
      if (activeSession && activeSession.messages.length === 2 && activeSession.title === 'New Conversation') {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        updateSessionTitle(activeSessionId, title);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="app-container">
        <Sidebar />

        {ui.isSidebarOpen && window.innerWidth <= 768 && (
          <div className="sidebar-overlay" onClick={toggleSidebar} />
        )}

        <main className="main-content">
          <ChatHeader />
          <ChatMessages onSendMessage={handleSendMessage} />
          <ChatInput onSend={handleSendMessage} loading={loading} />
        </main>
      </div>

      <BreathingExercise />
      <AffirmationToast />
    </>
  );
}
