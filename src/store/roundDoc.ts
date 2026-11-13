import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { setDocRound } from './docs';
import { logEvent } from './typingLog';
import { saveVersion } from './versions';

// "Round doc" is stored inside the document (a Yjs map), so it travels with
// the doc when partners co-edit it, and turning it off is itself recorded.

const settings = (doc: Y.Doc) => doc.getMap('settings');

export function isRound(doc: Y.Doc | null | undefined): boolean {
  return !!doc && settings(doc).get('round') === true;
}

export function setRound(doc: Y.Doc, docId: string, on: boolean) {
  if (isRound(doc) === on) return;
  // A named version marks exactly what the doc held when the switch flipped.
  void saveVersion(docId, doc, { auto: false, name: on ? 'Round doc turned on' : 'Round doc turned off' });
  settings(doc).set('round', on);
  logEvent(docId, { k: on ? 'round-on' : 'round-off' });
  void setDocRound(docId, on);
}

export function useRound(doc: Y.Doc | null): boolean {
  const [round, setRoundState] = useState(() => isRound(doc));
  useEffect(() => {
    if (!doc) return;
    const map = settings(doc);
    const update = () => setRoundState(map.get('round') === true);
    update();
    map.observe(update);
    return () => map.unobserve(update);
  }, [doc]);
  return round;
}

/** The resolution typed in New round, kept in the document so partners see it (a flow has no note line to hold it). */
export function setResolution(doc: Y.Doc, text: string) {
  if (text) settings(doc).set('resolution', text.slice(0, 500));
}

export function useResolution(doc: Y.Doc | null): string {
  const [res, setRes] = useState(() => (doc ? String(settings(doc).get('resolution') ?? '') : ''));
  useEffect(() => {
    if (!doc) return setRes('');
    const map = settings(doc);
    const update = () => setRes(String(map.get('resolution') ?? ''));
    update();
    map.observe(update);
    return () => map.unobserve(update);
  }, [doc]);
  return res;
}
