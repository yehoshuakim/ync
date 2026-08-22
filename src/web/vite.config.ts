import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const agentUpstream = process.env.AGENT_UPSTREAM ?? 'http://127.0.0.1:8002';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/agent': { target: agentUpstream, changeOrigin: true },
    },
  },
});
