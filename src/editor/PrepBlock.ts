import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { isSpeech, type Speech } from '../model/speeches';
import { isFlowMark, type FlowMark } from '../model/marks';
import { styleForKey } from './shortcuts';
import { asKind, cycleKind, demote, newBlockId, promote, type BlockKind } from '../model/blocks';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    prepBlock: {
      /** Apply a named style to every block in the selection. */
      setBlockKind: (kind: BlockKind) => ReturnType;
      /** Mark every selected block (same mark again clears it). */
      toggleFlowMark: (mark: FlowMark) => ReturnType;
      /** Tag every selected block with a speech (null = automatic). */
      setBlockSpeech: (speech: Speech | null) => ReturnType;
      /** Tab / Shift-Tab: move every selected block one level down or up. */
      shiftBlockLevel: (direction: 'in' | 'out') => ReturnType;
      /** Shift+Enter: give every selected block the style after (or before) the first one's in the style list. */
      cycleBlockKind: (direction: 1 | -1) => ReturnType;
    };
  }
}

const idKey = new PluginKey('pp-block-ids');

/** Selected block positions, deduplicated. */
function selectedBlocks(state: EditorState): { pos: number; kind: BlockKind }[] {
  const out: { pos: number; kind: BlockKind }[] = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'block') out.push({ pos, kind: asKind(node.attrs.kind) });
    return node.type.name !== 'block';
  });
  return out;
}

/** Give every block a unique id. Returns null when nothing needed fixing. */
export function fixBlockIds(state: EditorState): Transaction | null {
  const seen = new Set<string>();
  let tr: Transaction | null = null;
  state.doc.forEach((node, pos) => {
    if (node.type.name !== 'block') return;
    const id = node.attrs.id as string | null;
    if (id && !seen.has(id)) {
      seen.add(id);
      return;
    }
    const fresh = newBlockId();
    seen.add(fresh);
    tr = (tr ?? state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, id: fresh });
  });
  return tr;
}

/**
 * One styled paragraph of prep: a position title, section title, claim,
 * warrant, analytic or note. Every block has a stable id so later phases can
 * link answers to arguments and place blocks on the flow.
 */
