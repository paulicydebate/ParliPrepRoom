// The named styles every piece of prep uses. Doc view and (later) flow view
// both read these, so keep this file free of editor or UI code.

export type BlockKind = 'position' | 'section' | 'claim' | 'warrant' | 'analytic' | 'note';

export interface KindInfo {
  label: string;
  /** Outline depth: 1 = position title ... 4 = body text. */
  level: 1 | 2 | 3 | 4;
  /** Digit used with Mod-Alt to apply this style. */
  key: string;
  /** Style given to the new block when you press Enter at the end of this one. */
  next: BlockKind;
}

export const BLOCK_KINDS: BlockKind[] = ['position', 'section', 'claim', 'warrant', 'analytic', 'note'];

export const KIND_INFO: Record<BlockKind, KindInfo> = {
  position: { label: 'Position title', level: 1, key: '1', next: 'section' },
  section: { label: 'Section title', level: 2, key: '2', next: 'claim' },
  claim: { label: 'Claim', level: 3, key: '3', next: 'warrant' },
  warrant: { label: 'Warrant', level: 4, key: '4', next: 'warrant' },
  analytic: { label: 'Analytic', level: 4, key: '5', next: 'analytic' },
  note: { label: 'Note', level: 4, key: '6', next: 'note' },
};

export const DEFAULT_KIND: BlockKind = 'warrant';

export function isBlockKind(value: unknown): value is BlockKind {
  return typeof value === 'string' && (BLOCK_KINDS as string[]).includes(value);
}

export function asKind(value: unknown): BlockKind {
  return isBlockKind(value) ? value : DEFAULT_KIND;
}

export function levelOf(kind: unknown): number {
  return KIND_INFO[asKind(kind)].level;
}

/** Headings can be collapsed and appear in the outline. */
export function isHeading(kind: unknown): boolean {
  return levelOf(kind) < 4;
}

/** Tab: one level deeper. Body styles stay as they are. */
export function demote(kind: BlockKind): BlockKind {
  switch (kind) {
    case 'position':
      return 'section';
    case 'section':
      return 'claim';
    case 'claim':
      return 'warrant';
    default:
      return kind;
  }
}

/** Shift-Tab: one level up. */
export function promote(kind: BlockKind): BlockKind {
  switch (kind) {
    case 'section':
      return 'position';
    case 'claim':
      return 'section';
    case 'warrant':
    case 'analytic':
    case 'note':
      return 'claim';
    default:
      return kind;
  }
}

export function newBlockId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}
