import type { JSONContent } from '@tiptap/core';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { BODY_FIELD, schema } from '../editor/extensions';
import { newBlockId, type BlockKind } from '../model/blocks';

export type Line = [BlockKind, string, Record<string, unknown>?];

export function linesToJSON(lines: Line[]): JSONContent {
  return {
    type: 'doc',
    content: lines.map(([kind, text, attrs]) => ({
      type: 'block',
      attrs: { kind, id: newBlockId(), ...(attrs ?? {}) },
      ...(text ? { content: [{ type: 'text', text }] } : {}),
    })),
  };
}

/** Write starting content into an empty document. */
export function writeLines(doc: Y.Doc, lines: Line[]) {
  prosemirrorJSONToYXmlFragment(schema, linesToJSON(lines), doc.getXmlFragment(BODY_FIELD));
}

export const STARTER_LINES: Line[] = [['position', '']];

/** A new flow starts with a Gov sheet and its first row; "+ Opp" adds the other side. */
export const STARTER_FLOW_LINES: Line[] = [['position', 'Gov', { side: 'gov' }], ['claim', '']];

/** Write ProseMirror JSON (e.g. an imported file) into an empty document. */
export function writeJSON(doc: Y.Doc, json: JSONContent) {
  prosemirrorJSONToYXmlFragment(schema, json, doc.getXmlFragment(BODY_FIELD));
}
