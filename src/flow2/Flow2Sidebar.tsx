import { useEffect, useRef, useState } from 'react';
import { ColorsButton } from './ColorsDialog';
import { IconChevronDown, IconChevronRight, IconMaximize, IconPlus, IconRestore, IconSidebar } from '../ui/icons';
import type { FlowSheetData } from './model';

// The list of sheets, down the left of the flow: grouped by side, a row per sheet with its color dot and
// a menu (rename, minimize, maximize, delete), a + to add a sheet, and an edge you drag to resize it.
// The arrangement and look follow Flowist's sheet sidebar (by Elli; used with permission).

const MIN_W = 176;
const MAX_W = 256;
const DEFAULT_W = 224;

function readWidth(): number {
  try {
    const n = Number(localStorage.getItem('pp-flow2-side-w'));
    return n >= MIN_W && n <= MAX_W ? n : DEFAULT_W;
  } catch {
    return DEFAULT_W;
  }
}

export function Flow2Sidebar({
  sheets,
  activeId,
  maximizedId,
  collapsed,
  onGo,
  onAdd,
  onRename,
  blockPaste,
  resolution,
  onDelete,
  onToggleCollapse,
  onToggleMaximize,
  onClose,
}: {
  sheets: FlowSheetData[];
  activeId: string;
  maximizedId: string | null;
  collapsed: ReadonlySet<string>;
  onGo: (id: string) => void;
  onAdd: (side: 'gov' | 'opp') => void;
  onRename: (id: string, name: string) => void;
  /** True while pasting a name is not allowed (a round doc). */
  blockPaste?: () => boolean;
  /** The round's resolution, shown above the sheets. */
  resolution?: string;
  onDelete: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onToggleMaximize: (id: string) => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(readWidth);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const aside = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.f2-side-menu, .f2-side-more')) setMenu(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [menu]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    let last = w0;
    const move = (ev: PointerEvent) => {
      last = Math.max(MIN_W, Math.min(MAX_W, w0 + ev.clientX - x0));
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      try {
        localStorage.setItem('pp-flow2-side-w', String(Math.round(last)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const group = (side: 'gov' | 'opp', label: string) => {
    const rows = sheets.filter((s) => s.side === side);
    return (
      <section className="f2-side-group" key={side}>
        <div className="f2-side-heading">
          <span>{label}</span>
          <button type="button" className="icon-btn small" aria-label={`New ${label} sheet`} title={`New ${label} sheet`} onClick={() => onAdd(side)}>
            <IconPlus />
          </button>
        </div>
        <ul>
          {rows.map((s) => (
            <li key={s.id} className={`f2-side-row fl-${s.side}` + (s.id === activeId ? ' is-active' : '') + (collapsed.has(s.id) ? ' is-collapsed' : '')}>
              {renaming === s.id ? (
                <input
                  className="f2-side-rename"
                  autoFocus
                  defaultValue={s.name}
                  aria-label="Sheet name"
                  maxLength={80}
                  onPaste={(e) => blockPaste?.() && e.preventDefault()}
                  onDrop={(e) => blockPaste?.() && e.preventDefault()}
                  onBlur={(e) => {
                    onRename(s.id, e.target.value.trim());
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button type="button" className="f2-side-go" title={`${s.name || 'Untitled'} (double-click to rename)`} onClick={(e) => (e.detail >= 2 ? setRenaming(s.id) : onGo(s.id))}>
                  <span className="f2-side-dot" />
                  <span className="f2-side-name">{s.name || 'Untitled'}</span>
                  {s.id === maximizedId && <span className="f2-side-flag">full</span>}
                  {collapsed.has(s.id) && <span className="f2-side-flag">min</span>}
                </button>
              )}
              <button type="button" className="f2-side-more icon-btn small" aria-label={`Options for ${s.name || 'Untitled'}`} aria-haspopup="menu" onClick={() => setMenu(menu === s.id ? null : s.id)}>
                ⋮
              </button>
              {menu === s.id && (
                <div
                  className="f2-side-menu"
                  role="menu"
                  ref={(el) => {
                    // Opening the menu puts the keyboard on its first item.
                    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
                  }}
                  onKeyDown={(e) => {
                    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
                    const i = items.indexOf(document.activeElement as HTMLButtonElement);
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setMenu(null);
                      e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('.f2-side-more')?.focus();
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
                    }
                  }}
                >
                  <button type="button" role="menuitem" onClick={() => (setMenu(null), setRenaming(s.id))}>
                    Rename
                  </button>
                  <button type="button" role="menuitem" disabled={maximizedId === s.id} onClick={() => (setMenu(null), onToggleCollapse(s.id))}>
                    {collapsed.has(s.id) ? 'Show full sheet' : 'Minimize'}
                  </button>
                  <button type="button" role="menuitem" onClick={() => (setMenu(null), onToggleMaximize(s.id))}>
                    {maximizedId === s.id ? 'Restore' : 'Maximize'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    disabled={sheets.length < 2}
                    onClick={() => {
                      if (confirm !== s.id && s.cells.some((c) => c.text.trim())) return setConfirm(s.id);
                      setMenu(null);
                      setConfirm(null);
                      onDelete(s.id);
                    }}
                  >
                    {confirm === s.id ? 'Delete it and its text?' : 'Delete'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <aside className="f2-side" ref={aside} style={{ width }} aria-label="Sheets">
      <div className="f2-side-top">
        <span className="f2-side-title">Sheets</span>
        <button type="button" className="icon-btn small" aria-label="Hide the sheet list" title="Hide the sheet list" onClick={onClose}>
          <IconSidebar />
        </button>
      </div>
      {resolution && (
        <p className="f2-side-res" title={resolution}>
          {resolution}
        </p>
      )}
      <nav className="f2-side-scroll">
        {group('gov', 'Gov')}
        {group('opp', 'Opp')}
      </nav>
      <div className="f2-side-foot">
        <ColorsButton />
        <button type="button" className="btn ghost small" title="Make the flow fill the screen (hides the doc list and other windows)" onClick={() => window.dispatchEvent(new Event('pp-toggle-focus'))}>
          Fill screen
        </button>
      </div>
      <div
        className="f2-side-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the sheet list"
        aria-valuemin={MIN_W}
        aria-valuemax={MAX_W}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={(e) => {
          // Left and right arrows resize it from the keyboard.
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const next = Math.max(MIN_W, Math.min(MAX_W, width + (e.key === 'ArrowRight' ? 16 : -16)));
          setWidth(next);
          try {
            localStorage.setItem('pp-flow2-side-w', String(next));
          } catch {
            /* ignore */
          }
        }}
      />
    </aside>
  );
}

export { IconChevronDown, IconChevronRight, IconMaximize, IconRestore };
