import { useEffect, useState } from 'react';
import { docsChanged, listDocs, type DocMeta } from '../store/docs';
import { listVersions, versionsChanged, type VersionMeta } from '../store/versions';

export function useDocs(): DocMeta[] | null {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
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

export function useVersions(docId: string): VersionMeta[] | null {
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
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
