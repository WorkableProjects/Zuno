/**
 * Three save slots in IndexedDB (localStorage fallback), autosaved weekly.
 *
 * Save format history:
 *   v1 (Career.version 1, no saveVersion): the original careers.
 *   v2 (saveVersion 2): adds `saveVersion` and an optional `customPlays` list. Career.version stays 1, so older
 *       builds can still read a v2 save and simply ignore the new fields.
 * `migrateCareer` upgrades anything older and fills defaults for missing optional fields.
 */
import type { Career } from "./gmTypes";
import { teamName } from "./gmCareer";
import { CURRENT_SCHEMA_VERSION } from "../../game-files/schema/common";
import { GRIDIRON_SAVE_VERSION, GRIDIRON_TYPE, sanitizeCustomPlays, type CustomPlayRecord } from "../../game-files/schema/gridiron";
import { validateGameFileText } from "../../game-files/schema/validateGameFile";

const DB = "zuno-gridiron";
const STORE = "saves";
const LS_PREFIX = "zuno.gridiron.slot";
const LS_INDEX = "zuno.gridiron.index";
export const SLOTS = [1, 2, 3] as const;

/** A career as stored: the engine type plus the v2 fields. */
export type SavedCareer = Career & { saveVersion?: number; customPlays?: CustomPlayRecord[] };

export interface SlotInfo {
  slot: number;
  team: string;
  coach: string;
  label: string;
  updatedAt: number;
  colors: [string, string];
  year?: number;
  saveVersion?: number;
  /** Set when the slot holds data that could not be read. */
  corrupt?: boolean;
}

export type SaveErrorKind = "quota" | "unavailable" | "unknown";
export interface SaveResult {
  ok: boolean;
  error?: string;
  kind?: SaveErrorKind;
}

