import { get, onChildAdded, onDisconnect, onValue, push, ref, remove, runTransaction, serverTimestamp, set, update } from "firebase/database";
import { parseAvatar, type AvatarSpec } from "../../components/avatar/avatarData";
import { database, makeCode } from "../headbands/lobby";

/**
 * Shared online room plumbing for the party games (Blackjack, Draw It, Feud),
 * kept in Firebase Realtime Database under /{kind}/{code}. The host's device
 * runs the game and publishes what everyone may see under /game, each player's
 * own view under /private/{id}, and reads moves from /actions/{playerId}. The
 * sender of a move is always the inbox it arrived in.
 */

export type PartyKind = "bj" | "draw" | "feud";
export const PARTY_KINDS: readonly PartyKind[] = ["bj", "draw", "feud"];

export interface PartyLobbyPlayer {
  name: string;
  joinedAt: number;
  avatar: AvatarSpec | null;
  ready: boolean;
}

export interface PartyLobbyState<G = unknown> {
  phase: "lobby" | "playing";
  createdAt: number;
  players: Record<string, PartyLobbyPlayer>;
  order: string[];
  /** One line about the room's settings, written by the host for phones. */
  note: string;
  game: G | null;
}

export const partyPath = (kind: PartyKind, code: string, ...rest: string[]) => [kind, code, ...rest].join("/");

function readJson<T>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readPartyLobby<G>(raw: unknown): PartyLobbyState<G> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.phase !== "lobby" && r.phase !== "playing") return null;
  const players: Record<string, PartyLobbyPlayer> = {};
  if (r.players && typeof r.players === "object") {
    for (const [id, p] of Object.entries(r.players as Record<string, unknown>)) {
      const x = p as Record<string, unknown> | null;
      if (x && typeof x.name === "string") players[id] = { name: x.name, joinedAt: Number(x.joinedAt) || 0, avatar: parseAvatar(x.avatar), ready: x.ready === true };
    }
  }
  const order = readJson<unknown[]>(r.order);
  const game = readJson<G>(r.game);
  return {
    phase: r.phase,
    createdAt: Number(r.createdAt) || 0,
    players,
    order: Array.isArray(order) ? order.filter((x): x is string => typeof x === "string") : [],
    note: typeof r.note === "string" ? r.note : "",
    game: game && typeof game === "object" ? game : null,
  };
}

/** Players in the host's order, with anyone not yet placed added in join order. */
export function orderedPartyPlayers(lobby: Pick<PartyLobbyState, "players" | "order">): Array<{ id: string } & PartyLobbyPlayer> {
  const all = Object.entries(lobby.players)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([id, p]) => ({ id, ...p }));
  const placed = lobby.order.map((id) => all.find((p) => p.id === id)).filter((p): p is (typeof all)[number] => !!p);
  const seen = new Set(placed.map((p) => p.id));
  return [...placed, ...all.filter((p) => !seen.has(p.id))];
}

export function canStartParty(players: Array<{ id: string; ready: boolean }>, hostId: string, min: number, max: number): boolean {
  return players.length >= min && players.length <= max && players.some((p) => p.id === hostId) && players.every((p) => p.id === hostId || p.ready);
}

export async function createPartyRoom(kind: PartyKind): Promise<string> {
  const d = database();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const result = await runTransaction(ref(d, partyPath(kind, code)), (current) => (current === null ? { phase: "lobby", createdAt: Date.now() } : undefined));
    if (result.committed) {
      await onDisconnect(ref(d, partyPath(kind, code))).remove();
      return code;
    }
  }
  throw new Error("Could not find a free room code. Try again.");
}

export function watchPartyRoom<G>(kind: PartyKind, code: string, onChange: (s: PartyLobbyState<G> | null) => void, onError: (message: string) => void): () => void {
  return onValue(
    ref(database(), partyPath(kind, code)),
    (snap) => onChange(readPartyLobby<G>(snap.val())),
    () => onError("Lost the connection to the room."),
  );
}

export async function partyRoomExists(kind: PartyKind, code: string): Promise<boolean> {
  return (await get(ref(database(), partyPath(kind, code, "phase")))).exists();
}

