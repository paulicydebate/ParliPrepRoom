import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { acquireDoc, releaseDoc } from '../store/registry';

/** Open a document for the lifetime of a component. */
export function useYDoc(docId: string | null): Y.Doc | null {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  useEffect(() => {
    if (!docId) {
      setDoc(null);
      return;
    }
    let cancelled = false;
    const { doc: ydoc, ready } = acquireDoc(docId);
    setDoc(null);
    void ready.then(() => {
      if (!cancelled) setDoc(ydoc);
    });
    return () => {
      cancelled = true;
      releaseDoc(docId);
    };
  }, [docId]);
  return doc;
}
