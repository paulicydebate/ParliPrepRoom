import { Extension } from '@tiptap/core';
import { DOMSerializer, Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { levelOf, newBlockId } from '../model/blocks';
import { computeFlow, insertPosFor, readBlocks, sheetAt, type FlowLayout, type FlowSheet } from '../model/flow';
import { columnTracks, DEFAULT_METRICS, layoutFlow, type FlowGeometry } from '../model/flowLayout';
import { baseSpeech, SPEECH_INFO, type Side } from '../model/speeches';
import { toast } from './roundGuard';

// Flow view: the same document as the doc view, laid out as a grid. The
// editor root becomes a CSS grid and each block is placed in its speech
// column, so typing in a cell edits the shared document directly.

export interface FlowState {
  layout: FlowLayout;
  /** Key of the sheet shown (see sheetKey). */
  active: string | null;
  /** Pins column: shown just after this (1-based) speech column, pushing later columns right. */
  pinCol: number | null;
  /** Link mode: the claims being linked (by block id) and their column; the next click on an argument links them. */
  linking: { ids: string[]; col: number } | null;
  /** Cells picked with the box-select (ids of their first lines); Link uses them. */
  picked: string[];
  /** Measured height of each block of the sheet in view, by document position (px). Measured after every change. */
  heights: ReadonlyMap<number, number>;
  /** Where everything goes on screen (see model/flowLayout.ts); null until there is a sheet. */
  geometry: FlowGeometry | null;
}

function geometryOf(layout: FlowLayout, active: string | null, heights: ReadonlyMap<number, number>): FlowGeometry | null {
  const sheet = layout.sheets.find((s) => sheetKey(s) === active) ?? layout.sheets[0];
  return sheet ? layoutFlow(sheet, heights) : null;
}

export const flowKey = new PluginKey<FlowState>('pp-flow');

export const sheetKey = (s: FlowSheet) => s.id ?? `pos:${s.pos}`;

/** Column widths for the sheet in view: a column is narrow until a line with text is in it (or the caret is). */
export function tracksFor(state: EditorState) {
  const fs = flowKey.getState(state);
  const sheet = activeSheet(fs);
  const $from = state.selection.$from;
  const here = $from.depth >= 1 ? $from.before(1) : -1;
  const caretCol = sheet?.placements.find((p) => p.pos === here)?.col ?? null;
  return columnTracks(sheet, fs?.pinCol ?? null, { hasText: (pos) => (state.doc.nodeAt(pos)?.textContent.trim() ?? '') !== '', caretCol: caretCol || null });
}

export function activeSheet(state: FlowState | undefined): FlowSheet | null {
  if (!state) return null;
  return state.layout.sheets.find((s) => sheetKey(s) === state.active) ?? state.layout.sheets[0] ?? null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    flow: {
      /** Show a sheet. */
      showSheet: (key: string) => ReturnType;
      /** Add a sheet at the end of the document and show it. */
      addSheet: (side: Side) => ReturnType;
      renameSheet: (key: string, title: string) => ReturnType;
      setSheetSide: (key: string, side: Side) => ReturnType;
      /** Delete a sheet and everything on it (undo brings it back). */
      deleteSheet: (key: string) => ReturnType;
      /** Show the pins column after this speech column, or hide it if it's already there. */
      togglePinColumn: (col: number) => ReturnType;
      /** Start typing in an empty cell. A number means an existing row (group index); null means the first empty row at the bottom. */
      createCell: (target: CellTarget | number | null, col: number) => ReturnType;
      /** Tab / Shift-Tab: go to the next or previous speech in this row. */
      moveColumn: (dir: 1 | -1) => ReturnType;
      /** Start a new row below the current one, in the current column. */
      newRow: () => ReturnType;
      /**
       * Enter: go down one cell in this column (the cell in the next row, making it if the row has
       * none there, or a new row after the last). False when the caret is not in a cell (a title).
       */
      nextCell: () => ReturnType;
      /** Link mode: the selected claims (or the one the caret is in) will answer the argument you click next. */
      startLinking: () => ReturnType;
      cancelLinking: () => ReturnType;
      /** The "+" under linked answers: a new empty answer to the same argument, inserted at `at`. */
      addAnswer: (targetPos: number, at: number) => ReturnType;
      /** Take a linked claim out of its link (it goes back to its place in the document order). */
      unlinkBlock: (pos: number) => ReturnType;
    };
  }
}

function blockNode(state: EditorState, attrs: Record<string, unknown>, text = ''): PMNode {
  const type = state.schema.nodes.block;
  return type.create({ id: newBlockId(), ...attrs }, text ? state.schema.text(text) : null);
}

function currentPlacement(state: EditorState) {
  const fs = flowKey.getState(state);
  const sheet = activeSheet(fs);
  const { $from } = state.selection;
  if (!sheet || $from.depth < 1) return null;
  const pos = $from.before(1);
  const p = sheet.placements.find((x) => x.pos === pos);
  return p ? { sheet, p } : null;
}

function selectEnd(tr: Transaction, pos: number) {
  const node = tr.doc.nodeAt(pos);
  if (!node) return;
  tr.setSelection(TextSelection.create(tr.doc, pos + 1 + node.content.size)).scrollIntoView();
}

