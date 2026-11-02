import type { JSONContent } from '@tiptap/core';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { BODY_FIELD, schema } from '../editor/extensions';
import { newBlockId, type BlockKind } from '../model/blocks';

export type Line = [BlockKind, string];

export function linesToJSON(lines: Line[]): JSONContent {
  return {
    type: 'doc',
    content: lines.map(([kind, text]) => ({
      type: 'block',
      attrs: { kind, id: newBlockId() },
      ...(text ? { content: [{ type: 'text', text }] } : {}),
    })),
  };
}

/** Write starting content into an empty document. */
export function writeLines(doc: Y.Doc, lines: Line[]) {
  prosemirrorJSONToYXmlFragment(schema, linesToJSON(lines), doc.getXmlFragment(BODY_FIELD));
}

export const STARTER_LINES: Line[] = [['position', '']];

export const SAMPLE_REFERENCE: Line[] = [
  ['note', 'Sample reference doc. Coaches write briefs like this before tournaments; during prep it sits beside your prep for you to read and retype from.'],
  ['position', 'Brief: Police facial recognition'],
  ['section', 'Gov — Advantage: wrongful arrests'],
  ['claim', 'Facial recognition misidentifies some groups far more often than others'],
  ['warrant', 'NIST’s 2019 test of 189 algorithms found false-positive rates 10 to 100 times higher for some demographic groups, depending on the algorithm.'],
  ['warrant', 'A false match in a police database turns into a stop, an interrogation or an arrest of someone who did nothing.'],
  ['analytic', 'Impact framing: the harm falls on people who already face the most police contact, so error rates compound existing bias.'],
  ['section', 'Opp — Answers'],
  ['claim', 'Accuracy is improving fast'],
  ['warrant', 'Top algorithms now show much smaller demographic gaps; the problem is weak vendors, which regulation fixes better than a ban.'],
  ['claim', 'A match is a lead, not an arrest'],
  ['warrant', 'Policies already require human review and independent evidence before acting on a match.'],
];

export const SAMPLE_PREP: Line[] = [
  ['note', 'Sample prep doc. Try: Enter for the next style, Tab / Shift+Tab to move a level. The style menu in the toolbar shows the key for each style.'],
  ['position', 'Gov: Ban police facial recognition'],
  ['section', 'Advantage 1 — Wrongful arrests'],
  ['claim', 'The tech misidentifies people at very different rates'],
  ['warrant', ''],
];
