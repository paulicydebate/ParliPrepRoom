import { useEffect, useRef, useState } from 'react';
import {
  refKey,
  type FlowRef,
} from './model';

// The small search box for cross-apply and extend.

export /** A small search box listing cells to point at (for cross-apply and extend). */
function RefPicker({ kind, x, y, candidates, onPick, onClose }: { kind: 'x' | 'e'; x: number; y: number; candidates: { ref: FlowRef; where: string; text: string }[]; onPick: (r: FlowRef) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const list = candidates.filter((c) => c.text.toLowerCase().includes(q.toLowerCase()) || c.where.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  // A click anywhere else closes it.
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) closeRef.current();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, []);
  return (
    <div className="f2-picker" ref={box} style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={q}
        placeholder={kind === 'x' ? 'Cross-apply an argument from another sheet…' : 'Extend an earlier argument…'}
        aria-label="Search cells"
        onChange={(e) => {
          setQ(e.target.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAt((a) => Math.min(list.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAt((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && list[at]) {
            e.preventDefault();
            onPick(list[at].ref);
          }
        }}
      />
      <div className="f2-picker-list" role="listbox">
        {list.length === 0 && <div className="f2-picker-empty">{candidates.length ? 'Nothing matches.' : kind === 'x' ? 'No other sheet has anything typed yet.' : 'Nothing earlier on this sheet yet.'}</div>}
        {list.map((c, i) => (
          <button key={refKey(c.ref)} type="button" role="option" aria-selected={i === at} className={i === at ? 'is-on' : ''} onMouseEnter={() => setAt(i)} onMouseDown={(e) => { e.preventDefault(); onPick(c.ref); }}>
            <span className="f2-picker-where">{c.where}</span> {c.text.slice(0, 80)}
          </button>
        ))}
      </div>
    </div>
  );
}

