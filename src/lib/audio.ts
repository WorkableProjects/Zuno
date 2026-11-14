/**
 * Very quiet hover sounds, cut from the tracks in public/music.
 * Everything is optional: a missing file, a blocked player or a muted toggle
 * simply means silence. Nothing here can throw into the app.
 */

export type SoundTheme = "jeopardy" | "headbands";

const TRACKS: Record<SoundTheme, string> = {
  jeopardy: "ZunoApody (Jpdy).mp3",
  headbands: "LoungeAble (Headbands).mp3",
};

const MUTE_KEY = "zuno.muted";
const VOLUME = 0.045;
const SNIPPET_MS = 420;
const FADE_MS = 140;
const MIN_GAP_MS = 160;

let muted = readMuted();
let theme: SoundTheme = "jeopardy";
let lastPlay = 0;
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
  if (next) players.forEach((a) => a?.pause());
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
    audio.preload = "none";
    audio.volume = 0;
    audio.addEventListener("error", () => players.set(t, null)); // Missing file: stay silent from now on.
  } catch {
    audio = null;
  }
  players.set(t, audio);
  return audio;
}

/** Ramp a player's volume over a short time. Used for both fade in and fade out. */
export function fadeTo(audio: HTMLAudioElement, target: number, ms: number, done?: () => void) {
  const from = audio.volume;
  const start = performance.now();
  const step = (now: number) => {
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

/** A short, soft slice of the current game's track, faded in and out. */
export function playHover() {
  if (muted || typeof window === "undefined") return;
  const now = performance.now();
  if (now - lastPlay < MIN_GAP_MS) return;
  lastPlay = now;
  const audio = player(theme);
  if (!audio) return;
  try {
    audio.volume = 0;
    if (Number.isFinite(audio.duration) && audio.duration > 3) audio.currentTime = Math.random() * (audio.duration - 2);
    const started = audio.play();
    started?.catch(() => undefined); // Autoplay not allowed yet: ignore.
    fadeTo(audio, VOLUME, FADE_MS);
    window.setTimeout(() => fadeTo(audio, 0, FADE_MS, () => audio.pause()), SNIPPET_MS);
  } catch {
    /* ignore */
  }
}

/** Elements that make a hover sound. Chosen so reading text never triggers one. */
export const HOVER_SELECTOR = ".tile, .btn, .icon-btn, .segment, .rail-file, .liar-option, .option, .chip";

/** One delegated listener for the whole app. Mouse only; touch gets no sound. */
export function installHoverSounds(): () => void {
  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as Element | null)?.closest?.(HOVER_SELECTOR);
    if (!el || (el as HTMLButtonElement).disabled) return;
    const from = e.relatedTarget as Node | null;
    if (from && el.contains(from)) return; // Moving inside the same control.
    playHover();
  };
  document.addEventListener("pointerover", onOver, { passive: true });
  return () => document.removeEventListener("pointerover", onOver);
}
