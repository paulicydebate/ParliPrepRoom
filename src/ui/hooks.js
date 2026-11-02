import { useEffect, useState } from 'react';
import { docsChanged, listDocs } from '../store/docs';
import { listVersions, versionsChanged } from '../store/versions';
export function useDocs() {
    const [docs, setDocs] = useState(null);
    useEffect(() => {
        let live = true;
        const load = () => void listDocs().then((d) => live && setDocs([...d]));
        load();
        const off = docsChanged.subscribe(load);
        return () => {
            live = false;
            off();
        };
    }, []);
    return docs;
}
export function useVersions(docId) {
    const [versions, setVersions] = useState(null);
    useEffect(() => {
        let live = true;
        const load = () => void listVersions(docId).then((v) => live && setVersions(v));
        load();
        const off = versionsChanged.subscribe(load);
        return () => {
            live = false;
            off();
        };
    }, [docId]);
    return versions;
}
