// The named styles every piece of prep uses. Doc view and (later) flow view
// both read these, so keep this file free of editor or UI code.
export const BLOCK_KINDS = ['position', 'section', 'claim', 'warrant', 'analytic', 'note'];
export const KIND_INFO = {
    position: { label: 'Position title', level: 1, key: '1', next: 'section' },
    section: { label: 'Section title', level: 2, key: '2', next: 'claim' },
    claim: { label: 'Claim', level: 3, key: '3', next: 'warrant' },
    warrant: { label: 'Warrant', level: 4, key: '4', next: 'warrant' },
    analytic: { label: 'Analytic', level: 4, key: '5', next: 'analytic' },
    note: { label: 'Note', level: 4, key: '6', next: 'note' },
};
export const DEFAULT_KIND = 'warrant';
export function isBlockKind(value) {
    return typeof value === 'string' && BLOCK_KINDS.includes(value);
}
export function asKind(value) {
    return isBlockKind(value) ? value : DEFAULT_KIND;
}
export function levelOf(kind) {
    return KIND_INFO[asKind(kind)].level;
}
/** Headings can be collapsed and appear in the outline. */
export function isHeading(kind) {
    return levelOf(kind) < 4;
}
/** Tab: one level deeper. Body styles stay as they are. */
export function demote(kind) {
    switch (kind) {
        case 'position':
            return 'section';
        case 'section':
            return 'claim';
        case 'claim':
            return 'warrant';
        default:
            return kind;
    }
}
/** Shift-Tab: one level up. */
export function promote(kind) {
    switch (kind) {
        case 'section':
            return 'position';
        case 'claim':
            return 'section';
        case 'warrant':
        case 'analytic':
        case 'note':
            return 'claim';
        default:
            return kind;
    }
}
export function newBlockId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}
