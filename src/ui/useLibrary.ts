import type { JSONContent } from '@tiptap/core';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { useEffect, useState } from 'react';
import { BODY_FIELD } from '../editor/extensions';
import { outlineEntries, type OutlineEntry } from '../model/outline';
import { acquireDoc, releaseDoc } from '../store/registry';

/** At most this many docs are kept open for searching and pins. */
const MAX_DOCS = 40;

/**
 * Keep a set of docs open and indexed for the block finder and pin board.
 * Updates live as anyone types in them.
 */
export function useLibrary(docIds: string[], active: boolean): Map<string, OutlineEntry[]> {
  const [index, setIndex] = useState<Map<string, OutlineEntry[]>>(new Map());
  const key = docIds.slice(0, MAX_DOCS).join(',');

  useEffect(() => {
    if (!active) return;
    const ids = key ? key.split(',') : [];
    const cleanups: (() => void)[] = [];
    let live = true;
    for (const id of ids) {
      const { doc, ready } = acquireDoc(id);
      let timer: ReturnType<typeof setTimeout> | null = null;
      const rebuild = () => {
        if (!live) return;
        const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(BODY_FIELD)) as JSONContent;
        const entries = outlineEntries(json);
        setIndex((prev) => new Map(prev).set(id, entries));
      };
      const onUpdate = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(rebuild, 400);
      };
      void ready.then(() => {
        rebuild();
        doc.on('update', onUpdate);
      });
      cleanups.push(() => {
        if (timer) clearTimeout(timer);
        doc.off('update', onUpdate);
        releaseDoc(id);
      });
    }
    // Forget docs no longer in the list.
    setIndex((prev) => new Map([...prev].filter(([id]) => ids.includes(id))));
    return () => {
      live = false;
      for (const c of cleanups) c();
    };
  }, [key, active]);

  return index;
}
