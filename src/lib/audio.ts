/**
 * Hover music, from the tracks in public/music. Resting the mouse on a game
 * tile for a few seconds fades that game's track in from the start; moving off
 * fades it out. Everything is optional: a missing file, a blocked player or a
 * muted toggle simply means silence. Nothing here can throw into the app.
 */

export type SoundTheme = "jeopardy" | "headbands" | "liar";

const TRACKS: Record<SoundTheme, string> = {
  jeopardy: "ZunoApody (Jpdy).mp3",
  headbands: "LoungeAble (Headbands).mp3",
  liar: "Fibline (LIAR).mp3",
};

const MUTE_KEY = "zuno.muted";
const VOLUME = 0.3;
/** How long the pointer rests on a tile before its music starts. */
const HOVER_DELAY_MS = 5000;
const FADE_IN_MS = 1800;
const FADE_OUT_MS = 700;

let muted = readMuted();
let theme: SoundTheme = "jeopardy";
let playing: HTMLAudioElement | null = null;
let hoverTimer: number | undefined;
const players = new Map<SoundTheme, HTMLAudioElement | null>();
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export const isMuted = () => muted;

export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
  if (next) stopMusic();
  listeners.forEach((l) => l());
}

export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSoundTheme(next: SoundTheme) {
  theme = next;
}

function player(t: SoundTheme): HTMLAudioElement | null {
  if (players.has(t)) return players.get(t) ?? null;
  let audio: HTMLAudioElement | null = null;
  try {
    audio = new Audio(`${import.meta.env.BASE_URL}music/${encodeURIComponent(TRACKS[t])}`);
    // Load ahead so the music starts the moment the hover delay ends.
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = 0;
    audio.addEventListener("error", () => players.set(t, null)); // Missing file: stay silent from now on.
  } catch {
    audio = null;
  }
  players.set(t, audio);
  return audio;
}

/** Ramp a player's volume over a short time. Used for both fade in and fade out. */
const fadeIds = new WeakMap<HTMLAudioElement, number>();
export function fadeTo(audio: HTMLAudioElement, target: number, ms: number, done?: () => void) {
  const from = audio.volume;
  const start = performance.now();
  const id = (fadeIds.get(audio) ?? 0) + 1;
  fadeIds.set(audio, id); // A newer fade on the same track replaces this one.
  const step = (now: number) => {
    if (fadeIds.get(audio) !== id) return;
    const k = Math.min(1, (now - start) / ms);
    try {
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * k));
    } catch {
      return;
    }
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

/** Fade the current game's track in from the beginning. */
export function startMusic() {
  if (muted || typeof window === "undefined") return;
  const audio = player(theme);
  if (!audio) return;
  if (playing && playing !== audio) stopMusic();
  if (playing === audio && !audio.paused) return;
  try {
    audio.volume = 0;
    audio.currentTime = 0;
    audio.play()?.catch(() => undefined); // Autoplay not allowed yet: ignore.
    playing = audio;
    fadeTo(audio, VOLUME, FADE_IN_MS);
  } catch {
    /* ignore */
  }
}

/** Fade out whatever is playing. */
export function stopMusic() {
  window.clearTimeout(hoverTimer);
  const audio = playing;
  playing = null;
  if (!audio) return;
  fadeTo(audio, 0, FADE_OUT_MS, () => {
    if (playing !== audio) audio.pause();
  });
}

/** Warm up every track so none has to load when the music starts. */
function preloadAll() {
  (Object.keys(TRACKS) as SoundTheme[]).forEach((t) => {
    const a = player(t);
    try {
      a?.load();
    } catch {
      /* ignore */
    }
  });
}

const TILE_SELECTOR = ".tile";

/** One delegated listener for the whole app. Mouse only; touch gets no music. */
export function installHoverSounds(): () => void {
  preloadAll();
  let current: Element | null = null;
  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const tile = (e.target as Element | null)?.closest?.(TILE_SELECTOR) ?? null;
    if (tile === current) return;
    current = tile;
    stopMusic();
    if (!tile) return;
    // The tile selects itself on hover, so the theme is that game's by the time this fires.
    hoverTimer = window.setTimeout(startMusic, HOVER_DELAY_MS);
  };
  const onLeave = () => {
    current = null;
    stopMusic();
  };
  document.addEventListener("pointerover", onOver, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  return () => {
    document.removeEventListener("pointerover", onOver);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    stopMusic();
  };
}
