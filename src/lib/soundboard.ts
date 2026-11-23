import { useEffect, useSyncExternalStore } from "react";
import { playSfx, type Sfx } from "./sfx";

/**
 * A tiny soundboard. Pressing a sound plays it on this device and, when an
 * online room is registered, for everyone else in that room too. Sounds travel
 * as short ids under `{room}/board`; receivers only play ids on the whitelist.
 */
export const BOARD_IDS = ["airhorn", "drumroll", "sadTrombone", "applause", "boing", "rimshot", "win", "wrong"] as const satisfies readonly Sfx[];
export type BoardId = (typeof BOARD_IDS)[number];

export const isBoardId = (v: unknown): v is BoardId => typeof v === "string" && (BOARD_IDS as readonly string[]).includes(v);

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
        if (isBoardId(id)) playSfx(id);
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
    playSfx(id);
    return true;
  }
  void backend()
    .then((b) => {
      if (!b) {
        playSfx(id);
        return;
      }
      const { ref, push, remove, serverTimestamp } = b.db;
      const name = by?.trim().slice(0, 24);
      // The room's own listener plays it, here included, so every device hears it together.
      const item = push(ref(b.d, `${path}/board`), { s: id, at: serverTimestamp(), ...(name ? { by: name } : {}) });
      window.setTimeout(() => void remove(item).catch(() => undefined), KEEP_MS);
      item.catch(() => playSfx(id));
    })
    .catch(() => playSfx(id));
  return true;
}
