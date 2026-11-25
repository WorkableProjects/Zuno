import { useEffect } from "react";
import { getRoom, subscribeRoom } from "./room";
import { getSfxContext, playSfx, playSfxBuffer, unlockSfx, type Sfx } from "./sfx";

/**
 * A tiny soundboard. Pressing a sound plays it on this device and, when an
 * online room is registered, for everyone else in that room too. Sounds travel
 * as short ids under `{room}/board`; receivers only play ids on the whitelist.
 */
export const BOARD_IDS = ["airhorn", "drumroll", "sadTrombone", "applause", "boing", "rimshot", "win", "wrong"] as const satisfies readonly Sfx[];
export type BoardId = (typeof BOARD_IDS)[number];

export const isBoardId = (v: unknown): v is BoardId => typeof v === "string" && (BOARD_IDS as readonly string[]).includes(v);

/** Recorded CC0 clips in public/sounds/board (see CREDITS.md). Others use the synthesized sound. */
export const BOARD_CLIPS: Partial<Record<BoardId, string>> = {
  applause: "applause.mp3",
  boing: "boing.mp3",
  rimshot: "rimshot.mp3",
  win: "win.mp3",
};

/** Display name and approximate length in seconds for each board sound. */
export const BOARD_INFO: Record<BoardId, { label: string; seconds: number }> = {
  airhorn: { label: "Air horn", seconds: 1 },
  drumroll: { label: "Drum roll", seconds: 1.8 },
  sadTrombone: { label: "Sad trombone", seconds: 2.7 },
  applause: { label: "Applause", seconds: 4 },
  boing: { label: "Boing", seconds: 2 },
  rimshot: { label: "Rimshot", seconds: 1 },
  win: { label: "Fanfare", seconds: 3 },
  wrong: { label: "Buzzer", seconds: 0.5 },
};

/** Whether a board sound is a recorded clip or the built-in synthesized sound. */
export const boardKind = (id: BoardId): "clip" | "synth" => (BOARD_CLIPS[id] ? "clip" : "synth");

const clips = new Map<BoardId, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Fetches and decodes the recorded clips once. Safe to call repeatedly; failures leave the synth fallback. */
export function preloadBoardClips(): Promise<void> {
  if (loading) return loading;
  const ac = getSfxContext();
  if (!ac || typeof fetch === "undefined") return Promise.resolve();
  let failed = false;
  loading = Promise.all(
    (Object.entries(BOARD_CLIPS) as [BoardId, string][]).map(async ([id, file]) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sounds/board/${file}`);
        if (!res.ok) throw new Error(String(res.status));
        clips.set(id, await ac.decodeAudioData(await res.arrayBuffer()));
      } catch {
        // Falls back to the synthesized sound; the next preload retries.
        failed = true;
      }
    }),
  ).then(() => {
    if (failed) loading = null;
  });
  return loading;
}

/** Plays the recorded clip when loaded, otherwise the synthesized sound. */
export function playBoardSound(id: BoardId): void {
  note(id);
  const buf = clips.get(id);
  if (buf && playSfxBuffer(buf)) return;
  playSfx(id);
}

export const BOARD_COOLDOWN_MS = 1500;
/** Pure cooldown check: true when enough time has passed since the last press. */
export function cooldownReady(lastAt: number, now: number, ms = BOARD_COOLDOWN_MS): boolean {
  return now - lastAt >= ms || now < lastAt;
}

/** How long a sent sound stays in the database before its sender removes it. */
const KEEP_MS = 30_000;

let lastSent = -Infinity;
let stop: (() => void) | null = null;
let listening: string | null = null;

/** Starts or stops the board listener to follow the registered room. */
function syncListener(): void {
  const path = getRoom()?.path ?? null;
  if (path === listening) return;
  stop?.();
  stop = null;
  listening = path;
  if (path) {
    stop = listen(path);
    void preloadBoardClips();
  }
}

/** Keeps the soundboard listener in step with the room store; mount once. */
export function useSoundboardListener(): void {
  useEffect(() => {
    const un = subscribeRoom(syncListener);
    syncListener();
    return () => {
      un();
      stop?.();
      stop = null;
      listening = null;
    };
  }, []);
}

export async function backend() {
  const [{ lobbiesAvailable, database }, db] = await Promise.all([import("../games/headbands/lobby"), import("firebase/database")]);
  return lobbiesAvailable() ? { d: database(), db } : null;
}

/** Keys of sounds this device already played itself, so the room listener skips them. */
const played = new Set<string>();
const markPlayed = (key: string) => {
  played.add(key);
  window.setTimeout(() => played.delete(key), 60_000);
};

/** Window hook for tests and debugging: every board sound that reaches playBoardSound. */
function note(id: BoardId) {
  try {
    const w = window as unknown as { __boardPlays?: string[] };
    (w.__boardPlays ??= []).push(id);
  } catch {
    /* ignore */
  }
}

/** Number of recent sounds watched; wide enough that bursts are never missed. */
const BOARD_WINDOW = 20;

function listen(path: string): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  void backend()
    .then((b) => {
      if (!b || cancelled) return;
      const { ref, query, orderByKey, limitToLast, onChildAdded, onValue } = b.db;
      const q = query(ref(b.d, `${path}/board`), orderByKey(), limitToLast(BOARD_WINDOW));
      let ready = false;
      const seen = new Set<string>();
      let newest = "";
      const unChild = onChildAdded(q, (snap) => {
        const key = snap.key;
        if (!key || seen.has(key)) return;
        seen.add(key);
        // The first batch is whatever was already there: skip it. Push keys
        // sort by time, so an older entry sliding into the window after a
        // delete never replays.
        if (!ready || key <= newest) {
          if (!ready && key > newest) newest = key;
          return;
        }
        newest = key;
        if (played.has(key)) return;
        const id = (snap.val() as { s?: unknown } | null)?.s;
        if (isBoardId(id)) playBoardSound(id);
      }, () => undefined);
      // Child events for the existing data arrive before this value event.
      const unValue = onValue(q, () => void (ready = true), () => undefined, { onlyOnce: true });
      off = () => {
        unChild();
        unValue();
      };
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    off?.();
  };
}

/** Plays a sound here and for the room. Returns false while cooling down. */
export function sendBoardSound(id: BoardId, by?: string): boolean {
  if (!isBoardId(id)) return false;
  const now = Date.now();
  if (!cooldownReady(lastSent, now)) return false;
  lastSent = now;
  // Runs inside the tap: unlock audio here, and play at once so the sender
  // never waits on the network or on their own listener.
  unlockSfx();
  playBoardSound(id);
  const path = getRoom()?.path ?? null;
  if (!path) return true;
  void backend()
    .then((b) => {
      if (!b) return;
      const { ref, push, set, remove, serverTimestamp } = b.db;
      const name = by?.trim().slice(0, 24);
      // Mark the key before writing: the local write fires the listener synchronously.
      const item = push(ref(b.d, `${path}/board`));
      if (item.key) markPlayed(item.key);
      void set(item, { s: id, at: serverTimestamp(), ...(name ? { by: name } : {}) }).catch(() => undefined);
      window.setTimeout(() => void remove(item).catch(() => undefined), KEEP_MS);
    })
    .catch(() => undefined);
  return true;
}
