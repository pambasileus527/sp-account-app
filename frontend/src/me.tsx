import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, messageOf } from './api';
import type { Account, Me } from './types';

interface MeValue {
  me: Me;
  refresh: () => Promise<Me>;
}

const MeContext = createContext<MeValue | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const next = await api<Me>('/me');
    setMe(next);
    return next;
  }, []);
  useEffect(() => {
    refresh().catch((err) => setError(messageOf(err)));
  }, [refresh]);

  if (error) return <div className="screen"><p className="error">{error}</p></div>;
  if (!me) return null;
  return <MeContext.Provider value={{ me, refresh }}>{children}</MeContext.Provider>;
}

export function useMe(): MeValue {
  const value = useContext(MeContext);
  if (!value) throw new Error('MeProvider の外では使えません');
  return value;
}

export const activeAccount = (me: Me): Account | undefined => me.accounts.find((a) => a.id === me.active);
