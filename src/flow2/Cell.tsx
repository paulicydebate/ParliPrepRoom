import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { recordEdit, toast } from '../editor/roundGuard';
import { isRound } from '../store/roundDoc';
import { logEvent } from '../store/typingLog';
import {
  refKey,
  sheetsMap,
  yCells,
  yText,
  type FlowCell,
  type FlowMark,
  type FlowRef,
} from './model';
import { caretCoords, selectionRects } from './caret';
import { bindText } from './textBinding';
import { MARK_GLYPH, MARK_LABEL, type Peer } from './flowHooks';
import type { Focus } from './SheetView';

// One cell: an auto-growing text box bound to the cell's shared text, its mark, links to other cells, and partners' carets.
// The look and the cell-per-text-box idea are adapted from Flowist (by Elli, used with permission).

export function Cell({
  doc,
  sheetId,
  cell,
  x,
  w,
  hidden,
  y,
  side,
  measured,
  lit,
  picked,
  docId,
  peers,
  onBlur,
  onCaret,
  mark,
  refs,
  onRefClick,
  onRefRemove,
  onHover,
  inGroup,
  linkingFrom,
  linkable,
  want,
  onHeight,
  onFocus,
  onKeyDown,
  onMouseDown,
}: {
  doc: Y.Doc;
  sheetId: string;
  cell: FlowCell;
  x: number;
  w: number;
  hidden?: boolean;
  y: number;
  side: 'gov' | 'opp';
  measured: boolean;
  lit: boolean;
  picked: boolean;
  docId: string;
  peers: Peer[];
  onBlur: () => void;
  /** The caret moved to this character (shared with partners). */
  onCaret: (at: number, end: number) => void;
  mark: FlowMark | null;
  refs: (FlowRef & { text: string; missing: boolean })[];
  onRefClick: (r: FlowRef) => void;
  onRefRemove: (r: FlowRef) => void;
  onHover: (on: boolean) => void;
  inGroup: boolean;
  linkingFrom: boolean;
  linkable: boolean;
  want: React.MutableRefObject<Focus | null>;
  onHeight: (id: string, h: number) => void;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, c: FlowCell) => void;
  onMouseDown: (e: React.MouseEvent, c: FlowCell) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = area.current;
    const box = wrap.current;
    if (!el || !box) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    onHeight(cell.id, box.offsetHeight);
  }, [cell.id, onHeight]);

  // Bind the text box to this cell's shared text.
  useLayoutEffect(() => {
    const el = area.current;
    const text = yText(yCells(sheetsMapGet(doc, sheetId)).get(cell.id)!);
    if (!el || !text) return;
    // In a round doc every local edit goes in the typing log, and pasting and dropping text in are blocked.
    const off = bindText(el, text, (e) => {
      if (isRound(doc)) recordEdit(docId, e.ins, e.deleted);
    });
    const block = (e: Event) => {
      if (!isRound(doc)) return;
      const kind = e.type === 'drop' || (e as InputEvent).inputType === 'insertFromDrop' ? 'drop-blocked' : 'paste-blocked';
      e.preventDefault();
      const size = (e as ClipboardEvent).clipboardData?.getData('text')?.length ?? (e as DragEvent).dataTransfer?.getData('text')?.length ?? 0;
      logEvent(docId, { k: kind, n: size });
      toast(kind === 'paste-blocked' ? 'Paste is off in round docs. Type it in.' : 'Drag and drop is off in round docs.');
    };
    const guardInput = (e: Event) => {
      const t = (e as InputEvent).inputType;
      if (t === 'insertFromPaste' || t === 'insertFromPasteAsQuotation' || t === 'insertFromYank' || t === 'insertFromDrop') block(e);
    };
    const allowDrop = (e: Event) => {
      if (isRound(doc)) e.preventDefault();
    };
    el.addEventListener('paste', block);
    el.addEventListener('drop', block);
    el.addEventListener('dragover', allowDrop);
    el.addEventListener('beforeinput', guardInput);
    el.addEventListener('input', fit);
    el.addEventListener('flow2-remote', fit);
    fit();
    return () => {
      off();
      el.removeEventListener('paste', block);
      el.removeEventListener('drop', block);
      el.removeEventListener('dragover', allowDrop);
      el.removeEventListener('beforeinput', guardInput);
      el.removeEventListener('input', fit);
      el.removeEventListener('flow2-remote', fit);
    };
  }, [doc, sheetId, cell.id, fit, docId]);

  // Tell partners where in the cell the caret is.
  const caretRef = useRef(onCaret);
  caretRef.current = onCaret;
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    let last = '';
    const report = () => {
      const now = `${el.selectionStart}:${el.selectionEnd}`;
      if (document.activeElement !== el || now === last) return;
      last = now;
      caretRef.current(el.selectionStart, el.selectionEnd);
    };
    // (flow2-remote: a partner's edit moved the caret, so partners see where it is now.)
    const events = ['keyup', 'mouseup', 'input', 'focus', 'select', 'flow2-remote'] as const;
    for (const e of events) el.addEventListener(e, report);
    return () => {
      for (const e of events) el.removeEventListener(e, report);
    };
  }, [cell.id]);

  // Where a partner's caret is drawn inside this cell.
  const peerAt = peers[0]?.at;
  const peerEnd = peers[0]?.end;
  const [peerCaret, setPeerCaret] = useState<{ left: number; top: number; height: number } | null>(null);
  // And the text they have selected, as a band in their color.
  const [peerSel, setPeerSel] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || peerAt === undefined) {
      setPeerSel([]);
      return setPeerCaret(null);
    }
    const len = el.value.length;
    const at = Math.min(peerAt, len);
    const end = peerEnd === undefined ? at : Math.min(peerEnd, len);
    const c = caretCoords(el, end);
    setPeerCaret({ left: el.offsetLeft + c.left, top: el.offsetTop + c.top, height: c.height });
    setPeerSel(selectionRects(el, Math.min(at, end), Math.max(at, end)).map((r) => ({ ...r, left: r.left + el.offsetLeft, top: r.top + el.offsetTop })));
  }, [peerAt, peerEnd, cell.text, w]);

  // Measure again once the width has really changed (columns slide to their new width over 160 ms, so the width
  // passed in arrives before the box has it) and once the fonts have loaded (a fallback font wraps differently).
  useEffect(() => {
    const box = wrap.current;
    if (!box) return;
    let last = box.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(box.offsetWidth - last) < 0.5) return;
      last = box.offsetWidth;
      fit();
    });
    ro.observe(box);
    let live = true;
    void document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [fit]);

  // A cell's height depends on its width.
  const refSig = refs.map((r) => refKey(r) + r.text).join('|');
  useLayoutEffect(fit, [w, fit, refSig]);

  // Take the focus someone asked for.
  useLayoutEffect(() => {
    const f = want.current;
    if (f && f.id === cell.id && area.current) {
      want.current = null;
      area.current.focus();
      const at = f.at === 'start' ? 0 : area.current.value.length;
      area.current.setSelectionRange(at, at);
    }
  });

  return (
    <div
      ref={wrap}
      className={`f2-cell fl-${side}` + (lit ? ' is-lit' : '') + (picked ? ' is-picked' : '') + (inGroup ? ' in-group' : '') + (mark ? ` mark-${mark}` : '') + (hidden ? ' is-minimized' : '') + (peers.length ? ' has-peer' : '') + (linkingFrom ? ' is-linking' : '') + (linkable ? ' is-linkable' : '') + (measured ? '' : ' is-measuring')}
      style={{ left: x, top: y, width: w, ...(peers.length ? ({ ['--peer' as string]: peers[0].color } as React.CSSProperties) : {}) }}
      onMouseDown={(e) => onMouseDown(e, cell)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {mark && (
        <span className={`f2-mark f2-mark-${mark}`} title={MARK_LABEL[mark]} aria-label={MARK_LABEL[mark]}>
          {MARK_GLYPH[mark]}
        </span>
      )}
      {peers.length > 0 && <span className="f2-peer" style={{ background: peers[0].color }}>{peers.map((p) => p.name).join(', ')}</span>}
      {peers.length > 0 &&
        peerSel.map((r, i) => <span key={i} className="f2-peer-sel" style={{ ...r, background: peers[0].color }} aria-hidden="true" />)}
      {peers.length > 0 && peerCaret && <span className="f2-peer-caret" style={{ left: peerCaret.left, top: peerCaret.top, height: peerCaret.height, background: peers[0].color }} aria-hidden="true" />}
      <textarea ref={area} rows={1} spellCheck aria-label="Cell" onFocus={onFocus} onBlur={onBlur} onKeyDown={(e) => onKeyDown(e, cell)} />
      {refs.length > 0 && (
        <div className="f2-refs">
          {refs.map((r) => (
            <span key={refKey(r)} className={'f2-ref' + (r.missing ? ' is-missing' : '')} title={r.kind === 'x' ? 'Cross-applied from another sheet (click to go there)' : 'Extends an earlier argument (click to go there)'}>
              <button type="button" className="f2-ref-go" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (!r.missing) onRefClick(r); }}>
                {r.kind === 'x' ? '↗' : '↺'} {r.text}
              </button>
              <button type="button" className="f2-ref-x" tabIndex={-1} aria-label="Remove" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onRefRemove(r); }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function sheetsMapGet(doc: Y.Doc, id: string): Y.Map<unknown> {
  return sheetsMap(doc).get(id)!;
}

