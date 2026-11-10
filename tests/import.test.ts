import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { contentExtensions } from '../src/editor/extensions';
import { buildDocx } from '../src/export/docx';
import { parseCsv, parseDocx, parseText } from '../src/import/importFile';

const kinds = (json: { content?: { attrs?: Record<string, unknown>; content?: { text?: string }[] }[] }) =>
  (json.content ?? []).map((b) => `${b.attrs?.kind}:${(b.content ?? []).map((t) => t.text).join('')}`);

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
    const warrant = json.content![3];
    expect(warrant.content!.find((t) => t.text === 'bold')!.marks).toEqual([{ type: 'bold' }]);
    editor.destroy();
  });

  it('CSV with speech headers and quoted cells', () => {
    const rows = parseCsv('PMC,LOC,MG\n"Plan, with comma","No solvency",Yes it does\n');
    expect(rows[1]).toEqual(['Plan, with comma', 'No solvency', 'Yes it does']);
  });

  it('Markdown headings and bullets', () => {
    expect(kinds(parseText('# Brief\n## Adv\n### Claim\n- warrant one\nplain line'))).toEqual(['position:Brief', 'section:Adv', 'claim:Claim', 'warrant:warrant one', 'warrant:plain line']);
  });
});
