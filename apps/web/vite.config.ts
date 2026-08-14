import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const GATEWAY = process.env.XOPS_GATEWAY ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/bots': GATEWAY,
      '/ws': { target: GATEWAY.replace('http', 'ws'), ws: true },
    },
  },
});
