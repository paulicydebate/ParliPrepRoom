import { Editor } from '@tiptap/core';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { contentExtensions } from '../src/editor/extensions';
import { buildFlowXlsx } from '../src/export/xlsx';
import { linesToJSON } from '../src/store/seed';

describe('xlsx export', () => {
  it('writes one worksheet per sheet with speech columns and answers side by side', () => {
    const editor = new Editor({
      extensions: contentExtensions(),
      content: linesToJSON([
        ['position', 'Case: A & B', { side: 'gov' }],
        ['claim', 'C1 <tag>'],
        ['claim', 'Answer', { speech: 'LOC' }],
        ['position', 'DA', { side: 'opp' }],
        ['claim', 'Link'],
      ]),
    });
    const files = unzipSync(buildFlowXlsx(editor.state.doc));
    const wb = strFromU8(files['xl/workbook.xml']);
    expect(wb).toContain('name="Case  A &amp; B"');
    expect(wb).toContain('name="DA"');
    const s1 = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(s1).toContain('<t>PMC</t>');
    expect(s1).toContain('C1 &lt;tag&gt;');
    expect(s1).toMatch(/r="B2"[^>]*t="inlineStr"><is><r><rPr><b\/><\/rPr><t xml:space="preserve">Answer/);
    const s2 = strFromU8(files['xl/worksheets/sheet2.xml']);
    expect(s2).toContain('<t>LOC</t>');
    expect(s2).not.toContain('<t>PMC</t>');
    editor.destroy();
  });
});
