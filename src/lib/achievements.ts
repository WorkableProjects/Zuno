/**
 * Achievements: a small event bus that games and screens emit into, and listeners that
 * turn events into progress. Emitting never blocks gameplay: work is queued to a microtask
 * and nothing here can throw into the caller.
 *
 * Progress lives in localStorage so it works signed out; when signed in it is also merged
 * into profiles/{uid}/achievements (highest count wins), see profile.ts.
 * Achievement ids that reward a cosmetic use the cosmetic's id (see cosmetics.ts).
 */

export type GameEvent =
  | { type: "gameStarted"; gameType: string; online: boolean }
  | { type: "roomHosted"; gameType: string }
  | { type: "builderOpened" }
  | { type: "themeChanged"; theme: string }
  | { type: "profileCreated" };

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  /** Count needed to unlock. */
  goal: number;
  /** How an event advances it: returns the new count, or null if the event is irrelevant. */
  step: (ev: GameEvent, p: Progress) => number | null;
}

export interface Progress {
  count: number;
  /** Distinct values seen, for "try every…" goals. */
  seen?: string[];
  /** Unlock time (ms). */
  at?: number;
}

const GAME_TYPES = ["jeopardy", "headbands", "liar", "rpg", "blackjack", "drawit", "feud", "gridiron"];

const addSeen = (p: Progress, v: string) => {
  const seen = new Set(p.seen ?? []);
  seen.add(v);
  p.seen = [...seen];
  return p.seen.length;
};

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "first-game", label: "First game", description: "Start your first game.", goal: 1, step: (ev, p) => (ev.type === "gameStarted" ? p.count + 1 : null) },
  { id: "regular", label: "Regular", description: "Start 10 games.", goal: 10, step: (ev, p) => (ev.type === "gameStarted" ? p.count + 1 : null) },
  { id: "marathon", label: "Marathon", description: "Start 50 games.", goal: 50, step: (ev, p) => (ev.type === "gameStarted" ? p.count + 1 : null) },
  {
    id: "explorer",
    label: "Explorer",
    description: "Play every Zuno game at least once.",
    goal: GAME_TYPES.length,
    step: (ev, p) => (ev.type === "gameStarted" && GAME_TYPES.includes(ev.gameType) ? addSeen(p, ev.gameType) : null),
  },
  { id: "host", label: "Host with the most", description: "Host an online room.", goal: 1, step: (ev, p) => (ev.type === "roomHosted" ? p.count + 1 : null) },
  { id: "builder", label: "Builder", description: "Open the game builder.", goal: 1, step: (ev, p) => (ev.type === "builderOpened" ? p.count + 1 : null) },
  { id: "stylist", label: "Stylist", description: "Try three different themes.", goal: 3, step: (ev, p) => (ev.type === "themeChanged" ? addSeen(p, ev.theme) : null) },
];

export type ProgressMap = Record<string, Progress>;

const KEY = "zuno.achievements";

function readLocal(): ProgressMap {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? (v as ProgressMap) : {};
  } catch {
    return {};
  }
}
function writeLocal(m: ProgressMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* progress lasts for this visit */
  }
}

/** Keeps only well-formed entries for known achievements (input may come from the network). */
export function cleanProgress(raw: unknown): ProgressMap {
  const out: ProgressMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const def of ACHIEVEMENTS) {
    const v = (raw as Record<string, unknown>)[def.id] as Record<string, unknown> | undefined;
    if (!v || typeof v !== "object") continue;
    const count = Math.max(0, Math.min(def.goal, Math.floor(Number(v.count) || 0)));
    const p: Progress = { count };
    if (Array.isArray(v.seen)) p.seen = v.seen.filter((s): s is string => typeof s === "string" && s.length <= 32).slice(0, 16);
    if (typeof v.at === "number" && v.at > 0) p.at = v.at;
    out[def.id] = p;
  }
  return out;
}

/** Merges two progress maps: highest count, union of seen, earliest unlock. */
export function mergeProgress(a: ProgressMap, b: ProgressMap): ProgressMap {
  const out: ProgressMap = {};
  for (const def of ACHIEVEMENTS) {
    const x = a[def.id];
    const y = b[def.id];
    if (!x && !y) continue;
    const seen = [...new Set([...(x?.seen ?? []), ...(y?.seen ?? [])])];
    const at = [x?.at, y?.at].filter((t): t is number => typeof t === "number").sort((m, n) => m - n)[0];
    // For "try every…" goals the count is the number of distinct values seen on either device.
    const p: Progress = { count: Math.min(def.goal, Math.max(x?.count ?? 0, y?.count ?? 0, seen.length)) };
    if (seen.length) p.seen = seen;
    if (at) p.at = at;
    else if (p.count >= def.goal) p.at = Date.now();
    out[def.id] = p;
  }
  return out;
}

let progress: ProgressMap = cleanProgress(readLocal());
const listeners = new Set<() => void>();
const unlockListeners = new Set<(def: AchievementDef) => void>();
/** Called after every change so profile.ts can sync it; set by profile.ts. */
let persist: ((m: ProgressMap) => void) | null = null;

export const getProgress = (): ProgressMap => progress;
export function subscribeProgress(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Fires once per achievement, the moment it unlocks. */
export function onUnlock(fn: (def: AchievementDef) => void): () => void {
  unlockListeners.add(fn);
  return () => void unlockListeners.delete(fn);
}
export function setProgressSink(fn: ((m: ProgressMap) => void) | null) {
  persist = fn;
}
/** Replaces progress with a merge of local and remote (on sign-in). */
export function adoptProgress(remote: ProgressMap) {
  progress = mergeProgress(progress, remote);
  writeLocal(progress);
  listeners.forEach((l) => l());
}

/** Pure: applies one event to a progress map. Returns the new map and the achievements it unlocked. */
export function applyEvent(map: ProgressMap, ev: GameEvent, now = Date.now()): { next: ProgressMap; unlocked: AchievementDef[] } {
  const next: ProgressMap = { ...map };
  const unlocked: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    const prev = next[def.id];
    const cur: Progress = { count: prev?.count ?? 0, at: prev?.at, seen: prev?.seen ? [...prev.seen] : undefined };
    if (cur.at) continue;
    const n = def.step(ev, cur);
    if (n === null) continue;
    cur.count = Math.min(def.goal, n);
    if (cur.count >= def.goal) {
      cur.at = now;
      unlocked.push(def);
    }
    next[def.id] = cur;
  }
  return { next, unlocked };
}

/** Reports a gameplay event. Never throws and never blocks the caller. */
export function track(ev: GameEvent): void {
  queueMicrotask(() => {
    try {
      const { next, unlocked } = applyEvent(progress, ev);
      if (next === progress) return;
      progress = next;
      writeLocal(progress);
      listeners.forEach((l) => l());
      unlocked.forEach((def) => unlockListeners.forEach((l) => l(def)));
      persist?.(progress);
    } catch {
      /* achievements are optional */
    }
  });
}

export const unlockedIds = (m: ProgressMap) => Object.keys(m).filter((id) => m[id]?.at);
