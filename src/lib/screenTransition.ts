import { flushSync } from "react-dom";

export type NavDirection = "forward" | "back" | "up" | "down";

type ViewTransition = { finished: Promise<void>; skipTransition: () => void };
type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => ViewTransition };

let current: ViewTransition | null = null;
let generation = 0;

const MORPH = "zuno-morph";

// The control the person last pressed, so a morph starts from the card they actually chose.
let lastPressed: Element | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => (lastPressed = e.target as Element), { capture: true, passive: true });
  window.addEventListener("keydown", () => (lastPressed = document.activeElement), { capture: true, passive: true });
}

function morphTarget(key: string): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-morph="${CSS.escape(key)}"]`)];
  const pressed = lastPressed?.closest("button, a, [role=button]");
  const chosen = pressed && all.find((el) => pressed.contains(el) || el.contains(pressed));
  if (chosen) return chosen;
  // Otherwise the first one that is actually on screen.
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) return el;
  }
  return null;
}

function clearMorphs() {
  document.querySelectorAll<HTMLElement>("[data-morph]").forEach((el) => {
    if (el.style.viewTransitionName) el.style.viewTransitionName = "";
  });
}

export interface TransitionOptions {
  /** A shared element key: the element with data-morph=key before the change grows/shrinks into the one after it. */
  morph?: string;
}

/**
 * Runs a screen change inside a View Transition. The app content lives in one
 * named "stage" group (above the live backdrop) and the sidebar in its own
 * pinned group, so only the page itself moves. See motion.css for the motion.
 *
 * A change that lands while another is still playing skips the running one to
 * its end state and starts fresh, so fast clicks never snap or stack.
 * Browsers without the API simply update straight away.
 */
export function withScreenTransition(direction: NavDirection, update: () => void, options: TransitionOptions = {}): void {
  const doc = document as ViewTransitionDoc;
  if (!doc.startViewTransition || document.visibilityState !== "visible") {
    update();
    return;
  }
  if (current) {
    try {
      current.skipTransition();
    } catch {
      /* already done */
    }
    current = null;
    clearMorphs();
  }
  const root = document.documentElement;
  const id = ++generation;
  root.dataset.nav = direction;
  root.dataset.vt = "";

  const from = options.morph ? morphTarget(options.morph) : null;
  if (from) from.style.viewTransitionName = MORPH;
  root.toggleAttribute("data-morphing", !!from);

  const done = () => {
    if (id !== generation) return;
    current = null;
    delete root.dataset.nav;
    delete root.dataset.vt;
    root.removeAttribute("data-morphing");
    clearMorphs();
  };

  try {
    current = doc.startViewTransition(() => {
      flushSync(update);
      if (from) {
        from.style.viewTransitionName = "";
        const to = morphTarget(options.morph!);
        if (to) to.style.viewTransitionName = MORPH;
        else root.removeAttribute("data-morphing");
      }
    });
    void current.finished.finally(done);
  } catch {
    done();
    update();
  }
}

/** True while a screen transition is playing (used to hold back in-page entrance motion). */
export function transitioning(): boolean {
  return "vt" in document.documentElement.dataset;
}
