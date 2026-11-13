import { useState } from 'react';
import * as Y from 'yjs';
import { recordEdit, toast } from '../editor/roundGuard';
import { isRound } from '../store/roundDoc';
import { IconChevronDown, IconMaximize, IconRestore, IconSnap } from '../ui/icons';
import {
  renameSheet,
  setSheetSide,
  type FlowSheetData,
} from './model';

// A sheet window's title bar on the canvas: name (double-click to rename), side, snap, minimize and maximize.

export /** A sheet's title bar: drag it to move the sheet; name, side, Link and the minimize and maximize buttons live here. */
function WindowBar({ doc, docId, sheet, onSnap, onCollapse, onMaximize, onRestore }: { doc: Y.Doc; docId?: string; sheet: FlowSheetData; onSnap?: () => void; onCollapse?: () => void; onMaximize?: () => void; onRestore?: () => void }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={`f2-window-bar fl-${sheet.side}`} data-window-handle onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('.f2-window-bar') === e.currentTarget && !(e.target as HTMLElement).closest('button, input, select, .f2-window-name')) (onRestore ?? onMaximize)?.(); }}>
      <span className="sheet-dot" />
      {renaming ? (
        <input
          className="sheet-rename"
          autoFocus
          defaultValue={sheet.name}
          aria-label="Sheet name"
          maxLength={80}
          onPaste={(e) => isRound(doc) && (e.preventDefault(), toast('Paste is off in round docs. Type it in.'))}
          onDrop={(e) => isRound(doc) && e.preventDefault()}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name !== sheet.name) {
              renameSheet(doc, sheet.id, name);
              // Sheet names are typed text too: in a round doc they go in the typing log.
              if (docId && isRound(doc)) recordEdit(docId, name, sheet.name);
            }
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span className="f2-window-name" onDoubleClick={() => setRenaming(true)} title="Drag to move this sheet; double-click the name to rename">
          {sheet.name || 'Untitled'}
        </span>
      )}
      <select className="f2-window-side" value={sheet.side} disabled={sheet.cells.length > 0} aria-label="Side of this sheet" title="Whose sheet this is (can only change while the sheet is empty)" onChange={(e) => setSheetSide(doc, sheet.id, e.target.value as 'gov' | 'opp')}>
        <option value="gov">Gov</option>
        <option value="opp">Opp</option>
      </select>
      <span className="tb-spacer" />
      {onSnap && (
        <button type="button" className="icon-btn small" aria-label={`Move ${sheet.name || 'Untitled'} back to the top-left`} title="Snap this sheet back to the top-left of the canvas" onClick={onSnap}>
          <IconSnap />
        </button>
      )}
      {onCollapse && (
        <button type="button" className="icon-btn small" aria-label={`Minimize ${sheet.name || 'Untitled'}`} title="Minimize this sheet to its title bar" onClick={onCollapse}>
          <IconChevronDown />
        </button>
      )}
      {onMaximize && (
        <button type="button" className="icon-btn small" aria-label={`Maximize ${sheet.name || 'Untitled'}`} title="Fill the whole view with this sheet" onClick={onMaximize}>
          <IconMaximize />
        </button>
      )}
      {onRestore && (
        <button type="button" className="icon-btn small" aria-label={`Restore ${sheet.name || 'Untitled'}`} title="Back to the canvas" onClick={onRestore}>
          <IconRestore />
        </button>
      )}
    </div>
  );
}

// ---------- One cell ----------

