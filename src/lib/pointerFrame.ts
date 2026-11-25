/**
 * Helpers for pointer-driven effects (tile tilt, hero parallax) that must never force layout from a
 * pointermove handler: the element's rectangle is measured once and reused until the page scrolls or
 * resizes, and the visual write happens once per frame with the newest pointer position.
 */
let generation = 0;
if (typeof window !== "undefined") {
  const bump = () => {
    generation++;
  };
  window.addEventListener("scroll", bump, { capture: true, passive: true });
  window.addEventListener("resize", bump, { passive: true });
}

/** A stored rectangle also expires, since layout can change without a scroll (for example the sidebar collapsing). */
const MAX_AGE_MS = 600;
const rects = new WeakMap<Element, { gen: number; at: number; rect: DOMRect }>();

/** The element's rectangle, measured at most once per scroll/resize (and at most every 600ms while the pointer moves). */
export function cachedRect(el: Element): DOMRect {
  const now = performance.now();
  const hit = rects.get(el);
  if (hit && hit.gen === generation && now - hit.at < MAX_AGE_MS) return hit.rect;
  const rect = el.getBoundingClientRect();
  rects.set(el, { gen: generation, at: now, rect });
  return rect;
}

/** Drop the stored rectangle, for example when the pointer leaves and the element may move. */
export function forgetRect(el: Element): void {
  rects.delete(el);
}

const pending = new WeakMap<Element, { raf: number; write: () => void }>();

/** Runs `write` on the next frame; calling again before then replaces it, so only the newest position is drawn. */
export function writeNextFrame(el: Element, write: () => void): void {
  const queued = pending.get(el);
  if (queued) {
    queued.write = write;
    return;
  }
  const entry = {
    write,
    raf: requestAnimationFrame(() => {
      pending.delete(el);
      entry.write();
    }),
  };
  pending.set(el, entry);
}

/** Cancels a queued write (pointer left before the frame ran). */
export function cancelWrite(el: Element): void {
  const queued = pending.get(el);
  if (!queued) return;
  cancelAnimationFrame(queued.raf);
  pending.delete(el);
}
