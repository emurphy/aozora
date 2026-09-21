import { useCallback, useEffect, useRef, useState } from "react";

/** A move under this is ordinary reading, not a jump worth a way back from. */
const MIN_JUMP_CHARS = 600;
const MIN_JUMP_PAGES = 2;
/** After a mark, a position report inside this window is that jump landing. */
const SETTLE_MS = 1500;
/** The offer expires once reading has carried on this long. */
const OFFER_MS = 15_000;
/** Chained jumps unwind one by one, without the stack growing forever. */
const MAX_DEPTH = 10;

interface Options {
  /** Live position, watched to see where a jump landed. */
  char: number;
  /** The same position, read synchronously when a jump is marked. */
  charRef: React.RefObject<number>;
  /** Fixed-layout position counts pages, so its threshold is a page count. */
  fixedLayout: boolean;
  /** Bumped when the book is rebuilt: recorded offsets stop meaning anything. */
  resetToken: unknown;
}

/**
 * Remembers where the reader was before a jump (seek, TOC, bookmark, highlight,
 * search, internal link) so one click returns there. A mark is confirmed by the
 * position it lands on rather than by the caller, so a jump that barely moved
 * (the chapter already on screen) records nothing.
 */
export function useJumpBack({ char, charRef, fixedLayout, resetToken }: Options) {
  const [origins, setOrigins] = useState<number[]>([]);
  const originsRef = useRef<number[]>([]);
  const pendingRef = useRef<{ from: number; at: number } | null>(null);
  const returningRef = useRef(false);

  const apply = useCallback((next: number[]) => {
    originsRef.current = next;
    setOrigins(next);
  }, []);

  /** Call before navigating, while the position is still the old one. */
  const markJump = useCallback(() => {
    pendingRef.current = { from: charRef.current, at: Date.now() };
  }, [charRef]);

  // Confirm the mark against where the position actually landed.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (Date.now() - pending.at > SETTLE_MS) {
      pendingRef.current = null;
      returningRef.current = false; // a jump that never landed must not swallow the next one
      return;
    }
    if (Math.abs(char - pending.from) < (fixedLayout ? MIN_JUMP_PAGES : MIN_JUMP_CHARS)) return;
    pendingRef.current = null;
    if (returningRef.current) {
      returningRef.current = false; // a return is not itself a jump to come back from
      return;
    }
    apply([...originsRef.current, pending.from].slice(-MAX_DEPTH));
  }, [char, fixedLayout, apply]);

  useEffect(() => {
    if (!origins.length) return;
    const id = setTimeout(() => apply([]), OFFER_MS);
    return () => clearTimeout(id);
  }, [origins, apply]);

  useEffect(() => {
    apply([]);
  }, [resetToken, apply]);

  const dismiss = useCallback(() => apply([]), [apply]);

  /** The position to return to, handed to the caller's own jump. */
  const popOrigin = useCallback(() => {
    const stack = originsRef.current;
    if (!stack.length) return null;
    returningRef.current = true;
    apply(stack.slice(0, -1));
    return stack[stack.length - 1];
  }, [apply]);

  return { backChar: origins.length ? origins[origins.length - 1] : null, markJump, popOrigin, dismiss };
}
