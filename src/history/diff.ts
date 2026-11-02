import { diffArrays, diffWords } from 'diff';
import type { JSONContent } from '@tiptap/core';
import { asKind, type BlockKind } from '../model/blocks';

export interface FlatBlock {
  kind: BlockKind;
  text: string;
}

export interface TextPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export type DiffRow =
  | { type: 'same' | 'added' | 'removed'; block: FlatBlock }
  | { type: 'changed'; from: FlatBlock; to: FlatBlock; parts: TextPart[] };

function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(textOf).join('');
}

/** A document as a flat list of styled lines. */
export function flattenDoc(json: JSONContent | null | undefined): FlatBlock[] {
  return (json?.content ?? [])
    .filter((n) => n.type === 'block')
    .map((n) => ({ kind: asKind(n.attrs?.kind), text: textOf(n) }));
}

const key = (b: FlatBlock) => `${b.kind}\u0000${b.text}`;

/** Block-by-block comparison of two versions, with word-level detail for edited blocks. */
export function diffBlocks(before: FlatBlock[], after: FlatBlock[]): DiffRow[] {
  const changes = diffArrays(before, after, { comparator: (a, b) => key(a) === key(b) });
  const rows: DiffRow[] = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (!c.added && !c.removed) {
      for (const b of c.value) rows.push({ type: 'same', block: b });
      continue;
    }
    // A removal followed by an addition is usually an edit: pair them up.
    if (c.removed && changes[i + 1]?.added) {
      const removed = c.value;
      const added = changes[i + 1].value;
      const pairs = Math.min(removed.length, added.length);
      for (let j = 0; j < pairs; j++) {
        rows.push({ type: 'changed', from: removed[j], to: added[j], parts: diffWords(removed[j].text, added[j].text) });
      }
      for (const b of removed.slice(pairs)) rows.push({ type: 'removed', block: b });
      for (const b of added.slice(pairs)) rows.push({ type: 'added', block: b });
      i++;
      continue;
    }
    for (const b of c.value) rows.push({ type: c.added ? 'added' : 'removed', block: b });
  }
  return rows;
}

export function summarize(rows: DiffRow[]) {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const r of rows) {
    if (r.type === 'added') added++;
    else if (r.type === 'removed') removed++;
    else if (r.type === 'changed') changed++;
  }
  return { added, removed, changed };
}
