import { asKind, isHeading, levelOf } from './blocks';
function textOf(node) {
    if (node.type === 'text')
        return node.text ?? '';
    if (node.type === 'hardBreak')
        return ' ';
    return (node.content ?? []).map(textOf).join('');
}
export function outlineEntries(json) {
    const out = [];
    const stack = [];
    (json?.content ?? []).forEach((n, index) => {
        if (n.type !== 'block')
            return;
        const kind = asKind(n.attrs?.kind);
        const level = levelOf(kind);
        const text = textOf(n);
        while (stack.length && stack[stack.length - 1].level >= level)
            stack.pop();
        out.push({ id: String(n.attrs?.id ?? ''), kind, text, path: stack.map((s) => s.text).filter(Boolean), index });
        if (isHeading(kind))
            stack.push({ level, text });
    });
    return out;
}
/** A block and everything under it (a claim with its warrants, a section with its claims...). */
export function blockWithChildren(entries, id) {
    const i = entries.findIndex((e) => e.id === id);
    if (i < 0)
        return [];
    const level = levelOf(entries[i].kind);
    const out = [entries[i]];
    if (!isHeading(entries[i].kind))
        return out;
    for (let j = i + 1; j < entries.length && levelOf(entries[j].kind) > level; j++)
        out.push(entries[j]);
    return out;
}
/** Find blocks whose text (or headings above them) contain every word typed. */
export function searchEntries(entries, query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length)
        return [];
    const hits = [];
    entries.forEach((e, i) => {
        if (!e.text.trim())
            return;
        const own = e.text.toLowerCase();
        const context = (e.path.join(' ') + ' ' + own).toLowerCase();
        if (!words.every((w) => context.includes(w)))
            return;
        const inOwn = words.filter((w) => own.includes(w)).length;
        let score = inOwn * 10 + (isHeading(e.kind) ? 6 - levelOf(e.kind) : 0);
        if (own.startsWith(words[0]))
            score += 4;
        // Body text jumps to the claim (or heading) above it.
        let target = e;
        if (!isHeading(e.kind)) {
            for (let j = i - 1; j >= 0; j--) {
                if (isHeading(entries[j].kind)) {
                    target = entries[j];
                    break;
                }
            }
        }
        hits.push({ entry: e, target, score });
    });
    return hits.sort((a, b) => b.score - a.score);
}
