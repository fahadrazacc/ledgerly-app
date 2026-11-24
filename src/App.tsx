import { useCallback, useState } from 'react';
import { Icon, type IconName } from './icons';
import { StoreProvider } from './store';
import { href, useRoute, type Path } from './router';
import type { AppData, RecordType } from './types';
import type { Session } from './vault';
import { Lock } from './screens/Lock';
import { ConfirmHost } from './confirm';
import { ToastHost } from './toast';
import { normalize } from './utils';
import { Reminders } from './screens/Reminders';
import { Dashboard } from './screens/Dashboard';
import { EventDetail, Events } from './screens/Events';
import { Analysis } from './screens/Analysis';
import { Avatar } from './screens/Profile';
import { useWide } from './charts';
import { useStore } from './store';
import { initCloud, useSync } from './cloud/sync';
import { useEffect } from 'react';
import { Home } from './screens/Home';
import { Records } from './screens/Records';
import { AddRecord } from './screens/AddRecord';
import { Reports } from './screens/Reports';
import { Budgets } from './screens/Budgets';
import { Accounts } from './screens/Accounts';
import { Profile } from './screens/Profile';
import { Categories } from './screens/Categories';

export default function App() {
  const [open, setOpen] = useState<{ session: Session; data: AppData } | null>(null);
  const onOpen = useCallback((session: Session, data: AppData) => setOpen({ session, data: normalize(data) }), []);
  const onLock = useCallback(() => setOpen(null), []);
  useEffect(() => {
    initCloud().catch(() => undefined);
  }, []);

  return (
    <>
      {open ? (
        <StoreProvider initial={open.data} session={open.session} onLock={onLock}>
          <Shell />
        </StoreProvider>
      ) : (
        <Lock onOpen={onOpen} />
      )}
      <ConfirmHost />
      <ToastHost />
    </>
  );
}

const NAV: { path: Path; label: string; icon: IconName }[] = [
  { path: 'home', label: 'Home', icon: 'home' },
  { path: 'records', label: 'Records', icon: 'list' },
  { path: 'reports', label: 'Reports', icon: 'pie' },
  { path: 'budgets', label: 'Budgets', icon: 'target' },
];
// Extra items shown only in the wide (web) sidebar.
const SIDE: { path: Path; label: string; icon: IconName }[] = [
  { path: 'analysis', label: 'Analysis', icon: 'trend' },
  { path: 'events', label: 'Events', icon: 'plane' },
  { path: 'accounts', label: 'Accounts', icon: 'bank' },
  { path: 'reminders', label: 'Reminders', icon: 'bell' },
  { path: 'categories', label: 'Categories', icon: 'tag' },
  { path: 'settings', label: 'Settings', icon: 'settings' },
];

function Shell() {
  const { path, params } = useRoute();
  const wide = useWide();
  const { data, lock } = useStore();
  const sync = useSync();
  const showNav = path !== 'add';

  let screen;
  switch (path) {
    case 'records':
      screen = <Records key={params.get('account') ?? 'all'} account={params.get('account')} />;
      break;
    case 'account': {
      const id = params.get('id') ?? '';
      const back = params.get('back') || 'accounts';
      screen = <Records key={'acc-' + id} account={null} accountView={id} back={back} />;
      break;
    }
    case 'category': {
      const id = params.get('id') ?? '';
      screen = <Records key={'cat-' + id} account={null} categoryView={id} back={params.get('back') || 'categories'} />;
      break;
    }
    case 'add':
      screen = <AddRecord key={(params.get('id') ?? '') + (params.get('reminder') ?? '')} id={params.get('id')} reminderId={params.get('reminder')} from={params.get('from') || 'home'} presetType={params.get('type') as RecordType | null} presetEvent={params.get('event')} presetAccount={params.get('account')} presetCategory={params.get('category')} />;
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
    case 'profile':
      screen = <Profile />;
      break;
    case 'reminders':
      screen = <Reminders />;
      break;
    case 'events':
      screen = <Events />;
      break;
    case 'event':
      screen = <EventDetail key={params.get('id') ?? ''} id={params.get('id')} />;
      break;
    case 'insights':
    case 'analysis':
      screen = <Analysis />;
      break;
    case 'categories':
      screen = <Categories />;
      break;
    default:
      screen = wide ? <Dashboard /> : <Home />;
  }

  const active = wide ? (path === 'profile' ? 'settings' : path === 'event' ? 'events' : path === 'insights' ? 'analysis' : path === 'account' ? 'accounts' : path === 'category' ? 'categories' : path) : ['accounts', 'account', 'category', 'settings', 'profile', 'categories', 'reminders', 'events', 'event', 'insights', 'analysis'].includes(path) ? 'home' : path;
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
          {wide && (
            <>
              <span className="side-label">Manage</span>
              {SIDE.map(navItem)}
              <div className="side-foot">
                <a className="side-user" href={href('profile')}>
                  <Avatar size={36} radius={12} />
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 13 }}>
                      {data.settings.name}
                    </span>
                    <span className="row-sub">{sync.user ? (sync.status === 'synced' ? 'Synced' : sync.status === 'syncing' ? 'Syncing…' : sync.status === 'needs-pass' ? 'Sync paused' : sync.user.email) : data.settings.email || 'View profile'}</span>
                  </span>
                </a>
                <button className="side-logout" onClick={lock}>
                  <Icon name="lock" size={18} />
                  Log out
                </button>
              </div>
            </>
          )}
        </nav>
      )}
    </div>
  );
}
