import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'normalize.css'
import 'katex/dist/katex.min.css'
import App from './App'
// import { seedDatabase } from './lib/seed'

// Seed the database with initial data
// seedDatabase();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
