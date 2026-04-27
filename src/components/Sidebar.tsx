import { Plus, MessageCircle, Sparkles } from 'lucide-react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useChatStore } from '../stores/chatStore';

export function Sidebar() {
  const { user } = useUser();
  const { sessions, activeSessionId, createSession, setActiveSession, ui, toggleSidebar } = useChatStore();

  const handleNewChat = () => {
    createSession();
    if (window.innerWidth <= 768) {
      toggleSidebar();
    }
  };

  const handleSessionClick = (id: string) => {
    setActiveSession(id);
    if (window.innerWidth <= 768) {
      toggleSidebar();
    }
  };

  return (
    <aside className={`sidebar ${!ui.isSidebarOpen ? 'closed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Sparkles size={18} color="white" />
          </div>
          <span className="sidebar-logo-text">Lumina</span>
        </div>
        
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleNewChat}>
          <Plus size={18} />
          New Conversation
        </button>
      </div>

      <div className="sidebar-body">
        <div className="sidebar-section">
          <div className="sidebar-section-label">Recent</div>
          
          {sessions.length === 0 ? (
            <div style={{ 
              padding: 'var(--space-4)', 
              textAlign: 'center', 
              color: 'var(--color-text-tertiary)',
              fontSize: '0.875rem'
            }}>
              No conversations yet
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                onClick={() => handleSessionClick(session.id)}
              >
                <MessageCircle size={16} className="session-item-icon" />
                <span className="session-item-text">{session.title}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn btn-secondary" style={{ width: '100%' }}>
              Sign In
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <div className="user-profile">
            <UserButton afterSignOutUrl="/" />
            <div className="user-profile-info">
              <div className="user-profile-name">{user?.firstName || 'Friend'}</div>
              <div className="user-profile-credits">Welcome back</div>
            </div>
          </div>
        </SignedIn>
      </div>
    </aside>
  );
}
