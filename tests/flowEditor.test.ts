import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { contentExtensions } from '../src/editor/extensions';
import { activeSheet, columnSelection, flowKey, FlowView } from '../src/editor/flowView';
import { SHEET_ROWS } from '../src/model/flow';
import { linesToJSON, type Line } from '../src/store/seed';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(lines: Line[]) {
  editor = new Editor({ extensions: [...contentExtensions(), FlowView], content: linesToJSON(lines) });
  return editor;
}
const sheet = (e: Editor) => activeSheet(flowKey.getState(e.state))!;
const rowOf = (e: Editor, text: string) => {
  const s = sheet(e);
  return s.placements.find((p) => e.state.doc.nodeAt(p.pos)!.textContent === text)!;
};

describe('pre-made rows', () => {
  it('shows a full sheet of empty rows', () => {
    const e = make([['position', 'Case'], ['claim', 'C1']]);
    expect(sheet(e).ghostRows).toBe(SHEET_ROWS - 1);
  });

  it('clicking row 40 puts the line in row 40', () => {
    const e = make([['position', 'Case'], ['claim', 'C1']]);
    const first = sheet(e).nextRow;
    e.chain().createCell({ ghost: 38 }, 1).insertContent('Far down').run();
    expect(rowOf(e, 'Far down').row).toBe(first + 38);
    expect(sheet(e).blanks).toEqual([{ row: first, count: 38, before: 1 }]);
  });

  it('clicking a blank row above keeps the row below where it was', () => {
    const e = make([['position', 'Case'], ['claim', 'C1']]);
    e.chain().createCell({ ghost: 10 }, 1).insertContent('Row 12').run();
    const below = rowOf(e, 'Row 12').row;
    e.chain().createCell({ before: 1, index: 4 }, 3).insertContent('MG in the gap').run();
    expect(rowOf(e, 'MG in the gap').row).toBe(2 + 4);
    expect(rowOf(e, 'MG in the gap').col).toBe(3);
    expect(rowOf(e, 'Row 12').row).toBe(below);
  });

  it('a new row fills a blank row instead of pushing rows down', () => {
    const e = make([['position', 'Case'], ['claim', 'C1']]);
    e.chain().createCell({ ghost: 3 }, 1).insertContent('Later').run();
    const later = rowOf(e, 'Later').row;
    e.commands.setTextSelection(e.state.doc.child(1).nodeSize + e.state.doc.child(0).nodeSize - 1);
    e.chain().newRow().insertContent('Inserted').run();
    expect(rowOf(e, 'Later').row).toBe(later);
  });
});

describe('column selection', () => {
  it('a drag from one cell down to the next row covers only the first column', () => {
    const e = make([
      ['position', 'Case'],
      ['claim', 'C1'],
      ['claim', 'LOC answer', { speech: 'LOC' }],
      ['claim', 'C2'],
      ['claim', 'LOC answer 2', { speech: 'LOC' }],
    ]);
    const c1 = rowOf(e, 'C1').pos;
    const c2 = rowOf(e, 'C2').pos;
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, c1 + 1, c2 + 3)));
    const sel = columnSelection(e.state)!;
    expect(sel.col).toBe(1);
    expect(sel.positions.map((p) => e.state.doc.nodeAt(p)!.textContent)).toEqual(['C1', 'C2']);
  });
});
