import { useEffect, useSyncExternalStore } from "react";
import { getSfxContext, playSfx, playSfxBuffer, type Sfx } from "./sfx";

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

const clips = new Map<BoardId, AudioBuffer>();
let loading: Promise<void> | null = null;

/** Fetches and decodes the recorded clips once. Safe to call repeatedly; failures leave the synth fallback. */
export function preloadBoardClips(): Promise<void> {
  if (loading) return loading;
  const ac = getSfxContext();
  if (!ac || typeof fetch === "undefined") return Promise.resolve();
  loading = Promise.all(
    (Object.entries(BOARD_CLIPS) as [BoardId, string][]).map(async ([id, file]) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sounds/board/${file}`);
        if (!res.ok) return;
        clips.set(id, await ac.decodeAudioData(await res.arrayBuffer()));
      } catch {
        /* falls back to the synthesized sound */
      }
    }),
  ).then(() => undefined);
  return loading;
}

/** Plays the recorded clip when loaded, otherwise the synthesized sound. */
export function playBoardSound(id: BoardId): void {
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

let room: string | null = null;
let lastSent = -Infinity;
let stop: (() => void) | null = null;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Registers (or clears) the online room, e.g. "rpg/ABCDE". */
export function setSoundboardRoom(path: string | null): void {
  if (path === room) return;
  stop?.();
  stop = null;
  room = path;
  listeners.forEach((fn) => fn());
  if (path) stop = listen(path);
}

export function useSoundboardRoom(): string | null {
  return useSyncExternalStore(subscribe, () => room, () => null);
}

/** Registers the room for as long as the calling screen is mounted. */
export function useRegisterSoundboard(path: string | null): void {
  useEffect(() => {
    setSoundboardRoom(path);
    return () => setSoundboardRoom(null);
  }, [path]);
}

async function backend() {
  const [{ lobbiesAvailable, database }, db] = await Promise.all([import("../games/headbands/lobby"), import("firebase/database")]);
  return lobbiesAvailable() ? { d: database(), db } : null;
}

function listen(path: string): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  void backend()
    .then((b) => {
      if (!b || cancelled) return;
      const { ref, query, orderByKey, limitToLast, onChildAdded, onValue } = b.db;
      const q = query(ref(b.d, `${path}/board`), orderByKey(), limitToLast(1));
      let ready = false;
      const unChild = onChildAdded(q, (snap) => {
        // The first batch is whatever was already there: skip it.
        if (!ready) return;
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
  const path = room;
  if (!path) {
    playBoardSound(id);
    return true;
  }
  void backend()
    .then((b) => {
      if (!b) {
        playBoardSound(id);
        return;
      }
      const { ref, push, remove, serverTimestamp } = b.db;
      const name = by?.trim().slice(0, 24);
      // The room's own listener plays it, here included, so every device hears it together.
      const item = push(ref(b.d, `${path}/board`), { s: id, at: serverTimestamp(), ...(name ? { by: name } : {}) });
      window.setTimeout(() => void remove(item).catch(() => undefined), KEEP_MS);
      item.catch(() => playBoardSound(id));
    })
    .catch(() => playBoardSound(id));
  return true;
}
