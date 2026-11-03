import { useRef, useState } from 'react';
import { useAccount } from '../store/account';
import { deleteEffect, moveDoc, renameDoc, setDocTeam, sortDocs, type DocKind, type DocMeta } from '../store/docs';
import { IconBook, IconDoc, IconGrip, IconPlus, IconUpload } from './icons';

const coarsePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

interface RowDrag {
  dropBefore: boolean;
  dragging: boolean;
  /** Finger- or mouse-friendly drag from the handle. */
  onHandleDown: (e: React.PointerEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function DocRow({
  doc,
  openHere,
  onOpen,
  onDelete,
  drag,
}: {
  doc: DocMeta;
  openHere: boolean;
  onOpen: () => void;
  onDelete: () => void;
  drag: RowDrag;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(doc.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { teams } = useAccount();
  const effect = deleteEffect(doc, !!doc.teamId && teams.some((t) => t.id === doc.teamId && t.role === 'coach'));

  if (editing) {
    return (
      <li>
        <input
          className="doc-rename"
          autoFocus
          value={value}
          aria-label="Rename document"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value.trim()) void renameDoc(doc.id, value.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setValue(doc.title);
              setEditing(false);
            }
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={'doc-row' + (openHere ? ' is-open' : '') + (drag.dropBefore ? ' drop-before' : '') + (drag.dragging ? ' is-dragging' : '')}
      data-doc-id={doc.id}
      data-kind={doc.kind}
      draggable={!coarsePointer}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
    >
      <button
        type="button"
        className="doc-link"
        onClick={(e) => (e.detail >= 2 ? setEditing(true) : onOpen())}
        title="Click to open, double-click to rename, drag to reorder"
      >
        {doc.kind === 'prep' ? <IconDoc /> : <IconBook />}
        <span>{doc.title}</span>
        {doc.round && <span className="round-dot" title="Round doc" />}
      </button>
      <span className="drag-handle" aria-hidden="true" title="Drag to reorder" onPointerDown={drag.onHandleDown}>
        <IconGrip />
      </span>
      <details className="doc-menu" onToggle={(e) => !(e.currentTarget as HTMLDetailsElement).open && setConfirmDelete(false)}>
        <summary aria-label={`More for ${doc.title}`}>⋯</summary>
        <div className="menu">
          <button
            type="button"
            onClick={(e) => {
              (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
              setValue(doc.title);
              setEditing(true);
            }}
          >
            Rename
          </button>
          {doc.teamId === null &&
            teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={(e) => {
                  (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                  void setDocTeam(doc.id, t.id);
                }}
              >
                Move to {t.name}
              </button>
            ))}
          {confirmDelete ? (
            <button
              type="button"
              className="danger strong"
              onClick={(e) => {
                (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                onDelete();
              }}
            >
              {effect.label}
            </button>
          ) : (
            <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
              Delete…
            </button>
          )}
          {confirmDelete && <p className="menu-note">{effect.note}</p>}
        </div>
      </details>
    </li>
  );
}

export function Sidebar({
  docs,
  spaceName,
  signedOutOnServer,
  openIds,
  onOpen,
  onCreate,
  onDelete,
  onImport,
  onReset,
  resetCount,
}: {
  docs: DocMeta[];
  /** Team (or "My own docs") whose docs are listed, when signed in. */
  spaceName: string | null;
  /** On the live site but not signed in: docs stay on this device. */
  signedOutOnServer: boolean;
  openIds: Set<string>;
  onOpen: (id: string) => void;
  onCreate: (kind: DocKind) => void;
  onDelete: (doc: DocMeta) => void;
  /** Import a file as a new reference doc (hidden when not allowed, e.g. Round Mode). */
  onImport?: (file: File) => void;
  /** One-step "start fresh": delete my docs in this list and close every window (hidden when not allowed). */
  onReset?: () => void;
  /** How many docs a reset would delete. */
  resetCount?: number;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ kind: DocKind; before: string | null } | null>(null);
  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  const commit = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId && drop) void moveDoc(dragId, drop.kind, drop.before);
    endDrag();
  };

  // Drag from the handle with pointer events, so it works on iPads and phones
  // (the browser's built-in drag and drop doesn't work with touch).
  const startHandleDrag = (doc: DocMeta, e: React.PointerEvent) => {
    e.preventDefault();
    const pointerId = e.pointerId;
    setDragId(doc.id);
    let target: { kind: DocKind; before: string | null } | null = null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const row = el?.closest('[data-doc-id]') as HTMLElement | null;
      const list = el?.closest('[data-doc-list]') as HTMLElement | null;
      if (row) {
        const box = row.getBoundingClientRect();
        const lower = ev.clientY > box.top + box.height / 2;
        const next = (row.nextElementSibling as HTMLElement | null)?.dataset.docId ?? null;
        target = { kind: row.dataset.kind as DocKind, before: lower ? next : row.dataset.docId! };
      } else if (list) {
        target = { kind: list.dataset.docList as DocKind, before: null };
      }
      setDrop(target);
    };
    const finish = (commitMove: boolean) => () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (commitMove && target) void moveDoc(doc.id, target.kind, target.before);
      endDrag();
    };
    const onUp = finish(true);
    const onCancel = finish(false);
    // Follow the finger anywhere on the page, not just over the handle.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const section = (kind: DocKind, title: string, hint: string) => {
    const list = sortDocs(docs.filter((d) => d.kind === kind));
    return (
      <div className="side-section">
        <div className="side-head">
          <h2>{title}</h2>
          <span className="side-head-btns">
            {kind === 'reference' && onImport && (
              <>
                <button
                  type="button"
                  className="icon-btn small"
                  title="Import a file as a reference doc: Word, Excel/CSV, text or Markdown (Google Docs/Sheets: File → Download first)"
                  aria-label="Import a file"
                  onClick={() => fileInput.current?.click()}
                >
                  <IconUpload />
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".docx,.xlsx,.csv,.txt,.md,.markdown"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImport(f);
                    e.target.value = '';
                  }}
                />
              </>
            )}
            <button type="button" className="icon-btn small" title={`New ${title.toLowerCase()} doc`} aria-label={`New ${title.toLowerCase()} doc`} onClick={() => onCreate(kind)}>
              <IconPlus />
            </button>
          </span>
        </div>
        <p className="side-hint">{hint}</p>
        <ul
          className={'doc-list' + (drop && drop.kind === kind && drop.before === null ? ' drop-end' : '')}
          data-doc-list={kind}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            if (e.target === e.currentTarget) setDrop({ kind, before: null });
          }}
          onDrop={commit}
        >
          {list.map((d, i) => (
            <DocRow
              key={d.id}
              doc={d}
              openHere={openIds.has(d.id)}
              onOpen={() => onOpen(d.id)}
              onDelete={() => onDelete(d)}
              drag={{
                onHandleDown: (e) => startHandleDrag(d, e),
                dragging: dragId === d.id,
                dropBefore: !!dragId && drop?.kind === kind && drop.before === d.id,
                onDragStart: (e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', d.title);
                  setDragId(d.id);
                },
                onDragOver: (e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const lowerHalf = e.clientY > box.top + box.height / 2;
                  setDrop({ kind, before: lowerHalf ? (list[i + 1]?.id ?? null) : d.id });
                },
                onDrop: commit,
                onDragEnd: endDrag,
              }}
            />
          ))}
        </ul>
      </div>
    );
  };

  return (
    <aside className="sidebar">
      {spaceName && <div className="space-name">{spaceName}</div>}
      {signedOutOnServer && (
        <p className="side-banner">Sign in (top right) to save docs to the server, share them with your partner and join your team. Until then, docs stay on this device.</p>
      )}
      {section('prep', 'Prep', 'What you type during prep.')}
      {section('reference', 'Reference', 'Coach briefs and notes to read from.')}
      {onReset && (
        <div className="side-reset">
          {confirmReset ? (
            <>
              <p className="small">
                Delete {resetCount ? `your ${resetCount} doc${resetCount === 1 ? '' : 's'}` : 'nothing (no docs of yours)'} here and close every window?
              </p>
              <div className="row-inline">
                <button type="button" className="btn ghost small" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn small danger-fill"
                  onClick={() => {
                    setConfirmReset(false);
                    onReset();
                  }}
                >
                  Yes, reset
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn ghost small" onClick={() => setConfirmReset(true)} title="Delete your docs in this list, close every window and clear your pins">
              Reset: start fresh
            </button>
          )}
        </div>
      )}
      <p className="side-foot">
        <a href="/privacy" target="_blank" rel="noreferrer">
          Privacy
        </a>
      </p>
    </aside>
  );
}
