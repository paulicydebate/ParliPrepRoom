import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { measureUpdate } from '../worker/measure';
/** Record each local change as its own update, like the server receives them. */
function recorder(doc) {
    const updates = [];
    doc.on('update', (u) => updates.push(u));
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
        const chars = new Map();
        const out = updates.map((u) => measureUpdate(u, chars));
        expect(out[0].text).toBe('The plan bans police use');
        expect(out[1].deletedText).toBe('plan ');
        expect(out[2].text).toBe('policy ');
        expect(out[3].deletedText).toBe('use');
    });
    it('two people: deletions of a partner’s text are attributed to the right characters', () => {
        const a = new Y.Doc();
        const b = new Y.Doc();
        const updates = [];
        a.on('update', (u, origin) => {
            if (origin === 'remote')
                return;
            updates.push(u);
            Y.applyUpdate(b, u, 'remote');
        });
        b.on('update', (u, origin) => {
            if (origin === 'remote')
                return;
            updates.push(u);
            Y.applyUpdate(a, u, 'remote');
        });
        a.getText('t').insert(0, 'Alice wrote this.');
        b.getText('t').delete(6, 5); // Bob removes "wrote"
        const chars = new Map();
        const out = updates.map((u) => measureUpdate(u, chars));
        expect(out.map((o) => o.deletedText).filter(Boolean)).toEqual(['wrote']);
    });
});