function isQuota(e: unknown): boolean {
  const x = e as { name?: string; code?: number } | null;
  return !!x && (x.name === "QuotaExceededError" || x.name === "NS_ERROR_DOM_QUOTA_REACHED" || x.code === 22 || x.code === 1014);
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

interface IdbOutcome<T> {
  ok: boolean;
  value: T | null;
  quota: boolean;
}

/** Resolves ok only when the transaction has completed, so a write is never reported before it is durable. */
async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<IdbOutcome<T>> {
  const db = await openDb();
  if (!db) return { ok: false, value: null, quota: false };
  return new Promise((resolve) => {
    let value: T | null = null;
    try {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => {
        value = (req.result as T) ?? null;
      };
      tx.oncomplete = () => {
        db.close();
        resolve({ ok: true, value, quota: false });
      };
      const fail = () => {
        const quota = isQuota(tx.error) || isQuota(req.error);
        try {
          db.close();
        } catch {
          /* ignore */
        }
        resolve({ ok: false, value: null, quota });
      };
      tx.onerror = fail;
      tx.onabort = fail;
    } catch (e) {
      resolve({ ok: false, value: null, quota: isQuota(e) });
    }
  });
}

// ---------------------------------------------------------------------------
// Migration

export type MigrateResult = { ok: true; career: SavedCareer; notes: string[] } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Upgrades an untrusted parsed career (any known version) to the current shape. Does not mutate the input.
 * Returns an error only when the data cannot be a career at all; otherwise missing optional fields get defaults.
 */
export function migrateCareer(raw: unknown, slot?: number): MigrateResult {
  if (!isObj(raw)) return { ok: false, error: "The save is not a career." };
  if (raw.version !== 1) return { ok: false, error: "This save is from a version Gridiron GM can't read." };
  const sv = raw.saveVersion;
  if (sv !== undefined && (typeof sv !== "number" || !Number.isFinite(sv) || sv < 1)) return { ok: false, error: "The save has an invalid save version." };
  if (typeof sv === "number" && sv > GRIDIRON_SAVE_VERSION) return { ok: false, error: "This save was made by a newer version of Gridiron GM." };
  if (!Array.isArray(raw.teams) || raw.teams.length !== 32) return { ok: false, error: "The save is missing its 32 teams." };
  if (!isObj(raw.players) || !Array.isArray(raw.schedule)) return { ok: false, error: "The save is missing players or its schedule." };
  if (typeof raw.userTeam !== "number" || !isObj(raw.teams[raw.userTeam])) return { ok: false, error: "The save doesn't say which team you coach." };
  if (typeof raw.year !== "number" || typeof raw.week !== "number" || typeof raw.phase !== "string") return { ok: false, error: "The save is missing its year, week or phase." };

  let c: SavedCareer;
  try {
    c = JSON.parse(JSON.stringify(raw)) as SavedCareer;
  } catch {
    return { ok: false, error: "The save can't be copied." };
  }
  const notes: string[] = [];
  const from = typeof sv === "number" ? sv : 1;
  if (from < GRIDIRON_SAVE_VERSION) notes.push(`Upgraded from save format ${from} to ${GRIDIRON_SAVE_VERSION}.`);
  c.saveVersion = GRIDIRON_SAVE_VERSION;
  if (typeof slot === "number") c.slot = slot;
  else if (typeof c.slot !== "number") c.slot = 1;
  if (typeof c.coachName !== "string") c.coachName = "Coach";
  if (typeof c.seed !== "number") c.seed = 1;
  if (typeof c.nextId !== "number") {
    const ids = Object.keys(c.players).map(Number).filter(Number.isFinite);
    c.nextId = (ids.length ? Math.max(...ids) : 0) + 1;
  }
  const arr = ["picks", "prospects", "inbox", "offers", "coachPool", "history", "hallOfFame", "trophies", "log"] as const;
  for (const k of arr) if (!Array.isArray(c[k])) (c as unknown as Record<string, unknown>)[k] = [];
  for (const k of ["seasonStats", "records", "deadCap"] as const) if (!isObj(c[k])) (c as unknown as Record<string, unknown>)[k] = {};
  if (typeof c.cap !== "number") c.cap = 255;
  if (typeof c.scoutPoints !== "number") c.scoutPoints = 0;
  if (typeof c.jobSecurity !== "number") c.jobSecurity = 70;
  if (typeof c.goal !== "string") c.goal = "";
  if (typeof c.pressPending !== "boolean") c.pressPending = false;
  if (typeof c.coachMode !== "boolean") c.coachMode = false;
  if (!isObj(c.training)) c.training = { focus: "Balanced", intensity: "Normal" };
  if (typeof c.updatedAt !== "number") c.updatedAt = 0;

  const cp = sanitizeCustomPlays(c.customPlays);
  c.customPlays = cp.plays;
  if (cp.problems.length) notes.push(`${cp.problems.length} custom play(s) were skipped because they were damaged.`);
  return { ok: true, career: c, notes };
}

// ---------------------------------------------------------------------------
// Slots

function lsKey(slot: number) {
  return `${LS_PREFIX}${slot}`;
}

function describeFail(kind: SaveErrorKind): string {
  if (kind === "quota") return "Browser storage is full. Free some space or export the career to a file.";
  if (kind === "unavailable") return "This browser isn't letting Gridiron GM store saves (private mode or blocked site data). Export the career to a file to keep it.";
  return "The save could not be written.";
}

export async function saveCareerResult(c: Career): Promise<SaveResult> {
  if (!SLOTS.includes(c.slot as 1 | 2 | 3)) return { ok: false, kind: "unknown", error: "That save slot doesn't exist." };
  const prevUpdated = c.updatedAt;
  c.updatedAt = Date.now();
  let text: string;
  try {
    const sc = c as SavedCareer;
    sc.saveVersion = GRIDIRON_SAVE_VERSION;
    if (!Array.isArray(sc.customPlays)) sc.customPlays = [];
    text = JSON.stringify(sc);
  } catch {
    c.updatedAt = prevUpdated;
    return { ok: false, kind: "unknown", error: "The career could not be turned into a save." };
  }
  let kind: SaveErrorKind = "unavailable";
  const w = await idb<IDBValidKey>("readwrite", (s) => s.put(text, `slot${c.slot}`));
  if (w.ok) {
    try {
      localStorage.removeItem(lsKey(c.slot)); // no stale fallback copy
    } catch {
      /* ignore */
    }
    writeIndex(c);
    return { ok: true };
  }
  if (w.quota) kind = "quota";
  try {
    localStorage.setItem(lsKey(c.slot), text);
    writeIndex(c);
    // The fallback copy is the newest; drop any older IndexedDB copy so loads never pick it.
    await idb("readwrite", (s) => s.delete(`slot${c.slot}`));
    return { ok: true };
  } catch (e) {
    if (isQuota(e)) kind = "quota";
    c.updatedAt = prevUpdated;
    return { ok: false, kind, error: describeFail(kind) };
  }
}

export async function saveCareer(c: Career): Promise<boolean> {
  return (await saveCareerResult(c)).ok;
}

export type LoadResult =
  | { status: "ok"; career: SavedCareer; notes: string[] }
  | { status: "empty" }
  | { status: "corrupt"; reason: string };

async function readRaw(slot: number): Promise<string[]> {
  const out: string[] = [];
  const r = await idb<string>("readonly", (s) => s.get(`slot${slot}`));
  if (typeof r.value === "string" && r.value) out.push(r.value);
  try {
    const t = localStorage.getItem(lsKey(slot));
    if (t) out.push(t);
  } catch {
    /* ignore */
  }
  return out;
}

export async function loadCareerResult(slot: number): Promise<LoadResult> {
  const texts = await readRaw(slot);
  if (!texts.length) return { status: "empty" };
  let best: { career: SavedCareer; notes: string[] } | null = null;
  let reason = "The save file is damaged.";
  for (const text of texts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      reason = "The save is not valid data (it may have been cut off while writing).";
      continue;
    }
    const m = migrateCareer(parsed, slot);
    if (!m.ok) {
      reason = m.error;
      continue;
    }
    if (!best || m.career.updatedAt > best.career.updatedAt) best = { career: m.career, notes: m.notes };
  }
  return best ? { status: "ok", ...best } : { status: "corrupt", reason };
}

