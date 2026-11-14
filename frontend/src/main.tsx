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
