import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BODY_FIELD } from '../editor/extensions';
import { blockWithChildren, outlineEntries } from '../model/outline';
import { acquireDoc, releaseDoc } from '../store/registry';
/** At most this many docs are kept open for searching and pins. */
const MAX_DOCS = 40;
export function useLibrary(docIds, active) {
    const [index, setIndex] = useState(new Map());
    const jsonRef = useRef(new Map());
    const key = docIds.slice(0, MAX_DOCS).join(',');
    useEffect(() => {
        if (!active)
            return;
        const ids = key ? key.split(',') : [];
        const cleanups = [];
        let live = true;
        for (const id of ids) {
            const { doc, ready } = acquireDoc(id);
            let timer = null;
            const rebuild = () => {
                if (!live)
                    return;
                const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(BODY_FIELD));
                jsonRef.current.set(id, json);
                const entries = outlineEntries(json);
                setIndex((prev) => new Map(prev).set(id, entries));
            };
            const onUpdate = () => {
                if (timer)
                    clearTimeout(timer);
                timer = setTimeout(rebuild, 400);
            };
            void ready.then(() => {
                rebuild();
                doc.on('update', onUpdate);
            });
            cleanups.push(() => {
                if (timer)
                    clearTimeout(timer);
                doc.off('update', onUpdate);
                releaseDoc(id);
            });
        }
        // Forget docs no longer in the list.
        setIndex((prev) => new Map([...prev].filter(([id]) => ids.includes(id))));
        return () => {
            live = false;
            for (const c of cleanups)
                c();
        };
    }, [key, active]);
    const blockContent = useCallback((docId, blockId) => {
        const json = jsonRef.current.get(docId);
        const entries = index.get(docId);
        if (!json?.content || !entries)
            return [];
        return blockWithChildren(entries, blockId).map((e) => json.content[e.index]);
    }, [index]);
    return { index, blockContent };
}
