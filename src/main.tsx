import React from 'react'
import ReactDOM from 'react-dom/client'
import { Home } from './pages/Home.tsx' 
import './index.css'
import { ClerkProvider } from '@clerk/clerk-react'
import { dark } from '@clerk/themes' // ─── NEW: Import the dark theme

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key")
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      afterSignOutUrl="/"
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#00f2fe', // Lumina's signature cyan
          colorBackground: '#0a0a0f', // Deep dark background
          colorInputBackground: 'rgba(255, 255, 255, 0.05)',
          colorInputText: 'white',
          borderRadius: '12px',
        },
        elements: {
          card: {
            background: 'rgba(15, 15, 25, 0.85)',
            backdropFilter: 'blur(30px)',
            border: '1px solid rgba(0, 242, 254, 0.2)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 242, 254, 0.1)',
          },
          navbar: {
            background: 'rgba(255, 255, 255, 0.02)',
          },
          profileSectionPrimaryButton: {
            color: '#00f2fe',
          }
        }
      }}
    >
      <Home /> 
    </ClerkProvider>
  </React.StrictMode>,
)
