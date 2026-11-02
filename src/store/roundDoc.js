import { useEffect, useState } from 'react';
import { setDocRound } from './docs';
import { logEvent } from './typingLog';
import { saveVersion } from './versions';
// "Round doc" is stored inside the document (a Yjs map), so it travels with
// the doc when partners co-edit it, and turning it off is itself recorded.
const settings = (doc) => doc.getMap('settings');
export function isRound(doc) {
    return !!doc && settings(doc).get('round') === true;
}
export function setRound(doc, docId, on) {
    if (isRound(doc) === on)
        return;
    // A named version marks exactly what the doc held when the switch flipped.
    void saveVersion(docId, doc, { auto: false, name: on ? 'Round doc turned on' : 'Round doc turned off' });
    settings(doc).set('round', on);
    logEvent(docId, { k: on ? 'round-on' : 'round-off' });
    void setDocRound(docId, on);
}
export function useRound(doc) {
    const [round, setRoundState] = useState(() => isRound(doc));
    useEffect(() => {
        if (!doc)
            return;
        const map = settings(doc);
        const update = () => setRoundState(map.get('round') === true);
        update();
        map.observe(update);
        return () => map.unobserve(update);
    }, [doc]);
    return round;
}
