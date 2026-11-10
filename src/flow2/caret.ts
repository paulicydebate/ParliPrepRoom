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
