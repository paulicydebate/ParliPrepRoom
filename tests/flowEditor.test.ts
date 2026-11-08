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

describe('deleting a sheet', () => {
  it('removes the sheet and everything on it, keeps the others, and undo-able content stays consistent', () => {
    const e = make([
      ['position', 'Case', { side: 'gov' }],
      ['claim', 'C1'],
      ['position', 'T', { side: 'opp' }],
      ['claim', 'Interp'],
      ['warrant', 'Violation'],
      ['position', 'DA', { side: 'opp' }],
      ['claim', 'Link'],
    ]);
    const tSheet = flowKey.getState(e.state)!.layout.sheets.find((s) => s.title === 'T')!;
    e.commands.deleteSheet(tSheet.id!);
    const titles = flowKey.getState(e.state)!.layout.sheets.map((s) => s.title);
    expect(titles).toEqual(['Case', 'DA']);
    expect(e.state.doc.textContent).not.toContain('Interp');
    expect(e.state.doc.textContent).toContain('Link');
  });

  it('deleting the only sheet leaves an empty document, not a broken one', () => {
    const e = make([['position', 'Only'], ['claim', 'x']]);
    e.commands.deleteSheet(flowKey.getState(e.state)!.layout.sheets[0].id!);
    expect(e.state.doc.childCount).toBe(1);
  });
});

function press(e: Editor, combo: string) {
  const parts = combo.split('-');
  const key = parts[parts.length - 1];
  const event = new KeyboardEvent('keydown', {
    key,
    code: key,
    ctrlKey: parts.includes('Mod') || parts.includes('Ctrl'),
    altKey: parts.includes('Alt'),
    shiftKey: parts.includes('Shift'),
    bubbles: true,
    cancelable: true,
  });
  e.view.someProp('handleKeyDown', (f) => f(e.view, event));
}
/** Put the caret at the end of the line with this text. */
function caretEndOf(e: Editor, text: string) {
  const p = rowOf(e, text);
  e.commands.setTextSelection(p.pos + 1 + e.state.doc.nodeAt(p.pos)!.content.size);
}
const caretLine = (e: Editor) => e.state.selection.$from.parent;
const blockCount = (e: Editor) => e.state.doc.childCount;
const rowCells = (e: Editor, speech: string) => sheet(e).placements.filter((p) => p.group >= 0 && e.state.doc.nodeAt(p.pos)!.attrs.speech === speech);

describe('Enter in the flow drops you down to the next cell', () => {
  const lines = (): Line[] => [
    ['position', 'Case', { side: 'gov' }],
    ['claim', 'C1'],
    ['claim', 'LOC answer 1', { speech: 'LOC' }],
    ['claim', 'C2'],
    ['claim', 'LOC answer 2', { speech: 'LOC' }],
  ];

  it('in a later column, goes to the cell below in the same column instead of making this cell bigger', () => {
    const e = make(lines());
    const before = blockCount(e);
    caretEndOf(e, 'LOC answer 1');
    press(e, 'Enter');
    expect(caretLine(e).textContent).toBe('LOC answer 2');
    expect(blockCount(e)).toBe(before); // nothing was added: the cell did not grow
  });

  it('on the last row of a later column, starts a new row below in that column', () => {
    const e = make(lines());
    caretEndOf(e, 'LOC answer 2');
    const before = blockCount(e);
    press(e, 'Enter');
    expect(blockCount(e)).toBe(before + 1);
    const here = caretLine(e);
    expect(here.attrs.speech).toBe('LOC');
    expect(here.attrs.newRow).toBe(true); // a new row, not an extra line in the cell above
    e.commands.insertContent('LOC answer 3');
    expect(rowOf(e, 'LOC answer 3').row).toBeGreaterThan(rowOf(e, 'LOC answer 2').row);
    expect(rowOf(e, 'LOC answer 3').col).toBe(rowOf(e, 'LOC answer 2').col);
    expect(sheet(e).groups[sheet(e).groups.length - 1].cells.get(rowOf(e, 'LOC answer 2').col)?.length).toBe(1); // still one line per cell
  });

  it('when the row below has nothing in this column yet, makes the empty cell there', () => {
    const e = make([['position', 'Case', { side: 'gov' }], ['claim', 'C1'], ['claim', 'LOC answer 1', { speech: 'LOC' }], ['claim', 'C2']]);
    caretEndOf(e, 'LOC answer 1');
    press(e, 'Enter');
    const here = caretLine(e);
    expect(here.attrs.speech).toBe('LOC');
    expect(here.textContent).toBe('');
    e.commands.insertContent('Answer to C2');
    expect(rowOf(e, 'Answer to C2').row).toBe(rowOf(e, 'C2').row); // in C2's row, not a new row
  });

  it('in the first column, goes to the existing claim below instead of inserting a row', () => {
    const e = make(lines());
    const before = blockCount(e);
    caretEndOf(e, 'C1');
    press(e, 'Enter');
    expect(caretLine(e).textContent).toBe('C2');
    expect(blockCount(e)).toBe(before);
  });

  it('on the last claim, starts a new claim row', () => {
    const e = make(lines());
    caretEndOf(e, 'C2');
    const before = blockCount(e);
    press(e, 'Enter');
    expect(blockCount(e)).toBe(before + 1);
    e.commands.insertContent('C3');
    expect(rowOf(e, 'C3').row).toBeGreaterThan(rowOf(e, 'C2').row);
    expect(rowOf(e, 'C3').col).toBe(1);
  });

  it('Alt+Enter adds another line inside the same cell (to make a cell bigger on purpose)', () => {
    const e = make(lines());
    caretEndOf(e, 'LOC answer 1');
    const before = blockCount(e);
    press(e, 'Alt-Enter');
    expect(blockCount(e)).toBe(before + 1);
    e.commands.insertContent('second line');
    expect(rowOf(e, 'second line').group).toBe(rowOf(e, 'LOC answer 1').group); // same row of the flow, same cell
    expect(rowOf(e, 'second line').col).toBe(rowOf(e, 'LOC answer 1').col);
    const g = sheet(e).groups[0];
    expect(g.cells.get(rowOf(e, 'LOC answer 1').col)?.length).toBe(2);
  });

  it('Ctrl/Cmd+Enter still starts a new row right below the current one', () => {
    const e = make(lines());
    caretEndOf(e, 'C1');
    press(e, 'Mod-Enter');
    e.commands.insertContent('Inserted');
    expect(rowOf(e, 'Inserted').row).toBe(rowOf(e, 'C1').row + 1);
  });

  it('rowCells helper sanity', () => {
    const e = make(lines());
    expect(rowCells(e, 'LOC')).toHaveLength(2);
  });
});

