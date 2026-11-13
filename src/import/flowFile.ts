import type { FlowMark } from '../flow2/model';

// What an Excel file made by this app carries besides the grid: the flow itself, exactly (which cell answers which,
// blank rows, groups, marks, links between cells), and a fingerprint of the grid's text. Reading the file back, the
// exact copy is used only if the grid still has the same text; a file someone edited in Excel is read from the grid.

export const FLOW_PART = 'parlipreproom/flow.json';

export interface FlowFileCell {
  id: string;
  col: number;
  parent: string | null;
  order: number;
  gap: number;
  group: string | null;
  mark: FlowMark | null;
  refs: string[];
  text: string;
}

export interface FlowFile {
  v: 1;
  /** fingerprint() of the grid as written. */
  grid: string;
  sheets: { id: string; name: string; side: 'gov' | 'opp'; cells: FlowFileCell[] }[];
}

/** A short fingerprint of every non-empty cell's text, sheet by sheet, row by row. */
export function fingerprint(sheets: { rows: string[][] }[]): string {
  let h = 0x811c9dc5;
  const add = (s: string) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  };
  for (const sh of sheets) {
    for (const row of sh.rows) for (const c of row ?? []) if (c?.trim()) add(c.trim() + '\u0001');
    add('\u0002');
  }
  return (h >>> 0).toString(16);
}
