/**
 * Keeps the ambient scene from costing more than it is worth. The backdrop is made of a few large,
 * slowly moving layers; on a GPU that is free, but on a machine that composites in software every
 * frame redraws the whole screen and the interface itself starts to stutter.
 *
 * After start-up the governor samples a short run of frames while nothing else is animating. If the
 * machine cannot hold roughly 40 fps twice in a row it sets data-motion-auto="still" on the root,
 * which freezes the scene (see backdrop.css). The scene stays fully drawn, it just stops moving.
 * The decision lasts for the session, and an explicit Calm or Off choice in Settings is never overridden.
 */

const KEY = "zuno.motion.auto";
const SAMPLE_FRAMES = 14;
/** Slower than this (about 25 fps) is decisive on its own. */
const VERY_SLOW_MS = 40;
/** Median frame time (ms) above which the scene is judged too expensive. 25ms is 40 fps. */
const SLOW_MS = 25;
const FIRST_PROBE_MS = 1200;
const RETRY_MS = 2500;
const MAX_PROBES = 6;

const root = () => document.documentElement;
const busy = () => {
  const d = root().dataset;
  return "vt" in d || "launching" in d || root().classList.contains("intro-playing") || document.visibilityState !== "visible";
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Resolves with the median frame time of a clean run, or null if something else started animating. */
function sample(): Promise<number | null> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let last = 0;
    const tick = (now: number) => {
      if (busy()) return resolve(null);
      if (last) deltas.push(now - last);
      last = now;
      if (deltas.length >= SAMPLE_FRAMES) return resolve(median(deltas));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Pins every animated element of the scene at the pose it has right now and takes its animation away.
 * A paused animation still keeps its element on a compositing layer of its own, and a dozen full-screen
 * layers are exactly what a software compositor chokes on; a pinned element costs nothing once drawn.
 * Also run for every scene that arrives while the backdrop is still (by the governor or by choosing Off).
 */
export function freezeBackdrop() {
  for (const anim of document.getAnimations()) {
    const effect = anim.effect as KeyframeEffect | null;
    const el = effect?.target;
    if (!(el instanceof HTMLElement) || effect?.pseudoElement || !el.closest(".backdrop") || el.classList.contains("bg-layer")) continue;
    const cs = getComputedStyle(el);
    el.style.transform = cs.transform === "none" ? "" : cs.transform;
    el.style.opacity = cs.opacity;
    el.dataset.frozen = "";
  }
}

export function installMotionGovernor(): () => void {
  if (typeof window === "undefined") return () => undefined;
  try {
    if (sessionStorage.getItem(KEY) === "still") {
      root().dataset.motionAuto = "still";
      return () => undefined;
    }
  } catch {
    /* storage blocked: decide again this visit */
  }
  let stopped = false;
  let timer = 0;
  let slowInARow = 0;
  let probes = 0;

  const probe = async () => {
    if (stopped) return;
    // An explicit choice in Settings, or reduced motion, already settles it.
    const motion = root().dataset.motion;
    if (motion === "calm" || motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (busy()) {
      timer = window.setTimeout(probe, RETRY_MS);
      return;
    }
    const ms = await sample();
    if (stopped) return;
    if (ms === null) {
      timer = window.setTimeout(probe, RETRY_MS);
      return;
    }
    probes++;
    slowInARow = ms > SLOW_MS ? slowInARow + 1 : 0;
    if (slowInARow >= 2 || ms > VERY_SLOW_MS) {
      root().dataset.motionAuto = "still";
      freezeBackdrop();
      try {
        sessionStorage.setItem(KEY, "still");
      } catch {
        /* ignore */
      }
      return;
    }
    // A slow first reading is checked again soon; a healthy one is checked once more later in case a heavier scene arrives.
    if (slowInARow === 1 || probes < 2) timer = window.setTimeout(probe, slowInARow ? 600 : 12000);
    else if (probes < MAX_PROBES && probes % 2 === 0) timer = window.setTimeout(probe, 25000);
  };
  timer = window.setTimeout(probe, FIRST_PROBE_MS);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
