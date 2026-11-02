import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createDoc, deleteDoc, listDocs, type DocKind, type DocMeta } from '../store/docs';
import { acquireDoc, destroyDocData, flushAutoVersions, releaseDoc } from '../store/registry';
import { SAMPLE_PREP, SAMPLE_REFERENCE, STARTER_LINES, writeLines, type Line } from '../store/seed';
import { deleteAllVersions } from '../store/versions';
import { useDocs } from './hooks';
import { IconMenu, IconSettings, IconSplit } from './icons';
import { Pane, type PaneState } from './Pane';
import { SettingsDialog } from './SettingsDialog';
import { Sidebar } from './Sidebar';

const MAX_PANES = 3;
const LAYOUT_KEY = 'pp-layout-v1';

interface Layout {
  panes: PaneState[];
  weights: number[];
  focused: number;
  sidebar: boolean;
}

const paneKey = () => Math.random().toString(36).slice(2, 10);

function defaultLayout(): Layout {
  return { panes: [{ key: paneKey(), docId: null, outline: false }], weights: [1], focused: 0, sidebar: true };
}

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return defaultLayout();
    const l = JSON.parse(raw) as Layout;
    if (!Array.isArray(l.panes) || !l.panes.length) return defaultLayout();
    const panes = l.panes.slice(0, MAX_PANES);
    const weights = panes.map((_, i) => (Number(l.weights?.[i]) > 0 ? Number(l.weights[i]) : 1));
    return { panes, weights, focused: Math.min(l.focused ?? 0, panes.length - 1), sidebar: l.sidebar ?? true };
  } catch {
    return defaultLayout();
  }
}

async function makeDoc(title: string, kind: DocKind, lines: Line[]): Promise<DocMeta> {
  const meta = await createDoc({ title, kind });
  const { doc, ready } = acquireDoc(meta.id);
  await ready;
  writeLines(doc, lines);
  releaseDoc(meta.id);
  return meta;
}

/** First visit: add one sample reference doc and one sample prep doc, side by side. */
async function seedFirstRun(): Promise<Layout | null> {
  try {
    if (localStorage.getItem('pp-seeded')) {
      // Browsers that saw the first preview get the flow sample once.
      if (!localStorage.getItem('pp-seeded-flow')) {
        localStorage.setItem('pp-seeded-flow', '1');
        const flow = await makeDoc('Sample flow: facial recognition', 'prep', SAMPLE_PREP);
        return {
          panes: [
            { key: paneKey(), docId: flow.id, outline: false, view: 'doc' },
            { key: paneKey(), docId: flow.id, outline: false, view: 'flow' },
          ],
          weights: [1, 1.4],
          focused: 1,
          sidebar: true,
        };
      }
      return null;
    }
    localStorage.setItem('pp-seeded', '1');
    localStorage.setItem('pp-seeded-flow', '1');
  } catch {
    return null;
  }
  if ((await listDocs()).length) return null;
  const ref = await makeDoc('Sample brief: facial recognition', 'reference', SAMPLE_REFERENCE);
  const prep = await makeDoc('Sample prep: facial recognition', 'prep', SAMPLE_PREP);
  return {
    panes: [
      { key: paneKey(), docId: ref.id, outline: false },
      { key: paneKey(), docId: prep.id, outline: true },
    ],
    weights: [1, 1.25],
    focused: 1,
    sidebar: true,
  };
}

