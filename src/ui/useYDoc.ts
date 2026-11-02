import { useEffect, useState } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { acquireDoc, releaseDoc } from '../store/registry';

export interface OpenDoc {
  doc: Y.Doc;
  /** Live server connection, or null offline / in the preview. */
  provider: WebsocketProvider | null;
}

/** Open a document for the lifetime of a component. */
export function useYDoc(docId: string | null): OpenDoc | null {
  const [open, setOpen] = useState<OpenDoc | null>(null);
  useEffect(() => {
    if (!docId) {
      setOpen(null);
      return;
    }
    let cancelled = false;
    const { doc, ready, provider } = acquireDoc(docId);
    setOpen(null);
    void ready.then(() => {
      if (!cancelled) setOpen({ doc, provider: provider() });
    });
    return () => {
      cancelled = true;
      releaseDoc(docId);
    };
  }, [docId]);
  return open;
}
