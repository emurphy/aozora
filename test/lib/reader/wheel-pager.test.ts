import { describe, it, expect } from "vitest";
import { createWheelPager, dominantDelta } from "@/lib/reader/wheel-pager";
import fixture from "./fixtures/macos-trackpad-swipes.json";

/** Feeds [delta, t] pairs and returns the non-zero flips. */
const run = (events: [number, number][]) => {
  const feed = createWheelPager();
  return events.map(([d, t]) => feed(d, t)).filter((f) => f !== 0);
};

/** A trackpad swipe: short finger phase, then ~1.2 s of decaying momentum at 60 Hz. */
const swipe = (t0: number, sign = 1): [number, number][] =>
  Array.from({ length: 75 }, (_, i) => {
    const mag = i < 8 ? 2 + i * 5 : Math.max(1, Math.round(40 * Math.exp(-(i - 8) / 18)));
    return [sign * mag, t0 + i * 16];
  });

describe("createWheelPager", () => {
  it("flips once for a whole trackpad swipe including its momentum tail", () => {
    expect(run(swipe(0))).toEqual([1]);
  });

  it("flips again for a second swipe after the first settles", () => {
    expect(run([...swipe(0), ...swipe(2000)])).toEqual([1, 1]);
  });

  it("flips for a new swipe that lands on the previous swipe's momentum", () => {
    // Second swipe starts 600 ms in, while the first's momentum is still ~10.
    const first = swipe(0).filter(([, t]) => t < 600);
    const second = swipe(600);
    expect(run([...first, ...second])).toEqual([1, 1]);
  });

  it("follows the swipe direction", () => {
    expect(run(swipe(0, -1))).toEqual([-1]);
  });

  it("flips once per slow mouse-wheel notch", () => {
    expect(run([[100, 0], [100, 400], [100, 800]])).toEqual([1, 1, 1]);
  });

  it("keeps the 250 ms rate for a quickly spun notched wheel", () => {
    // Notches every 50 ms for 1 s: the old throttle allowed a flip every 250 ms.
    const events = Array.from({ length: 21 }, (_, i): [number, number] => [100, i * 50]);
    expect(run(events)).toHaveLength(5);
  });

  it("ignores zero deltas", () => {
    expect(run([[0, 0], [0, 500]])).toEqual([]);
  });

  it("does not let a lone 1 px blip start a flip the wrong way", () => {
    // Fingers landing: +1, then the real swipe the other way.
    expect(run([[1, 0], [-2, 46], [-7, 83], [-16, 100]])).toEqual([-1]);
  });

  it("turns the page for a gentle swipe of 1-2 px deltas once it has travelled far enough", () => {
    expect(run([[-1, 0], [-1, 17], [-2, 37], [-2, 53]])).toEqual([-1]);
  });

  it("ignores a finger brushing the trackpad (a couple of 1 px events)", () => {
    expect(run([[1, 0], [1, 17]])).toEqual([]);
    expect(run([[-1, 0], [-1, 20], [5, 1000], [9, 1016]])).toEqual([1]);
  });

  it("lets a single large wheel notch flip at once", () => {
    expect(run([[100, 0]])).toEqual([1]);
  });

  it("does not mistake a momentum event that absorbed a dropped frame for a wheel notch", () => {
    // Momentum decaying every 16 ms from -80, then (past the 250 ms floor) a
    // -113 that arrives after 28 ms: two frames' worth in one event.
    const events: [number, number][] = Array.from({ length: 20 }, (_, i): [number, number] => [-Math.round(80 * 0.97 ** i), i * 16]);
    const last = events.at(-1)!;
    events.push([-113, last[1] + 28], [-50, last[1] + 44], [-47, last[1] + 60]);
    expect(run(events)).toEqual([-1]);
  });
});

describe("dominantDelta", () => {
  it("reads the larger axis so vertical jitter can't flip a sideways swipe", () => {
    expect(dominantDelta({ deltaX: -40, deltaY: 1 })).toBe(-40);
    expect(dominantDelta({ deltaX: 2, deltaY: -30 })).toBe(-30);
  });
});

describe("recorded macOS trackpad swipes", () => {
  // Events are [deltaX, deltaY, ms since the burst began].
  const { bursts } = fixture;

  it.each(bursts.map((b, i) => [i, b] as const))("burst %i turns one page per physical swipe, in its direction", (_i, burst) => {
    const feed = createWheelPager();
    const flips = burst.events.map(([dx, dy, t]) => feed(dominantDelta({ deltaX: dx, deltaY: dy }), t)).filter((f) => f !== 0);
    expect(flips).toEqual(burst.flips);
  });
});
