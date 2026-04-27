import { Switch, Route } from 'wouter';
import { Home } from './pages/Home';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';

function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        background: 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
        textAlign: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <div
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'var(--color-surface-secondary)',
          border: '1px solid var(--color-border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          fontWeight: 600,
          color: 'var(--color-accent-primary)',
        }}
      >
        404
      </div>
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 500,
            marginBottom: 'var(--space-2)',
          }}
        >
          Page not found
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem' }}>
          The page you are looking for does not exist.
        </p>
      </div>
      <a
        href="/"
        className="btn btn-primary"
        style={{
          textDecoration: 'none',
        }}
      >
        Return Home
      </a>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
      <ThemeToggle />
    </ThemeProvider>
  );
}
