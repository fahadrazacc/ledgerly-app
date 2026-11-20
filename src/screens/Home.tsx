import { Icon } from '../icons';
import { useStore } from '../store';
import { SyncBanner } from './Cloud';
import { href } from '../router';
import { AccountTile, CatTile, Empty, IconTile, Progress } from '../ui';
import { upcoming } from '../notify';
import { dueLabel } from './Reminders';
import { RecordRow } from './RecordRow';
import { Avatar } from './Profile';
import { addMonths, balanceOf, money, monthShort, spentInCategory, startOfMonth, sums, totalBalance } from '../utils';

export function Home() {
  const { data, cur, hidden, toggleHidden } = useStore();
  const now = new Date();
  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const { income, expense } = sums(data.txns, start, end);
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const overall = data.budgets.find((b) => b.categoryId === null);
  const spent = spentInCategory(data, null, start, end);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  const recent = [...data.txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const accounts = data.accounts.filter((a) => !a.archived);
  const soon = upcoming(data, 7);
  const dueCount = soon.filter((r) => new Date(r.due).getTime() < Date.now() + 86_400_000).length;

  return (
    <main className="screen">
      <header className="head">
        <a href={href('profile')} aria-label="Open profile" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, textDecoration: 'none', color: 'var(--ink)' }}>
          <Avatar />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
              {greeting}
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.settings.name}</span>
          </div>
        </a>
        <div className="head-actions">
          <a className="btn-icon" aria-label={`Payment reminders${dueCount ? `, ${dueCount} due` : ''}`} href={href('reminders')}>
            <Icon name="bell" />
            {dueCount > 0 && <span className="bell-dot">{dueCount}</span>}
          </a>
          <a className="btn-icon" aria-label="Profile and settings" href={href('profile')}>
            <Icon name="settings" />
          </a>
        </div>
      </header>

      <SyncBanner />
      <div className="home-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="dark-card" aria-label="Balance">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="dark-muted">Total balance</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge" style={{ background: '#2a3446', color: '#fff' }}>
                  {monthShort(now)} {now.getFullYear()}
                </span>
                <button
                  onClick={toggleHidden}
                  aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
                  aria-pressed={hidden}
                  style={{ width: 44, height: 44, marginRight: -10, border: 0, borderRadius: 12, background: 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name={hidden ? 'eyeOff' : 'eye'} size={20} />
                </button>
              </div>
            </div>
            <div className="big-num">{money(totalBalance(data), cur)}</div>
            <div className="grid2">
              <div className="mini-pill">
                <span className="tile" style={{ width: 34, height: 34, borderRadius: 11, background: '#12352d', color: '#63e6be' }}>
                  <Icon name="arrowDL" size={18} stroke={2} />
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: '#b4bccb' }}>Income</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#63e6be' }}>{money(income, cur)}</span>
                </div>
              </div>
              <div className="mini-pill">
                <span className="tile" style={{ width: 34, height: 34, borderRadius: 11, background: '#3b2516', color: '#ffa94d' }}>
                  <Icon name="arrowUR" size={18} stroke={2} />
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: '#b4bccb' }}>Expense</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#ffa94d' }}>{money(expense, cur)}</span>
                </div>
              </div>
            </div>
          </section>

          {soon.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2 className="h2">Upcoming payments</h2>
                <a className="link" href={href('reminders')}>
                  See all
                </a>
              </div>
              <div className="card list">
                {soon.slice(0, 3).map((r) => {
                  const due = dueLabel(r.due);
                  return (
                    <div key={r.id} className="acc-row">
                      <a className="row" href={href('reminders')}>
                        <CatTile cat={data.categories.find((c) => c.id === r.categoryId)} size={38} />
                        <span className="row-main">
                          <span className="row-title">{r.title}</span>
                          <span className="row-sub" style={{ fontWeight: 700, color: due.late ? 'var(--exp)' : 'var(--accent)' }}>
                            {due.text}
                            {r.amount ? ` · ${money(r.amount, cur)}` : ''}
                          </span>
                        </span>
                      </a>
                      <a className="btn small primary" style={{ height: 38, padding: '0 14px' }} href={href(`add?reminder=${r.id}&from=home`)}>
                        {r.type === 'income' ? 'Receive' : 'Pay'}
                      </a>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <h2 className="h2">Accounts</h2>
              <a className="link" href={href('accounts')}>
                See all
              </a>
            </div>
            <div className="acc-strip">
              {accounts.map((a) => (
                <a key={a.id} className="acc-card" href={href('accounts')}>
                  <AccountTile account={a} size={32} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span className="muted small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.name}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(balanceOf(data, a.id), cur)}</span>
                  </span>
                </a>
              ))}
            </div>
          </section>

          {overall ? (
            <a className="card" href={href('budgets')} style={{ display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'var(--ink)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Monthly budget</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {overall.limit - spent >= 0 ? (
                    <>
                      <strong style={{ color: 'var(--ink)' }}>{money(overall.limit - spent, cur)}</strong> left
                    </>
                  ) : (
                    <strong className="exp">{money(spent - overall.limit, cur)} over</strong>
                  )}
                </span>
              </div>
              <Progress pct={(spent / overall.limit) * 100} color={spent > overall.limit ? '#E8590C' : '#3B5BDB'} />
              <div className="muted small" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {money(spent, cur)} of {money(overall.limit, cur)}
                </span>
                <span>{daysLeft} days left</span>
              </div>
            </a>
          ) : (
            <a className="card" href={href('budgets')} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--ink)' }}>
              <IconTile icon="target" color="#3B5BDB" />
              <span className="row-main">
                <span className="row-title">Set a monthly budget</span>
                <span className="row-sub">Know how much you can still spend</span>
              </span>
              <Icon name="chevR" />
            </a>
          )}
        </div>

        <section className="section">
          <div className="section-head">
            <h2 className="h2">Recent records</h2>
            <a className="link" href={href('records')}>
              See all
            </a>
          </div>
          <div className="card list">
            {recent.length ? (
              recent.map((t) => <RecordRow key={t.id} t={t} from="home" showTime={false} />)
            ) : (
              <Empty
                icon="list"
                title="No records yet"
                text="Tap + to add your first expense or income."
                action={
                  <a className="btn primary small" href={href('add?from=home')}>
                    Add record
                  </a>
                }
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
