import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { contentExtensions } from '../src/editor/extensions';
import { activeSheet, columnSelection, flowKey, FlowView } from '../src/editor/flowView';
import { SHEET_ROWS } from '../src/model/flow';
import { linesToJSON } from '../src/store/seed';
let editor = null;
afterEach(() => {
    editor?.destroy();
    editor = null;
});
function make(lines) {
    editor = new Editor({ extensions: [...contentExtensions(), FlowView], content: linesToJSON(lines) });
    return editor;
}
const sheet = (e) => activeSheet(flowKey.getState(e.state));
const rowOf = (e, text) => {
    const s = sheet(e);
    return s.placements.find((p) => e.state.doc.nodeAt(p.pos).textContent === text);
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
        const sel = columnSelection(e.state);
        expect(sel.col).toBe(1);
        expect(sel.positions.map((p) => e.state.doc.nodeAt(p).textContent)).toEqual(['C1', 'C2']);
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
        const tSheet = flowKey.getState(e.state).layout.sheets.find((s) => s.title === 'T');
        e.commands.deleteSheet(tSheet.id);
        const titles = flowKey.getState(e.state).layout.sheets.map((s) => s.title);
        expect(titles).toEqual(['Case', 'DA']);
        expect(e.state.doc.textContent).not.toContain('Interp');
        expect(e.state.doc.textContent).toContain('Link');
    });
    it('deleting the only sheet leaves an empty document, not a broken one', () => {
        const e = make([['position', 'Only'], ['claim', 'x']]);
        e.commands.deleteSheet(flowKey.getState(e.state).layout.sheets[0].id);
        expect(e.state.doc.childCount).toBe(1);
    });
});
