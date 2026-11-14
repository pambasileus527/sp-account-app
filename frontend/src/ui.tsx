import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { messageOf } from './api';

/* ---------- トースト ---------- */
const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), 2400);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && <div className="toast" role="status">{message}</div>}
    </ToastContext.Provider>
  );
}

/* ---------- 送信中は二重に押せないようにして、エラーは画面に出す ---------- */
export function useAction() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

export const ErrorLine = ({ error }: { error: string }) =>
  error ? <p className="error" role="alert">{error}</p> : null;

/* ---------- 表示まわり ---------- */
export function avatarClass(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return `av av${h % 6}`;
}

export const initialOf = (name: string): string => Array.from(name || '?')[0];

/** 画面ごとにページの先頭へ戻す */
export function useScrollTop(dep?: unknown) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [dep]);
}
