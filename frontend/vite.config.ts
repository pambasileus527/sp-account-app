import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 画面（:3000）から /api を、Pythonのサーバーへ中継する。ブラウザからは同じ場所に見えるので、Cookieがそのまま使える。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:8000' } },
    // Docker のボリューム越しでも、ファイルの変更を拾えるように
    watch: process.env.VITE_POLLING ? { usePolling: true } : undefined,
  },
});
