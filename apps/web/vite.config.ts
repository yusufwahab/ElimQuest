import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = env.VITE_DEV_API_TARGET || 'http://localhost:8787';
  return {
    // Set VITE_BASE_PATH (e.g. "/quiz/") when deploying to a sub-directory.
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: { '/api': target, '/socket.io': { target, ws: true } },
    },
    preview: { port: 4173, proxy: { '/api': target, '/socket.io': { target, ws: true } } },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: { manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) },
      },
    },
  };
});
