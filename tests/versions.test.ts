import { describe, expect, it } from 'vitest';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { BODY_FIELD } from '../src/editor/extensions';
import { flattenDoc } from '../src/history/diff';
import { writeLines } from '../src/store/seed';
import { listVersions, loadVersionDoc, renameVersion, saveVersion, deleteAllVersions } from '../src/store/versions';

function textOf(doc: Y.Doc) {
  return flattenDoc(yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(BODY_FIELD)) as never).map((b) => b.text);
}

describe('revision history', () => {
  it('skips auto-saves of an empty doc and of unchanged content', async () => {
    const doc = new Y.Doc();
    expect(await saveVersion('d1', doc, { auto: true })).toBeNull();
    writeLines(doc, [['claim', 'First']]);
    expect(await saveVersion('d1', doc, { auto: true })).not.toBeNull();
    expect(await saveVersion('d1', doc, { auto: true })).toBeNull();
    expect(await listVersions('d1')).toHaveLength(1);
  });

  it('always keeps named versions, newest first, and restores their content', async () => {
    const doc = new Y.Doc();
    writeLines(doc, [['claim', 'Version A']]);
    const a = await saveVersion('d2', doc, { auto: false, name: 'Before tournament' });
    const frag = doc.getXmlFragment(BODY_FIELD);
    frag.delete(0, frag.length);
    writeLines(doc, [['claim', 'Version B']]);
    await new Promise((r) => setTimeout(r, 2));
    await saveVersion('d2', doc, { auto: false, name: 'After' });

    const list = await listVersions('d2');
    expect(list.map((v) => v.name)).toEqual(['After', 'Before tournament']);

    const old = await loadVersionDoc(a!.id);
    expect(textOf(old!)).toEqual(['Version A']);
    expect(textOf(doc)).toEqual(['Version B']);
  });

  it('renames and deletes', async () => {
    const doc = new Y.Doc();
    writeLines(doc, [['claim', 'x']]);
    const v = await saveVersion('d3', doc, { auto: true });
    await renameVersion('d3', v!.id, 'Coach edits');
    const [renamed] = await listVersions('d3');
    expect(renamed.name).toBe('Coach edits');
    expect(renamed.auto).toBe(false);
    await deleteAllVersions('d3');
    expect(await listVersions('d3')).toEqual([]);
    expect(await loadVersionDoc(v!.id)).toBeNull();
  });

  it('does not lose entries when saves overlap', async () => {
    const docs = Array.from({ length: 5 }, (_, i) => {
      const d = new Y.Doc();
      writeLines(d, [['claim', `n${i}`]]);
      return d;
    });
    await Promise.all(docs.map((d, i) => saveVersion('d4', d, { auto: false, name: `v${i}` })));
    expect(await listVersions('d4')).toHaveLength(5);
  });
});

import { createDoc, listDocs, moveDoc, resetDocsCache, sortDocs } from '../src/store/docs';

describe('sidebar order', () => {
  it('drags a doc above another, into the other section, and new docs land on top', async () => {
    resetDocsCache();
    const a = await createDoc({ title: 'A', kind: 'prep' });
    await new Promise((r) => setTimeout(r, 2));
    const b = await createDoc({ title: 'B', kind: 'prep' });
    await new Promise((r) => setTimeout(r, 2));
    const c = await createDoc({ title: 'C', kind: 'prep' });
    const titles = async (kind: string) => sortDocs((await listDocs()).filter((d) => d.kind === kind)).map((d) => d.title);
    expect(await titles('prep')).toEqual(['C', 'B', 'A']);
    await moveDoc(a.id, 'prep', c.id);
    expect(await titles('prep')).toEqual(['A', 'C', 'B']);
    await moveDoc(c.id, 'reference', null);
    expect(await titles('prep')).toEqual(['A', 'B']);
    expect(await titles('reference')).toEqual(['C']);
    await createDoc({ title: 'D', kind: 'prep' });
    expect(await titles('prep')).toEqual(['D', 'A', 'B']);
    void b;
  });
});
