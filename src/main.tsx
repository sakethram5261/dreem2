import React from 'react'
import ReactDOM from 'react-dom/client'
// CHANGED: We are now importing Home instead of App
import { Home } from './Home.tsx' 
import './index.css'
import { ClerkProvider } from '@clerk/clerk-react'

// Pulls the key from Vercel's Environment Variables
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key")
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      {/* CHANGED: We render Home here instead of App */}
      <Home /> 
    </ClerkProvider>
  </React.StrictMode>,
)
