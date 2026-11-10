import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { addSheet, createChild, createRoot, deleteCell, ensureSheet, readFlow, sheetOrder, yCells, yText, sheetsMap } from '../src/flow2/model';
import { restoreFlow } from '../src/flow2/restore';
import { diffFlows, flattenFlow, summarizeFlow } from '../src/history/flowDiff';
import { decodeLog, DocReplayer, sessionsOf } from '../src/history/timeline';

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** A flow edited step by step, with every Yjs update kept the way the server's record keeps them. */
function recorded() {
  const doc = new Y.Doc();
  const log: { seq: number; at: number; userId: string; name: string; via: string; data: string }[] = [];
  let at = 1_000_000;
  doc.on('update', (u: Uint8Array) => log.push({ seq: log.length + 1, at: (at += 1000), userId: 'u1', name: 'Ann', via: 'live', data: toBase64(u) }));
  ensureSheet(doc);
  const sheetId = sheetOrder(doc).get(0);
  const type = (id: string, text: string) => yText(yCells(sheetsMap(doc).get(sheetId)!).get(id)!).insert(0, text);
  return { doc, log, sheetId, type };
}

describe('flow history', () => {
  it('replays a flow to any point of its record', () => {
    const { doc, log, sheetId, type } = recorded();
    const a = createRoot(doc, sheetId, 1)!;
    type(a, 'Econ Bad');
    const afterA = log.length - 1;
    const k = createChild(doc, sheetId, a)!;
    type(k, 'Econ Good');
    const replayer = new DocReplayer(decodeLog(log));
    expect(flattenFlow(replayer.flowAt(afterA)).map((c) => c.text)).toEqual(['Econ Bad']);
    expect(flattenFlow(replayer.flowAt(log.length - 1)).map((c) => `${c.depth}:${c.text}`)).toEqual(['0:Econ Bad', '1:Econ Good']);
    expect(flattenFlow(replayer.flowAt(-1))).toEqual([]);
  });

  it('the record sees each cell’s typing as typed text by that person', () => {
    const { doc, log, sheetId, type } = recorded();
    const a = createRoot(doc, sheetId, 1)!;
    type(a, 'hello');
    const updates = decodeLog(log);
    expect(updates.map((u) => u.text).join('')).toContain('hello');
    expect(sessionsOf(updates).length).toBe(1);
    expect(sessionsOf(updates)[0].inserted).toBeGreaterThanOrEqual(5);
  });

  it('compares two states cell by cell: added, edited (word by word), removed, unchanged', () => {
    const { doc, sheetId, type } = recorded();
    const a = createRoot(doc, sheetId, 1)!;
    const b = createRoot(doc, sheetId, 1, a)!;
    type(a, 'Econ is bad');
    type(b, 'Gone soon');
    const before = flattenFlow(readFlow(doc));
    yText(yCells(sheetsMap(doc).get(sheetId)!).get(a)!).insert(8, 'very ');
    deleteCell(doc, sheetId, b);
    const c = createRoot(doc, sheetId, 1, a)!;
    type(c, 'New one');
    const rows = diffFlows(before, flattenFlow(readFlow(doc)));
    expect(rows.map((r) => r.type)).toEqual(['changed', 'removed', 'added']);
    expect(summarizeFlow(rows)).toEqual({ added: 1, removed: 1, changed: 1 });
    const changed = rows[0];
    expect(changed.type === 'changed' && changed.parts.some((p) => p.added && p.value.includes('very'))).toBe(true);
  });

  it('restoring puts the sheets and cells back, as one change that can be undone', () => {
    const { doc, sheetId, type } = recorded();
    const a = createRoot(doc, sheetId, 1)!;
    type(a, 'keep');
    const snapshot = new Y.Doc();
    Y.applyUpdate(snapshot, Y.encodeStateAsUpdate(doc));
    // Later: more sheets and cells, and the first cell changed.
    addSheet(doc, 'opp');
    const x = createRoot(doc, sheetId, 1, a)!;
    type(x, 'later');
    yText(yCells(sheetsMap(doc).get(sheetId)!).get(a)!).insert(0, 'oops ');
    expect(readFlow(doc)).toHaveLength(2);
    restoreFlow(doc, snapshot);
    const now = readFlow(doc);
    expect(now).toHaveLength(1);
    expect(now[0].cells.map((c) => c.text)).toEqual(['keep']);
    // A partner who had the old document still merges with the restored one.
    const partner = new Y.Doc();
    Y.applyUpdate(partner, Y.encodeStateAsUpdate(doc));
    expect(readFlow(partner)[0].cells.map((c) => c.text)).toEqual(['keep']);
  });
});
