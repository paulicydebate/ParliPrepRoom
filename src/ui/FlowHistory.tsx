import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { SheetPreview } from '../flow2/Flow2Canvas';
import { observeFlow, readFlow, type FlowSheetData } from '../flow2/model';
import type { FlowDiffRow } from '../history/flowDiff';
import { useFlowColors, useFlowTheme } from '../store/flowTheme';

// How a flow shows up in Version history, History and Replay: a cell-by-cell comparison, and a read-only picture of the flow.

/** A flow's sheets, now and as they change (for comparing against a saved version). */
export function useFlowSheets(doc: Y.Doc, on: boolean): FlowSheetData[] | null {
  const [sheets, setSheets] = useState<FlowSheetData[] | null>(() => (on ? readFlow(doc) : null));
  useEffect(() => {
    if (!on) return;
    const update = () => setSheets(readFlow(doc));
    update();
    return observeFlow(doc, update);
  }, [doc, on]);
  return sheets;
}

/** A flow drawn read-only: each sheet as a picture, in its colors. */
export function FlowSnapshotView({ sheets }: { sheets: FlowSheetData[] }) {
  const theme = useFlowTheme();
  const colors = useFlowColors();
  return (
    <div className="flow-wrap f2 f2-snapshot" data-flow-theme={theme} data-flow-colors={colors}>
      {sheets.length === 0 && <p className="muted">Nothing on the flow yet.</p>}
      {sheets.map((s) => (
        <div key={s.id} className="f2-snapshot-sheet">
          <SheetPreview sheet={s} />
        </div>
      ))}
    </div>
  );
}

export function FlowDiffLines({ rows, changesOnly }: { rows: FlowDiffRow[]; changesOnly: boolean }) {
  let lastSheet = '';
  return (
    <div className="flow-diff">
      {rows.map((r, i) => {
        if (r.type === 'same' && changesOnly) return null;
        const cell = r.type === 'changed' ? r.to : r.cell;
        const head =
          cell.sheetId !== lastSheet ? (
            <h4 key={`h${i}`} className="fd-sheet">
              {cell.sheet}
            </h4>
          ) : null;
        lastSheet = cell.sheetId;
        return (
          <div key={i}>
            {head}
            <div className={`fd-row fd-${r.type}`} style={{ paddingLeft: 10 + cell.depth * 18 }}>
              <span className="fd-where">{cell.speech}</span>
              {r.type === 'changed' ? (
                r.parts.map((p, j) => (p.added ? <ins key={j}>{p.value}</ins> : p.removed ? <del key={j}>{p.value}</del> : <span key={j}>{p.value}</span>))
              ) : (
                <span>{cell.text}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
