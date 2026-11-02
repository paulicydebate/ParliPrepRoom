import { useState } from 'react';
import { useAccount } from '../store/account';
import { moveDoc, renameDoc, setDocTeam, sortDocs, type DocKind, type DocMeta } from '../store/docs';
import { IconBook, IconDoc, IconPlus } from './icons';

interface RowDrag {
  dropBefore: boolean;
  dragging: boolean;
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
      draggable
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
              Delete for good
            </button>
          ) : (
            <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
              Delete…
            </button>
          )}
          {confirmDelete && <p className="menu-note">Deletes the doc and its version history.</p>}
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
}) {
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

  const section = (kind: DocKind, title: string, hint: string) => {
    const list = sortDocs(docs.filter((d) => d.kind === kind));
    return (
      <div className="side-section">
        <div className="side-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn small" title={`New ${title.toLowerCase()} doc`} aria-label={`New ${title.toLowerCase()} doc`} onClick={() => onCreate(kind)}>
            <IconPlus />
          </button>
        </div>
        <p className="side-hint">{hint}</p>
        <ul
          className={'doc-list' + (drop && drop.kind === kind && drop.before === null ? ' drop-end' : '')}
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
      <p className="side-foot">
        <a href="/privacy" target="_blank" rel="noreferrer">
          Privacy
        </a>
      </p>
    </aside>
  );
}
