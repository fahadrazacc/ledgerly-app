import { useCallback, useState } from 'react';
import { Icon, type IconName } from './icons';
import { StoreProvider } from './store';
import { href, useRoute, type Path } from './router';
import type { AppData, RecordType } from './types';
import type { Session } from './vault';
import { Lock } from './screens/Lock';
import { Home } from './screens/Home';
import { Records } from './screens/Records';
import { AddRecord } from './screens/AddRecord';
import { Reports } from './screens/Reports';
import { Budgets } from './screens/Budgets';
import { Accounts } from './screens/Accounts';
import { Settings } from './screens/Settings';

export default function App() {
  const [open, setOpen] = useState<{ session: Session; data: AppData } | null>(null);
  const onOpen = useCallback((session: Session, data: AppData) => setOpen({ session, data }), []);
  const onLock = useCallback(() => setOpen(null), []);

  if (!open) return <Lock onOpen={onOpen} />;
  return (
    <StoreProvider initial={open.data} session={open.session} onLock={onLock}>
      <Shell />
    </StoreProvider>
  );
}

const NAV: { path: Path; label: string; icon: IconName }[] = [
  { path: 'home', label: 'Home', icon: 'home' },
  { path: 'records', label: 'Records', icon: 'list' },
  { path: 'reports', label: 'Reports', icon: 'pie' },
  { path: 'budgets', label: 'Budgets', icon: 'target' },
];

function Shell() {
  const { path, params } = useRoute();
  const showNav = path !== 'add';

  let screen;
  switch (path) {
    case 'records':
      screen = <Records />;
      break;
    case 'add':
      screen = <AddRecord key={params.get('id') ?? 'new'} id={params.get('id')} from={params.get('from') || 'home'} presetType={params.get('type') as RecordType | null} />;
      break;
    case 'reports':
      screen = <Reports />;
      break;
    case 'budgets':
      screen = <Budgets />;
      break;
    case 'accounts':
      screen = <Accounts />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    default:
      screen = <Home />;
  }

  const active = path === 'accounts' || path === 'settings' ? 'home' : path;
  const navItem = (n: (typeof NAV)[number]) => (
    <a key={n.path} className={`item ${active === n.path ? 'on' : ''}`} href={href(n.path)} aria-current={active === n.path ? 'page' : undefined}>
      <Icon name={n.icon} size={22} stroke={1.9} />
      {n.label}
    </a>
  );

  return (
    <div className={showNav ? 'with-nav' : ''}>
      {screen}
      {showNav && (
        <nav className="nav" aria-label="Main">
          <span className="brand">
            <span className="tile" style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--accent)', color: '#fff' }}>
              <Icon name="savings" size={18} stroke={2} />
            </span>
            Ledgerly
          </span>
          {navItem(NAV[0])}
          {navItem(NAV[1])}
          <a className="fab" href={href(`add?from=${path}`)} aria-label="Add record">
            <Icon name="plus" size={26} stroke={2.2} />
            <span className="fab-label">Add record</span>
          </a>
          {navItem(NAV[2])}
          {navItem(NAV[3])}
        </nav>
      )}
    </div>
  );
}
