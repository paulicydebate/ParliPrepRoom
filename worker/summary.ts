import type { RecordEvent, RecordUpdate } from './docRoom';

// One-line health summary of a round doc's server record, for the coach view.

/** One live edit inserting more than this many characters is flagged. */
export const LARGE_EDIT = 40;

export interface RecordSummary {
  firstAt: number | null;
  lastAt: number | null;
  typedLive: number;
  /** Characters that arrived after being offline (or the first upload). */
  catchup: number;
  large: number;
  blocked: number;
  roundOff: number;
  roundModeOff: number;
  awayMs: number;
  intact: boolean;
  seal: string | null;
  people: { name: string; typed: number }[];
  /** Number of things worth a look (large edits, blocked pastes, round doc turned off, broken record). */
  flags: number;
}

export function summarizeRecord(r: { updates: RecordUpdate[]; events: RecordEvent[]; intact: boolean; seal: string | null }): RecordSummary {
  const live = r.updates.filter((u) => u.via === 'live');
  const people = new Map<string, { name: string; typed: number }>();
  for (const u of r.updates) {
    const p = people.get(u.userId) ?? { name: u.name, typed: 0 };
    p.typed += u.inserted;
    people.set(u.userId, p);
  }
  let awayMs = 0;
  const since = new Map<string, number>();
  for (const e of r.events) {
    if (e.kind === 'away') since.set(e.userId, e.at);
    if (e.kind === 'back' && since.has(e.userId)) {
      awayMs += e.at - since.get(e.userId)!;
      since.delete(e.userId);
    }
  }
  const large = live.filter((u) => u.inserted > LARGE_EDIT).length;
  const blocked = r.events.filter((e) => e.kind === 'paste-blocked' || e.kind === 'drop-blocked').length;
  const roundOff = r.events.filter((e) => e.kind === 'round-off').length;
  return {
    firstAt: r.updates[0]?.at ?? null,
    lastAt: r.updates[r.updates.length - 1]?.at ?? null,
    typedLive: live.reduce((n, u) => n + u.inserted, 0),
    catchup: r.updates.filter((u) => u.via !== 'live').reduce((n, u) => n + u.inserted, 0),
    large,
    blocked,
    roundOff,
    roundModeOff: r.events.filter((e) => e.kind === 'roundmode-off').length,
    awayMs,
    intact: r.intact,
    seal: r.seal,
    people: [...people.values()].sort((a, b) => b.typed - a.typed),
    flags: large + blocked + roundOff + (r.intact ? 0 : 1),
  };
}
