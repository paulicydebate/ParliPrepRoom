// NPDA speeches, in speaking order. Every flow sheet has a column per speech
// from its side's first speech onward (separate LOR and PMR, never a
// combined block).

export type Side = 'gov' | 'opp';
export type Speech = 'PMC' | 'LOC' | 'MG' | 'MO' | 'LOR' | 'PMR';

export const SPEECHES: Speech[] = ['PMC', 'LOC', 'MG', 'MO', 'LOR', 'PMR'];

export const SPEECH_INFO: Record<Speech, { side: Side; name: string }> = {
  PMC: { side: 'gov', name: 'Prime Minister Constructive' },
  LOC: { side: 'opp', name: 'Leader of Opposition Constructive' },
  MG: { side: 'gov', name: 'Member of Government' },
  MO: { side: 'opp', name: 'Member of Opposition' },
  LOR: { side: 'opp', name: 'Leader of Opposition Rebuttal' },
  PMR: { side: 'gov', name: 'Prime Minister Rebuttal' },
};

export function isSpeech(v: unknown): v is Speech {
  return typeof v === 'string' && (SPEECHES as string[]).includes(v);
}

export function asSide(v: unknown): Side {
  return v === 'opp' ? 'opp' : 'gov';
}

/** Columns on a sheet: gov sheets start at the PMC, opp sheets at the LOC. */
export function columnsFor(side: Side): Speech[] {
  return side === 'gov' ? SPEECHES : SPEECHES.slice(1);
}

/** The speech a sheet's own arguments come from. */
export function baseSpeech(side: Side): Speech {
  return side === 'gov' ? 'PMC' : 'LOC';
}
