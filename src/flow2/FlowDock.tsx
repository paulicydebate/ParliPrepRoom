import type * as Y from 'yjs';
import { IconGroup, IconRedo, IconThread, IconUndo, IconUnlink } from '../ui/icons';
import { FLOW_MARKS, type FlowMark } from './model';
import type { Dock } from './Flow2Editor';

// The toolbar along the bottom of the flow: undo and redo; mark an argument (extended, dropped, answered, key);
// link answers to an argument and unlink; extend or cross-apply; group. It acts on the sheet you are working in.
// The arrangement, a floating dock of icon buttons in groups, follows Flowist's toolbar (by Elli; used with permission).

const MARK_GLYPH: Record<FlowMark, string> = { extended: '→', dropped: '!', answered: '✓', key: '★' };
const MARK_TITLE: Record<FlowMark, string> = {
  extended: 'Extended: you carried this argument forward',
  dropped: 'Dropped: the other side did not answer this',
  answered: 'Answered: this argument has been dealt with',
  key: 'Key argument',
};

export function FlowDock({ dock, undo }: { dock: Dock | null; undo: Y.UndoManager }) {
  const f = dock?.flags;
  const a = dock?.api;
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the caret in the cell
  const btn = (label: string, title: string, on: boolean | undefined, enabled: boolean, click: () => void, children: React.ReactNode, extra = '') => (
    <button type="button" className={'f2-dock-btn' + (on ? ' is-on' : '') + extra} aria-label={label} aria-pressed={on === undefined ? undefined : on} title={title} disabled={!enabled} onMouseDown={keep} onClick={click}>
      {children}
    </button>
  );
  const mod = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
  return (
    <div className="f2-dock" role="toolbar" aria-label="Flow tools" onMouseDown={(e) => e.stopPropagation()}>
      {btn('Undo', `Undo (${mod}+Z)`, undefined, true, () => undo.undo(), <IconUndo />)}
      {btn('Redo', `Redo (${mod}+Shift+Z)`, undefined, true, () => undo.redo(), <IconRedo />)}
      <span className="f2-dock-sep" />
      {FLOW_MARKS.map((m) => btn(MARK_TITLE[m].split(':')[0], MARK_TITLE[m] + ' (click again to clear)', f?.mark === m, !!f?.canMark, () => a?.mark(m), <span className="f2-dock-glyph">{MARK_GLYPH[m]}</span>, ` mark-${m}`))}
      <span className="f2-dock-sep" />
      {btn(f?.linking ? 'Cancel link' : 'Link', `Link the selected cells to the argument they answer (${mod}+Shift+L)`, !!f?.linking, !!f?.canLink || !!f?.linking, () => a?.link(), <IconThread />)}
      {btn('Unlink', 'Unlink this cell from the argument it answers', undefined, !!f?.canUnlink && !f?.linking, () => a?.unlink(), <IconUnlink />)}
      <span className="f2-dock-sep" />
      {btn('Extend', `Extend an earlier argument on this sheet (${mod}+Shift+E)`, undefined, !!f?.canRef, () => a?.ref('e'), <span className="f2-dock-glyph">↺</span>)}
      {btn('Cross-apply', `Apply an argument from another sheet here (${mod}+Shift+X)`, undefined, !!f?.canRef, () => a?.ref('x'), <span className="f2-dock-glyph">↗</span>)}
      <span className="f2-dock-sep" />
      {btn('Group', `Draw the selected cells as one framed block (${mod}+G)`, undefined, !!f?.canGroup, () => a?.group(), <IconGroup />)}
      {f?.canUngroup && !f.canGroup && btn('Ungroup', `Take this cell out of its group (${mod}+Shift+G)`, undefined, true, () => a?.ungroup(), <span className="f2-dock-glyph">⊟</span>)}
      {f?.linking && <span className="f2-dock-hint">Click the argument these answer. Esc cancels.</span>}
    </div>
  );
}
