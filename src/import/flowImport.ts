import type * as Y from 'yjs';
import { addCells, addSheet, readFlow, type FlowMark, type NewCell } from '../flow2/model';
import { SPEECH_INFO, SPEECHES, type Speech } from '../model/speeches';
import type { Sheet } from './importFile';
import { MARK_PREFIX } from '../export/flowXlsx';
import { fingerprint, type FlowFile } from './flowFile';

// Read spreadsheet rows (an Excel or CSV file) into the cell-based flow.
// - A file this app made carries the flow itself (flowFile.ts): if its grid is unchanged, the flow comes back
//   exactly, with which cell answers which, blank rows, groups, marks and links between cells.
// - Any other file is read from the grid: a heading row naming speeches (PMC, LOC...) puts each column in its speech,
//   a cell answers the nearest cell above it in the column before, and blank rows above an argument are kept.
//   What cannot be placed (a column that is not a speech) is reported, not dropped silently.

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

export interface ImportReport {
  /** Cells made. */
  cells: number;
  /** True when the flow came back exactly from a file this app made. */
  exact: boolean;
  /** What could not be placed, in plain words. */
  skipped: string[];
}

/** Adds one flow sheet per worksheet, in one change. */
export function importSheetsToFlow(doc: Y.Doc, sheets: Sheet[], exact?: FlowFile | null): ImportReport {
  return doc.transact(() => (exact && exact.v === 1 && exact.grid === fingerprint(sheets) ? importExact(doc, exact) : importGrid(doc, sheets)));
}

function importExact(doc: Y.Doc, file: FlowFile): ImportReport {
  let cells = 0;
  const sheetIds = new Map<string, string>();
  const made: { id: string; cells: FlowFile['sheets'][number]['cells']; ids: Map<string, string> }[] = [];
  for (const s of file.sheets) {
    const id = addSheet(doc, s.side === 'opp' ? 'opp' : 'gov', s.name.slice(0, 80) || undefined);
    sheetIds.set(s.id, id);
    made.push({ id, cells: s.cells, ids: new Map() });
  }
  // Cells first (new ids), then links between cells, which need every new id.
  for (const m of made) {
    const items: NewCell[] = m.cells.map((c) => ({ key: c.id, parent: c.parent, col: c.col, order: c.order, text: String(c.text ?? ''), gap: c.gap, group: c.group, mark: c.mark }));
    m.ids = addCells(doc, m.id, items);
    cells += items.length;
  }
  const cellIds = new Map<string, string>();
  for (const m of made) for (const [old, now] of m.ids) cellIds.set(old, now);
  const flow = readFlow(doc);
  for (const m of made) {
    const sheet = flow.find((s) => s.id === m.id);
    if (!sheet) continue;
    for (const c of m.cells) {
      const refs = (c.refs ?? [])
        .map((r) => r.split(':'))
        .filter(([kind, sh, cell]) => (kind === 'x' || kind === 'e') && sheetIds.has(sh) && cellIds.has(cell))
        .map(([kind, sh, cell]) => `${kind}:${sheetIds.get(sh)}:${cellIds.get(cell)}`);
      if (refs.length) addRefsRaw(doc, m.id, m.ids.get(c.id)!, refs);
    }
  }
  return { cells, exact: true, skipped: [] };
}

/** Links between cells, set directly (the cells were just made in this change). */
function addRefsRaw(doc: Y.Doc, sheetId: string, cellId: string, refs: string[]) {
  const sheet = doc.getMap<Y.Map<unknown>>('flow2.sheets').get(sheetId);
  const cell = (sheet?.get('cells') as Y.Map<Y.Map<unknown>> | undefined)?.get(cellId);
  cell?.set('refs', refs);
}

function importGrid(doc: Y.Doc, sheets: Sheet[]): ImportReport {
  let cells = 0;
  const skipped: string[] = [];
  for (const sh of sheets) {
    const all = Array.from(sh.rows, (r) => r ?? []); // (Array.from: a sheet with skipped rows has holes, which map would keep)
    const filled = (r: string[]) => r.some((c) => c?.trim());
    if (!all.some(filled)) continue;
    // The heading row: the first row among the first few with anything in them where two or more cells name a speech
    // and most of what is written does (a "Notes" column is allowed; a line of the flow below it is never taken).
    let headerIdx = -1;
    let seen = 0;
    for (let i = 0; i < all.length && seen < 5; i++) {
      if (!filled(all[i])) continue;
      seen++;
      const vals = all[i].filter((c) => c?.trim());
      const speeches = vals.filter((c) => speechOf(c)).length;
      if (speeches >= 2 && speeches >= vals.length * 0.6) {
        headerIdx = i;
        break;
      }
    }
    const header = headerIdx >= 0 ? all[headerIdx].map((c) => speechOf(c ?? '')) : null;
    const first = header?.find(Boolean) ?? null;
    const side = first ? SPEECH_INFO[first].side : 'gov';
    const id = addSheet(doc, side, sh.name.trim().slice(0, 60) || undefined);
    const columns = readFlow(doc).find((s) => s.id === id)?.columns ?? [];
    // Where each spreadsheet column goes on the sheet (0 = nowhere).
    const width = Math.max(0, ...all.map((r) => r.length));
    const target: number[] = [];
    for (let i = 0; i < width; i++) {
      if (header) target.push(header[i] ? columns.indexOf(header[i] as Speech) + 1 : 0);
      else target.push(i < columns.length ? i + 1 : 0);
    }
    const lost = new Set<string>();
    const items: NewCell[] = [];
    const last = new Map<number, string>();
    const nextOrder = new Map<string | null, number>();
    const order = (parent: string | null) => {
      const n = (nextOrder.get(parent) ?? 0) + 1;
      nextOrder.set(parent, n);
      return n;
    };
    let blanks = 0;
    for (const r of header ? all.slice(headerIdx + 1) : all) {
      if (!filled(r)) {
        blanks++;
        // A blank row ends the argument above: what comes after it starts afresh (it does not answer across the gap).
        last.clear();
        continue;
      }
      r.forEach((value, i) => {
        const raw = (value ?? '').trim();
        if (!raw) return;
        const col = target[i] ?? 0;
        if (col < 1) {
          const name = header ? (all[headerIdx][i] ?? '').trim() : '';
          lost.add(name ? `“${name}”` : `column ${i + 1}`);
          return;
        }
        const { text, mark } = splitMark(raw);
        const parent = col > 1 ? last.get(col - 1) ?? null : null;
        const key = `k${items.length}`;
        items.push({ key, parent, col, order: order(parent), text, mark, gap: parent === null ? Math.min(blanks, 50) : 0 });
        if (parent === null) blanks = 0;
        last.set(col, key);
        for (const k of [...last.keys()]) if (k > col) last.delete(k);
      });
    }
    addCells(doc, id, items);
    cells += items.length;
    if (lost.size) skipped.push(`${sh.name || 'A sheet'}: ${[...lost].join(', ')} ${lost.size > 1 ? 'are not speeches' : 'is not a speech'} on a ${side === 'gov' ? 'Gov' : 'Opp'} sheet, so ${lost.size > 1 ? 'they were' : 'it was'} left out`);
  }
  return { cells, exact: false, skipped };
}
