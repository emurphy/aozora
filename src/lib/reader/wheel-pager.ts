/**
 * Turns a stream of wheel events into page flips: one per gesture.
 *
 * A plain time throttle (one flip per 250 ms) is right for a notched mouse wheel
 * but not for a trackpad: macOS keeps emitting decaying "momentum" wheel events
 * for a second or more after the fingers lift, so one swipe flipped 4–6 pages.
 *
 * An event may flip (still at most once per `minIntervalMs`) only when it starts
 * something new:
 *   - after `idleMs` of wheel silence (a fresh swipe or notch),
 *   - a clear rise out of a decayed momentum tail (a new swipe landing on the
 *     previous one's momentum), or
 *   - a large non-decaying delta (a discrete mouse-wheel notch spun quickly;
 *     momentum always decays, notches repeat at full size).
 * Everything else is the tail of the current gesture and is swallowed.
 */

export interface WheelPagerOptions {
  /** Wheel silence (ms) that ends a gesture. */
  idleMs?: number;
  /** Floor between two flips (ms), as the old throttle. */
  minIntervalMs?: number;
  /** |delta| at/above which a non-decaying event reads as a mouse-wheel notch. */
  notchDelta?: number;
}

/** Returns a feed function: pass each event's delta and timestamp; it returns the flip direction (±1) or 0. */
export function createWheelPager({ idleMs = 150, minIntervalMs = 250, notchDelta = 50 }: WheelPagerOptions = {}) {
  let lastEventAt = -Infinity;
  let lastFlipAt = -Infinity;
  let prevMag = 0;
  // Peak of the current gesture and the lowest point since: a tail that has
  // fallen well below its peak and then climbs again is a new swipe.
  let peak = 0;
  let trough = 0;

  return (delta: number, now: number): -1 | 0 | 1 => {
    if (!delta) return 0;
    const mag = Math.abs(delta);
    const idle = now - lastEventAt >= idleMs;
    const before = prevMag;
    lastEventAt = now;
    prevMag = mag;

    const risesFromTail = trough < peak * 0.5 && mag >= trough * 2 + 6;
    const notch = mag >= notchDelta && mag >= before;
    if (idle || risesFromTail) {
      peak = trough = mag;
    } else if (mag > peak) {
      peak = trough = mag;
    } else {
      trough = Math.min(trough, mag);
    }

    if (!(idle || risesFromTail || notch) || now - lastFlipAt < minIntervalMs) return 0;
    lastFlipAt = now;
    return delta > 0 ? 1 : -1;
  };
}