function useNarrow() {
  const query = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function App() {
  const docs = useDocs();
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      setToastMsg((e as CustomEvent<string>).detail);
      clearTimeout(t);
      t = setTimeout(() => setToastMsg(null), 3500);
    };
    window.addEventListener('pp-toast', on);
    return () => {
      window.removeEventListener('pp-toast', on);
      clearTimeout(t);
    };
  }, []);
  const narrow = useNarrow();
  const [sidebarOverlay, setSidebarOverlay] = useState(false);
  const panesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void seedFirstRun().then((l) => l && setLayout(l));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // ignore
    }
  }, [layout]);

  // Save a version when the tab is hidden or closed.
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === 'hidden') void flushAutoVersions();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const setPane = (i: number, p: PaneState) =>
    setLayout((l) => ({ ...l, panes: l.panes.map((x, j) => (j === i ? p : x)) }));

  const openInFocused = (docId: string) => {
    setLayout((l) => {
      const i = Math.min(l.focused, l.panes.length - 1);
      return { ...l, panes: l.panes.map((x, j) => (j === i ? { ...x, docId } : x)) };
    });
    setSidebarOverlay(false);
  };

  const addPane = () =>
    setLayout((l) => {
      if (l.panes.length >= MAX_PANES) return l;
      return {
        ...l,
        panes: [...l.panes, { key: paneKey(), docId: null, outline: false }],
        weights: [...l.weights, 1],
        focused: l.panes.length,
      };
    });

  const closePane = (i: number) =>
    setLayout((l) => {
      if (l.panes.length <= 1) return l;
      const panes = l.panes.filter((_, j) => j !== i);
      const weights = l.weights.filter((_, j) => j !== i);
      return { ...l, panes, weights, focused: Math.min(l.focused, panes.length - 1) };
    });

  const create = async (kind: DocKind, paneIndex?: number) => {
    const meta = await makeDoc(kind === 'prep' ? 'Untitled prep' : 'Untitled reference', kind, STARTER_LINES);
    if (paneIndex === undefined) openInFocused(meta.id);
    else setLayout((l) => ({ ...l, panes: l.panes.map((x, j) => (j === paneIndex ? { ...x, docId: meta.id } : x)) }));
  };

  const remove = async (doc: DocMeta) => {
    setLayout((l) => ({ ...l, panes: l.panes.map((p) => (p.docId === doc.id ? { ...p, docId: null } : p)) }));
    await deleteDoc(doc.id);
    await destroyDocData(doc.id);
    await deleteAllVersions(doc.id);
  };

  // Drag the divider between two panes to resize them.
  const startResize = useCallback((i: number, e: React.PointerEvent) => {
    const container = panesRef.current;
    if (!container) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>(':scope > .pane-slot'));
    const a = els[i];
    const b = els[i + 1];
    if (!a || !b) return;
    e.preventDefault();
    const startX = e.clientX;
    const wa = a.getBoundingClientRect().width;
    const wb = b.getBoundingClientRect().width;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const min = 280;
    const move = (ev: PointerEvent) => {
      const dx = Math.max(min - wa, Math.min(wb - min, ev.clientX - startX));
      setLayout((l) => {
        const total = l.weights[i] + l.weights[i + 1];
        const weights = [...l.weights];
        weights[i] = (total * (wa + dx)) / (wa + wb);
        weights[i + 1] = total - weights[i];
        return { ...l, weights };
      });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }, []);

  const showSidebar = narrow ? sidebarOverlay : layout.sidebar;
  const openIds = new Set(layout.panes.map((p) => p.docId).filter((x): x is string => !!x));

  return (
    <div className={'app' + (narrow ? ' is-narrow' : '')}>
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Toggle document list"
          title="Documents"
          onClick={() => (narrow ? setSidebarOverlay((s) => !s) : setLayout((l) => ({ ...l, sidebar: !l.sidebar })))}
        >
          <IconMenu />
        </button>
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={22} height={22} />
          <span>ParliPrepRoom</span>
        </div>
        {narrow && layout.panes.length > 1 && (
          <div className="seg pane-tabs" role="tablist" aria-label="Panes">
            {layout.panes.map((p, i) => (
              <button key={p.key} type="button" role="tab" aria-selected={i === layout.focused} className={i === layout.focused ? 'is-on' : ''} onClick={() => setLayout((l) => ({ ...l, focused: i }))}>
                {docs?.find((d) => d.id === p.docId)?.title ?? 'Empty'}
              </button>
            ))}
          </div>
        )}
        <span className="tb-spacer" />
        <button type="button" className="btn ghost" onClick={addPane} disabled={layout.panes.length >= MAX_PANES} title="Add a pane to show another document side by side">
          <IconSplit /> <span className="hide-narrow">Split view</span>
        </button>
        <button type="button" className="icon-btn" aria-label="Appearance" title="Fonts and theme" onClick={() => setSettingsOpen(true)}>
          <IconSettings />
        </button>
      </header>

      <div className="workspace">
        {showSidebar && docs && (
          <>
            {narrow && <div className="scrim" onClick={() => setSidebarOverlay(false)} />}
            <Sidebar docs={docs} openIds={openIds} onOpen={openInFocused} onCreate={(k) => void create(k)} onDelete={(d) => void remove(d)} />
          </>
        )}
        <div className="panes" ref={panesRef}>
          {docs &&
            layout.panes.map((p, i) => (
              <Fragment key={p.key}>
                {i > 0 && !narrow && (
                  <div className="resizer" role="separator" aria-orientation="vertical" aria-label="Resize panes" onPointerDown={(e) => startResize(i - 1, e)} />
                )}
                <div className="pane-slot" style={{ flexGrow: layout.weights[i] ?? 1 }} hidden={narrow && i !== layout.focused}>
                  <Pane
                    pane={p}
                    docs={docs}
                    focused={i === layout.focused && layout.panes.length > 1}
                    canClose={layout.panes.length > 1}
                    onFocus={() => layout.focused !== i && setLayout((l) => ({ ...l, focused: i }))}
                    onChange={(np) => setPane(i, np)}
                    onClose={() => closePane(i)}
                    onCreate={(k) => void create(k, i)}
                  />
                </div>
              </Fragment>
            ))}
        </div>
      </div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <div className="toast" role="status" aria-live="polite" hidden={!toastMsg}>
        {toastMsg}
      </div>
    </div>
  );
}
