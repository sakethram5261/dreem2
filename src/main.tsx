import React from 'react'
import ReactDOM from 'react-dom/client'
// CHANGED: We added '/pages/' to the path so it knows where to look!
import { Home } from './pages/Home.tsx' 
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
      <Home /> 
    </ClerkProvider>
  </React.StrictMode>,
)
