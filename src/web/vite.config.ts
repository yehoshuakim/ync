import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/agent': process.env.AGENT_UPSTREAM || 'http://127.0.0.1:8002',
    },
  },
})
