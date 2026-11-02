import { Editor } from '@tiptap/core';
import { createStore, get, set } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { contentExtensions } from '../src/editor/extensions';
import { RoundGuard } from '../src/editor/roundGuard';
import { isRound, setRound } from '../src/store/roundDoc';
import { flushLog, logEvent, readLog, summarizeLog } from '../src/store/typingLog';
import { linesToJSON } from '../src/store/seed';

function make(ydoc: Y.Doc, docId: string) {
  return new Editor({
    extensions: [...contentExtensions(), RoundGuard.configure({ ydoc, docId })],
    content: linesToJSON([['claim', 'Start']]),
  });
}

/** Simulate a paste the way ProseMirror receives one. */
function paste(e: Editor, text: string) {
  const data = { getData: (t: string) => (t === 'text/plain' ? text : ''), types: ['text/plain'] };
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: data });
  e.view.dom.dispatchEvent(event);
}

describe('round docs', () => {
  it('team docs allow paste; round docs block it and log the attempt', async () => {
    const ydoc = new Y.Doc();
    const e = make(ydoc, 'r1');
    e.commands.setTextSelection(6);
    paste(e, ' pasted');
    expect(e.state.doc.textContent).toBe('Start pasted');

    setRound(ydoc, 'r1', true);
    expect(isRound(ydoc)).toBe(true);
    paste(e, ' again');
    expect(e.state.doc.textContent).toBe('Start pasted');

    e.commands.insertContent('x');
    const log = await readLog('r1');
    expect(log.events.map((ev) => ev.k)).toEqual(['round-on', 'paste-blocked', 'type']);
    expect(log.intact).toBe(true);
    expect(log.seal).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    e.destroy();
  });

  it('flags one edit that inserts a lot of text at once', async () => {
    const ydoc = new Y.Doc();
    const e = make(ydoc, 'r2');
    setRound(ydoc, 'r2', true);
    e.commands.insertContent('a'.repeat(120));
    const s = summarizeLog((await readLog('r2')).events);
    expect(s.large).toBe(1);
    e.destroy();
  });

  it('detects a log that was edited afterwards', async () => {
    logEvent('r3', { k: 'type', s: 'hello' });
    await flushLog();
    logEvent('r3', { k: 'type', s: 'world' });
    await flushLog();
    expect((await readLog('r3')).intact).toBe(true);

    const store = createStore('pp-typing-log', 'log');
    const b = (await get('batch:r3:1', store)) as { events: { s: string }[] };
    b.events[0].s = 'HELLO';
    await set('batch:r3:1', b, store);
    expect((await readLog('r3')).intact).toBe(false);
  });
});
