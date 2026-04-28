import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ClerkProvider } from '@clerk/clerk-react'
import { dark } from '@clerk/themes'

const PUBLISHABLE_KEY = "pk_test_bXVzaWNhbC1idXp6YXJkLTQwLmNsZXJrLmFjY291bnRzLmRldiQ";

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      afterSignOutUrl="/"
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#c4b5fd', // Lavender accent
          colorBackground: 'transparent',
          colorInputBackground: 'rgba(255, 255, 255, 0.04)',
          colorInputText: 'white',
          borderRadius: '14px',
        },
        elements: {
          cardBox: {
            background: 'rgba(15, 15, 25, 0.85)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(196, 181, 253, 0.2)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 40px rgba(196, 181, 253, 0.1)',
            borderRadius: '24px',
          },
          card: {
            background: 'transparent',
          },
          modalBackdrop: {
            background: 'rgba(10, 10, 18, 0.8)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          },
          navbar: {
            background: 'rgba(255, 255, 255, 0.02)',
          },
          profileSectionPrimaryButton: {
            color: '#c4b5fd',
          },
          formButtonPrimary: {
            background: 'linear-gradient(135deg, #c4b5fd 0%, #f4a7b9 100%)',
            color: '#0a0a12',
            fontWeight: '600',
          },
          formFieldInput: {
            borderColor: 'rgba(196, 181, 253, 0.2)',
          },
          footerActionLink: {
            color: '#c4b5fd',
          },
          headerTitle: {
            color: 'white',
          },
          headerSubtitle: {
            color: 'rgba(255, 255, 255, 0.6)',
          },
          socialButtonsBlockButton: {
            borderColor: 'rgba(196, 181, 253, 0.15)',
            background: 'rgba(255, 255, 255, 0.03)',
          },
          socialButtonsBlockButtonText: {
            color: 'rgba(255, 255, 255, 0.8)',
          },
          dividerLine: {
            background: 'rgba(196, 181, 253, 0.15)',
          },
          dividerText: {
            color: 'rgba(255, 255, 255, 0.4)',
          },
        }
      }}
    >
      <App />
    </ClerkProvider>
  </React.StrictMode>,
)
