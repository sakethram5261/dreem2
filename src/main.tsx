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
          colorPrimary: '#00f2fe',
          colorBackground: 'transparent', // Let the glass show through
          colorInputBackground: 'rgba(255, 255, 255, 0.05)',
          colorInputText: 'white',
          borderRadius: '12px',
        },
        elements: {
          cardBox: {
            background: 'rgba(15, 15, 25, 0.25)', // Lower opacity = more glass
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(0, 242, 254, 0.2)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 242, 254, 0.1)',
          },
          card: {
            background: 'transparent', // Prevents double-layering the color
          },
          modalBackdrop: {
            background: 'rgba(5, 5, 8, 0.6)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
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
      <App />
    </ClerkProvider>
  </React.StrictMode>,
)
