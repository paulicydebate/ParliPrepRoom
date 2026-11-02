import { useState } from 'react';
import { renameDoc, type DocKind, type DocMeta } from '../store/docs';
import { IconBook, IconDoc, IconPlus } from './icons';

function DocRow({
  doc,
  openHere,
  onOpen,
  onDelete,
}: {
  doc: DocMeta;
  openHere: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(doc.title);

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
    <li className={'doc-row' + (openHere ? ' is-open' : '')}>
      <button type="button" className="doc-link" onClick={onOpen} onDoubleClick={() => setEditing(true)} title="Open (double-click to rename)">
        {doc.kind === 'prep' ? <IconDoc /> : <IconBook />}
        <span>{doc.title}</span>
      </button>
      <details className="doc-menu">
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
          <button
            type="button"
            className="danger"
            onClick={(e) => {
              (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </details>
    </li>
  );
}

export function Sidebar({
  docs,
  openIds,
  onOpen,
  onCreate,
  onDelete,
}: {
  docs: DocMeta[];
  openIds: Set<string>;
  onOpen: (id: string) => void;
  onCreate: (kind: DocKind) => void;
  onDelete: (doc: DocMeta) => void;
}) {
  const section = (kind: DocKind, title: string, hint: string) => {
    const list = docs.filter((d) => d.kind === kind).sort((a, b) => b.createdAt - a.createdAt);
    return (
      <div className="side-section">
        <div className="side-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn small" title={`New ${title.toLowerCase()} doc`} aria-label={`New ${title.toLowerCase()} doc`} onClick={() => onCreate(kind)}>
            <IconPlus />
          </button>
        </div>
        <p className="side-hint">{hint}</p>
        <ul>
          {list.map((d) => (
            <DocRow key={d.id} doc={d} openHere={openIds.has(d.id)} onOpen={() => onOpen(d.id)} onDelete={() => onDelete(d)} />
          ))}
        </ul>
      </div>
    );
  };

  return (
    <aside className="sidebar">
      {section('prep', 'Prep', 'What you type during prep.')}
      {section('reference', 'Reference', 'Coach briefs and notes to read from.')}
    </aside>
  );
}
