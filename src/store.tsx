import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppData } from './types';
import { writeVault, type Session } from './vault';
import { setMasked } from './utils';
import { scheduleAutoBackup } from './backup';

interface Store {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  lock: () => void;
  session: Session;
  setSession: (s: Session) => void;
  cur: string;
  hidden: boolean;
  toggleHidden: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider(props: {
  initial: AppData;
  session: Session;
  onLock: () => void;
  children: ReactNode;
}) {
  const [data, setData] = useState(props.initial);
  const [session, setSession] = useState(props.session);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const first = useRef(true);

  // Persist every change, encrypted, in order.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saving.current = saving.current
      .then(() => writeVault(session, data))
      .then(scheduleAutoBackup)
      .catch((e) => console.error('Save failed', e));
  }, [data, session]);

  setMasked(!!data.settings.hideAmounts);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);

  // Auto-lock after 5 minutes in the background.
  const onLock = useRef(props.onLock);
  onLock.current = props.onLock;
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) onLock.current();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <Ctx.Provider
      value={{
        data,
        update,
        lock: props.onLock,
        session,
        setSession,
        cur: data.settings.currency,
        hidden: !!data.settings.hideAmounts,
        toggleHidden: () => update((d) => ({ ...d, settings: { ...d.settings, hideAmounts: !d.settings.hideAmounts } })),
      }}
    >
      {props.children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store missing');
  return s;
}