/** A new row right after this one, in the same column (a blank row below is filled instead of pushing rows down). */
function startRowBelow(state: EditorState, tr: Transaction, sheet: FlowSheet, p: { group: number; col: number }) {
  const g = sheet.groups[p.group];
  const speech = sheet.columns[p.col - 1];
  const isBase = speech === baseSpeech(sheet.side);
  const next = tr.doc.nodeAt(g.to);
  const nextGap = Number(next?.attrs.gap) || 0;
  if (next && nextGap > 0) tr.setNodeMarkup(g.to, undefined, { ...next.attrs, gap: nextGap - 1 });
  tr.insert(g.to, blockNode(state, { kind: 'claim', speech: isBase ? null : speech, newRow: !isBase }));
  tr.setSelection(TextSelection.create(tr.doc, g.to + 1)).scrollIntoView();
  return true;
}

/** Where a click asks for a new cell: an existing row, a blank row kept above a row, or an empty row below the content. */
export type CellTarget = { group: number } | { before: number; index: number } | { ghost: number };

function insertCell(state: EditorState, tr: Transaction, sheet: FlowSheet, target: CellTarget, col: number) {
  const speech = sheet.columns[col - 1];
  const isBase = speech === baseSpeech(sheet.side);
  const fresh = { kind: 'claim', speech: isBase ? null : speech };
  let pos: number;
  let attrs: Record<string, unknown>;
  if ('ghost' in target) {
    // Keep the empty rows above it so the line lands in the row that was clicked.
    pos = sheet.end;
    attrs = { ...fresh, newRow: !isBase, gap: target.ghost };
  } else if ('before' in target) {
    const g = sheet.groups[target.before];
    const root = g && tr.doc.nodeAt(g.from);
    if (!g || !root) return false;
    const gap = Number(root.attrs.gap) || 0;
    tr.setNodeMarkup(g.from, undefined, { ...root.attrs, gap: Math.max(0, gap - target.index - 1) });
    pos = g.from;
    attrs = { ...fresh, newRow: !isBase, gap: target.index };
  } else {
    const g = sheet.groups[target.group];
    if (!g) return false;
    if (col === 1 && !g.cells.has(1)) {
      // The row was started in a later speech; put the sheet's own claim first.
      const first = tr.doc.nodeAt(g.from);
      const gap = Number(first?.attrs.gap) || 0;
      if (first) tr.setNodeMarkup(g.from, undefined, { ...first.attrs, newRow: false, gap: 0 });
      pos = g.from;
      attrs = { ...fresh, gap };
    } else {
      pos = insertPosFor(g, col);
      attrs = fresh;
    }
  }
  tr.insert(pos, blockNode(state, attrs));
  tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
  return true;
}

/**
 * When a selection runs across several cells, it covers only the column it
 * started in: every line in that column between the start row and end row.
 */
export function columnSelection(state: EditorState): { col: number; positions: number[] } | null {
  const { selection } = state;
  if (selection.empty) return null;
  const sheet = activeSheet(flowKey.getState(state));
  if (!sheet) return null;
  const $a = selection.$anchor;
  const $h = selection.$head;
  if ($a.depth < 1 || $h.depth < 1) return null;
  const aPos = $a.before(1);
  const hPos = $h.before(1);
  if (aPos === hPos) return null;
  const pa = sheet.placements.find((p) => p.pos === aPos);
  const ph = sheet.placements.find((p) => p.pos === hPos);
  if (!pa || !ph || pa.col === 0) return null;
  const lo = Math.min(pa.row, ph.row);
  const hi = Math.max(pa.row + pa.rowSpan - 1, ph.row + ph.rowSpan - 1);
  const positions = sheet.placements
    .filter((p) => p.col === pa.col && p.row + p.rowSpan - 1 >= lo && p.row <= hi)
    .map((p) => p.pos)
    .sort((x, y) => x - y);
  return { col: pa.col, positions };
}

/** Copy (or cut) only the selected column's lines. Returns false to let the browser handle normal selections. */
function copyColumn(view: EditorView, event: ClipboardEvent, cut: boolean): boolean {
  const sel = columnSelection(view.state);
  if (!sel || !event.clipboardData) return false;
  const nodes = sel.positions.map((p) => view.state.doc.nodeAt(p)).filter((n): n is PMNode => !!n);
  const div = document.createElement('div');
  div.appendChild(DOMSerializer.fromSchema(view.state.schema).serializeFragment(Fragment.fromArray(nodes)));
  event.clipboardData.setData('text/html', div.innerHTML);
  event.clipboardData.setData('text/plain', nodes.map((n) => n.textContent).join('\n'));
  event.preventDefault();
  if (cut) {
    const tr = view.state.tr;
    for (const p of [...sel.positions].sort((a, b) => b - a)) {
      const n = tr.doc.nodeAt(p);
      if (n) tr.delete(p, p + n.nodeSize);
    }
    view.dispatch(tr);
  }
  return true;
}


const LINK_HINT = 'Select one or more claims in a later speech (drag across them), then press Link and click the argument they answer.';

/** Block position of a DOM node inside the flow grid. */
function blockPosOf(view: EditorView, el: Element): number | null {
  try {
    const $p = view.state.doc.resolve(view.posAtDOM(el, 0));
    return $p.depth >= 1 ? $p.before(1) : $p.pos;
  } catch {
    return null;
  }
}

function posOfId(state: EditorState, sheet: FlowSheet, id: string): number | null {
  for (const p of sheet.placements) if (state.doc.nodeAt(p.pos)?.attrs.id === id) return p.pos;
  return null;
}

