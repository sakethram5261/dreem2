import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App.tsx' // Note: If your main file is Home.tsx, change this to import { Home } from './Home.tsx' and change <App /> to <Home /> below
import './index.css'
import { ClerkProvider } from '@clerk/clerk-react'

// This pulls the key you saved in Vercel's Environment Variables
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key")
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </React.StrictMode>,
)
