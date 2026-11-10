import * as Y from 'yjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged: { docId: string; e: Record<string, unknown> }[] = [];
vi.mock('../src/store/typingLog', () => ({
  logEvent: (docId: string, e: Record<string, unknown>) => void logged.push({ docId, e }),
}));

import { LARGE_INSERT, recordEdit } from '../src/editor/roundGuard';
import { bindText } from '../src/flow2/textBinding';
import { setRound, isRound } from '../src/store/roundDoc';

beforeEach(() => {
  logged.length = 0;
});

describe('typing record for flow cells', () => {
  it('typing is logged as typed text; deleting logs the text removed', () => {
    recordEdit('d1', 'a', '');
    recordEdit('d1', '', 'xyz');
    expect(logged.map((l) => l.e)).toEqual([{ k: 'type', s: 'a' }, { k: 'delete', n: 3, s: 'xyz' }]);
  });

  it('an edit that puts in a lot of text at once is flagged as large, not as typing', () => {
    const big = 'x'.repeat(LARGE_INSERT + 1);
    recordEdit('d1', big, '');
    expect(logged).toHaveLength(1);
    expect(logged[0].e.k).toBe('large');
    expect(logged[0].e.n).toBe(LARGE_INSERT + 1);
  });

  it('a replace logs the removal and the insertion', () => {
    recordEdit('d1', 'new', 'old');
    expect(logged.map((l) => l.e.k)).toEqual(['delete', 'type']);
  });

  it('what a cell’s text box reports matches what changed', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    const el = document.createElement('textarea');
    const seen: { at: number; del: number; deleted: string; ins: string }[] = [];
    bindText(el, text, (e) => seen.push(e));
    el.value = 'hello world';
    el.dispatchEvent(new Event('input'));
    el.value = 'hello brave world';
    el.dispatchEvent(new Event('input'));
    el.value = 'hello world';
    el.dispatchEvent(new Event('input'));
    expect(seen).toEqual([
      { at: 0, del: 0, deleted: '', ins: 'hello world' },
      { at: 6, del: 0, deleted: '', ins: 'brave ' },
      { at: 6, del: 6, deleted: 'brave ', ins: '' },
    ]);
  });

  it('an edit from a partner is not reported as local', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    const el = document.createElement('textarea');
    const seen: unknown[] = [];
    bindText(el, text, (e) => seen.push(e));
    doc.transact(() => text.insert(0, 'from partner'), 'partner');
    expect(seen).toEqual([]);
    expect(el.value).toBe('from partner');
  });

  it('turning Round doc on is recorded, and the flag lives in the document', () => {
    const doc = new Y.Doc();
    expect(isRound(doc)).toBe(false);
    setRound(doc, 'd1', true);
    expect(isRound(doc)).toBe(true);
    expect(logged.some((l) => l.e.k === 'round-on')).toBe(true);
  });
});
