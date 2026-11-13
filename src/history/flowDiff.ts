import { diffWords } from 'diff';
import { SPEECH_INFO, type Speech } from '../model/speeches';
import { childrenMap, type FlowSheetData } from '../flow2/model';
import type { TextPart } from './diff';

// Comparing two states of a flow, cell by cell (the way diff.ts compares two docs block by block).

export interface FlatCell {
  id: string;
  sheetId: string;
  sheet: string;
  speech: Speech;
  /** 0 for an argument, 1 for an answer to it, and so on. */
  depth: number;
  text: string;
}

export type FlowDiffRow =
  | { type: 'same' | 'added' | 'removed'; cell: FlatCell }
  | { type: 'changed'; from: FlatCell; to: FlatCell; parts: TextPart[] };

/** Every cell with text, sheet by sheet, in reading order: an argument, then its answers, then the next argument. */
export function flattenFlow(sheets: readonly FlowSheetData[]): FlatCell[] {
  const out: FlatCell[] = [];
  for (const s of sheets) {
    const kids = childrenMap(s.cells);
    const walk = (c: (typeof s.cells)[number], depth: number) => {
      if (c.text.trim()) out.push({ id: c.id, sheetId: s.id, sheet: s.name || 'Untitled', speech: s.columns[c.col - 1] ?? 'PMC', depth, text: c.text });
      for (const k of kids.get(c.id) ?? []) walk(k, depth + 1);
    };
    for (const r of kids.get(null) ?? []) walk(r, 0);
  }
  return out;
}

/** Cell-by-cell comparison, with word-level detail for cells that were edited. Cells that are gone show where they were. */
export function diffFlows(before: FlatCell[], after: FlatCell[]): FlowDiffRow[] {
  const was = new Map(before.map((c) => [c.id, c]));
  const now = new Set(after.map((c) => c.id));
  const rows: FlowDiffRow[] = [];
  // Cells removed since: put each right after the nearest earlier cell that still exists.
  const removedAfter = new Map<string | null, FlatCell[]>();
  let anchor: string | null = null;
  for (const c of before) {
    if (now.has(c.id)) anchor = c.id;
    else removedAfter.set(anchor, [...(removedAfter.get(anchor) ?? []), c]);
  }
  for (const c of removedAfter.get(null) ?? []) rows.push({ type: 'removed', cell: c });
  for (const c of after) {
    const old = was.get(c.id);
    if (!old) rows.push({ type: 'added', cell: c });
    else if (old.text === c.text) rows.push({ type: 'same', cell: c });
    else rows.push({ type: 'changed', from: old, to: c, parts: diffWords(old.text, c.text) });
    for (const r of removedAfter.get(c.id) ?? []) rows.push({ type: 'removed', cell: r });
  }
  return rows;
}

export function summarizeFlow(rows: FlowDiffRow[]) {
  const s = { added: 0, removed: 0, changed: 0 };
  for (const r of rows) if (r.type === 'added') s.added++;
  else if (r.type === 'removed') s.removed++;
  else if (r.type === 'changed') s.changed++;
  return s;
}

export const speechName = (s: Speech) => SPEECH_INFO[s].name;
