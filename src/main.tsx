import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'normalize.css'
import 'katex/dist/katex.min.css'
import App from './App'
import { useAppStore } from './stores/useAppStore'
// import { seedDatabase } from './lib/seed'

// Seed the database with initial data
// seedDatabase();

const initializeApp = () => {
  const hash = window.location.hash.substring(1);
  if (hash) {
    try {
      const url = new URL(hash);
      useAppStore.getState().loadRemoteData(url.toString());
    } catch (error) {
      console.error("Invalid URL in hash:", error);
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
};

initializeApp();
