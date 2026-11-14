import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { MeProvider } from './me';
import { ToastProvider } from './ui';
import './style.css';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <MeProvider>
          <App />
        </MeProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

// 本番（HTTPS）でだけ Service Worker を登録する。開発中は画面が古いまま残らないようにしない。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
