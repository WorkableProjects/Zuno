import {
  get,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { parseAvatar, type AvatarSpec } from "../../components/avatar/avatarData";
import { database, makeCode } from "../headbands/lobby";
import {
  isChoice,
  poolOf,
  type Choice,
  type Phase,
  type RoundOutcome,
  type RpgAction,
  type RpgPlayer,
  type RpgState,
  type Settlement,
  type Stake,
} from "./rpgEngine";

/**
 * Online Rock Paper Gamble, kept in Firebase Realtime Database under /rpg/{code}.
 * The host's device runs the game and publishes what everyone may see under
 * /game. Picks are held on the host until both duelists are in. Phones send
 * their moves to /actions/{playerId}/..., and the host takes the sender from
 * that key, never from anything inside the message.
 */

export interface RpgLobbyPlayer {
  name: string;
  joinedAt: number;
  avatar: AvatarSpec | null;
  ready: boolean;
}

export interface RpgLobbyState {
  phase: "lobby" | "playing";
  createdAt: number;
  players: Record<string, RpgLobbyPlayer>;
  /** Turn order chosen by the host. Ids that are not in the room are ignored. */
  order: string[];
  startingMoney: number | null;
  game: RpgOnline | null;
}

/** The duel as everyone may see it: who has picked, but never what. */
export interface RpgOnlineDuel {
  challenger: string;
  challengee: string;
  wager: number;
  stakes: Stake[];
  pool: number;
  score: Record<string, number>;
  round: number;
  picked: string[];
  last: RoundOutcome | null;
  overlay: number;
  doubleMisses: number;
}

/** What every device sees. */
export interface RpgOnline {
  phase: Phase;
  timeLeft: number;
  match: number;
  activeId: string | null;
  players: RpgPlayer[];
  startingMoney: number;
  duel: RpgOnlineDuel | null;
  result: Settlement | null;
  log: string[];
  endedEarly: boolean;
  /** State revision; phones ignore updates older than what they hold. */
  revision: number;
}

/** True when an incoming broadcast is older than the one already shown. */
export function isStaleOnline(current: RpgOnline | null, incoming: RpgOnline): boolean {
  return !!current && (incoming.revision ?? 0) < (current.revision ?? 0);
}

export type RpgMove =
  | { type: "challenge"; target: string; wager?: number }
  | { type: "bet"; target: string; amount: number }
  | { type: "pick"; choice: Choice }
  | { type: "gift"; target: string; amount: number };

export function toRpgOnline(s: RpgState): RpgOnline {
  const d = s.duel;
  return {
    phase: s.phase,
    timeLeft: s.timeLeft,
    match: s.match,
    activeId: s.phase === "select" ? (s.players[s.active]?.id ?? null) : null,
    players: s.players,
    startingMoney: s.settings.startingMoney,
    duel: d
      ? {
          challenger: d.challenger,
          challengee: d.challengee,
          wager: d.wager,
          stakes: d.stakes,
          pool: poolOf(d),
          score: d.score,
          round: d.round,
          picked: Object.keys(d.picks),
          last: d.last,
          overlay: d.overlay,
          doubleMisses: d.doubleMisses,
        }
      : null,
    result: s.result,
    log: s.log,
    endedEarly: s.endedEarly,
    revision: s.revision,
  };
}

/**
 * Turns a phone's move into an engine action. `from` is the database key the
 * move arrived under. Nothing the phone wrote can change who it is.
 */
export function rpgMoveToAction(move: unknown, from: string): RpgAction | null {
  if (!move || typeof move !== "object") return null;
  const m = move as Record<string, unknown>;
  const target = typeof m.target === "string" ? m.target : "";
  switch (m.type) {
    case "challenge": {
      const wager = m.wager === undefined || m.wager === null ? 0 : Number(m.wager);
      return target ? { type: "challenge", by: from, target, wager } : null;
    }
    case "bet":
      return target ? { type: "bet", by: from, target, amount: Number(m.amount) } : null;
    case "gift":
      return target ? { type: "gift", by: from, target, amount: Number(m.amount) } : null;
    case "pick":
      return isChoice(m.choice) ? { type: "pick", by: from, choice: m.choice } : null;
    default:
      return null;
  }
}

/** Players in the host's turn order, with anyone not yet placed added in join order. */
export function orderedPlayers(lobby: Pick<RpgLobbyState, "players" | "order">): Array<{ id: string } & RpgLobbyPlayer> {
  const all = Object.entries(lobby.players)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([id, p]) => ({ id, ...p }));
  const placed = lobby.order.map((id) => all.find((p) => p.id === id)).filter((p): p is (typeof all)[number] => !!p);
  const seen = new Set(placed.map((p) => p.id));
  return [...placed, ...all.filter((p) => !seen.has(p.id))];
}