describe('linking responses to an argument', () => {
  const lines: Line[] = [
    ['position', 'Case'],
    ['claim', 'A'],
    ['claim', 'B'],
    ['claim', 'ans for A', { speech: 'LOC' }],
    ['claim', 'ans for B', { speech: 'LOC' }],
  ];
  const posOf = (e: Editor, text: string) => rowOf(e, text).pos;
  const caretIn = (e: Editor, text: string) => {
    const pos = posOf(e, text);
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, pos + 1)));
  };

  it('link mode starts from the caret, and a click on an argument in the speech before links it', async () => {
    const { applyLink } = await import('../src/editor/flowView');
    const e = make(lines);
    // (the lines are typed in the order A, B, then the two answers, so they sit in B's row group)
    caretIn(e, 'ans for A');
    e.commands.startLinking();
    expect(flowKey.getState(e.state)!.linking).toMatchObject({ col: 2 });
    expect(applyLink(e.view, posOf(e, 'A'))).toBe(true);
    expect(flowKey.getState(e.state)!.linking).toBeNull();
    const a = rowOf(e, 'A');
    const ans = rowOf(e, 'ans for A');
    expect(ans.row).toBe(a.row);
    expect(sheet(e).links).toEqual([{ from: a.pos, to: ans.pos }]);
    // The document order did not change.
    expect(e.state.doc.child(3).textContent).toBe('ans for A');
  });

  it('refuses a target that is not in the column just before, and keeps link mode on', async () => {
    const { applyLink } = await import('../src/editor/flowView');
    const e = make(lines);
    caretIn(e, 'ans for A');
    e.commands.startLinking();
    applyLink(e.view, posOf(e, 'ans for B')); // same column
    expect(flowKey.getState(e.state)!.linking).not.toBeNull();
    expect(sheet(e).links).toEqual([]);
  });

  it('Escape (cancelLinking) leaves everything as it was, and unlinkBlock removes a link', async () => {
    const { applyLink } = await import('../src/editor/flowView');
    const e = make(lines);
    caretIn(e, 'ans for A');
    e.commands.startLinking();
    e.commands.cancelLinking();
    expect(flowKey.getState(e.state)!.linking).toBeNull();
    caretIn(e, 'ans for A');
    e.commands.startLinking();
    applyLink(e.view, posOf(e, 'B'));
    expect(sheet(e).links).toHaveLength(1);
    e.commands.unlinkBlock(posOf(e, 'ans for A'));
    expect(sheet(e).links).toEqual([]);
  });

  it('Link does nothing when no claim in a later speech is selected', () => {
    const e = make(lines);
    caretIn(e, 'A');
    e.commands.startLinking();
    expect(flowKey.getState(e.state)!.linking).toBeNull();
  });
});
