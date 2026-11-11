import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectDatabaseEmulator, get, getDatabase, onDisconnect, onValue, ref, remove, runTransaction, serverTimestamp, set, update, type Database } from "firebase/database";
import type { HeadbandsMode } from "../../game-files/schema/headbands";

/**
 * Online lobby for Headbands, kept in Firebase Realtime Database under
 * /hb/{code}. Players join from their own devices with a room code and write
 * the identity for the next player in the circle. The host's screen runs the
 * game; the database only carries the lobby.
 */

export type LobbyPhase = "lobby" | "writing" | "playing" | "over";

export interface LobbyPlayer {
  name: string;
  joinedAt: number;
}

export interface LobbyEntry {
  /** Text Mode identity, or the same as subtext in Image Mode. */
  text: string;
  image: string | null;
  subtext: string | null;
}

export interface LobbyState {
  phase: LobbyPhase;
  mode: HeadbandsMode;
  createdAt: number;
  players: Record<string, LobbyPlayer>;
  /** Player ids in writing order: each writes for the next, the last for the first. */
  circle: string[];
  /** Keyed by the writer's player id. */
  entries: Record<string, LobbyEntry>;
}

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** Online lobbies need a Firebase project. Without one, Zuno hides them. */
export function lobbiesAvailable(): boolean {
  return !!(config.apiKey && config.databaseURL && config.projectId);
}

let app: FirebaseApp | null = null;
let db: Database | null = null;
function database(): Database {
  if (!lobbiesAvailable()) throw new Error("Online lobbies are not set up for this site.");
  if (!db) {
    app = initializeApp(config, "zuno-lobby");
    db = getDatabase(app);
    // Local development against `firebase emulators:start`, e.g. VITE_FIREBASE_EMULATOR=localhost:9000
    const emulator = import.meta.env.VITE_FIREBASE_EMULATOR as string | undefined;
    if (emulator) {
      const [host, port] = emulator.split(":");
      connectDatabaseEmulator(db, host, Number(port) || 9000);
    }
  }
  return db;
}

const path = (code: string, ...rest: string[]) => ["hb", code, ...rest].join("/");

/** Five characters without look-alikes such as 0/O and 1/I. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makeCode(random: () => number = Math.random): string {
  return Array.from({ length: 5 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("");
}
export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

/** A stable id for this browser tab, so a refresh rejoins as the same player. */
export function playerId(): string {
  const key = "zuno.hb.playerId";
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Parses whatever the database holds into a complete LobbyState, or null. */
export function readLobby(raw: unknown): LobbyState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const phase = (["lobby", "writing", "playing", "over"] as const).find((p) => p === r.phase);
  if (!phase) return null;
  const players: Record<string, LobbyPlayer> = {};
  if (r.players && typeof r.players === "object") {
    for (const [id, p] of Object.entries(r.players as Record<string, unknown>)) {
      if (p && typeof p === "object" && typeof (p as LobbyPlayer).name === "string") players[id] = { name: (p as LobbyPlayer).name, joinedAt: Number((p as LobbyPlayer).joinedAt) || 0 };
    }
  }
  const circle = Array.isArray(r.circle) ? (r.circle as unknown[]).filter((id): id is string => typeof id === "string" && id in players) : [];
  const entries: Record<string, LobbyEntry> = {};
  if (r.entries && typeof r.entries === "object") {
    for (const [id, e] of Object.entries(r.entries as Record<string, unknown>)) {
      if (!e || typeof e !== "object") continue;
      const x = e as Record<string, unknown>;
      entries[id] = {
        text: typeof x.text === "string" ? x.text : "",
        image: typeof x.image === "string" ? x.image : null,
        subtext: typeof x.subtext === "string" ? x.subtext : null,
      };
    }
  }
  return { phase, mode: r.mode === "image" ? "image" : "text", createdAt: Number(r.createdAt) || 0, players, circle, entries };
}

/** Opens a new lobby with an unused code. */
export async function createLobby(mode: HeadbandsMode): Promise<string> {
  const d = database();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const result = await runTransaction(ref(d, path(code)), (current) => (current === null ? { phase: "lobby", mode, createdAt: Date.now() } : undefined));
    if (result.committed) {
      // The lobby disappears if the host's tab closes.
      await onDisconnect(ref(d, path(code))).remove();
      return code;
    }
  }
  throw new Error("Could not find a free room code. Try again.");
}

export function watchLobby(code: string, onChange: (state: LobbyState | null) => void, onError: (message: string) => void): () => void {
  return onValue(
    ref(database(), path(code)),
    (snap) => onChange(readLobby(snap.val())),
    () => onError("Lost the connection to the lobby."),
  );
}

export async function lobbyExists(code: string): Promise<boolean> {
  const snap = await get(ref(database(), path(code, "phase")));
  return snap.exists();
}

/** Adds or renames a player. Their entry in the circle is added by the host. */
export async function joinLobby(code: string, id: string, name: string): Promise<void> {
  const d = database();
  await set(ref(d, path(code, "players", id)), { name: name.trim().slice(0, 24), joinedAt: serverTimestamp() });
  await onDisconnect(ref(d, path(code, "players", id))).remove();
}

export function leaveLobby(code: string, id: string): Promise<void> {
  return remove(ref(database(), path(code, "players", id)));
}

export function setLobby(code: string, change: Partial<Pick<LobbyState, "phase" | "mode" | "circle">> & { entries?: null }): Promise<void> {
  return update(ref(database(), path(code)), change);
}

export function submitEntry(code: string, writer: string, entry: LobbyEntry | null): Promise<void> {
  return set(ref(database(), path(code, "entries", writer)), entry);
}

export function closeLobby(code: string): Promise<void> {
  return remove(ref(database(), path(code)));
}

/** The share link a phone opens to join. */
export function joinLink(code: string): string {
  const url = new URL(window.location.href);
  url.hash = `join=${code}`;
  return url.toString();
}

/** Room code from a #join=CODE link, if the page was opened with one. */
export function codeFromHash(hash: string): string | null {
  const m = /join=([a-z0-9]{5})/i.exec(hash);
  return m ? normalizeCode(m[1]) : null;
}

/** Keeps the circle in step with who is in the lobby: drop leavers, add newcomers at the end. */
export function syncCircle(circle: readonly string[], players: Record<string, LobbyPlayer>): string[] {
  const kept = circle.filter((id) => id in players);
  const added = Object.entries(players)
    .filter(([id]) => !kept.includes(id))
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([id]) => id);
  return [...kept, ...added];
}
