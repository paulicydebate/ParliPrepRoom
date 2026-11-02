import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { contentExtensions } from '../src/editor/extensions';
import { buildDocx } from '../src/export/docx';
import { buildFlowXlsx } from '../src/export/xlsx';
import { parseCsv, parseDocx, parseText, parseXlsx, sheetsToDoc } from '../src/import/importFile';
import { computeFlow, readBlocks } from '../src/model/flow';
import { linesToJSON } from '../src/store/seed';
const kinds = (json) => (json.content ?? []).map((b) => `${b.attrs?.kind}:${(b.content ?? []).map((t) => t.text).join('')}`);
describe('import into reference docs', () => {
    it('Word: headings become position/section/claim, body becomes warrants, bold carries over', async () => {
        const editor = new Editor({
            extensions: contentExtensions(),
            content: {
                type: 'doc',
                content: [
                    { type: 'block', attrs: { kind: 'position' }, content: [{ type: 'text', text: 'Brief' }] },
                    { type: 'block', attrs: { kind: 'section' }, content: [{ type: 'text', text: 'Adv 1' }] },
                    { type: 'block', attrs: { kind: 'claim' }, content: [{ type: 'text', text: 'Claim A' }] },
                    { type: 'block', attrs: { kind: 'warrant' }, content: [{ type: 'text', text: 'plain ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
                ],
            },
        });
        const blob = await buildDocx(editor.state.doc, 'Brief');
        const json = parseDocx(new Uint8Array(await blob.arrayBuffer()));
        expect(kinds(json)).toEqual(['position:Brief', 'section:Adv 1', 'claim:Claim A', 'warrant:plain bold']);
        const warrant = json.content[3];
        expect(warrant.content.find((t) => t.text === 'bold').marks).toEqual([{ type: 'bold' }]);
        editor.destroy();
    });
    it('Excel flow: our own export comes back as the same flow (sheets, rows, answers)', () => {
        const editor = new Editor({
            extensions: contentExtensions(),
            content: linesToJSON([
                ['position', 'Case', { side: 'gov' }],
                ['claim', 'C1'],
                ['claim', 'LOC answer', { speech: 'LOC' }],
                ['claim', 'C2'],
                ['position', 'DA', { side: 'opp' }],
                ['claim', 'Link'],
            ]),
        });
        const sheets = parseXlsx(buildFlowXlsx(editor.state.doc));
        expect(sheets.map((s) => s.name)).toEqual(['Case', 'DA']);
        const json = sheetsToDoc(sheets);
        const back = new Editor({ extensions: contentExtensions(), content: json });
        const layout = computeFlow(readBlocks(back.state.doc));
        expect(layout.sheets.map((s) => [s.title, s.side])).toEqual([
            ['Case', 'gov'],
            ['DA', 'opp'],
        ]);
        const where = layout.sheets[0].placements.map((p) => `${back.state.doc.nodeAt(p.pos).textContent}@${p.col}:${p.row}`);
        expect(where).toEqual(['C1@1:1', 'LOC answer@2:1', 'C2@1:2']);
        editor.destroy();
        back.destroy();
    });
    it('CSV with speech headers and quoted cells', () => {
        const rows = parseCsv('PMC,LOC,MG\n"Plan, with comma","No solvency",Yes it does\n');
        expect(rows[1]).toEqual(['Plan, with comma', 'No solvency', 'Yes it does']);
        const json = sheetsToDoc([{ name: 'Case', rows }]);
        expect(kinds(json)).toEqual(['position:Case', 'claim:Plan, with comma', 'claim:No solvency', 'claim:Yes it does']);
    });
    it('Markdown headings and bullets', () => {
        expect(kinds(parseText('# Brief\n## Adv\n### Claim\n- warrant one\nplain line'))).toEqual(['position:Brief', 'section:Adv', 'claim:Claim', 'warrant:warrant one', 'warrant:plain line']);
    });
});
