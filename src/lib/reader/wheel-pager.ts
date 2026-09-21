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
 * A start only arms a flip, which fires once the gesture has travelled
 * `minTravel` px in one direction: a finger brushing or resting on the trackpad
 * emits one or two 1 px events, sometimes the wrong way, and those must not
 * turn the page. A real swipe gets there within its first few events; a mouse
 * notch in its first.
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
  /** Travel (px, summed in one direction) a gesture needs before it may flip. */
  minTravel?: number;
}

/** Returns a feed function: pass each event's delta and timestamp; it returns the flip direction (±1) or 0. */
export function createWheelPager({ idleMs = 150, minIntervalMs = 250, notchDelta = 50, minTravel = 4 }: WheelPagerOptions = {}) {
  let lastEventAt = -Infinity;
  let lastFlipAt = -Infinity;
  let prevRate = 0;
  // Peak of the current gesture and the lowest point since: a tail that has
  // fallen well below its peak and then climbs again is a new swipe.
  let peak = 0;
  let trough = 0;
  // A gesture start awaiting enough travel: its direction and the px so far.
  let armed: -1 | 0 | 1 = 0;
  let travel = 0;

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

    if (idle || risesFromTail || notch || (armed && dir !== armed)) {
      // A new start (or a reversal of one still arming) begins counting afresh.
      armed = dir;
      travel = mag;
    } else if (armed) {
      travel += mag;
    }

    if (!armed || travel < minTravel) return 0;
    // Ready, but too soon after the last flip: drop it rather than let it fire
    // later from the middle of this gesture's momentum.
    armed = 0;
    if (now - lastFlipAt < minIntervalMs) return 0;
    lastFlipAt = now;
    return dir;
  };
}
