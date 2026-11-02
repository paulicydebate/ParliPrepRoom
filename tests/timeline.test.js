import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { flattenDoc } from '../src/history/diff';
import { DocReplayer, decodeLog, sessionsOf } from '../src/history/timeline';
import { writeLines } from '../src/store/seed';
import { BODY_FIELD } from '../src/editor/extensions';
const b64 = (u) => btoa(String.fromCharCode(...u));
describe('named history and replay', () => {
    it('groups edits into sessions by person and rebuilds the doc at any point', () => {
        const doc = new Y.Doc();
        const log = [];
        let who = { userId: 'a', name: 'Ana' };
        let t = 1_000_000;
        doc.on('update', (u) => log.push({ seq: log.length + 1, at: (t += 1000), ...who, via: 'live', data: b64(u) }));
        writeLines(doc, [['claim', 'First claim']]);
        who = { userId: 'b', name: 'Ben' };
        const frag = doc.getXmlFragment(BODY_FIELD);
        const text = frag.get(0).get(0);
        text.insert(text.length, ' plus Ben');
        t += 5 * 60_000; // long pause
        text.insert(text.length, '!');
        const updates = decodeLog(log);
        const sessions = sessionsOf(updates);
        expect(sessions.map((s) => s.name)).toEqual(['Ana', 'Ben', 'Ben']);
        expect(sessions[1].inserted).toBe(' plus Ben'.length);
        const r = new DocReplayer(updates);
        expect(flattenDoc(r.jsonAt(0)).map((x) => x.text)).toEqual(['First claim']);
        expect(flattenDoc(r.jsonAt(1)).map((x) => x.text)).toEqual(['First claim plus Ben']);
        expect(flattenDoc(r.jsonAt(updates.length - 1)).map((x) => x.text)).toEqual(['First claim plus Ben!']);
        expect(flattenDoc(r.jsonAt(-1))).toEqual([]);
    });
});
