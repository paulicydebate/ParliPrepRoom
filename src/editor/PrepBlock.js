import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { isSpeech } from '../model/speeches';
import { isFlowMark } from '../model/marks';
import { styleForKey } from './shortcuts';
import { KIND_INFO, asKind, demote, newBlockId, promote } from '../model/blocks';
const idKey = new PluginKey('pp-block-ids');
/** Selected block positions, deduplicated. */
function selectedBlocks(state) {
    const out = [];
    const { from, to } = state.selection;
    state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'block')
            out.push({ pos, kind: asKind(node.attrs.kind) });
        return node.type.name !== 'block';
    });
    return out;
}
/** Give every block a unique id. Returns null when nothing needed fixing. */
export function fixBlockIds(state) {
    const seen = new Set();
    let tr = null;
    state.doc.forEach((node, pos) => {
        if (node.type.name !== 'block')
            return;
        const id = node.attrs.id;
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
            setBlockKind: (kind) => ({ state, tr, dispatch }) => {
                const blocks = selectedBlocks(state);
                if (!blocks.length)
                    return false;
                if (dispatch) {
                    for (const b of blocks) {
                        const node = tr.doc.nodeAt(b.pos);
                        if (node)
                            tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, kind });
                    }
                }
                return true;
            },
            toggleFlowMark: (mark) => ({ state, tr, dispatch }) => {
                const blocks = selectedBlocks(state);
                if (!blocks.length)
                    return false;
                if (dispatch) {
                    const allHave = blocks.every((b) => tr.doc.nodeAt(b.pos)?.attrs.mark === mark);
                    for (const b of blocks) {
                        const node = tr.doc.nodeAt(b.pos);
                        if (node)
                            tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, mark: allHave ? null : mark });
                    }
                }
                return true;
            },
            setBlockSpeech: (speech) => ({ state, tr, dispatch }) => {
                const blocks = selectedBlocks(state);
                if (!blocks.length)
                    return false;
                if (dispatch) {
                    for (const b of blocks) {
                        const node = tr.doc.nodeAt(b.pos);
                        if (node)
                            tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, speech });
                    }
                }
                return true;
            },
            shiftBlockLevel: (direction) => ({ state, tr, dispatch }) => {
                const blocks = selectedBlocks(state);
                if (!blocks.length)
                    return false;
                if (dispatch) {
                    for (const b of blocks) {
                        const node = tr.doc.nodeAt(b.pos);
                        const kind = direction === 'in' ? demote(b.kind) : promote(b.kind);
                        if (node)
                            tr.setNodeMarkup(b.pos, undefined, { ...node.attrs, kind });
                    }
                }
                return true;
            },
        };
    },
    addKeyboardShortcuts() {
        const shortcuts = {
            Enter: () => {
                const { state } = this.editor;
                const { $from, empty } = state.selection;
                const node = $from.parent;
                if (node.type.name !== 'block' || !empty)
                    return false;
                const kind = asKind(node.attrs.kind);
                // Enter on an empty block moves it up a level, like outlines and lists.
                if (node.content.size === 0 && kind !== 'position') {
                    return this.editor.commands.setBlockKind(promote(kind));
                }
                const atEnd = $from.parentOffset === node.content.size;
                return this.editor
                    .chain()
                    .splitBlock()
                    .command(({ tr }) => {
                    if (atEnd) {
                        const pos = tr.selection.$from.before();
                        const created = tr.doc.nodeAt(pos);
                        if (created)
                            tr.setNodeMarkup(pos, undefined, { ...created.attrs, kind: KIND_INFO[kind].next });
                    }
                    return true;
                })
                    .run();
            },
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
                        if (!kind)
                            return false;
                        event.preventDefault();
                        editor.commands.setBlockKind(kind);
                        return true;
                    },
                },
            }),
            new Plugin({
                key: idKey,
                appendTransaction(transactions, _old, state) {
                    if (!transactions.some((t) => t.docChanged))
                        return null;
                    // Edits from another pane or partner already carry their ids.
                    if (transactions.every((t) => t.getMeta(ySyncPluginKey)?.isChangeOrigin))
                        return null;
                    return fixBlockIds(state);
                },
            }),
        ];
    },
});
