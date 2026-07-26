import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base muss dem Repository-Namen entsprechen, damit GitHub Pages die Dateien findet.
// Repo: https://github.com/<user>/Refine  ->  base '/Refine/'
export default defineConfig({
  plugins: [react()],
  base: '/Refine/',
})
