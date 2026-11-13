// Where a caret at character `pos` sits inside a textarea: a hidden copy of the box with the same font, padding and
// width is filled with the text before `pos`, and a marker at its end is measured. Offsets are from the textarea's
// own top-left corner.

const COPIED = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'letterSpacing', 'lineHeight', 'textTransform', 'textIndent', 'tabSize', 'wordSpacing',
] as const;

export function caretCoords(el: HTMLTextAreaElement, pos: number): { left: number; top: number; height: number } {
  const style = getComputedStyle(el);
  const mirror = document.createElement('div');
  for (const k of COPIED) mirror.style[k] = style[k];
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', overflow: 'hidden', height: 'auto' });
  const at = Math.max(0, Math.min(pos, el.value.length));
  mirror.textContent = el.value.slice(0, at);
  const marker = document.createElement('span');
  marker.textContent = el.value.slice(at, at + 1) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3 || 16;
  const out = { left: marker.offsetLeft, top: marker.offsetTop, height: line };
  document.body.removeChild(mirror);
  return out;
}

/**
 * The boxes covering the text from `start` to `end` inside a textarea, line by line (same offsets as caretCoords):
 * the first line from the start to the right edge, whole lines in between, the last line up to the end.
 */
export function selectionRects(el: HTMLTextAreaElement, start: number, end: number): { left: number; top: number; width: number; height: number }[] {
  if (end <= start) return [];
  const a = caretCoords(el, start);
  const b = caretCoords(el, end);
  const style = getComputedStyle(el);
  const left = parseFloat(style.paddingLeft) || 0;
  const right = el.clientWidth - (parseFloat(style.paddingRight) || 0);
  if (Math.abs(a.top - b.top) < 1) return [{ left: a.left, top: a.top, width: Math.max(2, b.left - a.left), height: a.height }];
  const out = [{ left: a.left, top: a.top, width: Math.max(2, right - a.left), height: a.height }];
  for (let y = a.top + a.height; y < b.top - 1; y += a.height) out.push({ left, top: y, width: right - left, height: a.height });
  out.push({ left, top: b.top, width: Math.max(2, b.left - left), height: b.height });
  return out;
}