/** Link the claims chosen with Link to the argument at targetPos. */
export function applyLink(view: EditorView, targetPos: number): boolean {
  const state = view.state;
  const fs = flowKey.getState(state);
  const sheet = activeSheet(fs);
  const lk = fs?.linking;
  if (!sheet || !lk) return false;
  const tp = sheet.placements.find((p) => p.pos === targetPos);
  const tnode = state.doc.nodeAt(targetPos);
  if (!tp || !tnode || tp.col === 0) return false;
  const targetId = tnode.attrs.id as string | null;
  if (!targetId) return false;
  if (tp.col !== lk.col - 1) {
    toast(`Click an argument in the ${sheet.columns[lk.col - 2] ?? 'previous'} column (the speech just before), or press Esc.`);
    return true;
  }
  const tr = state.tr;
  // Empty cells in the selection (a claim with nothing typed and no text under it) are not linked:
  // they disappear when the answers collapse beside their argument.
  const toDelete: { pos: number; size: number }[] = [];
  for (const id of lk.ids) {
    const pos = posOfId(state, sheet, id);
    const node = pos === null ? null : state.doc.nodeAt(pos);
    if (pos === null || !node) continue;
    let end = pos + node.nodeSize;
    let hasText = node.textContent.trim() !== '';
    for (let next = state.doc.nodeAt(end); next && next.attrs.kind !== 'claim' && levelOf(next.attrs.kind) > 2 && !next.attrs.speech; next = state.doc.nodeAt(end)) {
      hasText = hasText || next.textContent.trim() !== '';
      end += next.nodeSize;
    }
    if (!hasText) toDelete.push({ pos, size: end - pos });
    else tr.setNodeMarkup(pos, undefined, { ...node.attrs, answers: targetId, speech: sheet.columns[lk.col - 1] });
  }
  for (const d of toDelete.sort((a, b) => b.pos - a.pos)) tr.delete(d.pos, d.pos + d.size);
  tr.setMeta(flowKey, { linking: null, picked: [] });
  const mapped = tr.mapping.map(targetPos);
  tr.setSelection(TextSelection.create(tr.doc, mapped + 1 + tnode.content.size));
  view.dispatch(tr);
  return true;
}


/**
 * Drag on an empty spot to draw a box; the cells it touches are picked (then Link uses them). A press
 * that never moves is a plain click and calls `onClick`.
 */
function boxSelect(view: EditorView, start: MouseEvent, onClick: () => void) {
  const wrap = view.dom.closest('.flow-grid-wrap') as HTMLElement | null;
  const x0 = start.clientX;
  const y0 = start.clientY;
  let box: HTMLElement | null = null;
  let moved = false;
  let raf = 0;
  let last = { x: x0, y: y0 };
  const apply = () => {
    raf = 0;
    if (!box || !wrap) return;
    const left = Math.min(x0, last.x);
    const top = Math.min(y0, last.y);
    const right = Math.max(x0, last.x);
    const bottom = Math.max(y0, last.y);
    const w = wrap.getBoundingClientRect();
    box.style.left = `${left - w.left}px`;
    box.style.top = `${top - w.top}px`;
    box.style.width = `${right - left}px`;
    box.style.height = `${bottom - top}px`;
    const ids: string[] = [];
    for (const el of view.dom.querySelectorAll<HTMLElement>(':scope > .fl-cell[data-first]')) {
      const r = el.getBoundingClientRect();
      if (r.right < left || r.left > right || r.bottom < top || r.top > bottom) continue;
      const id = view.state.doc.nodeAt(Number(el.dataset.first))?.attrs.id;
      if (id) ids.push(String(id));
    }
    const now = flowKey.getState(view.state)?.picked ?? [];
    if (ids.join() !== now.join()) view.dispatch(view.state.tr.setMeta(flowKey, { picked: ids }));
  };
  const move = (e: MouseEvent) => {
    last = { x: e.clientX, y: e.clientY };
    if (!moved) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
      moved = true;
      box = document.createElement('div');
      box.className = 'fl-marquee';
      wrap?.appendChild(box);
    }
    if (!raf) raf = requestAnimationFrame(apply);
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    if (raf) cancelAnimationFrame(raf);
    if (moved) apply();
    box?.remove();
    if (!moved) onClick();
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up, { once: true });
}

