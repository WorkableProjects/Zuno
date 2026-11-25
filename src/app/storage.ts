import type { BackgroundPreset } from "../game-files/schema/common";

/** Small local preferences. No account, no server. Every read and write is guarded. */

/** Theme ids. The registry (labels, palettes, skins) lives in ./themes.ts. */
export type Theme = "dark" | "light" | "vice" | "ocean" | "zuno-special" | "anthropical";
export const THEME_IDS: readonly Theme[] = ["dark", "light", "vice", "ocean", "zuno-special", "anthropical"];

const KEYS = {
  theme: "zuno.theme",
  sidebar: "zuno.sidebar",
  lastTile: "zuno.lastTile",
  recent: "zuno.recent",
  draft: "zuno.draft.jeopardy",
  draftHeadbands: "zuno.draft.headbands",
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadTheme(): Theme {
  const v = read(KEYS.theme);
  return (THEME_IDS as readonly string[]).includes(v ?? "") ? (v as Theme) : "dark";
}
export function saveTheme(theme: Theme) {
  write(KEYS.theme, theme);
}

/** Whether the home sidebar is folded down to the logo and its toggle. */
export function loadSidebarCollapsed(): boolean {
  return read(KEYS.sidebar) === "collapsed";
}
export function saveSidebarCollapsed(collapsed: boolean) {
  write(KEYS.sidebar, collapsed ? "collapsed" : "expanded");
}

export type Device = "mobile" | "desktop";
/** Null until the user has answered the launch question. */
export function loadDevice(): Device | null {
  const v = read("zuno.device");
  return v === "mobile" || v === "desktop" ? v : null;
}
export function saveDevice(device: Device) {
  write("zuno.device", device);
}

export type Motion = "full" | "calm" | "off";
export function loadMotion(): Motion {
  const v = read("zuno.motion");
  return v === "calm" || v === "off" ? v : "full";
}
export function saveMotion(motion: Motion) {
  write("zuno.motion", motion);
}
/** Puts the motion choice on the root element, where the backdrop CSS reads it. */
export function applyMotion(motion: Motion) {
  document.documentElement.dataset.motion = motion;
}

export function loadSfxOn(): boolean {
  return read("zuno.sfx") !== "off";
}
export function saveSfxOn(on: boolean) {
  write("zuno.sfx", on ? "on" : "off");
}

export function loadLastTile(): string | null {
  return read(KEYS.lastTile);
}
export function saveLastTile(id: string) {
  write(KEYS.lastTile, id);
}

/**
 * A remembered game. It is only a shortcut: opening one always runs the full
 * validator again, and when the file text was too large to keep, the user is
 * asked to pick the file again.
 */
export interface RecentGame {
  id: string;
  gameType: string;
  filename: string;
  title: string;
  description: string;
  author: string;
  accentColor: string;
  backgroundPreset: BackgroundPreset;
  coverImage: string | null;
  summary: string;
  savedAt: number;
  text: string | null;
}

const MAX_RECENT = 6;
const MAX_KEPT_TEXT = 300_000;
const MAX_KEPT_COVER = 200_000;

export function loadRecent(): RecentGame[] {
  const raw = read(KEYS.recent);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((r) => r && typeof r.id === "string" && typeof r.title === "string" && typeof r.filename === "string");
  } catch {
    return [];
  }
}

export function rememberGame(entry: Omit<RecentGame, "id" | "savedAt">): RecentGame[] {
  const id = `${entry.gameType}:${entry.filename}:${entry.title}`;
  const kept: RecentGame = {
    ...entry,
    id,
    savedAt: Date.now(),
    text: entry.text && entry.text.length <= MAX_KEPT_TEXT ? entry.text : null,
    coverImage: entry.coverImage && entry.coverImage.length <= MAX_KEPT_COVER ? entry.coverImage : null,
  };
  let list = [kept, ...loadRecent().filter((r) => r.id !== id)].slice(0, MAX_RECENT);
  // Storage can be full. Drop kept file text, oldest first, until it fits.
  while (!write(KEYS.recent, JSON.stringify(list))) {
    const idx = list.map((r) => r.text !== null || r.coverImage !== null).lastIndexOf(true);
    if (idx === -1) break;
    list = list.map((r, i) => (i === idx ? { ...r, text: null, coverImage: null } : r));
  }
  return list;
}

export function forgetGame(id: string): RecentGame[] {
  const list = loadRecent().filter((r) => r.id !== id);
  write(KEYS.recent, JSON.stringify(list));
  return list;
}

type DraftKind = "jeopardy" | "headbands";
const draftKey = (kind: DraftKind) => (kind === "headbands" ? KEYS.draftHeadbands : KEYS.draft);

export function loadDraft(kind: DraftKind = "jeopardy"): unknown {
  const raw = read(draftKey(kind));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function saveDraft(draft: unknown, kind: DraftKind = "jeopardy"): boolean {
  return write(draftKey(kind), JSON.stringify(draft));
}
export function clearDraft(kind: DraftKind = "jeopardy") {
  try {
    localStorage.removeItem(draftKey(kind));
  } catch {
    /* ignore */
  }
}
