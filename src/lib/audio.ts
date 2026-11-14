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
  liar: "Liar's Little Clue.mp3",
};

const MUTE_KEY = "zuno.muted";
const VOLUME_KEY = "zuno.level";
/** The meter's 0-100% maps onto quieter real gain: 70% on the meter plays at 0.3. */
const GAIN_AT_FULL = 0.3 / 0.7;
const DEFAULT_VOLUME = 0.7;
/** Quick fades used when switching games or nudging the volume. */
const CROSSFADE_MS = 900;
/** Gap allowed between tiles before the music counts as left. */
const LEAVE_GRACE_MS = 1500;
/** How long the pointer rests on a tile before its music starts. */
const HOVER_DELAY_MS = 1700;
const FADE_IN_MS = 1800;
const FADE_OUT_MS = 700;

let muted = readMuted();
let volume = readVolume();
let theme: SoundTheme = "jeopardy";
let playing: HTMLAudioElement | null = null;
let hoverTimer: number | undefined;
/** Set when the browser refused to play; the next click or key press retries. */
let blocked = false;
let hoveringTile = false;
const players = new Map<SoundTheme, HTMLAudioElement | null>();
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export const isMuted = () => muted;
/** Meter level from 0 to 1, as shown to the person. */
export const getVolume = () => volume;

export function setVolume(next: number) {
  volume = Math.max(0, Math.min(1, next));
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    /* storage unavailable: the level lasts for this visit */
  }
  if (playing) fadeTo(playing, volume * GAIN_AT_FULL, 120);
  // Dragging the level up from zero turns sound back on.
  if (muted && volume > 0) setMuted(false);
  else listeners.forEach((l) => l());
}

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
export function startMusic(fadeMs = FADE_IN_MS) {
  if (muted || typeof window === "undefined") return;
  const audio = player(theme);
  if (!audio) return;
  if (playing === audio && !audio.paused) return;
  if (playing) stopMusic(CROSSFADE_MS);
  try {
    audio.volume = 0;
    audio.currentTime = 0;
    playing = audio;
    audio.play()?.catch(() => {
      // The browser refused: no click or key press on the page yet. Try again on the next one.
      if (playing === audio) playing = null;
      blocked = true;
    });
    fadeTo(audio, volume * GAIN_AT_FULL, fadeMs);
  } catch {
    /* ignore */
  }
}

/** Fade out whatever is playing. */
export function stopMusic(fadeMs = FADE_OUT_MS) {
  window.clearTimeout(hoverTimer);
  const audio = playing;
  playing = null;
  if (!audio) return;
  fadeTo(audio, 0, fadeMs, () => {
    if (playing !== audio) audio.pause();
  });
}

/**
 * Called from a click or key press. Browsers only let a page play sound after
 * one, so each track is started silently and stopped inside that gesture;
 * from then on hovering can start the music.
 */
export function unlockAudio() {
  blocked = false;
  (Object.keys(TRACKS) as SoundTheme[]).forEach((t) => {
    const a = player(t);
    if (!a || a === playing) return;
    try {
      a.muted = true;
      const started = a.play();
      const reset = () => {
        if (a === playing) return;
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      };
      if (started) started.then(reset, () => (a.muted = false));
      else reset();
    } catch {
      a.muted = false;
    }
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
  let leaveTimer: number | undefined;
  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const target = e.target as Element | null;
    // Adjusting the volume keeps the music going so the level can be heard.
    if (target?.closest?.(".sound-control")) {
      window.clearTimeout(leaveTimer);
      return;
    }
    const tile = target?.closest?.(TILE_SELECTOR) ?? null;
    if (tile === current) return;
    current = tile;
    hoveringTile = !!tile;
    window.clearTimeout(hoverTimer);
    window.clearTimeout(leaveTimer);
    if (!tile) {
      if (playing) leaveTimer = window.setTimeout(() => stopMusic(), LEAVE_GRACE_MS);
      return;
    }
    // The tile selects itself on hover, which sets the theme; wait a moment for that.
    // Music already playing crossfades straight to the new game; otherwise it waits.
    hoverTimer = playing ? window.setTimeout(() => startMusic(CROSSFADE_MS), 120) : window.setTimeout(() => startMusic(), HOVER_DELAY_MS);
  };
  // Browsers only allow sound after the person clicks or types on the page.
  const onGesture = () => {
    if (!blocked) return;
    blocked = false;
    if (hoveringTile) startMusic();
  };
  document.addEventListener("pointerdown", onGesture, true);
  document.addEventListener("keydown", onGesture, true);
  const onLeave = () => {
    window.clearTimeout(leaveTimer);
    hoveringTile = false;
    current = null;
    stopMusic();
  };
  document.addEventListener("pointerover", onOver, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  return () => {
    document.removeEventListener("pointerover", onOver);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("pointerdown", onGesture, true);
    document.removeEventListener("keydown", onGesture, true);
    stopMusic();
  };
}
