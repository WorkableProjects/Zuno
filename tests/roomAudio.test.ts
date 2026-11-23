import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the Realtime Database: ordered children per path.
type Cb = (snap: { key: string; val: () => unknown }) => void;
const store = new Map<string, Map<string, unknown>>();
const subs = new Map<string, Set<{ cb: Cb; limit: number }>>();
let n = 0;
const emit = (path: string, key: string, val: unknown) => subs.get(path)?.forEach((s) => s.cb({ key, val: () => val }));
const fake = {
  ref: (_d: unknown, path: string) => ({ path, key: null as string | null }),
  query: (r: { path: string }, ..._m: unknown[]) => ({ path: r.path, limit: 20 }),
  orderByKey: () => 0,
  limitToLast: (l: number) => l,
  onChildAdded: (q: { path: string; limit: number }, cb: Cb) => {
    const kids = [...(store.get(q.path) ?? new Map()).entries()].slice(-q.limit);
    kids.forEach(([k, v]) => cb({ key: k, val: () => v }));
    const set = subs.get(q.path) ?? new Set();
    const s = { cb, limit: q.limit };
    set.add(s);
    subs.set(q.path, set);
    return () => void set.delete(s);
  },
  onValue: (_q: unknown, cb: () => void) => {
    queueMicrotask(cb);
    return () => undefined;
  },
  push: (r: { path: string }) => {
    const key = `k${String(++n).padStart(4, "0")}`;
    return Object.assign(Promise.resolve(), { path: `${r.path}/${key}`, key, parent: r.path });
  },
  set: async (item: { parent: string; key: string }, val: unknown) => {
    const m = store.get(item.parent) ?? new Map();
    m.set(item.key, val);
    store.set(item.parent, m);
    emit(item.parent, item.key, val);
  },
  remove: async () => undefined,
  serverTimestamp: () => Date.now(),
};
vi.mock("firebase/database", () => fake);
vi.mock("../src/games/headbands/lobby", () => ({ lobbiesAvailable: () => true, database: () => ({}) }));
vi.mock("react", () => ({ useEffect: (f: () => void) => void f(), useSyncExternalStore: () => null }));
const played: string[] = [];
vi.mock("../src/lib/sfx", () => ({
  getSfxContext: () => null,
  playSfx: (id: string) => void played.push(id),
  playSfxBuffer: () => false,
  unlockSfx: () => true,
}));

const flush = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  store.clear();
  subs.clear();
  played.length = 0;
  vi.resetModules();
  (globalThis as { window?: unknown }).window = globalThis;
});
afterEach(() => vi.useRealTimers());

describe("room registration", () => {
  it("does not drop the room when one screen hands over to another", async () => {
    const room = await import("../src/lib/room");
    const seen: (string | null)[] = [];
    room.subscribeRoom(() => seen.push(room.getRoom()?.path ?? null));
    room.setRoom({ path: "hb/ABCDE", name: "Host" });
    // Simulates cleanup of the old screen followed by effect of the new one.
    vi.useFakeTimers();
    let owner = 0;
    const mount = (path: string) => {
      const me = ++owner;
      room.setRoom({ path, name: "Host" });
      return () => void setTimeout(() => owner === me && room.setRoom(null), 0);
    };
    const un = mount("hb/ABCDE");
    un();
    mount("hb/ABCDE");
    vi.runAllTimers();
    expect(room.getRoom()?.path).toBe("hb/ABCDE");
    expect(seen).not.toContain(null);
  });
});

describe("soundboard listener", () => {
  it("plays two sounds arriving back to back, once each, and skips history", async () => {
    const room = await import("../src/lib/room");
    const sb = await import("../src/lib/soundboard");
    store.set("liar/ABCDE/board", new Map([["k0000", { s: "boing", at: 1 }]]));
    sb.useSoundboardListener();
    room.setRoom({ path: "liar/ABCDE", name: "P" });
    await flush();
    expect(played).toEqual([]);
    await fake.set({ parent: "liar/ABCDE/board", key: "k0001" }, { s: "airhorn", at: 2 });
    await fake.set({ parent: "liar/ABCDE/board", key: "k0002" }, { s: "rimshot", at: 3 });
    expect(played).toEqual(["airhorn", "rimshot"]);
  });

  it("plays the sender's own sound exactly once", async () => {
    const room = await import("../src/lib/room");
    const sb = await import("../src/lib/soundboard");
    sb.useSoundboardListener();
    room.setRoom({ path: "rpg/ABCDE", name: "P" });
    await flush();
    expect(sb.sendBoardSound("win")).toBe(true);
    await flush();
    expect(played).toEqual(["win"]);
    expect(store.get("rpg/ABCDE/board")?.size).toBe(1);
  });
});
