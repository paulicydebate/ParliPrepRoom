import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { BODY_FIELD, schema } from '../editor/extensions';
import { newBlockId } from '../model/blocks';
export function linesToJSON(lines) {
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
export function writeLines(doc, lines) {
    prosemirrorJSONToYXmlFragment(schema, linesToJSON(lines), doc.getXmlFragment(BODY_FIELD));
}
export const STARTER_LINES = [['position', '']];
export const SAMPLE_REFERENCE = [
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
export const SAMPLE_PREP = [
    ['note', 'Sample prep doc. Enter gives the next style, Tab / Shift+Tab move a level, and the style menu shows each style’s key. Switch this pane to Flow (top right) to see the same prep as a flow.'],
    ['position', 'Gov: Ban police facial recognition', { side: 'gov' }],
    ['section', 'Advantage 1 — Wrongful arrests'],
    ['claim', 'The tech misidentifies people at very different rates'],
    ['warrant', 'NIST 2019: false positives 10–100x higher for some groups.'],
    ['claim', 'Accuracy is improving fast', { speech: 'LOC' }],
    ['claim', 'Improvement is uneven; police buy cheap vendors', { speech: 'MG' }],
    ['claim', 'A false match turns into an arrest'],
    ['warrant', 'Matches get treated as leads without independent evidence.'],
    ['claim', 'Human review catches errors', { speech: 'LOC' }],
    ['claim', 'Review is rubber-stamping; documented wrongful arrests', { speech: 'MG' }],
    ['position', 'Opp: Regulation CP', { side: 'opp' }],
    ['claim', 'CP: mandate accuracy audits and warrants instead of a ban'],
    ['claim', 'Perm: do both', { speech: 'MG' }],
];
/** Write ProseMirror JSON (e.g. an imported file) into an empty document. */
export function writeJSON(doc, json) {
    prosemirrorJSONToYXmlFragment(schema, json, doc.getXmlFragment(BODY_FIELD));
}
