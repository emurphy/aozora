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
 *   - a large, non-decaying, wheel-paced delta (a discrete mouse-wheel notch
 *     spun quickly: notches repeat at full rate, at most every few frames,
 *     while trackpad momentum arrives every frame and only slows down). Rates
 *     are per 60 Hz frame, so a momentum event that absorbed a dropped frame
 *     (twice the delta after twice the wait) doesn't pass for a notch.
 * Everything else is the tail of the current gesture and is swallowed.
 *
 * A start smaller than `confirmDelta` only arms a flip, which fires on the next
 * event in the same direction: fingers landing on a trackpad can emit a lone
 * 1 px blip the wrong way, which must not flip the page backwards.
 */

/**
 * The wheel delta along the event's dominant axis. A sideways trackpad swipe
 * also reports ±1 px of vertical jitter, so `deltaY || deltaX` would let a
 * stray `deltaY: +1` override `deltaX: -40` and flip the wrong way.
 */
export function dominantDelta(e: { deltaX: number; deltaY: number }): number {
  return Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
}

/** One 60 Hz frame: trackpad wheel events arrive about this often. */
const FRAME_MS = 1000 / 60;

export interface WheelPagerOptions {
  /** Wheel silence (ms) that ends a gesture. */
  idleMs?: number;
  /** Floor between two flips (ms), as the old throttle. */
  minIntervalMs?: number;
  /** |delta| at/above which a non-decaying event reads as a mouse-wheel notch. */
  notchDelta?: number;
  /** |delta| below which a gesture start waits for a same-direction event to confirm it. */
  confirmDelta?: number;
}

/** Returns a feed function: pass each event's delta and timestamp; it returns the flip direction (±1) or 0. */
export function createWheelPager({ idleMs = 150, minIntervalMs = 250, notchDelta = 50, confirmDelta = 3 }: WheelPagerOptions = {}) {
  let lastEventAt = -Infinity;
  let lastFlipAt = -Infinity;
  let prevRate = 0;
  // Peak of the current gesture and the lowest point since: a tail that has
  // fallen well below its peak and then climbs again is a new swipe.
  let peak = 0;
  let trough = 0;
  // Direction of a tentative (tiny) gesture start awaiting confirmation.
  let armed: -1 | 0 | 1 = 0;

  return (delta: number, now: number): -1 | 0 | 1 => {
    if (!delta) return 0;
    const mag = Math.abs(delta);
    const dir = delta > 0 ? 1 : -1;
    const gap = now - lastEventAt;
    const idle = gap >= idleMs;
    const rate = (mag * FRAME_MS) / Math.max(gap, FRAME_MS);
    const before = prevRate;
    lastEventAt = now;
    prevRate = rate;

    const risesFromTail = trough < peak * 0.5 && mag >= trough * 2 + 6;
    const notch = mag >= notchDelta && gap >= 2 * FRAME_MS && rate >= before;
    if (idle || risesFromTail) {
      peak = trough = mag;
    } else if (mag > peak) {
      peak = trough = mag;
    } else {
      trough = Math.min(trough, mag);
    }

    let fire = false;
    if (idle || risesFromTail || notch) {
      if (mag >= confirmDelta) fire = true;
      else armed = dir;
    } else if (armed) {
      // Confirmed by a second event the same way; a reversal re-arms instead.
      if (dir === armed) fire = true;
      else armed = dir;
    }

    if (!fire || now - lastFlipAt < minIntervalMs) return 0;
    armed = 0;
    lastFlipAt = now;
    return dir;
  };
}
