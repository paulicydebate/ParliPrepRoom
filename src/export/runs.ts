import type { JSONContent } from '@tiptap/core';

/** A piece of text with its inline formatting, ready for any export format. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight?: boolean;
  /** A line break inside the block. */
  br?: boolean;
}

export function runsOf(block: JSONContent): Run[] {
  const out: Run[] = [];
  for (const n of block.content ?? []) {
    if (n.type === 'hardBreak') {
      out.push({ text: '', br: true });
      continue;
    }
    if (n.type !== 'text' || !n.text) continue;
    const marks = new Set((n.marks ?? []).map((m) => m.type));
    out.push({
      text: n.text,
      bold: marks.has('bold') || undefined,
      italic: marks.has('italic') || undefined,
      underline: marks.has('underline') || undefined,
      strike: marks.has('strike') || undefined,
      highlight: marks.has('highlight') || undefined,
    });
  }
  return out;
}

export function download(data: Blob | Uint8Array<ArrayBuffer>, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(title: string) {
  return title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'prep';
}
