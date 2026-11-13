import * as Y from 'yjs';
import { newBlockId } from '../model/blocks';
import { asSide, columnsFor, type Side, type Speech } from '../model/speeches';

// The new flow: a document of separate cells, each with its own text, linked to the argument it
// answers. (Idea and interaction design adapted from Flowist, by Elli, used with permission; the
// code is this app's own, built on Yjs.)
//
//   cell   = one box in one speech column: text, which column, which cell it answers (parent),
//            where it sits among its siblings (order) and blank rows kept above it (gap).
//   root   = a cell with no parent. Roots run down the sheet in `order`; the cells that answer a
//            root, and the cells that answer those, hang off it to the right.
//   sheet  = a tab: a name, a side (gov or opp) and its cells.
//
// All of it lives in the document's own Yjs types, so two people editing the same flow merge.

export interface FlowCell {
  id: string;
  /** 1-based speech column on this sheet. */
  col: number;
  /** The cell this one answers (in the column just before), or null for a root. */
  parent: string | null;
  /** Position among roots (for a root) or among the cells answering the same parent. */
  order: number;
  /** Blank rows kept above this cell (roots only). */
  gap: number;
  /** Cells that share a group id (and sit next to each other) are drawn as one framed block. */
  group: string | null;
  /** How the argument stands in the round: extended, dropped, answered, or key. */
  mark: FlowMark | null;
  /** Cross-applications (a cell on another sheet) and extensions (an earlier cell on this sheet) this cell refers to. */
  refs: FlowRef[];
  text: string;
}

export type FlowMark = 'extended' | 'dropped' | 'answered' | 'key';
export const FLOW_MARKS: FlowMark[] = ['extended', 'dropped', 'answered', 'key'];
const asMark = (v: unknown): FlowMark | null => (FLOW_MARKS as string[]).includes(String(v)) ? (v as FlowMark) : null;

/** `x`: cross-applied from another sheet's cell; `e`: extends an earlier cell of this sheet. */
export interface FlowRef {
  kind: 'x' | 'e';
  /** The sheet the cell is on (always set for `x`; the cell's own sheet for `e`). */
  sheet: string;
  cell: string;
}

export const refKey = (r: FlowRef) => `${r.kind}:${r.sheet}:${r.cell}`;
function parseRefs(value: unknown): FlowRef[] {
  if (!Array.isArray(value)) return [];
  const out: FlowRef[] = [];
  for (const v of value) {
    const [kind, sheet, cell] = String(v).split(':');
    if ((kind === 'x' || kind === 'e') && sheet && cell) out.push({ kind, sheet, cell });
  }
  return out;
}

export interface FlowSheetData {
  id: string;
  name: string;
  side: Side;
  columns: Speech[];
  cells: FlowCell[];
  /** Where the sheet sits on the canvas (null until it has been placed or moved). */
  x: number | null;
  y: number | null;
}

/** What a remote or local change to a sheet does, so views can redraw. */
export const ORIGIN_LOCAL = 'flow2-local';

const ORDER = 'flow2.order';
const SHEETS = 'flow2.sheets';

export const sheetOrder = (doc: Y.Doc) => doc.getArray<string>(ORDER);
export const sheetsMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(SHEETS);

export function yCells(sheet: Y.Map<unknown>): Y.Map<Y.Map<unknown>> {
  return sheet.get('cells') as Y.Map<Y.Map<unknown>>;
}

export function yText(cell: Y.Map<unknown>): Y.Text {
  return cell.get('text') as Y.Text;
}

function readCell(id: string, m: Y.Map<unknown>): FlowCell {
  return {
    id,
    col: Math.max(1, Math.floor(Number(m.get('col')) || 1)),
    parent: typeof m.get('parent') === 'string' ? (m.get('parent') as string) : null,
    order: Number(m.get('order')) || 0,
    gap: Math.max(0, Math.floor(Number(m.get('gap')) || 0)),
    group: typeof m.get('group') === 'string' ? (m.get('group') as string) : null,
    mark: asMark(m.get('mark')),
    refs: parseRefs(m.get('refs')),
    text: (m.get('text') as Y.Text | undefined)?.toString() ?? '',
  };
}

