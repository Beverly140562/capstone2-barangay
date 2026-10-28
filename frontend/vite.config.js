import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,

    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,

        // /api/auth/me → /auth/me
        // /api/history/beneficiary-validation → /history/beneficiary-validation
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});