export const PrepBlock = Node.create({
  name: 'block',
  // Run our Enter/Tab before Tiptap's built-in keymap.
  priority: 1000,
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'warrant',
        parseHTML: (el) => asKind(el.getAttribute('data-kind')),
        renderHTML: (attrs) => ({ 'data-kind': asKind(attrs.kind) }),
      },
      id: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-id': attrs.id } : {}),
      },
      // Speech this line belongs to on the flow (PMC, LOC, ...). null = follow
      // the line above / the sheet's own speech.
      speech: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-speech');
          return isSpeech(v) ? v : null;
        },
        renderHTML: (attrs) => (isSpeech(attrs.speech) ? { 'data-speech': attrs.speech } : {}),
      },
      // Position titles only: whose sheet this is.
      side: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-side'),
        renderHTML: (attrs) => (attrs.side ? { 'data-side': attrs.side } : {}),
      },
      // Flow mark: how an argument stands in the round (extended, dropped, answered, key).
      mark: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => (isFlowMark(el.getAttribute('data-mark')) ? el.getAttribute('data-mark') : null),
        renderHTML: (attrs) => (isFlowMark(attrs.mark) ? { 'data-mark': attrs.mark } : {}),
      },
      // Blank flow rows kept above this row (clicking a row further down the flow).
      gap: {
        default: 0,
        keepOnSplit: false,
        parseHTML: (el) => Number(el.getAttribute('data-gap')) || 0,
        renderHTML: (attrs) => (Number(attrs.gap) > 0 ? { 'data-gap': String(attrs.gap) } : {}),
      },
      // Claims only: always start a new flow row.
      newRow: {
        default: false,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-new-row') === 'true',
        renderHTML: (attrs) => (attrs.newRow ? { 'data-new-row': 'true' } : {}),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-kind]' },
      { tag: 'h1', attrs: { kind: 'position' } },
      { tag: 'h2', attrs: { kind: 'section' } },
      { tag: 'h3', attrs: { kind: 'claim' } },
      { tag: 'h4', attrs: { kind: 'claim' } },
      { tag: 'p', attrs: { kind: 'warrant' } },
      { tag: 'li', attrs: { kind: 'warrant' } },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'pp-block' }), 0];
  },

  addCommands() {
    return {
      setBlockKind:
        (kind) =>
        ({ state, tr, dispatch }) => {
          const blocks = selectedBlocks(state);
          if (!blocks.length) return false;
          if (dispatch) {
            for (const b of blocks) {
              const node = tr.doc.nodeAt(b.pos);
              if (node) tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, kind });
            }
          }
          return true;
        },
      toggleFlowMark:
        (mark) =>
        ({ state, tr, dispatch }) => {
          const blocks = selectedBlocks(state);
          if (!blocks.length) return false;
          if (dispatch) {
            const allHave = blocks.every((b) => tr.doc.nodeAt(b.pos)?.attrs.mark === mark);
            for (const b of blocks) {
              const node = tr.doc.nodeAt(b.pos);
              if (node) tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, mark: allHave ? null : mark });
            }
          }
          return true;
        },
      setBlockSpeech:
        (speech) =>
        ({ state, tr, dispatch }) => {
          const blocks = selectedBlocks(state);
          if (!blocks.length) return false;
          if (dispatch) {
            for (const b of blocks) {
              const node = tr.doc.nodeAt(b.pos);
              if (node) tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, speech });
            }
          }
          return true;
        },
      cycleBlockKind:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const blocks = selectedBlocks(state);
          if (!blocks.length) return false;
          // One target for the whole selection (based on the first line), so they stay uniform.
          const kind = cycleKind(blocks[0].kind, direction);
          if (dispatch) {
            for (const b of blocks) {
              const node = tr.doc.nodeAt(b.pos);
              if (node) tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, kind });
            }
          }
          return true;
        },
      shiftBlockLevel:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const blocks = selectedBlocks(state);
          if (!blocks.length) return false;
          if (dispatch) {
            for (const b of blocks) {
              const node = tr.doc.nodeAt(b.pos);
              const kind = direction === 'in' ? demote(b.kind) : promote(b.kind);
              if (node) tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, kind });
            }
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    const shortcuts: Record<string, () => boolean> = {
      // Enter just starts a new line, with no automatic formatting: the same style as this
      // line, except that after a position or section title (you rarely stack titles) the new
      // line is a claim, the usual starting point. Shift+Enter (next style) and
      // Ctrl/Cmd+Shift+Enter (previous style) change the style.
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        const node = $from.parent;
        if (node.type.name !== 'block' || !empty) return false;
        const afterTitle = $from.parentOffset === node.content.size && (node.attrs.kind === 'position' || node.attrs.kind === 'section');
        return this.editor
          .chain()
          .splitBlock()
          .command(({ tr }) => {
            if (afterTitle) {
              const pos = tr.selection.$from.before();
              const created = tr.doc.nodeAt(pos);
              if (created) tr.setNodeMarkup(pos, undefined, { ...created.attrs, kind: 'claim' });
            }
            return true;
          })
          .run();
      },
      'Shift-Enter': () => this.editor.commands.cycleBlockKind(1),
      'Mod-Shift-Enter': () => this.editor.commands.cycleBlockKind(-1),
      Tab: () => {
        this.editor.commands.shiftBlockLevel('in');
        return true;
      },
      'Shift-Tab': () => {
        this.editor.commands.shiftBlockLevel('out');
        return true;
      },
      'Mod-Shift-e': () => this.editor.commands.toggleFlowMark('extend'),
      'Mod-Shift-d': () => this.editor.commands.toggleFlowMark('dropped'),
      'Mod-Shift-a': () => this.editor.commands.toggleFlowMark('answered'),
      'Mod-Shift-k': () => this.editor.commands.toggleFlowMark('key'),
      'Mod-]': () => this.editor.commands.shiftBlockLevel('in'),
      'Mod-[': () => this.editor.commands.shiftBlockLevel('out'),
    };
    return shortcuts;
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('pp-style-keys'),
        props: {
          handleKeyDown(_view, event) {
            const kind = styleForKey(event);
            if (!kind) return false;
            event.preventDefault();
            editor.commands.setBlockKind(kind);
            return true;
          },
        },
      }),
      new Plugin({
        key: idKey,
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((t) => t.docChanged)) return null;
          // Edits from another pane or partner already carry their ids.
          if (transactions.every((t) => t.getMeta(ySyncPluginKey)?.isChangeOrigin)) return null;
          return fixBlockIds(state);
        },
      }),
    ];
  },
});
