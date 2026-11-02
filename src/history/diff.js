import { diffArrays, diffWords } from 'diff';
import { asKind } from '../model/blocks';
function textOf(node) {
    if (node.type === 'text')
        return node.text ?? '';
    if (node.type === 'hardBreak')
        return '\n';
    return (node.content ?? []).map(textOf).join('');
}
/** A document as a flat list of styled lines. */
export function flattenDoc(json) {
    return (json?.content ?? [])
        .filter((n) => n.type === 'block')
        .map((n) => ({ kind: asKind(n.attrs?.kind), text: textOf(n) }));
}
const key = (b) => `${b.kind}\u0000${b.text}`;
/** Block-by-block comparison of two versions, with word-level detail for edited blocks. */
export function diffBlocks(before, after) {
    const changes = diffArrays(before, after, { comparator: (a, b) => key(a) === key(b) });
    const rows = [];
    for (let i = 0; i < changes.length; i++) {
        const c = changes[i];
        if (!c.added && !c.removed) {
            for (const b of c.value)
                rows.push({ type: 'same', block: b });
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
            for (const b of removed.slice(pairs))
                rows.push({ type: 'removed', block: b });
            for (const b of added.slice(pairs))
                rows.push({ type: 'added', block: b });
            i++;
            continue;
        }
        for (const b of c.value)
            rows.push({ type: c.added ? 'added' : 'removed', block: b });
    }
    return rows;
}
export function summarize(rows) {
    let added = 0;
    let removed = 0;
    let changed = 0;
    for (const r of rows) {
        if (r.type === 'added')
            added++;
        else if (r.type === 'removed')
            removed++;
        else if (r.type === 'changed')
            changed++;
    }
    return { added, removed, changed };
}
