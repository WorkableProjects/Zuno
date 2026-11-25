import { getVolume, isMuted } from "./audio";
import { getSfxContext, isSfxEnabled, playSfx, unlockSfx } from "./sfx";

/**
 * Global audio manager. Browsers keep audio suspended until a user gesture, so
 * this installs one set of capture listeners that unlock the shared sfx
 * context on the first press or key, then plays a short entry sound once per
 * browser session. It follows the mute, volume and sound-effects settings, and
 * nothing here can throw into the app.
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

/** Installs the one-time unlock and entry-sound listeners. Safe to call repeatedly. */
export function installAudioManager(): () => void {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;
  if (welcomed()) doneThisLoad = true;
  const off = () => {
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
    installed = false;
  };
  function onGesture() {
    try {
      unlockSfx();
      if (welcomed()) return off();
      // Muted or effects off: stay armed so the entry sound can still play later.
      if (!isSfxEnabled() || isMuted() || getVolume() <= 0) return;
      markWelcomed();
      playSfx("welcome");
      off();
    } catch {
      off();
    }
  }
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
  return off;
}
