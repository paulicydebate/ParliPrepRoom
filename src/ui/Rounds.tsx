import { useEffect, useRef, useState } from 'react';
import { toast } from '../editor/roundGuard';
import {
  PERSONAL,
  createTournament,
  lookupTournament,
  myTournaments,
  teamDetails,
  useAccount,
  type Member,
  type Tournament,
} from '../store/account';
import { createRoundDoc } from '../store/docs';
import { acquireDoc, releaseDoc } from '../store/registry';
import { setRound } from '../store/roundDoc';
import { writeLines, type Line } from '../store/seed';
import { choose, format, formatMinutes, loadPresets, parseMinutes, prepMinutes, savePresets } from '../store/timer';
import { IconClose } from './icons';

const LAST_TOURNAMENT = 'pp-last-tournament';

function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return { ref, onClose, onCancel: onClose };
}

const remembered = () => {
  try {
    return localStorage.getItem(LAST_TOURNAMENT) ?? '';
  } catch {
    return '';
  }
};

/**
 * "New round": one step to a round doc for you and your partner, tagged with
 * the tournament and round, with the prep timer started.
 */
export function NewRoundDialog({ onCreated, onClose }: { onCreated: (docId: string) => void; onClose: () => void }) {
  const modal = useModal(onClose);
  const acct = useAccount();
  const inTeam = acct.space !== PERSONAL;
  const [round, setRoundLabel] = useState('Round 1');
  const [side, setSide] = useState<'gov' | 'opp'>('gov');
  const [resolution, setResolution] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [partner, setPartner] = useState('');
  const [code, setCode] = useState(remembered);
  const [tournament, setTournament] = useState<{ name: string } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [startTimer, setStartTimer] = useState(true);
  const [prep, setPrep] = useState(() => formatMinutes(prepMinutes()));
  const prepLen = parseMinutes(prep);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inTeam) return;
    void teamDetails(acct.space).then((t) => setMembers(t.members.filter((m) => m.userId !== acct.user?.id)), () => setMembers([]));
  }, [inTeam, acct.space, acct.user?.id]);

  const check = async (value: string) => {
    setTournament(null);
    setCodeError(null);
    if (!value.trim()) return;
    try {
      setTournament(await lookupTournament(value.trim()));
    } catch {
      setCodeError('No tournament with that code.');
    }
  };
  useEffect(() => {
    if (code) void check(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const label = round.trim() || 'Round';
      const res = resolution.trim();
      const title = `${label} · ${side === 'gov' ? 'Gov' : 'Opp'}${res ? ` · ${res.slice(0, 48)}${res.length > 48 ? '…' : ''}` : ''}`;
      const meta = await createRoundDoc({
        title,
        space: acct.space,
        partners: partner ? [partner] : [],
        tournamentCode: tournament ? code.trim() : null,
        roundLabel: label,
      });
      try {
        if (tournament) localStorage.setItem(LAST_TOURNAMENT, code.trim().toUpperCase());
      } catch {
        // ignore
      }
      // Starting content, the round-doc switch and the prep timer live inside the doc.
      const { doc, ready } = acquireDoc(meta.id);
      await ready;
      const lines: Line[] = [];
      if (res) lines.push(['note', `Resolution: ${res}`]);
      lines.push(['position', side === 'gov' ? 'Gov case' : 'Opp case', { side }], ['claim', '']);
      writeLines(doc, lines);
      setRound(doc, meta.id, true);
      // Remember this prep length as the Prep button's time on this device.
      if (startTimer && prepLen && prepLen !== prepMinutes()) {
        const presets = loadPresets();
        const has = presets.some((p) => p.label.toLowerCase() === 'prep');
        savePresets(has ? presets.map((p) => (p.label.toLowerCase() === 'prep' ? { ...p, minutes: prepLen } : p)) : [{ label: 'Prep', minutes: prepLen }, ...presets]);
      }
      if (startTimer && prepLen) doc.getMap('timer').set('state', choose('Prep', prepLen, true));
      releaseDoc(meta.id);
      onCreated(meta.id);
      toast(startTimer && prepLen ? `Round doc ready. Prep timer started: ${format(prepLen * 60_000)}.` : 'Round doc ready.');
      onClose();
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  const students = members.filter((m) => m.role === 'student');

  return (
    <dialog {...modal} className="settings new-round">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="settings-head">
          <h2>New round</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <p className="muted">Makes a round doc for you{inTeam ? ' and your partner' : ''}: paste off, typing recorded, shared live. It opens as a doc and a flow side by side.</p>

        <div className="form-grid">
          <label>
            <span>Round</span>
            <input className="name-input" value={round} onChange={(e) => setRoundLabel(e.target.value)} placeholder="Round 3" />
          </label>
          <div>
            <span className="form-label">Side</span>
            <div className="seg" role="group" aria-label="Side">
              <button type="button" className={side === 'gov' ? 'is-on' : ''} onClick={() => setSide('gov')}>
                Gov
              </button>
              <button type="button" className={side === 'opp' ? 'is-on' : ''} onClick={() => setSide('opp')}>
                Opp
              </button>
            </div>
          </div>
        </div>

        <label className="form-row">
          <span>Resolution</span>
          <textarea className="name-input area" rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="This House would…" />
        </label>

        {inTeam && (
          <label className="form-row">
            <span>Partner</span>
            <select className="name-input" value={partner} onChange={(e) => setPartner(e.target.value)}>
              <option value="">No partner</option>
              {students.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="form-row">
          <span>Tournament code (optional)</span>
          <input
            className="name-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={(e) => void check(e.target.value)}
            placeholder="From the tournament, e.g. K7Q2MX"
            autoCapitalize="characters"
          />
          {tournament && <span className="form-ok">✓ {tournament.name}: the tab room can check this round doc.</span>}
          {codeError && <span className="form-err">{codeError}</span>}
        </label>

        <div className="check form-row prep-row">
          <label>
            <input type="checkbox" checked={startTimer} onChange={(e) => setStartTimer(e.target.checked)} /> Start the prep timer:
          </label>
          <input
            className="name-input prep-len"
            value={prep}
            onChange={(e) => setPrep(e.target.value)}
            inputMode="decimal"
            aria-label="Prep length in minutes"
            disabled={!startTimer}
          />
          <span className="muted small">minutes</span>
          {startTimer && !prepLen && <span className="form-err">Type a length like 25 or 22:30.</span>}
        </div>

        <div className="settings-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || (!!code.trim() && !tournament && !codeError) || !!codeError || (startTimer && !prepLen)}>
            Start round
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Set up a tournament and get its code and the director's link. */
export function TournamentsDialog({ onClose }: { onClose: () => void }) {
  const modal = useModal(onClose);
  const [list, setList] = useState<Tournament[] | null>(null);
  const [name, setName] = useState('');
  const load = () => void myTournaments().then(setList, () => setList([]));
  useEffect(load, []);
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`);
    } catch {
      toast('Copy it from the box.');
    }
  };
  return (
    <dialog {...modal} className="settings tournaments">
      <div className="settings-head">
        <h2>Tournaments (tab room)</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </div>
      <p className="muted">
        Set up a tournament, give teams its <strong>code</strong> (they enter it when they start a round), and give the <strong>director link</strong> to the tab room. That link shows
        every tagged round doc and its full record, including the prep text, without signing in, so keep it private.
      </p>
      <form
        className="row-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await createTournament(name.trim());
          setName('');
          load();
        }}
      >
        <input className="name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tournament name, e.g. Fall Classic 2026" aria-label="Tournament name" />
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Create
        </button>
      </form>
      <ul className="tournament-list">
        {list?.length === 0 && <li className="muted">You haven't set up any tournaments.</li>}
        {list?.map((t) => {
          const link = `${location.origin}/td/${t.directorSecret}`;
          return (
            <li key={t.id}>
              <strong>{t.name}</strong>
              <div className="t-row">
                <span>
                  Code for teams: <code className="t-code">{t.code}</code>
                </span>
                <button type="button" className="btn small" onClick={() => void copy(t.code, 'Code')}>
                  Copy code
                </button>
              </div>
              <div className="t-row">
                <code className="invite-link">{link}</code>
                <button type="button" className="btn small" onClick={() => void copy(link, 'Director link')}>
                  Copy director link
                </button>
                <a className="btn small ghost" href={link} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
