import { useEffect, useState } from 'react';

export type Path = 'home' | 'records' | 'add' | 'reports' | 'budgets' | 'accounts' | 'settings';

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q = ''] = h.split('?');
  return { path: ((path as Path) || 'home') as Path, params: new URLSearchParams(q) };
}

export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const f = () => {
      setR(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export const go = (p: string) => {
  location.hash = '#/' + p;
};
export const href = (p: string) => '#/' + p;
