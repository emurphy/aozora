import { describe, it, expect } from "vitest";
import { createWheelPager } from "@/lib/reader/wheel-pager";

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
});
