import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { strToU8, zipSync } from 'fflate';
import * as Y from 'yjs';
import { BODY_FIELD, schema } from '../editor/extensions';
import { docState, listServerDocs } from '../store/account';
import { buildDocx } from './docx';
import { buildFlowXlsx } from './xlsx';
import { safeFilename } from './runs';

/**
 * Download every doc the user can see in a team (or in "My own docs") in one
 * .zip: docs as Word files and flows as Excel files, a backup that doesn't
 * depend on the server.
 */
export async function buildTeamZip(space: string, teamName: string, onProgress?: (done: number, total: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const docs = await listServerDocs(space);
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  let done = 0;
  for (const d of docs) {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, await docState(d.id));
    const json = yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(BODY_FIELD));
    ydoc.destroy();
    const node = schema.nodeFromJSON(json.content?.length ? json : { type: 'doc', content: [{ type: 'block', attrs: { kind: 'warrant' } }] });
    const flow = d.format === 'flow';
    const folder = d.kind === 'reference' ? 'Reference' : d.round ? 'Round docs' : 'Prep';
    const ext = flow ? 'xlsx' : 'docx';
    const suffix = flow ? ' flow' : '';
    let name = `${folder}/${safeFilename(d.title)}${suffix}.${ext}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${folder}/${safeFilename(d.title)}${suffix} (${i}).${ext}`;
    used.add(name.toLowerCase());
    const bytes = flow ? new Uint8Array(buildFlowXlsx(node)) : new Uint8Array(await (await buildDocx(node, d.title)).arrayBuffer());
    files[name] = bytes;
    onProgress?.(++done, docs.length);
  }
  files['README.txt'] = strToU8(
    `ParliPrepRoom backup of ${teamName}\nMade ${new Date().toLocaleString()}\n${docs.length} docs: docs as Word files, flows as Excel files.\nRound-doc typing records stay on the server; open each doc's check page to see them.\n`,
  );
  return zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>;
}
