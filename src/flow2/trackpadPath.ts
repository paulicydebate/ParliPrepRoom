// Draws a trackpad pan smoothly: along the path the events stamp, a little behind the newest one.
//
// Adapted from Flowist (by Elli; used with permission): canvas/camera/trackpad-path.ts. The functions are
// Flowist's; its import of a gesture-gap constant (ui/smooth-wheel.ts) is replaced by the constant itself.

type Point = { x: number; y: number };
/** A pause this long ends a trackpad gesture (Flowist's GESTURE_GAP_MS). */
export const GESTURE_GAP_MS = 100;

/** Where a trackpad's pan has put the camera by `t`, the OS's time for the event that took it there. */
type PathPoint = Point & { t: number };

const HISTORY = 8;
const DEFAULT_CADENCE_MS = 1000 / 60;
/** How much faster or slower than real time the path is drawn, as its lag changes or after it ran out. */
const DRIFT = 0.25;
/** Older than any trip to the page: such a stamp isn't the OS's time on performance.now()'s clock. */
const STALE_STAMP_MS = 250;

function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const keep = (values: number[], value: number) => {
  values.push(value);
  if (values.length > HISTORY) values.shift();
};

/**
 * How far behind its newest event a trackpad's path is drawn. A trackpad reports on its own clock, about 60
 * times a second, and its events reach the page at the start of a frame, so some frames get none and the next
 * two: drawn as they came, the camera stood still, then jumped. Drawn one event interval behind the newest event
 * as frames usually get it, each frame falls between two events it already has.
 */
export function createTrackpadClock() {
  const ages: number[] = [];
  const intervals: number[] = [];
  let last = -Infinity;
  const cadence = () => median(intervals) ?? DEFAULT_CADENCE_MS;
  return {
    /** The time to place an event the OS stamped `stamp` at, read at `now`. */
    stamped(stamp: number, now: number) {
      const t = stamp <= now && now - stamp < STALE_STAMP_MS ? stamp : now;
      const gap = t - last;
      if (gap >= 1 && gap < GESTURE_GAP_MS) keep(intervals, gap);
      last = t;
      return t;
    },
    // By the frame's own clock: one that runs offset from the events' shifts every age alike, and the lag with them.
    reached: (age: number) => keep(ages, age),
    cadence,
    lag: () => (median(ages) ?? 0) + cadence(),
  };
}

type TrackpadClock = ReturnType<typeof createTrackpadClock>;

/** The path at `t`, along the line between the two points around it. */
function pathAt(points: readonly PathPoint[], t: number): Point {
  let next = 1;
  while (next < points.length - 1 && points[next]!.t < t) next += 1;
  const a = points[next - 1]!;
  const b = points[next]!;
  if (t <= a.t) return { x: a.x, y: a.y };
  if (t >= b.t) return { x: b.x, y: b.y };
  const share = (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share };
}

/**
 * A trackpad pan's path from `from`, whose first event took the camera to `to` at `t`, and where each frame draws
 * it: heading for the clock's lag behind the newest event, within DRIFT of real time so the camera's speed never
 * jumps, and never past the newest event, where it waits for the next.
 */
export function createTrackpadPath(clock: TrackpadClock, from: Point, to: Point, t: number) {
  // The first event's move was made over the interval before it.
  const points: PathPoint[] = [{ t: t - clock.cadence(), ...from }, { t, ...to }];
  let drawnAt: number | null = null;
  let drawnFrame: number | null = null;
  let frameMs = clock.cadence();
  let fresh = true;
  return {
    newest(): Point {
      const { x, y } = points.at(-1)!;
      return { x, y };
    },
    add(to: Point, t: number) {
      const newest = points.at(-1)!;
      // After a pause that long the fingers start again from rest, not across it.
      if (t - newest.t >= GESTURE_GAP_MS) {
        points.push({ t: t - clock.cadence(), x: newest.x, y: newest.y });
        if (drawnAt !== null && drawnAt >= newest.t) drawnAt = null;
      }
      const last = points.at(-1)!;
      if (t <= last.t) points[points.length - 1] = { t: last.t, ...to };
      else points.push({ t, ...to });
      fresh = true;
    },
    draw(now: number): Point {
      const newest = points.at(-1)!;
      if (fresh) clock.reached(now - newest.t);
      fresh = false;
      if (drawnFrame !== null) frameMs = now - drawnFrame;
      drawnFrame = now;
      const wanted = now - clock.lag();
      const paced = drawnAt === null ? wanted
        : Math.max(drawnAt, Math.min(Math.max(wanted, drawnAt + (1 - DRIFT) * frameMs), drawnAt + (1 + DRIFT) * frameMs));
      const at = Math.min(paced, newest.t);
      drawnAt = at;
      while (points.length > 2 && points[1]!.t <= at) points.shift();
      return pathAt(points, at);
    },
  };
}

export type TrackpadPath = ReturnType<typeof createTrackpadPath>;
