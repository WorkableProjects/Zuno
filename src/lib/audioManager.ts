import { getVolume, isMuted } from "./audio";
import { getSfxContext, isSfx, isSfxEnabled, playSfx, unlockSfx, type Sfx } from "./sfx";

/**
 * Global audio manager. Browsers keep audio suspended until a user gesture, so
 * this installs capture listeners that unlock the shared sfx context on the
 * first press or key, then plays a short entry sound once per browser session.
 *
 * It also owns the one delegated pointer and keyboard listener that gives every
 * interactive control a sound: buttons, links, nav, tiles, tabs, radios,
 * switches and checkboxes, selects and sliders, plus dialogs opening and
 * closing. Mark an element `data-sfx="name"` to pick its voice or
 * `data-sfx="none"` to silence it. Explicit playSfx calls always win: the
 * delegated sound waits a beat and steps aside if anything else played.
 * It follows the mute, volume and sound-effects settings, and nothing here can
 * throw into the app.
 */
const FLAG = "zuno.welcomed";

const welcomed = (): boolean => {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return doneThisLoad;
  }
};
let doneThisLoad = false;
const markWelcomed = () => {
  doneThisLoad = true;
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* ignore */
  }
};

let installed = false;

/** The shared context the manager unlocks, for callers that need to know its state. */
export const audioContext = (): AudioContext | null => getSfxContext();

/** How long a delegated sound waits so an explicit sound from the same interaction can claim it. */
const DEFER_MS = 24;

const INTERACTIVE = [
  "button",
  "[role=button]",
  "[role=tab]",
  "[role=radio]",
  "[role=switch]",
  "[role=menuitem]",
  "[role=option]",
  "[role=link]",
  "a[href]",
  "summary",
  "select",
  "input[type=checkbox]",
  "input[type=radio]",
  "input[type=range]",
  "[data-sfx]",
  ".tile",
  ".lib-tile",
].join(",");
const HOVER_TILES = ".tile, .lib-tile";
const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "w", "a", "s", "d", "W", "A", "S", "D"]);
const BACK_RE = /^\s*(back|exit|leave|close|cancel|dismiss|no\b)/i;

const isDisabled = (el: Element) => (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";

/** The data-sfx override on the element or an ancestor: a voice name, "none", or null for no override. */
function override(el: Element): Sfx | "none" | null {
  const v = el.closest("[data-sfx]")?.getAttribute("data-sfx")?.trim();
  if (!v) return null;
  if (v === "none") return "none";
  return isSfx(v) ? v : null;
}

/** Picks the voice for a pressed control, reading state after the app has handled the press. */
function voiceFor(el: Element): Sfx | "none" {
  const o = override(el);
  if (o) return o;
  const input = el as HTMLInputElement;
  if (el.tagName === "INPUT" && input.type === "checkbox") return input.checked ? "toggleOn" : "toggleOff";
  if (el.tagName === "INPUT" && input.type === "radio") return "select";
  const role = el.getAttribute("role");
  if (role === "switch" || el.hasAttribute("aria-pressed")) {
    const on = (el.getAttribute(role === "switch" ? "aria-checked" : "aria-pressed") ?? el.getAttribute("aria-checked")) === "true";
    return on ? "toggleOn" : "toggleOff";
  }
  if (el.tagName === "SUMMARY") return (el.parentElement as HTMLDetailsElement | null)?.open ? "open" : "close";
  const expanded = el.getAttribute("aria-expanded");
  if (expanded === "true") return "open";
  if (expanded === "false") return "close";
  if (role === "tab" || role === "radio" || role === "option" || role === "menuitem" || el.matches(HOVER_TILES)) return "select";
  if (BACK_RE.test(el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? "")) return "back";
  return "click";
}

/** Installs the one-time unlock and entry-sound listeners and the delegated control sounds. Safe to call repeatedly. */
export function installAudioManager(): () => void {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return () => undefined;
  installed = true;
  if (welcomed()) doneThisLoad = true;

  // Unlock and welcome.
  let gestureOn = true;
  const offGesture = () => {
    if (!gestureOn) return;
    gestureOn = false;
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
  };
  function onGesture() {
    try {
      unlockSfx();
      if (welcomed()) return offGesture();
      // Muted or effects off: stay armed so the entry sound can still play later.
      if (!isSfxEnabled() || isMuted() || getVolume() <= 0) return;
      markWelcomed();
      playSfx("welcome");
      offGesture();
    } catch {
      offGesture();
    }
  }
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);

  // Delegated control sounds. Hover ticks are kept for the moments they help:
  // the mouse landing on a game tile, and focus moving by keyboard.
  let hovered: Element | null = null;
  let keyboard = false;
  const auto = (name: Sfx | "none") => {
    if (name !== "none") playSfx(name, { auto: true });
  };
  const later = (fn: () => void) => void window.setTimeout(() => { try { fn(); } catch { /* optional */ } }, DEFER_MS);
  const target = (e: Event) => (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
  const quiet = (el: Element) => isDisabled(el) || !!el.closest(".corner");

  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    keyboard = false;
    const el = (e.target as Element | null)?.closest?.(HOVER_TILES) ?? null;
    if (el === hovered) return;
    hovered = el;
    if (el && !isDisabled(el) && override(el) !== "none") auto("hover");
  };
  const onKey = (e: KeyboardEvent) => {
    if (NAV_KEYS.has(e.key)) keyboard = true;
  };
  const onPointerDown = () => {
    keyboard = false;
  };
  const onFocus = (e: FocusEvent) => {
    if (!keyboard) return;
    const el = target(e);
    if (el && !quiet(el) && override(el) !== "none") auto("hover");
  };
  // Click covers mouse, touch and keyboard activation (Enter, Space) alike.
  const onClick = (e: MouseEvent) => {
    const el = target(e);
    if (!el || quiet(el)) return;
    // Selects and sliders sound on change/input, not on the click that opens them.
    if (el.tagName === "SELECT" || (el as HTMLInputElement).type === "range") return;
    later(() => auto(voiceFor(el)));
  };
  const onChange = (e: Event) => {
    const el = e.target as HTMLElement | null;
    if (!el || el.tagName !== "SELECT" || quiet(el)) return;
    const o = override(el);
    later(() => auto(o ?? "select"));
  };
  // Sliders tick as they move, with the pitch following the value.
  let lastTick = 0;
  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement | null;
    if (!el || el.type !== "range" || quiet(el)) return;
    const now = performance.now();
    if (now - lastTick < 70) return;
    lastTick = now;
    const o = override(el);
    if (o === "none") return;
    playSfx(o ?? "tick", { auto: true });
  };

  let dialogs = document.querySelectorAll("[role=dialog], dialog[open]").length;
  const observer = new MutationObserver(() => {
    const n = document.querySelectorAll("[role=dialog], dialog[open]").length;
    const was = dialogs;
    dialogs = n;
    if (n === was) return;
    // Auto: a click sound for the control that opened the dialog already counts.
    auto(n > was ? "open" : "close");
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });

  document.addEventListener("pointerover", onOver, { passive: true });
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusin", onFocus, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("input", onInput, true);
  return () => {
    offGesture();
    observer.disconnect();
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("focusin", onFocus, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("input", onInput, true);
    installed = false;
  };
}
