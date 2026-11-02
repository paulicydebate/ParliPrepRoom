import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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
      /** Start typing in an empty cell (group index, or null for a new row at the bottom). */
      createCell: (group: number | null, col: number) => ReturnType;
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

function insertCell(state: EditorState, tr: Transaction, sheet: FlowSheet, group: number | null, col: number) {
  const speech = sheet.columns[col - 1];
  const base = baseSpeech(sheet.side);
  const isBase = speech === base;
  let pos: number;
  let attrs: Record<string, unknown>;
  if (group === null) {
    pos = sheet.end;
    attrs = { kind: 'claim', speech: isBase ? null : speech, newRow: !isBase };
  } else {
    const g = sheet.groups[group];
    if (!g) return false;
    if (col === 1 && !g.cells.has(1)) {
      // The row was started in a later speech; put the sheet's own claim first.
      const first = tr.doc.nodeAt(g.from);
      if (first?.attrs.newRow) tr.setNodeMarkup(g.from, undefined, { ...first.attrs, newRow: false });
      pos = g.from;
      attrs = { kind: 'claim', speech: null };
    } else {
      pos = insertPosFor(g, col);
      attrs = { kind: 'claim', speech: isBase ? null : speech };
    }
  }
  tr.insert(pos, blockNode(state, attrs));
  tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
  return true;
}

export const FlowView = Extension.create({
  name: 'flowView',
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
      createCell:
        (group, col) =>
        ({ state, tr, dispatch }) => {
          const sheet = activeSheet(flowKey.getState(state));
          if (!sheet || col < 1 || col > sheet.columns.length) return false;
          if (!dispatch) return true;
          return insertCell(state, tr, sheet, group, col);
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
          return insertCell(state, tr, cur.sheet, cur.p.group, target);
        },
      newRow:
        () =>
        ({ state, tr, dispatch }) => {
          const cur = currentPlacement(state);
          const sheet = cur?.sheet ?? activeSheet(flowKey.getState(state));
          if (!sheet) return false;
          if (!dispatch) return true;
          if (!cur || cur.p.group < 0) return insertCell(state, tr, sheet, null, 1);
          const g = sheet.groups[cur.p.group];
          const speech = sheet.columns[cur.p.col - 1];
          const isBase = speech === baseSpeech(sheet.side);
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
            return { layout, active: sheet ? sheetKey(sheet) : null };
          },
          apply(tr, value, _old, newState) {
            const layout = tr.docChanged ? computeFlow(readBlocks(newState.doc)) : value.layout;
            let active = value.active;
            const meta = tr.getMeta(flowKey) as { active: string } | undefined;
            if (meta) active = meta.active;
            else if (tr.selectionSet || tr.docChanged) {
              // Follow the caret to its sheet (arrow keys, search, the doc view's outline).
              const here = sheetAt(layout, newState.selection.from);
              if (here && newState.selection.from > here.pos + 1) active = sheetKey(here);
            }
            if (!layout.sheets.some((s) => sheetKey(s) === active)) {
              active = layout.sheets[0] ? sheetKey(layout.sheets[0]) : null;
            }
            return { layout, active };
          },
        },
        props: {
          attributes(state) {
            const sheet = activeSheet(flowKey.getState(state));
            return {
              class: 'pp-flow',
              style: `--fl-cols: ${sheet?.columns.length ?? 1}`,
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
            for (const p of sheet.placements) {
              const n = state.doc.nodeAt(p.pos);
              if (!n) continue;
              if (p.col === 0) {
                decos.push(Decoration.node(p.pos, p.pos + n.nodeSize, { class: 'fl-section', style: `grid-column: 1 / -1; grid-row: ${p.row}` }));
              } else {
                const side = p.speech ? SPEECH_INFO[p.speech].side : sheet.side;
                decos.push(
                  Decoration.node(p.pos, p.pos + n.nodeSize, {
                    class: `fl-item fl-${side}`,
                    style: `grid-column: ${p.col}; grid-row: ${p.row} / span ${p.rowSpan}`,
                  }),
                );
              }
            }

            const cell = (pos: number, group: number | null, col: number, row: number, span: number, filled: boolean, last: boolean) => {
              const speech = sheet.columns[col - 1];
              const side = SPEECH_INFO[speech].side;
              decos.push(
                Decoration.widget(
                  pos,
                  () => {
                    const el = document.createElement('div');
                    el.className = `fl-cell fl-${side}` + (filled ? '' : ' is-empty') + (group === null ? ' is-ghost' : '') + (last ? ' is-last' : '');
                    el.contentEditable = 'false';
                    el.style.gridColumn = String(col);
                    el.style.gridRow = `${row} / span ${span}`;
                    el.dataset.col = String(col);
                    el.dataset.group = group === null ? 'new' : String(group);
                    if (!filled) el.setAttribute('aria-label', `Add to ${speech}`);
                    return el;
                  },
                  { side: -1, key: `c-${group ?? 'new'}-${col}-${row}-${span}-${filled ? 1 : 0}`, ignoreSelection: true },
                ),
              );
            };

            for (const g of sheet.groups) {
              for (let c = 1; c <= cols; c++) cell(g.from, g.index, c, g.row, g.span, g.cells.has(c), false);
            }
            // A ghost row at the bottom: click any cell to start a new row.
            for (let c = 1; c <= cols; c++) cell(sheet.end, null, c, sheet.nextRow, 1, false, true);

            return DecorationSet.create(state.doc, decos);
          },
          // Typing while the caret sits on a hidden sheet title (an empty
          // sheet) starts the first row instead of editing the title.
          handleTextInput(view, _from, _to, text) {
            const parent = view.state.selection.$from.parent;
            if (parent.type.name !== 'block' || parent.attrs.kind !== 'position') return false;
            editor.chain().createCell(null, 1).insertContent(text).run();
            return true;
          },
          handleDOMEvents: {
            mousedown(_view, event) {
              const el = (event.target as HTMLElement | null)?.closest?.('.fl-cell.is-empty') as HTMLElement | null;
              if (!el) return false;
              event.preventDefault();
              const col = Number(el.dataset.col);
              const group = el.dataset.group === 'new' ? null : Number(el.dataset.group);
              editor.chain().focus().createCell(group, col).run();
              return true;
            },
          },
        },
      }),
    ];
  },
});
