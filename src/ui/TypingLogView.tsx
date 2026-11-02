import { useEffect, useState } from 'react';
import { burstsOf, logChanged, readLog, summarizeLog, type LogEvent, type LogReport } from '../store/typingLog';

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const day = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

function minutes(ms: number) {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

const LABEL: Record<LogEvent['k'], string> = {
  type: 'Typed',
  delete: 'Deleted',
  large: 'Large edit',
  'paste-blocked': 'Paste blocked',
  'drop-blocked': 'Drop blocked',
  'round-on': 'Round doc turned on',
  'round-off': 'Round doc turned off',
  restore: 'Restored a version',
  'roundmode-on': 'Round Mode on',
  'roundmode-off': 'Round Mode off',
  away: 'Left the app',
  back: 'Came back',
};

/** Events worth a reviewer's attention (typing itself is summarized, not listed). */
const NOTABLE = new Set<LogEvent['k']>(['large', 'paste-blocked', 'drop-blocked', 'round-on', 'round-off', 'roundmode-on', 'roundmode-off', 'restore', 'away', 'back']);

export function TypingLogView({ docId }: { docId: string }) {
  const [report, setReport] = useState<LogReport | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => void readLog(docId).then((r) => live && setReport(r));
    load();
    const off = logChanged.subscribe(load);
    return () => {
      live = false;
      off();
    };
  }, [docId]);

  if (!report) return <div className="log-view muted">Loading the typing log…</div>;
  if (!report.events.length) {
    return (
      <div className="log-view">
        <p className="muted">Nothing logged yet. Typing is recorded while this is a round doc.</p>
      </div>
    );
  }
  const s = summarizeLog(report.events);
  const notable = report.events.filter((e) => NOTABLE.has(e.k));

  return (
    <div className="log-view">
      <div className={'seal' + (report.intact ? ' ok' : ' bad')}>
        <div>
          <div className="seal-label">Seal code</div>
          <div className="seal-code">{report.seal}</div>
        </div>
        <p>
          {report.intact
            ? 'Log is intact: every entry checks out against the one before it.'
            : 'Log does not check out: entries were changed or removed after they were written.'}
        </p>
      </div>
      <dl className="log-stats">
        <div>
          <dt>Logged</dt>
          <dd>
            {s.first && s.last ? `${day(s.first)}, ${time(s.first)} – ${time(s.last)}` : '—'}
          </dd>
        </div>
        <div>
          <dt>Characters typed</dt>
          <dd>{s.typed.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Characters deleted</dt>
          <dd>{s.deleted.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Pastes / drops blocked</dt>
          <dd className={s.blocked ? 'warn' : ''}>{s.blocked}</dd>
        </div>
        <div>
          <dt>Large edits</dt>
          <dd className={s.large ? 'warn' : ''}>{s.large}</dd>
        </div>
        <div>
          <dt>Time in other apps</dt>
          <dd>{minutes(s.awayMs)}</dd>
        </div>
      </dl>
      {s.byAuthor.size > 0 && (
        <>
          <h4>Who typed</h4>
          <ul className="log-authors">
            {[...s.byAuthor].map(([name, a]) => (
              <li key={name}>
                <strong>{name}</strong> typed {a.typed.toLocaleString()} characters, deleted {a.deleted.toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Events to check</h4>
      {notable.length === 0 && <p className="muted">None: only typing and deleting.</p>}
      <ul className="log-events">
        {notable.map((e, i) => (
          <li key={i} data-kind={e.k}>
            <span className="log-time">{time(e.t)}</span>
            <span className="log-who">{e.a ?? ''}</span>
            <span className="log-what">
              {LABEL[e.k]}
              {e.k === 'large' && e.n ? ` (${e.n} characters at once)` : ''}
              {(e.k === 'paste-blocked' || e.k === 'drop-blocked') && e.n ? ` (${e.n} characters)` : ''}
              {e.k === 'restore' && e.s ? `: ${e.s}` : ''}
            </span>
            {e.k === 'large' && e.s && <span className="log-text">“{e.s}”</span>}
          </li>
        ))}
      </ul>
      <h4>Everything typed, in order</h4>
      <p className="muted">Grouped into bursts with no pause over 4 seconds. <ins>Typed text</ins> <del>deleted text</del></p>
      <ol className="log-bursts">
        {burstsOf(report.events).map((b, i) => (
          <li key={i}>
            <div className="burst-meta">
              <span className="log-time">{time(b.start)}</span>
              <span className="log-who">{b.author}</span>
            </div>
            <div className="burst-text">
              {b.parts.map((p, j) =>
                p.kind === 'removed' ? (
                  <del key={j}>{p.text}</del>
                ) : p.kind === 'large' ? (
                  <mark key={j} title="Inserted in one go">{p.text}</mark>
                ) : (
                  <ins key={j}>{p.text}</ins>
                ),
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="muted small-print">
        This records what happened in this app on this device. It can’t see another screen or phone.
      </p>
    </div>
  );
}