/** Which party game, if any, has an open room with this code. */
export async function findPartyRoom(code: string): Promise<PartyKind | null> {
  for (const k of PARTY_KINDS) if (await partyRoomExists(k, code)) return k;
  return null;
}

export async function joinPartyRoom(kind: PartyKind, code: string, id: string, name: string, avatar: AvatarSpec | null): Promise<void> {
  const d = database();
  const phase = (await get(ref(d, partyPath(kind, code, "phase")))).val();
  const seated = (await get(ref(d, partyPath(kind, code, "players", id)))).exists();
  if (phase === "playing" && !seated) throw new Error("That game has already started.");
  if (seated && phase === "playing") {
    if (avatar) await update(ref(d, partyPath(kind, code, "players", id)), { avatar: JSON.stringify(avatar) });
    await onDisconnect(ref(d, partyPath(kind, code, "players", id))).cancel();
    return;
  }
  await set(ref(d, partyPath(kind, code, "players", id)), {
    name: name.trim().slice(0, 24),
    joinedAt: serverTimestamp(),
    ready: false,
    ...(avatar ? { avatar: JSON.stringify(avatar) } : {}),
  });
  await onDisconnect(ref(d, partyPath(kind, code, "players", id))).remove();
}

export const keepPartySeat = (kind: PartyKind, code: string, id: string) => onDisconnect(ref(database(), partyPath(kind, code, "players", id))).cancel();
export const releasePartySeat = (kind: PartyKind, code: string, id: string) => onDisconnect(ref(database(), partyPath(kind, code, "players", id))).remove();
export const leavePartyRoom = (kind: PartyKind, code: string, id: string) => remove(ref(database(), partyPath(kind, code, "players", id)));
export const setPartyReady = (kind: PartyKind, code: string, id: string, ready: boolean) => update(ref(database(), partyPath(kind, code, "players", id)), { ready });
export const closePartyRoom = (kind: PartyKind, code: string) => remove(ref(database(), partyPath(kind, code)));

export function setPartyRoom(kind: PartyKind, code: string, change: { phase?: "lobby" | "playing"; game?: null; actions?: null; private?: null; canvas?: null; order?: string; note?: string }): Promise<void> {
  return update(ref(database(), partyPath(kind, code)), change);
}

export function clearPartyReady(kind: PartyKind, code: string, ids: string[]): Promise<void> {
  const patch: Record<string, boolean> = {};
  for (const id of ids) patch[`players/${id}/ready`] = false;
  return update(ref(database(), partyPath(kind, code)), patch);
}

export const publishPartyGame = (kind: PartyKind, code: string, json: string) => set(ref(database(), partyPath(kind, code, "game")), json);
export const publishPartyPrivate = (kind: PartyKind, code: string, id: string, json: string) => set(ref(database(), partyPath(kind, code, "private", id)), json);

export function watchPartyPrivate<P>(kind: PartyKind, code: string, id: string, onChange: (p: P | null) => void): () => void {
  return onValue(ref(database(), partyPath(kind, code, "private", id)), (snap) => onChange(readJson<P>(snap.val())), () => undefined);
}

export async function sendPartyMove(kind: PartyKind, code: string, by: string, move: object): Promise<void> {
  await push(ref(database(), partyPath(kind, code, "actions", by)), move);
}

export function watchPartyMoves(kind: PartyKind, code: string, playerIds: string[], onMove: (by: string, move: unknown) => void): () => void {
  const stops = playerIds.map((id) =>
    onChildAdded(ref(database(), partyPath(kind, code, "actions", id)), (snap) => {
      const v = snap.val() as unknown;
      void remove(snap.ref);
      if (v && typeof v === "object") onMove(id, v);
    }),
  );
  return () => stops.forEach((stop) => stop());
}

export function partyJoinLink(kind: PartyKind, code: string): string {
  const url = new URL(window.location.href);
  url.hash = `${kind}=${code}`;
  return url.toString();
}

export function partyCodeFromHash(hash: string): { kind: PartyKind; code: string } | null {
  const m = /(bj|draw|feud)=([a-z0-9]{5})/i.exec(hash);
  return m ? { kind: m[1].toLowerCase() as PartyKind, code: m[2].toUpperCase() } : null;
}
