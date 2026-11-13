import type { FlowSheetData } from '../flow2/model';
import { matchWord } from './fuzzy';

// Searching what is written on a flow: every word typed must match a cell (or the arguments it answers, or the
// sheet's name). Words may be a little misspelled (the matcher is Flowist's, by Elli; see fuzzy.ts). Pure.

export interface FlowEntry {
  cellId: string;
  sheetId: string;
  sheetName: string;
  speech: string;
  text: string;
  /** What this cell answers, nearest last (the arguments up the line). */
  path: string[];
}

export function flowEntries(sheets: FlowSheetData[]): FlowEntry[] {
  const out: FlowEntry[] = [];
  for (const sheet of sheets) {
    const byId = new Map(sheet.cells.map((c) => [c.id, c]));
    for (const c of sheet.cells) {
      if (!c.text.trim()) continue;
      const path: string[] = [];
      for (let p = c.parent ? byId.get(c.parent) : undefined, n = 0; p && n < 8; p = p.parent ? byId.get(p.parent) : undefined, n++) {
        if (p.text.trim()) path.unshift(p.text.trim());
      }
      out.push({ cellId: c.id, sheetId: sheet.id, sheetName: sheet.name.trim(), speech: sheet.columns[c.col - 1] ?? '', text: c.text, path });
    }
  }
  return out;
}

export interface FlowHit {
  entry: FlowEntry;
  score: number;
}

export function searchFlow(entries: FlowEntry[], query: string): FlowHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: FlowHit[] = [];
  for (const entry of entries) {
    let score = 0;
    let ok = true;
    for (const w of words) {
      const own = matchWord(w, entry.text);
      if (own) {
        score += 40 - own.rank * 8;
        continue;
      }
      // Not in the cell itself: the arguments it answers, or the sheet's name, count for less.
      const around = matchWord(w, entry.path.join(' ') + ' ' + entry.sheetName);
      if (around) score += 12 - around.rank * 3;
      else {
        ok = false;
        break;
      }
    }
    if (ok) hits.push({ entry, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}
