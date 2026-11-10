import { useEffect } from 'react';
import { blockWithChildren } from '../model/outline';
import { setPinColumnOpen, useLibraryView } from '../store/flowPins';
import { usePins } from '../store/pins';

// The pins column inside a flow: the blocks pinned for this sheet (pins whose sheet name matches), read-only,
// kept current. Tap one to open it in another window beside the flow. Placement beside a speech column
// follows the old flow's pins column; the idea of a column that sits in the grid is Flowist's.

export function PinColumn({ space, sheetName, hostKey, roundMode }: { space: string; sheetName: string; hostKey: string; roundMode: boolean }) {
  const pins = usePins(space);
  const { docs, index } = useLibraryView();
  // While a pins column is showing, the app keeps the prep docs indexed.
  useEffect(() => {
    setPinColumnOpen(hostKey, true);
    return () => setPinColumnOpen(hostKey, false);
  }, [hostKey]);
  const mine = pins.filter((p) => p.group && p.group.trim().toLowerCase() === sheetName.trim().toLowerCase());
  const open = (docId: string, blockId: string) => window.dispatchEvent(new CustomEvent('pp-jump', { detail: { docId, blockId } }));
  return (
    <div className="f2-pins" role="region" aria-label={`Pinned blocks for ${sheetName || 'this sheet'}`}>
      {mine.length === 0 && (
        <p className="muted small f2-pins-empty">
          Nothing pinned for “{sheetName || 'this sheet'}” yet. Pin a block from search (Ctrl/⌘+K) or the pin board, and pick this sheet for it.
          {roundMode ? ' In Round Mode only round docs show here.' : ''}
        </p>
      )}
      {mine.map((p) => {
        const doc = docs.find((d) => d.id === p.docId);
        const entries = index.get(p.docId);
        const blocks = entries ? blockWithChildren(entries, p.blockId) : [];
        return (
          <button key={`${p.docId}:${p.blockId}`} type="button" className="f2-pin" title="Open this block beside the flow" onClick={() => open(p.docId, p.blockId)}>
            <span className="f2-pin-path muted small">{doc ? [doc.title, ...(blocks[0]?.path ?? [])].join(' › ') : 'Not available here'}</span>
            {!entries && doc && <span className="muted small">Loading…</span>}
            {entries && blocks.length === 0 && <span className="muted small">This block was deleted.</span>}
            {blocks.map((b) => (
              <span key={b.id} className="f2-pin-block" data-kind={b.kind}>
                {b.text || ' '}
              </span>
            ))}
          </button>
        );
      })}
    </div>
  );
}
