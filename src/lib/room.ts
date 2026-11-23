import { useEffect, useSyncExternalStore } from "react";

/** The online room the player is in right now, e.g. `{ path: "rpg/ABCDE", name: "Sam" }`. */
export type Room = { path: string; name: string };

let current: Room | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Registers (or clears) the online room. Listeners only fire when something changed. */
export function setRoom(room: Room | null): void {
  if (room === null ? current === null : current?.path === room.path && current.name === room.name) return;
  current = room;
  listeners.forEach((fn) => fn());
}

/** Low-level subscription for non-React consumers. */
export const subscribeRoom = subscribe;

export const getRoom = (): Room | null => current;

export function useRoom(): Room | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Registers the room for as long as the calling screen is mounted. */
export function useRegisterRoom(path: string | null, name: string): void {
  useEffect(() => {
    setRoom(path ? { path, name } : null);
    return () => setRoom(null);
  }, [path, name]);
}
