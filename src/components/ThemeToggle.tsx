import { useTheme } from '../contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isMorning = theme === 'morning';

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${isMorning ? 'night' : 'morning'} mode`}
      title={`Switch to ${isMorning ? 'night' : 'morning'} mode`}
    >
      <div className="theme-toggle-track">
        <div className={`theme-toggle-thumb ${isMorning ? 'morning' : 'night'}`}>
          {/* Sun icon */}
          <svg
            className={`theme-icon sun ${isMorning ? 'active' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          
          {/* Moon icon */}
          <svg
            className={`theme-icon moon ${!isMorning ? 'active' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </div>
      </div>
      
      {/* Ambient particles */}
      <div className="toggle-particles">
        {[...Array(6)].map((_, i) => (
          <span key={i} className="particle" style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
    </button>
  );
}