/** Moves one entry up or down. Returns the new id order. */
export function moveInOrder(ids: string[], id: string, by: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = ids.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** The host can start once two or more are in and everyone except the host is ready. */
export function canStart(players: Array<{ id: string; ready: boolean }>, hostId: string, minPlayers = 2, maxPlayers = 12): boolean {
  return players.length >= minPlayers && players.length <= maxPlayers && players.some((p) => p.id === hostId) && players.every((p) => p.id === hostId || p.ready);
}

const path = (code: string, ...rest: string[]) => ["rpg", code, ...rest].join("/");

function readGame(raw: unknown): RpgOnline | null {
  if (typeof raw !== "string") return null;
  try {
    const g = JSON.parse(raw) as RpgOnline;
    return g && Array.isArray(g.players) && typeof g.phase === "string" ? g : null;
  } catch {
    return null;
  }
}

export function readRpgLobby(raw: unknown): RpgLobbyState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.phase !== "lobby" && r.phase !== "playing") return null;
  const players: Record<string, RpgLobbyPlayer> = {};
  if (r.players && typeof r.players === "object") {
    for (const [id, p] of Object.entries(r.players as Record<string, unknown>)) {
      const x = p as Record<string, unknown> | null;
      if (x && typeof x.name === "string")
        players[id] = { name: x.name, joinedAt: Number(x.joinedAt) || 0, avatar: parseAvatar(x.avatar), ready: x.ready === true };
    }
  }
  let order: string[] = [];
  if (typeof r.order === "string") {
    try {
      const parsed = JSON.parse(r.order) as unknown;
      if (Array.isArray(parsed)) order = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* ignore a damaged order */
    }
  }
  const money = Number(r.startingMoney);
  return {
    phase: r.phase,
    createdAt: Number(r.createdAt) || 0,
    players,
    order,
    startingMoney: Number.isFinite(money) && money > 0 ? money : null,
    game: readGame(r.game),
  };
}

export async function createRpgLobby(): Promise<string> {
  const d = database();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const result = await runTransaction(ref(d, path(code)), (current) => (current === null ? { phase: "lobby", createdAt: Date.now() } : undefined));
    if (result.committed) {
      await onDisconnect(ref(d, path(code))).remove();
      return code;
    }
  }
  throw new Error("Could not find a free room code. Try again.");
}

export function watchRpgLobby(code: string, onChange: (s: RpgLobbyState | null) => void, onError: (message: string) => void): () => void {
  return onValue(
    ref(database(), path(code)),
    (snap) => onChange(readRpgLobby(snap.val())),
    () => onError("Lost the connection to the room."),
  );
}

export async function rpgLobbyExists(code: string): Promise<boolean> {
  return (await get(ref(database(), path(code, "phase")))).exists();
}

/**
 * Takes a seat. Before the game starts anyone may join. Once it has started
 * only a player who already holds a seat can come back to it.
 */
export async function joinRpgLobby(code: string, id: string, name: string, avatar: AvatarSpec | null): Promise<void> {
  const d = database();
  const phase = (await get(ref(d, path(code, "phase")))).val();
  const seated = (await get(ref(d, path(code, "players", id)))).exists();
  if (phase === "playing" && !seated) throw new Error("That game has already started.");
  const clean = name.trim().slice(0, 24);
  if (seated && phase === "playing") {
    // Coming back mid-game: keep the seat, only refresh the picture.
    if (avatar) await update(ref(d, path(code, "players", id)), { avatar: JSON.stringify(avatar) });
    await onDisconnect(ref(d, path(code, "players", id))).cancel();
    return;
  }
  await set(ref(d, path(code, "players", id)), {
    name: clean,
    joinedAt: serverTimestamp(),
    ready: false,
    ...(avatar ? { avatar: JSON.stringify(avatar) } : {}),
  });
  await onDisconnect(ref(d, path(code, "players", id))).remove();
}

/** Once the game starts a dropped connection no longer gives up the seat. */
export function keepRpgSeat(code: string, id: string): Promise<void> {
  return onDisconnect(ref(database(), path(code, "players", id))).cancel();
}

/** Back in the lobby: a dropped connection gives up the seat again. */
export function releaseRpgSeat(code: string, id: string): Promise<void> {
  return onDisconnect(ref(database(), path(code, "players", id))).remove();
}

export function leaveRpgLobby(code: string, id: string): Promise<void> {
  return remove(ref(database(), path(code, "players", id)));
}

export function setRpgReady(code: string, id: string, ready: boolean): Promise<void> {
  return update(ref(database(), path(code, "players", id)), { ready });
}

export function setRpgLobby(
  code: string,
  change: { phase?: "lobby" | "playing"; game?: null; actions?: null; startingMoney?: number; order?: string },
): Promise<void> {
  return update(ref(database(), path(code)), change);
}

export function setRpgOrder(code: string, ids: string[]): Promise<void> {
  return setRpgLobby(code, { order: JSON.stringify(ids) });
}

/** Clears every player's ready flag, for a new game in the same room. */
export function clearRpgReady(code: string, ids: string[]): Promise<void> {
  const patch: Record<string, boolean> = {};
  for (const id of ids) patch[`players/${id}/ready`] = false;
  return update(ref(database(), path(code)), patch);
}

export function publishRpgGame(code: string, game: RpgOnline): Promise<void> {
  return set(ref(database(), path(code, "game")), JSON.stringify(game));
}

export async function sendRpgMove(code: string, by: string, move: RpgMove): Promise<void> {
  await push(ref(database(), path(code, "actions", by)), move);
}

/**
 * The host listens to each seated player's own inbox. The sender is the inbox
 * the move came from.
 */
export function watchRpgMoves(code: string, playerIds: string[], onMove: (by: string, move: unknown) => void): () => void {
  const stops = playerIds.map((id) =>
    onChildAdded(ref(database(), path(code, "actions", id)), (snap) => {
      const v = snap.val() as unknown;
      void remove(snap.ref);
      if (v && typeof v === "object") onMove(id, v);
    }),
  );
  return () => stops.forEach((stop) => stop());
}

export function closeRpgLobby(code: string): Promise<void> {
  return remove(ref(database(), path(code)));
}

export function rpgJoinLink(code: string): string {
  const url = new URL(window.location.href);
  url.hash = `rpg=${code}`;
  return url.toString();
}

export function rpgCodeFromHash(hash: string): string | null {
  const m = /rpg=([a-z0-9]{5})/i.exec(hash);
  return m ? m[1].toUpperCase() : null;
}
