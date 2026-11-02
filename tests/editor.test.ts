import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { Collapse, collapseKey, computeHidden } from '../src/editor/collapse';
import { contentExtensions } from '../src/editor/extensions';
import { setStyleKeyPreset } from '../src/editor/shortcuts';
import { linesToJSON, type Line } from '../src/store/seed';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(lines: Line[]) {
  editor = new Editor({ extensions: [...contentExtensions(), Collapse], content: linesToJSON(lines) });
  return editor;
}

const kinds = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.forEach((n) => out.push(n.attrs.kind));
  return out;
};

/** Simulate a real key press, the way the browser delivers it. */
function press(e: Editor, combo: string) {
  const parts = combo.split('-');
  const key = parts[parts.length - 1];
  const event = new KeyboardEvent('keydown', {
    key,
    code: /^\d$/.test(key) ? `Digit${key}` : key,
    ctrlKey: parts.includes('Mod') || parts.includes('Ctrl'),
    altKey: parts.includes('Alt'),
    shiftKey: parts.includes('Shift'),
    bubbles: true,
    cancelable: true,
  });
  e.view.someProp('handleKeyDown', (f) => f(e.view, event));
}

/** Put the caret at the end of block number `index`. */
function caretAtEnd(e: Editor, index: number) {
  let pos = 0;
  e.state.doc.forEach((n, p, i) => {
    if (i === index) pos = p + 1 + n.content.size;
  });
  e.commands.setTextSelection(pos);
}

describe('prep editor keys', () => {
  it('Enter at the end of a style starts the next style down', () => {
    const e = make([['position', 'Gov']]);
    caretAtEnd(e, 0);
    press(e, 'Enter');
    e.commands.insertContent('Adv 1');
    press(e, 'Enter');
    e.commands.insertContent('Claim');
    press(e, 'Enter');
    expect(kinds(e)).toEqual(['position', 'section', 'claim', 'warrant']);
  });

  it('Enter on an empty block moves it up a level', () => {
    const e = make([['claim', 'C'], ['warrant', '']]);
    caretAtEnd(e, 1);
    press(e, 'Enter');
    expect(kinds(e)).toEqual(['claim', 'claim']);
  });

  it('Tab and Shift-Tab change level', () => {
    const e = make([['claim', 'C']]);
    caretAtEnd(e, 0);
    press(e, 'Tab');
    expect(kinds(e)).toEqual(['warrant']);
    press(e, 'Shift-Tab');
    press(e, 'Shift-Tab');
    expect(kinds(e)).toEqual(['section']);
  });

  it('the style keys apply a named style', () => {
    setStyleKeyPreset('alt');
    const e = make([['warrant', 'x']]);
    caretAtEnd(e, 0);
    press(e, 'Alt-1');
    expect(kinds(e)).toEqual(['position']);
    press(e, 'Alt-6');
    expect(kinds(e)).toEqual(['note']);
  });

  it('keeps block ids unique after splitting', () => {
    const e = make([['claim', 'Split me']]);
    e.commands.setTextSelection(4);
    press(e, 'Enter');
    const ids: string[] = [];
    e.state.doc.forEach((n) => ids.push(n.attrs.id));
    expect(ids).toHaveLength(2);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('collapsing', () => {
  it('hides everything under a heading until the next heading at its level', () => {
    const e = make([
      ['position', 'Gov'],
      ['section', 'Adv 1'],
      ['claim', 'C1'],
      ['warrant', 'W1'],
      ['section', 'Adv 2'],
      ['claim', 'C2'],
    ]);
    const ids: string[] = [];
    e.state.doc.forEach((n) => ids.push(n.attrs.id));
    e.commands.toggleCollapse(ids[1]);
    const collapsed = collapseKey.getState(e.state)!;
    expect([...collapsed]).toEqual([ids[1]]);
    const { hidden, counts } = computeHidden(e.state.doc, collapsed);
    expect(hidden.size).toBe(2);
    expect(counts.get(ids[1])).toBe(2);
  });

  it('opens a fold when the caret moves into it', () => {
    const e = make([
      ['claim', 'C1'],
      ['warrant', 'W1'],
    ]);
    const id = e.state.doc.firstChild!.attrs.id;
    e.commands.toggleCollapse(id);
    expect(collapseKey.getState(e.state)!.has(id)).toBe(true);
    caretAtEnd(e, 1);
    expect(collapseKey.getState(e.state)!.has(id)).toBe(false);
  });
});

describe('collapse to claims', () => {
  it('hides warrants but keeps every heading visible', () => {
    const e = make([
      ['position', 'Gov'],
      ['section', 'Adv 1'],
      ['claim', 'C1'],
      ['warrant', 'W1'],
      ['claim', 'C2'],
      ['analytic', 'A2'],
    ]);
    e.commands.collapseAll(3);
    const { hidden } = computeHidden(e.state.doc, collapseKey.getState(e.state)!);
    const hiddenKinds: string[] = [];
    e.state.doc.forEach((n, pos) => hidden.has(pos) && hiddenKinds.push(n.attrs.kind));
    expect(hiddenKinds).toEqual(['warrant', 'analytic']);
  });
});

describe('flow marks', () => {
  it('toggles a mark on the selected block, and the same mark again clears it', () => {
    const e = make([['claim', 'C1'], ['claim', 'C2']]);
    caretAtEnd(e, 0);
    e.commands.toggleFlowMark('dropped');
    expect(e.state.doc.child(0).attrs.mark).toBe('dropped');
    expect(e.state.doc.child(1).attrs.mark).toBeNull();
    e.commands.toggleFlowMark('extend');
    expect(e.state.doc.child(0).attrs.mark).toBe('extend');
    e.commands.toggleFlowMark('extend');
    expect(e.state.doc.child(0).attrs.mark).toBeNull();
  });

  it('a new line after a marked claim starts unmarked', () => {
    const e = make([['claim', 'C1']]);
    caretAtEnd(e, 0);
    e.commands.toggleFlowMark('key');
    press(e, 'Enter');
    expect(e.state.doc.child(1).attrs.mark).toBeNull();
  });
});
