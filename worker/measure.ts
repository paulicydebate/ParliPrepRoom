import * as Y from 'yjs';

/** Marks an item that holds no typed text (a number, a mark, a cell or sheet map), so deleting it is not counted. */
const NOT_TEXT = '\u0000';
/** Marks the item holding a flow sheet's name: a later name for the same sheet is written after it. */
const NAME = '\u0001';

/**
 * Characters inserted (with the text) and deleted by a Yjs update. `chars`
 * remembers every character inserted so far (by Yjs item id), so a later
 * deletion can say exactly which text it removed. Pass the same map through
 * the updates in order.
 *
 * Docs: each new block shows as a line break. Flows (src/flow2/model.ts): each new cell's text starts on a new
 * line, a sheet's name counts as typed text, and the cell's other fields (column, place, mark, links) count as
 * nothing, neither inserted nor deleted when they change.
 */
export function measureUpdate(update: Uint8Array, chars: Map<string, string> = new Map()): { text: string; deleted: number; deletedText: string } {
  const { structs, ds } = Y.decodeUpdate(update);
  let text = '';
  const remember = (id: { client: number; clock: number } | undefined, len: number, at: (i: number) => string) => {
    if (id) for (let i = 0; i < len; i++) chars.set(`${id.client}:${id.clock + i}`, at(i));
  };
  for (const s of structs) {
    const item = s as unknown as {
      id?: { client: number; clock: number };
      length?: number;
      origin?: { client: number; clock: number } | null;
      parentSub?: string | null;
      content?: { str?: unknown; type?: unknown; arr?: unknown[] };
    };
    const content = item.content;
    if (!content) continue;
    if (typeof content.str === 'string') {
      const str = content.str;
      text += str;
      remember(item.id, str.length, (i) => str[i]);
    }
    // A new line (block) in a doc, or a new cell's text box in a flow, starts a new line.
    else if (content.type instanceof Y.XmlElement || (content.type instanceof Y.Text && !(content.type instanceof Y.XmlText))) {
      text += '\n';
      remember(item.id, 1, () => NOT_TEXT);
    }
    // A flow sheet's name is typed. Map values are replaced whole, so the old name's item is deleted (not counted).
    // The first name says which key it is; a renamed one only points back at the name it replaces.
    else if (
      Array.isArray(content.arr) &&
      typeof content.arr[0] === 'string' &&
      (item.parentSub === 'name' || (!!item.origin && chars.get(`${item.origin.client}:${item.origin.clock}`) === NAME))
    ) {
      const name = content.arr[0] as string;
      if (name) text += (text ? '\n' : '') + name;
      remember(item.id, item.length ?? 1, () => NAME);
    } else remember(item.id, item.length ?? 1, () => NOT_TEXT);
  }
  let deleted = 0;
  let deletedText = '';
  ds.clients.forEach((items, client) =>
    items.forEach((d) => {
      for (let k = d.clock; k < d.clock + d.len; k++) {
        const ch = chars.get(`${client}:${k}`);
        if (ch === NOT_TEXT || ch === NAME) continue;
        deleted++;
        deletedText += ch ?? '';
      }
    }),
  );
  return { text, deleted, deletedText };
}

/**
 * True when every line of `text` is text that was deleted earlier in this doc (`deletedSoFar`): putting back what
 * was there, by Undo or by restoring a saved version, is not pasting. Used to excuse a large single edit.
 */
export function isRestore(text: string, deletedSoFar: string): boolean {
  const lines = text.split('\n').filter((l) => l.trim());
  return lines.length > 0 && lines.every((l) => deletedSoFar.includes(l));
}
