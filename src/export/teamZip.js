import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { strToU8, zipSync } from 'fflate';
import * as Y from 'yjs';
import { BODY_FIELD, schema } from '../editor/extensions';
import { docState, listServerDocs } from '../store/account';
import { buildDocx } from './docx';
import { safeFilename } from './runs';
/**
 * Download every doc the user can see in a team (or in "My own docs") as Word
 * files in one .zip: a backup that doesn't depend on the server.
 */
export async function buildTeamZip(space, teamName, onProgress) {
    const docs = await listServerDocs(space);
    const files = {};
    const used = new Set();
    let done = 0;
    for (const d of docs) {
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, await docState(d.id));
        const json = yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(BODY_FIELD));
        ydoc.destroy();
        const node = schema.nodeFromJSON(json.content?.length ? json : { type: 'doc', content: [{ type: 'block', attrs: { kind: 'warrant' } }] });
        const blob = await buildDocx(node, d.title);
        const folder = d.kind === 'reference' ? 'Reference' : d.round ? 'Round docs' : 'Prep';
        let name = `${folder}/${safeFilename(d.title)}.docx`;
        for (let i = 2; used.has(name.toLowerCase()); i++)
            name = `${folder}/${safeFilename(d.title)} (${i}).docx`;
        used.add(name.toLowerCase());
        files[name] = new Uint8Array(await blob.arrayBuffer());
        onProgress?.(++done, docs.length);
    }
    files['README.txt'] = strToU8(`ParliPrepRoom backup of ${teamName}\nMade ${new Date().toLocaleString()}\n${docs.length} docs, as Word files.\nRound-doc typing records stay on the server; open each doc's check page to see them.\n`);
    return zipSync(files, { level: 6 });
}
