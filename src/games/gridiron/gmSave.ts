/** Three save slots in IndexedDB (localStorage fallback), autosaved weekly. */
import type { Career } from "./gmTypes";
import { teamName } from "./gmCareer";

const DB = "zuno-gridiron";
const STORE = "saves";
export const SLOTS = [1, 2, 3] as const;

export interface SlotInfo {
  slot: number;
  team: string;
  coach: string;
  label: string;
  updatedAt: number;
  colors: [string, string];
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveCareer(c: Career): Promise<boolean> {
  c.updatedAt = Date.now();
  const text = JSON.stringify(c);
  const ok = await idb<IDBValidKey>("readwrite", (s) => s.put(text, `slot${c.slot}`));
  if (ok !== null) {
    writeIndex(c);
    return true;
  }
  try {
    localStorage.setItem(`zuno.gridiron.slot${c.slot}`, text);
    writeIndex(c);
    return true;
  } catch {
    return false;
  }
}

export async function loadCareer(slot: number): Promise<Career | null> {
  let text = await idb<string>("readonly", (s) => s.get(`slot${slot}`));
  if (!text) {
    try {
      text = localStorage.getItem(`zuno.gridiron.slot${slot}`);
    } catch {
      text = null;
    }
  }
  if (!text) return null;
  try {
    const c = JSON.parse(text) as Career;
    return c.version === 1 ? c : null;
  } catch {
    return null;
  }
}

export async function deleteCareer(slot: number) {
  await idb("readwrite", (s) => s.delete(`slot${slot}`));
  try {
    localStorage.removeItem(`zuno.gridiron.slot${slot}`);
    const idx = readIndex().filter((x) => x.slot !== slot);
    localStorage.setItem("zuno.gridiron.index", JSON.stringify(idx));
  } catch {
    /* ignore */
  }
}

function writeIndex(c: Career) {
  try {
    const t = c.teams[c.userTeam];
    const idx = readIndex().filter((x) => x.slot !== c.slot);
    idx.push({ slot: c.slot, team: teamName(c, c.userTeam), coach: c.coachName, label: `${c.year} · ${c.phase === "regular" ? `Week ${c.week}` : c.phase}`, updatedAt: c.updatedAt, colors: t.colors });
    localStorage.setItem("zuno.gridiron.index", JSON.stringify(idx));
  } catch {
    /* ignore */
  }
}

export function readIndex(): SlotInfo[] {
  try {
    const raw = localStorage.getItem("zuno.gridiron.index");
    const list = raw ? (JSON.parse(raw) as SlotInfo[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** A smaller copy for export: drops per-game box scores and highlights. */
export function exportableCareer(c: Career): Career {
  const copy = JSON.parse(JSON.stringify(c)) as Career;
  for (const g of copy.schedule) if (g.result) g.result = { ...g.result, players: g.home === c.userTeam || g.away === c.userTeam ? g.result.players : {}, highlights: [] };
  copy.inbox = copy.inbox.slice(0, 20);
  copy.log = copy.log.slice(-50);
  return copy;
}
