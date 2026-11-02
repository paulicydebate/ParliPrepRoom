import * as Y from 'yjs';

/**
 * Characters inserted (with the text) and deleted by a Yjs update. `chars`
 * remembers every character inserted so far (by Yjs item id), so a later
 * deletion can say exactly which text it removed. Pass the same map through
 * the updates in order.
 */
export function measureUpdate(update: Uint8Array, chars: Map<string, string> = new Map()): { text: string; deleted: number; deletedText: string } {
  const { structs, ds } = Y.decodeUpdate(update);
  let text = '';
  for (const s of structs) {
    const item = s as unknown as { id?: { client: number; clock: number }; content?: { str?: unknown; type?: unknown } };
    const content = item.content;
    if (content && typeof content.str === 'string') {
      text += content.str;
      if (item.id) for (let i = 0; i < content.str.length; i++) chars.set(`${item.id.client}:${item.id.clock + i}`, content.str[i]);
    }
    // A new line (block) in the doc shows as a line break.
    else if (content && content.type instanceof Y.XmlElement) text += '\n';
  }
  let deleted = 0;
  let deletedText = '';
  ds.clients.forEach((items, client) =>
    items.forEach((d) => {
      deleted += d.len;
      for (let k = d.clock; k < d.clock + d.len; k++) deletedText += chars.get(`${client}:${k}`) ?? '';
    }),
  );
  return { text, deleted, deletedText };
}

