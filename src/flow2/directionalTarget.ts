// Which cell an arrow key moves to: the nearest one ahead, counting how far off to the side it is three times
// as much as how far ahead.
//
// Adapted from Flowist (by Elli; used with permission): workspace/layout/directional-target.ts. The functions
// are Flowist's; only the rectangle type is changed to a plain box.

type Box = { left: number; top: number; right: number; bottom: number };
export function cycleTarget<T>(ordered: readonly T[], currentIndex: number, reverse: boolean): T | undefined {
  if (ordered.length === 0) return undefined;
  const step = reverse ? -1 : 1;
  const index = currentIndex < 0
    ? (reverse ? ordered.length - 1 : 0)
    : (currentIndex + step + ordered.length) % ordered.length;
  return ordered[index];
}

export function rovingIndex(key: string, index: number, count: number, forward = 'ArrowRight', back = 'ArrowLeft'): number | null {
  const last = count - 1;
  if (key === forward) return index === last ? 0 : index + 1;
  if (key === back) return index === 0 ? last : index - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return null;
}

export function directionalTarget<T>(
  key: string,
  origin: Box,
  candidates: readonly T[],
  boxOf: (candidate: T) => Box | null | undefined,
): T | undefined {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  const x = (origin.left + origin.right) / 2;
  const y = (origin.top + origin.bottom) / 2;
  let best: T | undefined;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const box = boxOf(candidate);
    if (!box) continue;
    const dx = (box.left + box.right) / 2 - x;
    const dy = (box.top + box.bottom) / 2 - y;
    const ahead = (horizontal ? dx : dy) * direction;
    if (ahead <= 1) continue;
    const score = ahead + Math.abs(horizontal ? dy : dx) * 3;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
