import { useEffect, useState } from 'react';
import { acquireDoc, releaseDoc } from '../store/registry';
/** Open a document for the lifetime of a component. */
export function useYDoc(docId) {
    const [open, setOpen] = useState(null);
    useEffect(() => {
        if (!docId) {
            setOpen(null);
            return;
        }
        let cancelled = false;
        const { doc, ready, provider } = acquireDoc(docId);
        setOpen(null);
        void ready.then(() => {
            if (!cancelled)
                setOpen({ doc, provider: provider() });
        });
        return () => {
            cancelled = true;
            releaseDoc(docId);
        };
    }, [docId]);
    return open;
}
