import type * as Y from 'yjs';
import { addSheet, createChild, createRoot, readFlow, setMark, type FlowMark } from '../flow2/model';
import { SPEECH_INFO, SPEECHES, type Speech } from '../model/speeches';
import type { Sheet } from './importFile';
import { MARK_PREFIX } from '../export/flowXlsx';

// Read spreadsheet rows (an Excel or CSV file) into the cell-based flow. A header row naming speeches (PMC, LOC...)
// puts each column in its speech. A cell answers the nearest cell above it in the column before, so a flow
// exported from here (src/export/flowXlsx.ts) comes back the way it was.

const speechOf = (header: string): Speech | null => {
  const h = header.trim().toUpperCase().replace(/[^A-Z]/g, '');
  return (SPEECHES as string[]).includes(h) ? (h as Speech) : null;
};

function splitMark(text: string): { text: string; mark: FlowMark | null } {
  for (const [mark, prefix] of Object.entries(MARK_PREFIX) as [FlowMark, string][]) {
    if (text.startsWith(prefix)) return { text: text.slice(prefix.length), mark };
  }
  return { text, mark: null };
}

/** Adds one flow sheet per worksheet. Returns how many cells were made. */
export function importSheetsToFlow(doc: Y.Doc, sheets: Sheet[]): number {
  // One change for the whole file, not one per cell.
  return doc.transact(() => importAll(doc, sheets));
}

function importAll(doc: Y.Doc, sheets: Sheet[]): number {
  let made = 0;
  for (const sh of sheets) {
    const rows = sh.rows.filter((r) => r.some((c) => c?.trim()));
    if (!rows.length) continue;
    const headerIdx = rows.findIndex((r) => r.filter((c) => speechOf(c ?? '')).length >= 2);
    const header = headerIdx >= 0 ? rows[headerIdx].map((c) => speechOf(c ?? '')) : null;
    const first = header?.find(Boolean) ?? null;
    const side = first ? SPEECH_INFO[first].side : 'gov';
    const id = addSheet(doc, side, sh.name.trim().slice(0, 60) || undefined);
    const columns = readFlow(doc).find((s) => s.id === id)?.columns ?? [];
    const last = new Map<number, string>();
    const lastChild = new Map<string, string>();
    let lastRoot: string | null = null;
    for (const r of header ? rows.slice(headerIdx + 1) : rows) {
      r.forEach((cell, i) => {
        const raw = (cell ?? '').trim();
        if (!raw) return;
        const col = header ? columns.indexOf(header[i] as Speech) + 1 : Math.min(i + 1, columns.length);
        if (col < 1) return;
        const { text, mark } = splitMark(raw);
        const parent = col > 1 ? last.get(col - 1) : undefined;
        let cellId: string | null;
        if (parent) {
          cellId = createChild(doc, id, parent, lastChild.get(parent) ?? null, columns.length, text);
          if (cellId) lastChild.set(parent, cellId);
        } else {
          cellId = createRoot(doc, id, col, lastRoot, 0, text);
          if (cellId) lastRoot = cellId;
        }
        if (!cellId) return;
        made++;
        if (mark) setMark(doc, id, [cellId], mark);
        last.set(col, cellId);
        for (const k of [...last.keys()]) if (k > col) last.delete(k);
      });
    }
  }
  return made;
}
