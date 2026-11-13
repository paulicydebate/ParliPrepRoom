import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { measureUpdate } from '../worker/measure';

/** Record each local change as its own update, like the server receives them. */
function recorder(doc: Y.Doc) {
  const updates: Uint8Array[] = [];
  doc.on('update', (u: Uint8Array) => updates.push(u));
  return updates;
}

describe('server record text', () => {
  it('knows exactly which text each later edit deleted', () => {
    const doc = new Y.Doc();
    const updates = recorder(doc);
    const t = doc.getText('t');
    t.insert(0, 'The plan bans police use');
    t.delete(4, 5); // "plan "
    t.insert(4, 'policy ');
    t.delete(t.length - 3, 3); // "use" via backspace-like removal
    const chars = new Map<string, string>();
    const out = updates.map((u) => measureUpdate(u, chars));
    expect(out[0].text).toBe('The plan bans police use');
    expect(out[1].deletedText).toBe('plan ');
    expect(out[2].text).toBe('policy ');
    expect(out[3].deletedText).toBe('use');
  });

  it('two people: deletions of a partner’s text are attributed to the right characters', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const updates: Uint8Array[] = [];
    a.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      updates.push(u);
      Y.applyUpdate(b, u, 'remote');
    });
    b.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      updates.push(u);
      Y.applyUpdate(a, u, 'remote');
    });
    a.getText('t').insert(0, 'Alice wrote this.');
    b.getText('t').delete(6, 5); // Bob removes "wrote"
    const chars = new Map<string, string>();
    const out = updates.map((u) => measureUpdate(u, chars));
    expect(out.map((o) => o.deletedText).filter(Boolean)).toEqual(['wrote']);
  });
});

import { addSheet, createChild, createRoot, linkCells, moveSheet, renameSheet, setMark, unlinkCell, yCells, yText, sheetsMap, deleteCell } from '../src/flow2/model';

describe('server record text for flows', () => {
  it('puts each cell on its own line, counts sheet names, and ignores marks, moves and links', () => {
    const doc = new Y.Doc();
    const updates = recorder(doc);
    const sheet = addSheet(doc, 'gov', 'Gov 1');
    const a = createRoot(doc, sheet, 1)!;
    const typeIn = (id: string, s: string) => yText(yCells(sheetsMap(doc).get(sheet)!).get(id)!).insert(0, s);
    typeIn(a, 'claim one');
    const b = createChild(doc, sheet, a)!;
    typeIn(b, 'answer');
    const chars = new Map<string, string>();
    const before = updates.length;
    const firstPart = updates.slice(0, before).map((u) => measureUpdate(u, chars));
    expect(firstPart.map((m) => m.text).join('')).toBe('Gov 1\nclaim one\nanswer');

    const mark = updates.length;
    setMark(doc, sheet, [a], 'dropped');
    setMark(doc, sheet, [a], 'key');
    moveSheet(doc, sheet, 100, 200);
    moveSheet(doc, sheet, 300, 400);
    unlinkCell(doc, sheet, b);
    linkCells(doc, sheet, [b], a);
    const meta = updates.slice(mark).map((u) => measureUpdate(u, chars));
    expect(meta.every((m) => m.text === '' && m.deleted === 0)).toBe(true);

    const ren = updates.length;
    renameSheet(doc, sheet, 'Topicality');
    const r = updates.slice(ren).map((u) => measureUpdate(u, chars));
    expect(r[0].text).toBe('Topicality');
    expect(r[0].deleted).toBe(0);

    const del = updates.length;
    deleteCell(doc, sheet, b);
    const d = updates.slice(del).map((u) => measureUpdate(u, chars));
    expect(d[0].deletedText).toBe('answer');
    expect(d[0].deleted).toBe(6);
  });
});
