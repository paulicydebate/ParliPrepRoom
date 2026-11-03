import { Extension } from '@tiptap/core';
import { DOMSerializer, Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { newBlockId } from '../model/blocks';
import { computeFlow, insertPosFor, readBlocks, sheetAt, type FlowLayout, type FlowSheet } from '../model/flow';
import { baseSpeech, SPEECH_INFO, type Side } from '../model/speeches';

// Flow view: the same document as the doc view, laid out as a grid. The
// editor root becomes a CSS grid and each block is placed in its speech
// column, so typing in a cell edits the shared document directly.

export interface FlowState {
  layout: FlowLayout;
  /** Key of the sheet shown (see sheetKey). */
  active: string | null;
  /** Pins column: shown just after this (1-based) speech column, pushing later columns right. */
  pinCol: number | null;
}

export const flowKey = new PluginKey<FlowState>('pp-flow');

export const sheetKey = (s: FlowSheet) => s.id ?? `pos:${s.pos}`;

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
          const g = sheet.groups[cur.p.group];
          const speech = sheet.columns[cur.p.col - 1];
          const isBase = speech === baseSpeech(sheet.side);
          // Fill a blank row below instead of pushing everything down.
          const next = tr.doc.nodeAt(g.to);
          const nextGap = Number(next?.attrs.gap) || 0;
          if (next && nextGap > 0) tr.setNodeMarkup(g.to, undefined, { ...next.attrs, gap: nextGap - 1 });
          tr.insert(g.to, blockNode(state, { kind: 'claim', speech: isBase ? null : speech, newRow: !isBase }));
          tr.setSelection(TextSelection.create(tr.doc, g.to + 1)).scrollIntoView();
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.moveColumn(1),
      'Shift-Tab': () => this.editor.commands.moveColumn(-1),
      'Mod-Enter': () => this.editor.commands.newRow(),
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
            return { layout, active: sheet ? sheetKey(sheet) : null, pinCol: null };
          },
          apply(tr, value, _old, newState) {
            const layout = tr.docChanged ? computeFlow(readBlocks(newState.doc)) : value.layout;
            let active = value.active;
            let pinCol = value.pinCol;
            const meta = tr.getMeta(flowKey) as { active?: string; pinCol?: number | null } | undefined;
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
            return { layout, active, pinCol };
          },
        },
        props: {
          attributes(state) {
            const sheet = activeSheet(flowKey.getState(state));
            return {
              ...(columnSelection(state) ? { 'data-colsel': 'true' } : {}),
              class: 'pp-flow',
              style: `--fl-cols: ${(sheet?.columns.length ?? 1) + (flowKey.getState(state)?.pinCol ? 1 : 0)}`,
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
            // With the pins column open, columns after it move one to the right.
            const pinCol = fs.pinCol;
            const dc = (c: number) => (pinCol && c > pinCol ? c + 1 : c);
            for (const p of sheet.placements) {
              const n = state.doc.nodeAt(p.pos);
              if (!n) continue;
              if (p.col === 0) {
                decos.push(Decoration.node(p.pos, p.pos + n.nodeSize, { class: 'fl-section', style: `grid-column: 1; grid-row: ${p.row}` }));
              } else {
                const side = p.speech ? SPEECH_INFO[p.speech].side : sheet.side;
                decos.push(
                  Decoration.node(p.pos, p.pos + n.nodeSize, {
                    class: `fl-item fl-${side}`,
                    style: `grid-column: ${dc(p.col)}; grid-row: ${p.row} / span ${p.rowSpan}`,
                  }),
                );
              }
            }

            const sideOf = (col: number) => SPEECH_INFO[sheet.columns[col - 1]].side;

            // Alternating column shades, behind everything, the full height of the sheet.
            const bandRows = sheet.nextRow + sheet.ghostRows;
            for (let c = 1; c <= cols; c++) {
              decos.push(
                Decoration.widget(
                  sheet.pos,
                  () => {
                    const el = document.createElement('div');
                    el.className = 'fl-band' + (c % 2 === 0 ? ' is-alt' : '');
                    el.contentEditable = 'false';
                    el.setAttribute('aria-hidden', 'true');
                    el.style.gridColumn = String(dc(c));
                    el.style.gridRow = `1 / span ${bandRows}`;
                    return el;
                  },
                  { side: -2, key: `band-${c}-${dc(c)}-${bandRows}`, ignoreSelection: true },
                ),
              );
            }

            // Background for each cell of a row (and a click target if empty).
            for (const g of sheet.groups) {
              for (let c = 1; c <= cols; c++) {
                const filled = g.cells.has(c);
                decos.push(
                  Decoration.widget(
                    g.from,
                    () => {
                      const el = document.createElement('div');
                      el.className = `fl-cell fl-${sideOf(c)}` + (filled ? '' : ' is-empty');
                      el.contentEditable = 'false';
                      el.style.gridColumn = String(dc(c));
                      el.style.gridRow = `${g.row} / span ${g.span}`;
                      el.dataset.col = String(c);
                      el.dataset.target = 'group';
                      el.dataset.group = String(g.index);
                      return el;
                    },
                    { side: -1, key: `c-${g.index}-${c}-${dc(c)}-${g.row}-${g.span}-${filled ? 1 : 0}-${sideOf(c)}`, ignoreSelection: true },
                  ),
                );
              }
            }

            // Runs of empty rows (blank rows kept above a row, and the empty
            // rows below the content), drawn as one block of cells each.
            const emptyRows = (pos: number, row: number, count: number, target: 'blank' | 'ghost', before: number) => {
              if (count <= 0) return;
              decos.push(
                Decoration.widget(
                  pos,
                  () => {
                    const wrap = document.createElement('div');
                    wrap.className = 'fl-rows' + (target === 'ghost' ? ' is-ghost' : '');
                    wrap.contentEditable = 'false';
                    wrap.style.gridColumn = '1 / -1';
                    wrap.style.gridRow = `${row} / span ${count}`;
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
                  { side: -1, key: `r-${target}-${before}-${row}-${count}-${cols}-${sheet.side}-${pinCol ?? 0}`, ignoreSelection: true },
                ),
              );
            };
            for (const b of sheet.blanks) emptyRows(sheet.groups[b.before]?.from ?? sheet.end, b.row, b.count, 'blank', b.before);
            emptyRows(sheet.end, sheet.nextRow, sheet.ghostRows, 'ghost', -1);

            // The pins column: the app's panel, placed after the chosen column, as tall as the sheet.
            const panel = editor.extensionManager.extensions.find((x) => x.name === 'flowView')?.options.pinPanel as HTMLElement | null;
            if (pinCol && panel) {
              const rows = sheet.nextRow + sheet.ghostRows;
              decos.push(
                Decoration.widget(
                  sheet.pos,
                  () => {
                    panel.contentEditable = 'false';
                    panel.className = 'fl-pins';
                    panel.style.gridColumn = String(pinCol + 1);
                    panel.style.gridRow = `1 / span ${rows}`;
                    return panel;
                  },
                  { side: -1, key: `pins-${pinCol}-${rows}`, ignoreSelection: true, stopEvent: () => true },
                ),
              );
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
          handleDOMEvents: {
            mousedown(_view, event) {
              const el = (event.target as HTMLElement | null)?.closest?.('.fl-cell.is-empty') as HTMLElement | null;
              if (!el) return false;
              event.preventDefault();
              const col = Number(el.dataset.col);
              const target: CellTarget =
                el.dataset.target === 'ghost'
                  ? { ghost: Number(el.dataset.index) }
                  : el.dataset.target === 'blank'
                    ? { before: Number(el.dataset.before), index: Number(el.dataset.index) }
                    : { group: Number(el.dataset.group) };
              editor.chain().focus().createCell(target, col).run();
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
                  ? n.type.create({ ...n.attrs, id: null, newRow: false, gap: 0, side: null, speech: isBase ? null : speech, kind: n.attrs.kind === 'position' || n.attrs.kind === 'section' ? 'claim' : n.attrs.kind }, n.content, n.marks)
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
