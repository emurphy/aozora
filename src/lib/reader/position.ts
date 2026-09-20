/**
 * Reading-position helpers for the continuous reader.
 *
 * Position is a character count, not a pixel offset, so it survives re-flow.
 * Anchors map cumulative char offsets to elements; the resume point is the
 * viewport centre, which reads the same for vertical-rl and horizontal-tb.
 */

import { getParagraphNodes, getCharacterCount } from "@/lib/epub/dom-utils";

export interface Anchor {
  el: Element;
  charBefore: number;
}

/**
 * Anchors in document order: `charBefore` is the cumulative character count
 * before the element, so the array is non-decreasing and binary-searchable.
 */
export function collectAnchors(contentEl: Element): { anchors: Anchor[]; total: number } {
  const nodes = getParagraphNodes(contentEl);
  const anchors: Anchor[] = [];
  let cumulative = 0;
  let lastEl: Element | null = null;

  for (const node of nodes) {
    const el: Element | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    if (el && el !== lastEl) {
      anchors.push({ el, charBefore: cumulative });
      lastEl = el;
    }
    cumulative += getCharacterCount(node);
  }

  return { anchors, total: cumulative };
}

function viewportCentre(host: HTMLElement): { hr: DOMRect; x: number; y: number } {
  const hr = host.getBoundingClientRect();
  return {
    hr,
    x: hr.left + host.clientWidth / 2,
    y: hr.top + host.clientHeight / 2,
  };
}

/** Last anchor starting at or before `target`, on the reading-order axis. */
function lastAnchorBefore(anchors: Anchor[], vertical: boolean, target: number): number {
  let lo = 0;
  let hi = anchors.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = anchors[mid].el.getBoundingClientRect();
    // Reading-order coordinate, monotonically non-decreasing across anchors.
    const leading = vertical ? -r.right : r.top;
    if (leading <= target) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** The character offset at the viewport centre: where a reopen resumes. */
export function currentCharAtCenter(host: HTMLElement, anchors: Anchor[], vertical: boolean): number {
  if (!anchors.length) return 0;
  const { x, y } = viewportCentre(host);
  return anchors[lastAnchorBefore(anchors, vertical, vertical ? -x : y)].charBefore;
}

/**
 * Characters read through the paragraph at the viewport's far edge. Progress
 * reports this rather than the centre, so the last screen of a book that is
 * barely longer than one screen still reads 100%.
 */
export function charAtViewEnd(host: HTMLElement, anchors: Anchor[], total: number, vertical: boolean): number {
  if (!anchors.length) return 0;
  const hr = host.getBoundingClientRect();
  const far = vertical ? -hr.left : hr.top + host.clientHeight;
  const i = lastAnchorBefore(anchors, vertical, far);
  return i + 1 < anchors.length ? anchors[i + 1].charBefore : total;
}

function alignToCenter(host: HTMLElement, el: Element, vertical: boolean): void {
  const { x, y } = viewportCentre(host);
  const r = el.getBoundingClientRect();
  if (vertical) {
    host.scrollLeft += r.left + r.width / 2 - x;
  } else {
    host.scrollTop += r.top + r.height / 2 - y;
  }
}

/** Mirrors {@link currentCharAtCenter}, so save then restore round-trips. */
export function scrollToChar(host: HTMLElement, anchors: Anchor[], vertical: boolean, targetChar: number): void {
  if (!anchors.length) return;
  let lo = 0;
  let hi = anchors.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].charBefore <= targetChar) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  alignToCenter(host, anchors[best].el, vertical);
}

/** Scrolls a TOC target's leading edge to the viewport's. False if the id is absent. */
export function scrollToElementId(host: HTMLElement, root: Document | ShadowRoot, id: string, vertical: boolean): boolean {
  const el = root.getElementById ? root.getElementById(id) : null;
  if (!el) return false;
  const hr = host.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (vertical) {
    host.scrollLeft += r.right - hr.right;
  } else {
    host.scrollTop += r.top - hr.top;
  }
  return true;
}
