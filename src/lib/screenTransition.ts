import { flushSync } from "react-dom";

export type NavDirection = "forward" | "back";

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

let running = false;

/**
 * Runs a screen change inside a View Transition, so moving between the intro,
 * dashboard, game page, lobbies and games is a short depth cross-fade instead
 * of a hard cut. The motion itself lives in motion.css (220-320ms, an 80ms
 * dissolve under reduced motion or Still). Browsers without the API, or a
 * change that lands while another is running, simply update straight away.
 */
export function withScreenTransition(direction: NavDirection, update: () => void): void {
  const doc = document as ViewTransitionDoc;
  if (!doc.startViewTransition || running || document.visibilityState !== "visible") {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.nav = direction;
  running = true;
  try {
    const vt = doc.startViewTransition(() => flushSync(update));
    void vt.finished.finally(() => {
      running = false;
      delete root.dataset.nav;
    });
  } catch {
    running = false;
    delete root.dataset.nav;
    update();
  }
}
