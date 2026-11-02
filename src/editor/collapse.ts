import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { isHeading, levelOf } from '../model/blocks';

// Collapsing is per pane (per editor), not saved in the document, so your
// partner's view never folds because you folded yours.

export const collapseKey = new PluginKey<Set<string>>('pp-collapse');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapse: {
      toggleCollapse: (id: string) => ReturnType;
      /** Fold every heading at exactly this level (3 = claims, leaving the outline of claims). */
      collapseAll: (level: number) => ReturnType;
      expandAll: () => ReturnType;
    };
  }
}

interface HiddenInfo {
  /** Block position -> ids of the collapsed headings hiding it. */
  hidden: Map<number, string[]>;
  /** Collapsed heading id -> number of blocks it hides. */
  counts: Map<string, number>;
}

/** Work out which blocks are hidden under collapsed headings. */
export function computeHidden(doc: PMNode, collapsed: Set<string>): HiddenInfo {
  const hidden = new Map<number, string[]>();
  const counts = new Map<string, number>();
  const stack: { level: number; id: string }[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== 'block') return;
    const level = levelOf(node.attrs.kind);
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length) {
      hidden.set(pos, stack.map((s) => s.id));
      for (const s of stack) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    }
    const id = node.attrs.id as string | null;
    if (id && isHeading(node.attrs.kind) && collapsed.has(id)) stack.push({ level, id });
  });
  return { hidden, counts };
}

function headingIds(doc: PMNode, level: number): string[] {
  const ids: string[] = [];
  doc.forEach((node) => {
    const id = node.attrs.id as string | null;
    if (node.type.name === 'block' && id && isHeading(node.attrs.kind) && levelOf(node.attrs.kind) === level) ids.push(id);
  });
  return ids;
}

function findBlock(doc: PMNode, id: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null;
  doc.forEach((node, pos) => {
    if (!found && node.attrs.id === id) found = { node, pos };
  });
  return found;
}

type Meta = { toggle: string } | { set: Set<string> };

export const Collapse = Extension.create({
  name: 'collapse',

  addCommands() {
    return {
      toggleCollapse:
        (id) =>
        ({ state, tr, dispatch }) => {
          const block = findBlock(state.doc, id);
          if (!block) return false;
          if (dispatch) {
            // Park the caret on the heading so it doesn't sit inside hidden text.
            tr.setSelection(TextSelection.create(tr.doc, block.pos + 1 + block.node.content.size));
            tr.setMeta(collapseKey, { toggle: id } satisfies Meta);
          }
          return true;
        },
      collapseAll:
        (level) =>
        ({ state, tr, dispatch }) => {
          if (dispatch) {
            const ids = new Set(headingIds(state.doc, level));
            // Move the caret to the first block (never hidden) so it doesn't reopen a fold.
            tr.setSelection(TextSelection.create(tr.doc, 1));
            tr.setMeta(collapseKey, { set: ids } satisfies Meta);
          }
          return true;
        },
      expandAll:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(collapseKey, { set: new Set() } satisfies Meta);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<Set<string>>({
        key: collapseKey,
        state: {
          init: () => new Set(),
          apply(tr, value, _old, newState) {
            let next = value;
            const meta = tr.getMeta(collapseKey) as Meta | undefined;
            if (meta && 'toggle' in meta) {
              next = new Set(value);
              if (next.has(meta.toggle)) next.delete(meta.toggle);
              else next.add(meta.toggle);
            } else if (meta && 'set' in meta) {
              next = meta.set;
            }
            // If the caret lands inside a folded section (arrow keys, search,
            // outline click), open the folds above it.
            if (next.size && (tr.selectionSet || tr.docChanged)) {
              const $from = newState.selection.$from;
              if ($from.depth >= 1) {
                const pos = $from.before(1);
                const owners = computeHidden(newState.doc, next).hidden.get(pos);
                if (owners?.length) {
                  next = new Set(next);
                  for (const o of owners) next.delete(o);
                }
              }
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            const collapsed = collapseKey.getState(state) ?? new Set<string>();
            const { hidden, counts } = computeHidden(state.doc, collapsed);
            const decos: Decoration[] = [];
            state.doc.forEach((node, pos) => {
              if (node.type.name !== 'block') return;
              if (hidden.has(pos)) {
                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'pp-hidden' }));
                return;
              }
              const id = node.attrs.id as string | null;
              if (!id || !isHeading(node.attrs.kind)) return;
              const isCollapsed = collapsed.has(id);
              const count = counts.get(id) ?? 0;
              if (isCollapsed) {
                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'pp-collapsed', 'data-hidden-count': String(count) }));
              }
              decos.push(
                Decoration.widget(
                  pos + 1,
                  () => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'pp-toggle' + (isCollapsed ? ' is-collapsed' : '');
                    btn.contentEditable = 'false';
                    btn.dataset.toggleId = id;
                    btn.setAttribute('aria-label', isCollapsed ? 'Expand' : 'Collapse');
                    btn.tabIndex = -1;
                    return btn;
                  },
                  { side: -1, key: `t-${id}-${isCollapsed ? 1 : 0}`, ignoreSelection: true },
                ),
              );
            });
            return DecorationSet.create(state.doc, decos);
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const target = (event.target as HTMLElement | null)?.closest?.('.pp-toggle') as HTMLElement | null;
              const id = target?.dataset.toggleId;
              if (!id) return false;
              event.preventDefault();
              const block = findBlock(view.state.doc, id);
              if (!block) return true;
              const tr = view.state.tr
                .setSelection(TextSelection.create(view.state.doc, block.pos + 1 + block.node.content.size))
                .setMeta(collapseKey, { toggle: id } satisfies Meta);
              view.dispatch(tr);
              return true;
            },
          },
        },
      }),
    ];
  },
});
