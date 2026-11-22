import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { href } from '../router';
import { toast } from '../toast';
import { BackLink, Header, IconTile, Progress } from '../ui';
import { computeInsights, forecast, type Insight } from '../insights';
import { askGemini, questionPrompt, summaryPrompt } from '../ai';
import { money } from '../utils';

const TONE: Record<Insight['tone'], string> = { warn: '#E8590C', good: '#0CA678', info: '#3B5BDB' };

/** Very small markdown: paragraphs, "- " bullets, **bold**. */
function Md({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="md-list">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^[-*•]\s+/.test(line)) list.push(line.replace(/^[-*•]\s+/, ''));
    else {
      flush();
      if (line) blocks.push(<p key={blocks.length} className="md-p">{inline(line.replace(/^#+\s*/, ''))}</p>);
    }
  }
  flush();
  return <div className="md">{blocks}</div>;
}

function InsightRow({ i }: { i: Insight }) {
  const body = (
    <>
      <IconTile icon={i.icon} color={TONE[i.tone]} size={40} />
      <span className="row-main">
        <span className="row-title wrap-title">{i.title}</span>
        <span className="row-sub wrap">{i.text}</span>
      </span>
      {i.link && <Icon name="chevR" />}
    </>
  );
  return i.link ? (
    <a className="row" href={href(i.link)} style={{ alignItems: 'flex-start' }}>
      {body}
    </a>
  ) : (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      {body}
    </div>
  );
}

export function KeySetup({ compact = false }: { compact?: boolean }) {
  const { update } = useStore();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!key.trim()) return;
        setBusy(true);
        setError('');
        try {
          await askGemini(key, 'Reply with the single word OK.', 'Test');
          update((d) => ({ ...d, settings: { ...d.settings, ai: { ...(d.settings.ai ?? {}), geminiKey: key.trim() } } }));
          toast('AI assistant is ready');
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      {!compact && (
        <p className="muted small" style={{ margin: 0 }}>
          AI summaries use Google Gemini with your own free key. It's stored encrypted inside your Ledgerly data, synced to your devices, and never shared. Only totals are sent to Gemini, not your notes (unless you allow it).
        </p>
      )}
      <ol className="steps small">
        <li>
          Open{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>{' '}
          and sign in with Google.
        </li>
        <li>Tap “Create API key”, then copy it.</li>
        <li>Paste it below.</li>
      </ol>
      <label className="field">
        <span>Gemini API key</span>
        <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" />
      </label>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn primary block" disabled={busy || !key.trim()}>
        {busy ? 'Checking key…' : 'Turn on AI'}
      </button>
    </form>
  );
}

function ForecastCard() {
  const { data, cur } = useStore();
  const f = forecast(data);
  const ref = f.budget ?? f.lastTotal;
  const over = ref ? f.projected > ref : false;
  return (
    <section className="dark-card" style={{ gap: 10 }}>
      <span className="dark-muted">Month-end forecast</span>
      <span className="big-num" style={{ marginTop: -6 }}>
        {money(f.projected, cur)}
      </span>
      <span style={{ fontSize: 13, color: '#b4bccb' }}>
        {money(f.spent, cur)} spent so far · {f.daysLeft} days left · ~{money(Math.round(f.pace), cur)}/day
      </span>
      {ref ? (
        <>
          <Progress pct={(f.projected / ref) * 100} color={over ? '#FF922B' : '#63E6BE'} />
          <span style={{ fontSize: 12, fontWeight: 700, color: over ? '#ffa94d' : '#63e6be' }}>
            {f.budget ? (over ? `${money(f.projected - f.budget, cur)} over budget at this pace` : `${money(f.budget - f.projected, cur)} under budget at this pace`) : over ? `${money(f.projected - f.lastTotal, cur)} more than last month` : `${money(f.lastTotal - f.projected, cur)} less than last month`}
          </span>
        </>
      ) : null}
    </section>
  );
}

export function Insights() {
  const { data, update } = useStore();
  const ai = data.settings.ai ?? {};
  const insights = useMemo(() => computeInsights(data), [data]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ q: string; a?: string; err?: string }[]>([]);
  const summary = ai.lastSummary;

  const generate = async () => {
    if (!ai.geminiKey) return;
    setBusy(true);
    try {
      const p = summaryPrompt(data);
      const text = await askGemini(ai.geminiKey, p.system, p.prompt);
      update((d) => ({ ...d, settings: { ...d.settings, ai: { ...(d.settings.ai ?? {}), lastSummary: { text, at: Date.now() } } } }));
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const askIt = async (question: string) => {
    if (!ai.geminiKey || !question.trim()) return;
    const idx = chat.length;
    setChat((c) => [...c, { q: question }]);
    setQ('');
    try {
      const p = questionPrompt(data, question);
      const a = await askGemini(ai.geminiKey, p.system, p.prompt);
      setChat((c) => c.map((x, i) => (i === idx ? { ...x, a } : x)));
    } catch (e) {
      setChat((c) => c.map((x, i) => (i === idx ? { ...x, err: (e as Error).message } : x)));
    }
  };

  const suggestions = ['Where can I cut back this month?', 'How much can I save by year end?', 'Compare this month with last month', 'Am I on track with my budgets?'];

  return (
    <main className="screen">
      <Header title="AI insights" left={<BackLink to="home" />} />

      <div className="two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ForecastCard />

          <section className="card ai-card">
            <div className="panel-head">
              <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ai-badge">
                  <Icon name="sparkle" size={16} />
                </span>
                AI summary
              </h2>
              {ai.geminiKey && summary && (
                <button className="link" onClick={generate} disabled={busy}>
                  {busy ? 'Writing…' : 'Refresh'}
                </button>
              )}
            </div>
            {!ai.geminiKey ? (
              <KeySetup />
            ) : summary ? (
              <>
                <Md text={summary.text} />
                <span className="muted small">
                  Written {new Date(summary.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} by Gemini from your totals. Check important numbers in Reports.
                </span>
              </>
            ) : (
              <button className="btn primary block" onClick={generate} disabled={busy}>
                <Icon name="sparkle" size={18} />
                {busy ? 'Writing your summary…' : 'Write my monthly summary'}
              </button>
            )}
          </section>

          {ai.geminiKey && (
            <section className="card ai-card">
              <h2 className="h2">Ask about your money</h2>
              {chat.map((c, i) => (
                <div key={i} className="chat">
                  <div className="chat-q">{c.q}</div>
                  <div className="chat-a">{c.err ? <span className="error">{c.err}</span> : c.a ? <Md text={c.a} /> : <span className="muted">Thinking…</span>}</div>
                </div>
              ))}
              {chat.length === 0 && (
                <div className="chips">
                  {suggestions.map((s) => (
                    <button key={s} className="chip" onClick={() => askIt(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  askIt(q);
                }}
              >
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How much did I spend on food in October?" aria-label="Ask a question" />
                <button className="btn-icon solid" aria-label="Ask" disabled={!q.trim()}>
                  <Icon name="send" />
                </button>
              </form>
            </section>
          )}
        </div>

        <section className="section">
          <h2 className="h2">Smart insights</h2>
          <div className="card list">
            {insights.length ? insights.map((i) => <InsightRow key={i.id} i={i} />) : <p className="muted small">Add a few records and insights will appear here.</p>}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Smart insights are worked out on your device and work without AI.
          </p>
        </section>
      </div>
    </main>
  );
}

/** Small card for the phone Home screen. */
export function InsightsHomeCard() {
  const { data } = useStore();
  const list = useMemo(() => computeInsights(data).slice(0, 2), [data]);
  if (!list.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ai-badge">
            <Icon name="sparkle" size={14} />
          </span>
          Insights
        </h2>
        <a className="link" href={href('insights')}>
          AI insights
        </a>
      </div>
      <div className="card list">
        {list.map((i) => (
          <InsightRow key={i.id} i={i} />
        ))}
      </div>
    </section>
  );
}

/** Panel for the web dashboard. */
export function InsightsPanel() {
  const { data } = useStore();
  const list = useMemo(() => computeInsights(data).slice(0, 4), [data]);
  const summary = data.settings.ai?.lastSummary;
  return (
    <section className="card panel w2">
      <div className="panel-head">
        <h2 className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ai-badge">
            <Icon name="sparkle" size={14} />
          </span>
          AI insights
        </h2>
        <a className="link" href={href('insights')}>
          {summary ? 'Full summary' : 'Get AI summary'}
        </a>
      </div>
      {summary && (
        <div className="md-preview">
          <Md text={summary.text.split('\n').filter((l) => l.trim()).slice(0, 2).join('\n')} />
        </div>
      )}
      <div className="list insight-grid">
        {list.map((i) => (
          <InsightRow key={i.id} i={i} />
        ))}
      </div>
    </section>
  );
}