export const FlowView = Extension.create<{ pinPanel: HTMLElement | null }>({
  name: 'flowView',
  addOptions() {
    // An element the app fills with the pins for this sheet; placed in the grid as a column.
    return { pinPanel: null };
  },
  // Our Tab beats the doc view's Tab (which changes level).
  priority: 1100,

  addCommands() {
    return {
      showSheet:
        (key) =>
        ({ state, tr, dispatch }) => {
          const sheet = flowKey.getState(state)?.layout.sheets.find((s) => sheetKey(s) === key);
          if (!sheet) return false;
          if (dispatch) {
            tr.setMeta(flowKey, { active: key });
            const first = sheet.placements.find((p) => p.col > 0);
            if (first) selectEnd(tr, first.pos);
            else tr.setSelection(TextSelection.create(tr.doc, sheet.pos + 1));
          }
          return true;
        },
      addSheet:
        (side) =>
        ({ state, tr, dispatch }) => {
          if (dispatch) {
            const count = (flowKey.getState(state)?.layout.sheets.filter((s) => s.side === side).length ?? 0) + 1;
            const title = side === 'gov' ? `Gov ${count}` : `Opp ${count}`;
            const id = newBlockId();
            const end = tr.doc.content.size;
            tr.insert(end, [blockNode(state, { kind: 'position', side, id }, title), blockNode(state, { kind: 'claim' })]);
            tr.setMeta(flowKey, { active: id });
            const claimPos = end + tr.doc.nodeAt(end)!.nodeSize;
            tr.setSelection(TextSelection.create(tr.doc, claimPos + 1)).scrollIntoView();
          }
          return true;
        },
      renameSheet:
        (key, title) =>
        ({ state, tr, dispatch }) => {
          const sheet = flowKey.getState(state)?.layout.sheets.find((s) => sheetKey(s) === key);
          const node = sheet && tr.doc.nodeAt(sheet.pos);
          if (!sheet || !node) return false;
          if (dispatch) {
            const from = sheet.pos + 1;
            const to = from + node.content.size;
            if (title) tr.insertText(title, from, to);
            else tr.delete(from, to);
          }
          return true;
        },
      setSheetSide:
        (key, side) =>
        ({ state, tr, dispatch }) => {
          const sheet = flowKey.getState(state)?.layout.sheets.find((s) => sheetKey(s) === key);
          const node = sheet && tr.doc.nodeAt(sheet.pos);
          if (!sheet || !node) return false;
          if (dispatch) tr.setNodeMarkup(sheet.pos, undefined, { ...node.attrs, side });
          return true;
        },
      togglePinColumn:
        (col) =>
        ({ state, tr, dispatch }) => {
          const current = flowKey.getState(state)?.pinCol ?? null;
          if (dispatch) tr.setMeta(flowKey, { pinCol: current === col ? null : col });
          return true;
        },
      deleteSheet:
        (key) =>
        ({ state, tr, dispatch }) => {
          const sheet = flowKey.getState(state)?.layout.sheets.find((s) => sheetKey(s) === key);
          if (!sheet) return false;
          if (dispatch) {
            tr.delete(sheet.pos, sheet.end);
            // A document always needs at least one line.
            if (tr.doc.childCount === 0) tr.insert(0, blockNode(state, { kind: 'position' }));
            tr.setMeta(flowKey, { active: '' });
          }
          return true;
        },
      createCell:
        (target, col) =>
        ({ state, tr, dispatch }) => {
          const sheet = activeSheet(flowKey.getState(state));
          if (!sheet || col < 1 || col > sheet.columns.length) return false;
          if (!dispatch) return true;
          const t: CellTarget = target === null ? { ghost: 0 } : typeof target === 'number' ? { group: target } : target;
          return insertCell(state, tr, sheet, t, col);
        },
      moveColumn:
        (dir) =>
        ({ state, tr, dispatch }) => {
          const cur = currentPlacement(state);
          // Always swallow Tab on the flow so focus doesn't leave the grid.
          if (!cur || cur.p.group < 0) return true;
          const target = cur.p.col + dir;
          if (target < 1 || target > cur.sheet.columns.length) return true;
          const g = cur.sheet.groups[cur.p.group];
          const list = g?.cells.get(target);
          if (!dispatch) return true;
          if (list?.length) {
            selectEnd(tr, list[list.length - 1].pos);
            return true;
          }
          return insertCell(state, tr, cur.sheet, { group: cur.p.group }, target);
        },
      newRow:
        () =>
        ({ state, tr, dispatch }) => {
          const cur = currentPlacement(state);
          const sheet = cur?.sheet ?? activeSheet(flowKey.getState(state));
          if (!sheet) return false;
          if (!dispatch) return true;
          if (!cur || cur.p.group < 0) return insertCell(state, tr, sheet, { ghost: 0 }, 1);
          return startRowBelow(state, tr, cur.sheet, cur.p);
        },
      startLinking:
        () =>
        ({ state, tr, dispatch }) => {
          const sheet = activeSheet(flowKey.getState(state));
          if (!sheet) return false;
          let positions: number[];
          const sel = columnSelection(state);
          const pickedIds = new Set(flowKey.getState(state)?.picked ?? []);
          if (pickedIds.size) {
            // Cells picked with the box-select: the column that has the most of them.
            const mine = sheet.placements.filter((p) => pickedIds.has(String(state.doc.nodeAt(p.pos)?.attrs.id)));
            const counts = new Map<number, number>();
            for (const p of mine) counts.set(p.col, (counts.get(p.col) ?? 0) + 1);
            const col = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
            positions = mine.filter((p) => p.col === col).map((p) => p.pos);
          } else if (sel) positions = sel.positions;
          else {
            const cur = currentPlacement(state);
            positions = cur ? [cur.p.pos] : [];
          }
          const claims = positions
            .map((pos) => ({ pos, p: sheet.placements.find((x) => x.pos === pos), node: state.doc.nodeAt(pos) }))
            .filter((x) => x.p && x.p.col >= 2 && x.node?.attrs.kind === 'claim' && x.node.attrs.id);
          if (!claims.length) {
            if (dispatch) toast(LINK_HINT);
            return true;
          }
          if (dispatch) tr.setMeta(flowKey, { linking: { ids: claims.map((x) => String(x.node!.attrs.id)), col: claims[0].p!.col } });
          return true;
        },
      addAnswer:
        (targetPos, at) =>
        ({ state, tr, dispatch }) => {
          const sheet = activeSheet(flowKey.getState(state));
          const target = state.doc.nodeAt(targetPos);
          const tp = sheet?.placements.find((p) => p.pos === targetPos);
          if (!sheet || !target || !tp || !target.attrs.id || tp.col >= sheet.columns.length) return false;
          if (dispatch) {
            tr.insert(at, blockNode(state, { kind: 'claim', speech: sheet.columns[tp.col], answers: target.attrs.id as string }));
            tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
          }
          return true;
        },
      cancelLinking:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(flowKey, { linking: null });
          return true;
        },
      unlinkBlock:
        (pos) =>
        ({ state, tr, dispatch }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || !node.attrs.answers) return false;
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, answers: null });
          return true;
        },
      nextCell:
        () =>
        ({ state, tr, dispatch }) => {
          const cur = currentPlacement(state);
          if (!cur || cur.p.group < 0) return false;
          const { sheet, p } = cur;
          const below = sheet.groups[p.group + 1];
          if (!dispatch) return true;
          // Last row: start a new one in this column.
          if (!below) return startRowBelow(state, tr, sheet, p);
          // The cell below already has something: go to it. Otherwise make the empty cell in that row.
          const list = below.cells.get(p.col);
          if (list?.length) {
            selectEnd(tr, list[0].pos);
            return true;
          }
          return insertCell(state, tr, sheet, { group: p.group + 1 }, p.col);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.moveColumn(1),
      'Shift-Tab': () => this.editor.commands.moveColumn(-1),
      'Mod-Enter': () => this.editor.commands.newRow(),
      'Mod-Shift-l': () => (flowKey.getState(this.editor.state)?.linking ? this.editor.commands.cancelLinking() : this.editor.commands.startLinking()),
      // Alt/Option+Enter: another line inside this same cell (like Alt+Enter in a spreadsheet).
      'Alt-Enter': () => this.editor.commands.splitBlock(),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<FlowState>({
        key: flowKey,
        state: {
          init: (_config, state) => {
            const layout = computeFlow(readBlocks(state.doc));
            const sheet = sheetAt(layout, state.selection.from) ?? layout.sheets[0];
            const heights = new Map<number, number>();
            const active = sheet ? sheetKey(sheet) : null;
            return { layout, active, pinCol: null, linking: null, picked: [], heights, geometry: geometryOf(layout, active, heights) };
          },
          apply(tr, value, _old, newState) {
            const layout = tr.docChanged ? computeFlow(readBlocks(newState.doc)) : value.layout;
            let active = value.active;
            let pinCol = value.pinCol;
            const meta = tr.getMeta(flowKey) as { active?: string; pinCol?: number | null; linking?: FlowState['linking']; heights?: ReadonlyMap<number, number>; picked?: string[] } | undefined;
            let heights = value.heights;
            if (tr.docChanged) heights = new Map([...heights].map(([pos, h]) => [tr.mapping.map(pos), h]));
            if (meta?.heights) heights = meta.heights;
            let linking = value.linking;
            if (meta && 'linking' in meta) linking = meta.linking ?? null;
            let picked = value.picked;
            if (meta?.picked) picked = meta.picked;
            if (meta && 'pinCol' in meta) pinCol = meta.pinCol ?? null;
            if (meta && meta.active !== undefined) active = meta.active;
            else if (tr.selectionSet || tr.docChanged) {
              // Follow the caret to its sheet (arrow keys, search, the doc view's outline).
              const here = sheetAt(layout, newState.selection.from);
              if (here && newState.selection.from > here.pos + 1) active = sheetKey(here);
            }
            if (!layout.sheets.some((s) => sheetKey(s) === active)) {
              active = layout.sheets[0] ? sheetKey(layout.sheets[0]) : null;
            }
            const sheetNow = layout.sheets.find((s) => sheetKey(s) === active);
            if (pinCol !== null && sheetNow && pinCol > sheetNow.columns.length) pinCol = sheetNow.columns.length;
            if (active !== value.active) {
              linking = null;
              picked = [];
            }
            return { layout, active, pinCol, linking, picked, heights, geometry: geometryOf(layout, active, heights) };
          },
        },
        // Measures every block after each change and hands the heights to the layout.
        view(editorView) {
          let raf = 0;
          const measure = () => {
            raf = 0;
            if (editorView.isDestroyed) return;
            const fs = flowKey.getState(editorView.state);
            const sheet = activeSheet(fs);
            if (!fs || !sheet) return;
            const next = new Map<number, number>();
            let changed = false;
            for (const p of sheet.placements) {
              let el: HTMLElement | null = null;
              try {
                el = editorView.nodeDOM(p.pos) as HTMLElement | null;
              } catch {
                el = null; // the view is being rebuilt; measure again next frame
              }
              if (!el || !el.getBoundingClientRect) continue;
              const h = Math.round(el.getBoundingClientRect().height * 10) / 10;
              next.set(p.pos, h);
              if (Math.abs((fs.heights.get(p.pos) ?? 0) - h) > 0.5) changed = true;
            }
            if (changed) editorView.dispatch(editorView.state.tr.setMeta(flowKey, { heights: next }).setMeta('addToHistory', false));
          };
          const schedule = () => {
            if (!raf) raf = requestAnimationFrame(measure);
          };
          const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
          ro?.observe(editorView.dom);
          void document.fonts?.ready.then(schedule);
          schedule();
          return {
            update: schedule,
            destroy() {
              if (raf) cancelAnimationFrame(raf);
              ro?.disconnect();
            },
          };
        },
        props: {
          attributes(state) {
            const sheet = activeSheet(flowKey.getState(state));
            return {
              ...(columnSelection(state) ? { 'data-colsel': 'true' } : {}),
              ...(flowKey.getState(state)?.linking ? { 'data-linking': 'true' } : {}),
              class: 'pp-flow',
              style: `--fl-cols: ${(sheet?.columns.length ?? 1) + (flowKey.getState(state)?.pinCol ? 1 : 0)}; --fl-template: ${tracksFor(state).template}; --fl-minw: ${tracksFor(state).minWidth}; height: ${Math.ceil(flowKey.getState(state)?.geometry?.total ?? 0)}px`,
              ...(sheet && sheet.placements.length && !flowKey.getState(state)?.heights.size ? { 'data-measuring': 'true' } : {}),
              'data-side': sheet?.side ?? 'gov',
            };
          },
          decorations(state) {
            const fs = flowKey.getState(state);
            if (!fs) return null;
            const sheet = activeSheet(fs);
            const decos: Decoration[] = [];
            const hide = (pos: number, size: number) => decos.push(Decoration.node(pos, pos + size, { class: 'pp-hidden' }));

            for (const b of fs.layout.preamble) hide(b.pos, b.size);
            for (const s of fs.layout.sheets) {
              const head = state.doc.nodeAt(s.pos);
              if (head) hide(s.pos, head.nodeSize);
              if (s === sheet) continue;
              for (const p of s.placements) {
                const n = state.doc.nodeAt(p.pos);
                if (n) hide(p.pos, n.nodeSize);
              }
            }
            if (!sheet) return DecorationSet.create(state.doc, decos);

            const cols = sheet.columns.length;
            const geo = fs.geometry;
            const topOf = (pos: number) => Math.round((geo?.tops.get(pos) ?? 0) * 10) / 10;
            // With the pins column open, columns after it move one to the right.
            const pinCol = fs.pinCol;
            const dc = (c: number) => (pinCol && c > pinCol ? c + 1 : c);
            const template = tracksFor(state).template;
            // Blocks are placed by the layout (model/flowLayout.ts): a column number and a top, so
            // every cell grows on its own instead of sharing a row height with its neighbours.
            for (const p of sheet.placements) {
              const n = state.doc.nodeAt(p.pos);
              if (!n) continue;
              if (p.col === 0) {
                decos.push(Decoration.node(p.pos, p.pos + n.nodeSize, { class: 'fl-section', style: `--c: 1; top: ${topOf(p.pos)}px` }));
              } else {
                const side = p.speech ? SPEECH_INFO[p.speech].side : sheet.side;
                decos.push(Decoration.node(p.pos, p.pos + n.nodeSize, { class: `fl-item fl-${side}`, style: `--c: ${dc(p.col)}; top: ${topOf(p.pos)}px` }));
              }
            }

            const sideOf = (col: number) => SPEECH_INFO[sheet.columns[col - 1]].side;
            const place = (el: HTMLElement, col: number, top?: number, height?: number) => {
              el.style.setProperty('--c', String(col));
              if (top !== undefined) el.style.top = `${top}px`;
              if (height !== undefined) el.style.height = `${height}px`;
            };

            // Alternating column shades, behind everything, the full height of the sheet.
            for (let c = 1; c <= cols; c++) {
              decos.push(
                Decoration.widget(
                  sheet.pos,
                  () => {
                    const el = document.createElement('div');
                    el.className = 'fl-band' + (c % 2 === 0 ? ' is-alt' : '');
                    el.contentEditable = 'false';
                    el.setAttribute('aria-hidden', 'true');
                    place(el, dc(c));
                    return el;
                  },
                  { side: -2, key: `band-${c}-${dc(c)}`, ignoreSelection: true },
                ),
              );
            }

            // One box per cell (a claim and the lines under it), only as tall as its own text. Empty
            // positions are see-through until hovered, and still click targets.
            const textOf = (pos: number) => state.doc.nodeAt(pos)?.textContent.trim() ?? '';
            type CellBox = { g: number; c: number; i: number; top: number; height: number; empty: boolean; blank: boolean; first: number; last: number };
            const cellBoxes: CellBox[] = [];
            const boxAt = new Map<number, CellBox>();
            for (const gm of geo?.groups ?? []) {
              const g = sheet.groups[gm.index];
              if (!g) continue;
              for (let c = 1; c <= cols; c++) {
                const boxes = gm.columns.get(c) ?? [{ top: gm.top, height: DEFAULT_METRICS.rowHeight - DEFAULT_METRICS.cellGap, empty: true, first: -1, last: -1 }];
                boxes.forEach((box, i) => {
                  const cb: CellBox = {
                    g: g.index,
                    c,
                    i,
                    top: Math.round(box.top * 10) / 10,
                    height: Math.round(box.height * 10) / 10,
                    empty: box.empty,
                    blank: !box.empty && textOf(box.first) === '' && textOf(box.last) === '',
                    first: box.first,
                    last: box.last,
                  };
                  cellBoxes.push(cb);
                  if (!cb.empty) for (const it of g.cells.get(c) ?? []) if (it.pos >= cb.first && it.pos <= cb.last) boxAt.set(it.pos, cb);
                });
              }
            }
            // The caret is in an argument or one of its answers: that argument and all its answers light up.
            const caret = state.selection.$from;
            const here = caret.depth >= 1 ? caret.before(1) : -1;
            const picked = new Set(fs.picked);
            const lit = new Set<number>();
            for (const l of sheet.links) {
              const a = boxAt.get(l.from);
              const b = boxAt.get(l.to);
              if (!a || !b) continue;
              if ((here >= a.first && here <= a.last) || (here >= b.first && here <= b.last)) {
                lit.add(a.first);
                for (const l2 of sheet.links) if (l2.from === l.from) {
                  const r = boxAt.get(l2.to);
                  if (r) lit.add(r.first);
                }
              }
            }
            for (const cb of cellBoxes) {
              const g = sheet.groups[cb.g];
              const on = !cb.empty && lit.has(cb.first);
              const pk = !cb.empty && picked.has(String(state.doc.nodeAt(cb.first)?.attrs.id));
              decos.push(
                Decoration.widget(
                  g.from,
                  () => {
                    const el = document.createElement('div');
                    el.className = `fl-cell fl-${sideOf(cb.c)}` + (cb.empty ? ' is-empty' : cb.blank ? ' is-blank' : '') + (on ? ' is-lit' : '') + (pk ? ' is-picked' : '');
                    el.contentEditable = 'false';
                    place(el, dc(cb.c), cb.top, cb.height);
                    el.dataset.col = String(cb.c);
                    el.dataset.target = 'group';
                    el.dataset.group = String(cb.g);
                    if (!cb.empty) {
                      el.dataset.first = String(cb.first);
                      el.dataset.last = String(cb.last);
                    }
                    return el;
                  },
                  { side: -1, key: `c-${cb.g}-${cb.c}-${cb.i}-${dc(cb.c)}-${cb.top}-${cb.height}-${cb.empty ? 1 : cb.blank ? 2 : 0}-${on ? 1 : 0}-${pk ? 1 : 0}-${cb.first}-${cb.last}-${sideOf(cb.c)}`, ignoreSelection: true },
                ),
              );
            }

            // "+" under the answers linked to an argument: add one more answer to it.
            const byTarget = new Map<number, number[]>();
            for (const l of sheet.links) byTarget.set(l.from, [...(byTarget.get(l.from) ?? []), l.to]);
            for (const [target, answers] of byTarget) {
              let low: CellBox | null = null;
              for (const a of answers) {
                const b = boxAt.get(a);
                if (b && (!low || b.top > low.top)) low = b;
              }
              if (!low) continue;
              const at = low.last + (state.doc.nodeAt(low.last)?.nodeSize ?? 0);
              const y = Math.round((low.top + low.height + 3) * 10) / 10;
              const col = low.c;
              decos.push(
                Decoration.widget(
                  sheet.pos,
                  () => {
                    const el = document.createElement('button');
                    el.type = 'button';
                    el.className = 'fl-add-answer';
                    el.contentEditable = 'false';
                    el.title = 'Add another answer to this argument';
                    el.setAttribute('aria-label', 'Add another answer to this argument');
                    el.textContent = '+';
                    place(el, dc(col), y);
                    el.dataset.addTarget = String(target);
                    el.dataset.addAt = String(at);
                    return el;
                  },
                  { side: -1, key: `add-${target}-${dc(col)}-${y}-${at}`, ignoreSelection: true, stopEvent: () => true },
                ),
              );
            }

            // Runs of empty rows (blank rows kept above a row, and the empty
            // rows below the content), drawn as one block of cells each.
            const emptyRows = (pos: number, top: number, count: number, target: 'blank' | 'ghost', before: number) => {
              if (count <= 0) return;
              const rounded = Math.round(top * 10) / 10;
              decos.push(
                Decoration.widget(
                  pos,
                  () => {
                    const wrap = document.createElement('div');
                    wrap.className = 'fl-rows' + (target === 'ghost' ? ' is-ghost' : '');
                    wrap.contentEditable = 'false';
                    wrap.style.top = `${rounded}px`;
                    wrap.style.gridTemplateColumns = template;
                    wrap.style.height = `${count * DEFAULT_METRICS.rowHeight}px`;
                    const frag = document.createDocumentFragment();
                    for (let i = 0; i < count; i++) {
                      for (let c = 1; c <= cols; c++) {
                        const el = document.createElement('div');
                        el.className = `fl-cell fl-${sideOf(c)} is-empty`;
                        el.style.gridColumn = String(dc(c));
                        el.style.gridRow = String(i + 1);
                        el.dataset.col = String(c);
                        el.dataset.target = target;
                        el.dataset.index = String(i);
                        el.dataset.before = String(before);
                        frag.appendChild(el);
                      }
                    }
                    wrap.appendChild(frag);
                    return wrap;
                  },
                  { side: -1, key: `r-${target}-${before}-${rounded}-${count}-${cols}-${sheet.side}-${pinCol ?? 0}-${template}`, ignoreSelection: true },
                ),
              );
            };
            for (const b of geo?.blanks ?? []) emptyRows(sheet.groups[b.before]?.from ?? sheet.end, b.top, b.count, 'blank', b.before);
            emptyRows(sheet.end, geo?.ghostTop ?? 0, sheet.ghostRows, 'ghost', -1);

            // The pins column: the app's panel, placed after the chosen column, as tall as the sheet.
            const panel = editor.extensionManager.extensions.find((x) => x.name === 'flowView')?.options.pinPanel as HTMLElement | null;
            if (pinCol && panel) {
              decos.push(
                Decoration.widget(
                  sheet.pos,
                  () => {
                    panel.contentEditable = 'false';
                    panel.className = 'fl-pins';
                    place(panel, pinCol + 1);
                    return panel;
                  },
                  { side: -1, key: `pins-${pinCol}`, ignoreSelection: true, stopEvent: () => true },
                ),
              );
            }

            // Link mode: the claims being linked, and the arguments they can be linked to.
            if (fs.linking) {
              const ids = new Set(fs.linking.ids);
              for (const p of sheet.placements) {
                const n = state.doc.nodeAt(p.pos);
                if (!n) continue;
                if (ids.has(String(n.attrs.id))) decos.push(Decoration.node(p.pos, p.pos + n.nodeSize, { class: 'fl-linking' }));
                else if (p.col === fs.linking.col - 1 && n.attrs.kind === 'claim') decos.push(Decoration.node(p.pos, p.pos + n.nodeSize, { class: 'fl-linkable' }));
              }
            }

            // Column selection: mark the lines that will be copied.
            const colSel = columnSelection(state);
            if (colSel) {
              for (const pos of colSel.positions) {
                const n = state.doc.nodeAt(pos);
                if (n) decos.push(Decoration.node(pos, pos + n.nodeSize, { class: 'fl-colsel' }));
              }
            }

            return DecorationSet.create(state.doc, decos);
          },
          // Typing while the caret sits on a hidden sheet title (an empty
          // sheet) starts the first row instead of editing the title.
          handleTextInput(view, _from, _to, text) {
            const parent = view.state.selection.$from.parent;
            if (parent.type.name !== 'block' || parent.attrs.kind !== 'position') return false;
            editor.chain().createCell({ ghost: 0 }, 1).insertContent(text).run();
            return true;
          },
          handleKeyDown(view, event) {
            const st = flowKey.getState(view.state);
            if (event.key === 'Escape' && (st?.linking || st?.picked.length)) {
              view.dispatch(view.state.tr.setMeta(flowKey, { linking: null, picked: [] }));
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            mousedown(view, event) {
              if (flowKey.getState(view.state)?.linking) {
                const item = (event.target as HTMLElement | null)?.closest?.('.fl-item');
                const pos = item ? blockPosOf(view, item) : null;
                if (pos !== null && applyLink(view, pos)) {
                  event.preventDefault();
                  return true;
                }
              }
              // Clicking into text drops a box-select.
              if (flowKey.getState(view.state)?.picked.length && (event.target as HTMLElement | null)?.closest?.('.fl-item')) {
                view.dispatch(view.state.tr.setMeta(flowKey, { picked: [] }));
              }
              return false;
            },
          },
        },
      }),
      new Plugin({
        key: new PluginKey('pp-flow-cells'),
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              const target = event.target as HTMLElement | null;
              const add = target?.closest?.('.fl-add-answer') as HTMLElement | null;
              if (add) {
                event.preventDefault();
                editor.chain().focus().addAnswer(Number(add.dataset.addTarget), Number(add.dataset.addAt)).run();
                return true;
              }
              // Anything that is not text starts a box-select if you drag, and a click if you do not.
              const empty = target?.closest?.('.fl-cell.is-empty') as HTMLElement | null;
              const background = !empty && (target === view.dom || !!target?.closest?.('.fl-band, .fl-rows, .fl-cell.is-empty'));
              if (!empty && !background) return false;
              event.preventDefault();
              view.focus();
              boxSelect(view, event as MouseEvent, () => {
                if (!empty) {
                  if (flowKey.getState(view.state)?.picked.length) view.dispatch(view.state.tr.setMeta(flowKey, { picked: [] }));
                  return;
                }
                const col = Number(empty.dataset.col);
                const cell: CellTarget =
                  empty.dataset.target === 'ghost'
                    ? { ghost: Number(empty.dataset.index) }
                    : empty.dataset.target === 'blank'
                      ? { before: Number(empty.dataset.before), index: Number(empty.dataset.index) }
                      : { group: Number(empty.dataset.group) };
                editor.chain().focus().createCell(cell, col).run();
              });
              return true;
            },
            copy(view, event) {
              return copyColumn(view, event as ClipboardEvent, false);
            },
            cut(view, event) {
              return copyColumn(view, event as ClipboardEvent, true);
            },
          },
          // Pasted lines take the column they're pasted into, as answers in this row.
          transformPasted(slice, view) {
            const cur = currentPlacement(view.state);
            if (!cur || cur.p.col === 0) return slice;
            const speech = cur.sheet.columns[cur.p.col - 1];
            const isBase = speech === baseSpeech(cur.sheet.side);
            const nodes: PMNode[] = [];
            slice.content.forEach((n) => {
              nodes.push(
                n.type.name === 'block'
                  ? n.type.create({ ...n.attrs, id: null, newRow: false, gap: 0, answers: null, side: null, speech: isBase ? null : speech, kind: n.attrs.kind === 'position' || n.attrs.kind === 'section' ? 'claim' : n.attrs.kind }, n.content, n.marks)
                  : n,
              );
            });
            return new Slice(Fragment.fromArray(nodes), slice.openStart, slice.openEnd);
          },
        },
      }),
    ];
  },
});