export function readSheet(id: string, sheet: Y.Map<unknown>): FlowSheetData {
  const side = asSide(sheet.get('side'));
  const cells: FlowCell[] = [];
  yCells(sheet).forEach((m, cid) => cells.push(readCell(cid, m)));
  // Two people editing at once can leave odd data behind: an answer whose argument the other person deleted, or a
  // cell in a column this sheet does not have. Read them as something every view can show, so nothing goes missing.
  const columns = columnsFor(side);
  const ids = new Set(cells.map((c) => c.id));
  for (const c of cells) {
    if (c.col > columns.length) c.col = columns.length;
    if (c.parent !== null && !ids.has(c.parent)) c.parent = null;
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { id, name: String(sheet.get('name') ?? ''), side, columns: columnsFor(side), cells, x: num(sheet.get('x')), y: num(sheet.get('y')) };
}

export function readFlow(doc: Y.Doc): FlowSheetData[] {
  const sheets = sheetsMap(doc);
  const out: FlowSheetData[] = [];
  const seen = new Set<string>();
  for (const id of sheetOrder(doc).toArray()) {
    const s = sheets.get(id);
    // Two restores at once can list a sheet twice.
    if (s && !seen.has(id)) out.push(readSheet(id, s));
    seen.add(id);
  }
  return out;
}

/** Tell a view when anything in the flow changes (text typed, cell moved, sheet added). */
export function observeFlow(doc: Y.Doc, fn: () => void): () => void {
  const order = sheetOrder(doc);
  const sheets = sheetsMap(doc);
  order.observe(fn);
  sheets.observeDeep(fn);
  return () => {
    order.unobserve(fn);
    sheets.unobserveDeep(fn);
  };
}

const local = <T>(doc: Y.Doc, fn: () => T): T => doc.transact(fn, ORIGIN_LOCAL) as T;

// ---------- Sheets ----------

export function addSheet(doc: Y.Doc, side: Side, name?: string): string {
  return local(doc, () => {
    const id = newBlockId();
    const count = sheetOrder(doc).toArray().filter((sid) => sheetsMap(doc).get(sid)?.get('side') === side).length + 1;
    const sheet = new Y.Map<unknown>();
    sheet.set('name', name ?? (side === 'gov' ? `Gov ${count}` : `Opp ${count}`));
    sheet.set('side', side);
    sheet.set('cells', new Y.Map<Y.Map<unknown>>());
    sheetsMap(doc).set(id, sheet);
    sheetOrder(doc).push([id]);
    return id;
  });
}

/** Put a sheet at a place on the canvas. */
export function moveSheet(doc: Y.Doc, id: string, x: number, y: number) {
  local(doc, () => {
    const s = sheetsMap(doc).get(id);
    s?.set('x', Math.round(x));
    s?.set('y', Math.round(y));
  });
}

export function renameSheet(doc: Y.Doc, id: string, name: string) {
  local(doc, () => sheetsMap(doc).get(id)?.set('name', name.slice(0, 80)));
}

/** Changing sides changes the columns, so it is only offered for a sheet with nothing on it. */
export function setSheetSide(doc: Y.Doc, id: string, side: Side) {
  local(doc, () => sheetsMap(doc).get(id)?.set('side', side));
}

export function deleteSheet(doc: Y.Doc, id: string) {
  local(doc, () => {
    const order = sheetOrder(doc);
    const i = order.toArray().indexOf(id);
    if (i >= 0) order.delete(i, 1);
    sheetsMap(doc).delete(id);
  });
}

/** A flow always has at least one sheet. */
export function ensureSheet(doc: Y.Doc) {
  if (sheetOrder(doc).length === 0) addSheet(doc, 'gov');
}

// ---------- Cells ----------

function cellsOf(doc: Y.Doc, sheetId: string): Y.Map<Y.Map<unknown>> | null {
  const s = sheetsMap(doc).get(sheetId);
  return s ? yCells(s) : null;
}

/** A sort key just after `after` (or at the end / start). */
export function orderAfter(siblings: { id: string; order: number }[], afterId: string | null): number {
  const sorted = [...siblings].sort((a, b) => a.order - b.order);
  if (afterId === null) return (sorted.at(-1)?.order ?? 0) + 1;
  const i = sorted.findIndex((s) => s.id === afterId);
  if (i < 0) return (sorted.at(-1)?.order ?? 0) + 1;
  const next = sorted[i + 1];
  return next ? (sorted[i].order + next.order) / 2 : sorted[i].order + 1;
}

function make(cells: Y.Map<Y.Map<unknown>>, props: { col: number; parent: string | null; order: number; gap?: number; text?: string }): string {
  const id = newBlockId();
  const m = new Y.Map<unknown>();
  m.set('col', props.col);
  m.set('parent', props.parent);
  m.set('order', props.order);
  if (props.gap) m.set('gap', props.gap);
  m.set('text', new Y.Text(props.text ?? ''));
  cells.set(id, m);
  return id;
}

function snapshot(cells: Y.Map<Y.Map<unknown>>): FlowCell[] {
  const out: FlowCell[] = [];
  cells.forEach((m, id) => out.push(readCell(id, m)));
  return out;
}

/** A new root cell in column `col`, right after the root `afterRootId` (or at the end). */
export function createRoot(doc: Y.Doc, sheetId: string, col: number, afterRootId: string | null = null, gap = 0, text = ''): string | null {
  const cells = cellsOf(doc, sheetId);
  if (!cells) return null;
  return local(doc, () => {
    const roots = snapshot(cells).filter((c) => c.parent === null);
    return make(cells, { col, parent: null, order: orderAfter(roots, afterRootId), gap, text });
  });
}

/** A new cell answering `parentId`, after its sibling `afterId` (or last). Null if there is no column after the parent's. */
export function createChild(doc: Y.Doc, sheetId: string, parentId: string, afterId: string | null = null, columnCount = 6, text = ''): string | null {
  const cells = cellsOf(doc, sheetId);
  const parent = cells?.get(parentId);
  if (!cells || !parent) return null;
  const col = Math.floor(Number(parent.get('col')) || 1) + 1;
  if (col > columnCount) return null;
  return local(doc, () => {
    const sibs = snapshot(cells).filter((c) => c.parent === parentId);
    return make(cells, { col, parent: parentId, order: orderAfter(sibs, afterId), text });
  });
}

/** A new cell in the same column and under the same parent, right after `cellId`. */
export function createSibling(doc: Y.Doc, sheetId: string, cellId: string): string | null {
  const cells = cellsOf(doc, sheetId);
  const cell = cells?.get(cellId);
  if (!cells || !cell) return null;
  const parent = typeof cell.get('parent') === 'string' ? (cell.get('parent') as string) : null;
  const col = Math.floor(Number(cell.get('col')) || 1);
  return local(doc, () => {
    const sibs = snapshot(cells).filter((c) => c.parent === parent && (parent !== null || c.col === col));
    return make(cells, { col, parent, order: orderAfter(sibs, cellId) });
  });
}

/**
 * Remove a cell. Cells that answered it keep their text and become roots right after the
 * root they hung from, so nothing typed is lost with a deleted neighbour.
 */
export function deleteCell(doc: Y.Doc, sheetId: string, cellId: string) {
  const cells = cellsOf(doc, sheetId);
  if (!cells?.get(cellId)) return;
  local(doc, () => {
    const all = snapshot(cells);
    const byId = new Map(all.map((c) => [c.id, c]));
    const gone = byId.get(cellId)!;
    let anchor = gone;
    for (let c: FlowCell | undefined = gone; c?.parent; c = byId.get(c.parent)) anchor = byId.get(c.parent) ?? anchor;
    let at = anchor.order;
    const roots = all.filter((c) => c.parent === null && c.id !== cellId);
    for (const o of all.filter((c) => c.parent === cellId).sort((a, b) => a.order - b.order)) {
      at = orderAfterValue(roots, at);
      const m = cells.get(o.id)!;
      m.set('parent', null);
      m.set('order', at);
      m.delete('gap');
      roots.push({ ...o, parent: null, order: at });
    }
    cells.delete(cellId);
  });
}

/** A sort key just after `value` among `items`. */
function orderAfterValue(items: { order: number }[], value: number): number {
  const later = items.filter((r) => r.order > value).sort((a, b) => a.order - b.order)[0];
  return later ? (value + later.order) / 2 : value + 1;
}

export type LinkResult = { linked: string[]; removed: string[] } | { error: string };

/**
 * Make these cells answer `targetId`. They must be in the column right after the target's. Cells with
 * nothing typed are removed instead of linked (they vanish when the answers collapse).
 * `ids` should be in the order they should appear.
 */
export function linkCells(doc: Y.Doc, sheetId: string, ids: string[], targetId: string): LinkResult {
  const cells = cellsOf(doc, sheetId);
  const target = cells?.get(targetId);
  if (!cells || !target) return { error: 'That argument is gone.' };
  const col = Math.floor(Number(target.get('col')) || 1) + 1;
  const all = snapshot(cells);
  const byId = new Map(all.map((c) => [c.id, c]));
  const picked = ids.map((id) => byId.get(id)).filter((c): c is FlowCell => !!c);
  if (picked.some((c) => c.col !== col)) return { error: 'Click an argument in the speech just before these cells.' };
  if (picked.some((c) => c.id === targetId)) return { error: 'A cell cannot answer itself.' };
  const linked: string[] = [];
  const removed: string[] = [];
  local(doc, () => {
    const sibs = all.filter((c) => c.parent === targetId && !ids.includes(c.id));
    let last = sibs.sort((a, b) => a.order - b.order).at(-1)?.order ?? 0;
    for (const c of picked) {
      const hasChildText = all.some((k) => k.parent === c.id && k.text.trim() !== '');
      if (c.text.trim() === '' && !hasChildText) {
        deleteCell(doc, sheetId, c.id);
        removed.push(c.id);
        continue;
      }
      const m = cells.get(c.id)!;
      last += 1;
      m.set('parent', targetId);
      m.set('order', last);
      m.delete('gap');
      m.delete('group');
      linked.push(c.id);
    }
  });
  return { linked, removed };
}

/** Take a cell out of its link: it becomes a root right after the root it hung from. */
export function unlinkCell(doc: Y.Doc, sheetId: string, cellId: string) {
  const cells = cellsOf(doc, sheetId);
  const m = cells?.get(cellId);
  if (!cells || !m || typeof m.get('parent') !== 'string') return;
  local(doc, () => {
    const all = snapshot(cells);
    const byId = new Map(all.map((c) => [c.id, c]));
    let rootId = cellId;
    for (let c: FlowCell | undefined = byId.get(cellId); c?.parent; c = byId.get(c.parent)) rootId = c.parent;
    const roots = all.filter((c) => c.parent === null);
    m.set('order', orderAfter(roots, rootId));
    m.set('parent', null);
    m.delete('group');
  });
}

// ---------- Reading helpers for the views ----------

/** Two people can give two cells the same place at the same moment; the id breaks the tie the same way for everyone. */
const byOrder = (a: FlowCell, b: FlowCell) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Roots in sheet order. */
export function rootsOf(cells: FlowCell[]): FlowCell[] {
  return cells.filter((c) => c.parent === null).sort(byOrder);
}

export function childrenOf(cells: FlowCell[], id: string): FlowCell[] {
  return cells.filter((c) => c.parent === id).sort(byOrder);
}

// ---------- Groups ----------

export type GroupResult = { ok: true; group: string } | { ok: false; error: string };

/**
 * Draw these cells as one framed block (the idea is Flowist's, by Elli, used with permission). They must be
 * in one column under one parent (or all roots); they are moved next to each other, in their order.
 */
export function groupCells(doc: Y.Doc, sheetId: string, ids: string[]): GroupResult {
  const cells = cellsOf(doc, sheetId);
  if (!cells) return { ok: false, error: 'That sheet is gone.' };
  const all = snapshot(cells);
  const picked = all.filter((c) => ids.includes(c.id));
  if (picked.length < 2) return { ok: false, error: 'Select two or more cells in one column to group them.' };
  const first = picked[0];
  if (picked.some((c) => c.col !== first.col || c.parent !== first.parent)) return { ok: false, error: 'Cells can only be grouped with others in the same column and under the same argument.' };
  const group = newBlockId();
  local(doc, () => {
    const sorted = [...picked].sort((a, b) => a.order - b.order);
    const others = all.filter((c) => c.parent === first.parent && (first.parent !== null || c.col === first.col) && !ids.includes(c.id));
    let at = sorted[0].order;
    const sibs = [...others];
    sorted.forEach((c, i) => {
      if (i > 0) {
        at = orderAfterValue(sibs, at);
        cells.get(c.id)!.set('order', at);
      }
      sibs.push({ ...c, order: at } as FlowCell);
      cells.get(c.id)!.set('group', group);
    });
  });
  return { ok: true, group };
}

/** Take cells out of their group. */
export function ungroupCells(doc: Y.Doc, sheetId: string, ids: string[]) {
  const cells = cellsOf(doc, sheetId);
  if (!cells) return;
  local(doc, () => {
    for (const id of ids) cells.get(id)?.delete('group');
  });
}

// ---------- Cross-applications and extensions ----------

/**
 * Point a cell at another cell: `x` (cross-apply: an argument from another sheet applied here) or `e` (extend an
 * earlier argument on this sheet). The idea is Flowist's, by Elli, used with permission.
 */
export function addRef(doc: Y.Doc, sheetId: string, cellId: string, ref: FlowRef): boolean {
  const cells = cellsOf(doc, sheetId);
  const m = cells?.get(cellId);
  if (!cells || !m) return false;
  if (ref.cell === cellId && ref.sheet === sheetId) return false;
  const current = parseRefs(m.get('refs'));
  if (current.some((r) => refKey(r) === refKey(ref))) return true;
  local(doc, () => m.set('refs', [...current, ref].map(refKey)));
  return true;
}

export function removeRef(doc: Y.Doc, sheetId: string, cellId: string, ref: FlowRef) {
  const m = cellsOf(doc, sheetId)?.get(cellId);
  if (!m) return;
  local(doc, () => {
    const next = parseRefs(m.get('refs')).filter((r) => refKey(r) !== refKey(ref)).map(refKey);
    if (next.length) m.set('refs', next);
    else m.delete('refs');
  });
}

// ---------- Marks and sheet position ----------

/** Mark these cells (or clear the mark, with null). */
export function setMark(doc: Y.Doc, sheetId: string, cellIds: string[], mark: FlowMark | null) {
  const cells = cellsOf(doc, sheetId);
  if (!cells) return;
  local(doc, () => {
    for (const id of cellIds) {
      const m = cells.get(id);
      if (!m) continue;
      if (mark) m.set('mark', mark);
      else m.delete('mark');
    }
  });
}

/** Forget where a sheet was put: it goes back to its place in the row of sheets, from the top-left corner. */
export function resetSheetPosition(doc: Y.Doc, id: string) {
  local(doc, () => {
    const s = sheetsMap(doc).get(id);
    s?.delete('x');
    s?.delete('y');
  });
}