export async function loadCareer(slot: number): Promise<Career | null> {
  const r = await loadCareerResult(slot);
  return r.status === "ok" ? r.career : null;
}

export async function deleteCareer(slot: number): Promise<boolean> {
  await idb("readwrite", (s) => s.delete(`slot${slot}`));
  try {
    localStorage.removeItem(lsKey(slot));
    localStorage.setItem(LS_INDEX, JSON.stringify(readIndex().filter((x) => x.slot !== slot)));
  } catch {
    /* ignore */
  }
  const left = await readRaw(slot);
  return left.length === 0;
}

function infoOf(c: Career): SlotInfo {
  const t = c.teams[c.userTeam];
  return {
    slot: c.slot,
    team: teamName(c, c.userTeam),
    coach: c.coachName,
    label: `${c.year} · ${c.phase === "regular" ? `Week ${c.week}` : c.phase}`,
    updatedAt: c.updatedAt,
    colors: t.colors,
    year: c.year,
    saveVersion: GRIDIRON_SAVE_VERSION,
  };
}

function writeIndex(c: Career) {
  try {
    const idx = readIndex().filter((x) => x.slot !== c.slot);
    idx.push(infoOf(c));
    localStorage.setItem(LS_INDEX, JSON.stringify(idx));
  } catch {
    /* the index is only a cache; rebuildIndex recovers it */
  }
}

export function readIndex(): SlotInfo[] {
  try {
    const raw = localStorage.getItem(LS_INDEX);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((x): x is SlotInfo => isObj(x) && SLOTS.includes(x.slot as 1 | 2 | 3) && typeof x.team === "string" && Array.isArray(x.colors));
  } catch {
    return [];
  }
}

/** Reads every slot and rebuilds the index from the real data, marking unreadable slots as corrupt. */
export async function rebuildIndex(): Promise<SlotInfo[]> {
  const out: SlotInfo[] = [];
  for (const slot of SLOTS) {
    const r = await loadCareerResult(slot);
    if (r.status === "ok") out.push(infoOf(r.career));
    else if (r.status === "corrupt") out.push({ slot, team: "Unreadable save", coach: "", label: r.reason, updatedAt: 0, colors: ["#666666", "#999999"], corrupt: true });
  }
  try {
    localStorage.setItem(LS_INDEX, JSON.stringify(out.filter((x) => !x.corrupt)));
  } catch {
    /* ignore */
  }
  return out;
}

// ---------------------------------------------------------------------------
// Export and import

/** A smaller copy for export: drops per-game box scores and highlights. */
export function exportableCareer(c: Career): Career {
  const copy = JSON.parse(JSON.stringify(c)) as SavedCareer;
  for (const g of copy.schedule) if (g.result) g.result = { ...g.result, players: g.home === c.userTeam || g.away === c.userTeam ? g.result.players : {}, highlights: [] };
  copy.inbox = copy.inbox.slice(0, 20);
  copy.log = copy.log.slice(-50);
  copy.saveVersion = GRIDIRON_SAVE_VERSION;
  if (!Array.isArray(copy.customPlays)) copy.customPlays = [];
  return copy;
}

export function exportFileName(c: Career): string {
  return `${c.teams[c.userTeam].abbr.toLowerCase()}-${c.year}.zuno.json`;
}

export function buildExportFile(c: Career) {
  const t = c.teams[c.userTeam];
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType: GRIDIRON_TYPE,
    metadata: { title: `${t.city} ${t.name} · ${c.year}`, description: `${c.coachName}'s career`, author: c.coachName, coverImage: null },
    appearance: { accentColor: "#22C55E", backgroundPreset: "tide" },
    content: { league: null, career: exportableCareer(c) },
    settings: {},
  };
}

export function exportCareerText(c: Career): string {
  return JSON.stringify(buildExportFile(c));
}

export type ImportResult = { ok: true; career: SavedCareer; warnings: string[] } | { ok: false; errors: string[] };

/** Validates and migrates the text of an exported career file. Never touches a slot. */
export function importCareerText(text: string): ImportResult {
  const v = validateGameFileText(text, GRIDIRON_TYPE);
  if (!v.ok) return { ok: false, errors: v.errors };
  const k = (v.file as { content: { career: unknown } }).content.career;
  if (!k) return { ok: false, errors: ["This file has no saved career in it."] };
  const m = migrateCareer(k);
  if (!m.ok) return { ok: false, errors: [m.error] };
  return { ok: true, career: m.career, warnings: [...(v.warnings ?? []), ...m.notes] };
}
