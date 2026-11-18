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
  publicTurn,
  storyteller,
  type LiarAction,
  type LiarState,
  type Phase,
  type Player,
  type RecapEntry,
  type Statement,
  type Turn,
  type Vote,
  tally,
  type ScoreEvent,
} from "./liarEngine";

/**
 * Online LIAR, kept in Firebase Realtime Database under /liar/{code}.
 * The host's device runs the game and publishes what everyone may see under
 * /game. The lie stays on the host until the reveal. Phones send their turn
 * and their votes to /actions.
 */

export interface LiarLobbyPlayer {
  name: string;
  joinedAt: number;
  avatar: AvatarSpec | null;
}

export interface LiarLobbyState {
  phase: "lobby" | "playing";
  createdAt: number;
  players: Record<string, LiarLobbyPlayer>;
  game: LiarOnline | null;
}

/** What every device sees. No lie and no individual votes before the reveal. */
export interface LiarOnline {
  phase: Phase;
  round: number;
  turnIndex: number;
  rounds: number;
  scoring: boolean;
  allowAbstain: boolean;
  paused: boolean;
  endedEarly: boolean;
  players: Player[];
  storytellerId: string | null;
  statements: Statement[] | null;
  lieIndex: number | null;
  voted: string[];
  votes: Record<string, Vote> | null;
  scores: Record<string, number>;
  recap: RecapEntry[];
  /** State revision; phones ignore updates older than what they hold. */
  revision?: number;
  /** Score changes with the rule behind each (revealed turns only). */
  scoreLog?: ScoreEvent[];
  /** Totals during voting, only when live results are enabled. */
  liveCounts?: number[] | null;
}

/** True when an incoming broadcast is older than the one already shown. */
export function isStaleOnline(current: LiarOnline | null, incoming: LiarOnline): boolean {
  return !!current && (incoming.revision ?? 0) < (current.revision ?? 0);
}

export type LiarMove =
  | { type: "submit"; turn: string }
  | { type: "vote"; vote: string };

export function toLiarOnline(s: LiarState): LiarOnline {
  const view = publicTurn(s);
  const revealed = s.phase === "reveal";
  return {
    phase: s.phase,
    round: s.round,
    turnIndex: s.turnIndex,
    rounds: s.options.rounds,
    scoring: s.options.scoring,
    allowAbstain: s.options.allowAbstain,
    paused: s.paused,
    endedEarly: s.endedEarly,
    players: s.players,
    storytellerId: storyteller(s)?.id ?? null,
    statements: view?.statements ?? null,
    lieIndex: view?.lieIndex ?? null,
    voted: Object.keys(s.votes),
    votes: revealed && !s.options.anonymousVotes ? s.votes : null,
    scores: s.scores,
    recap: s.options.anonymousVotes ? s.recap.map((r) => ({ ...r, votes: {} })) : s.recap,
    revision: s.revision ?? 0,
    scoreLog: s.scoreLog ?? [],
    liveCounts: s.phase === "vote" && s.options.liveResults ? tally(s.votes).counts : null,
  };
}

export function liarMoveToAction(
  move: LiarMove,
  from: string,
  s: LiarState,
): LiarAction | null {
  if (move.type === "submit") {
    if (storyteller(s)?.id !== from || typeof move.turn !== "string")
      return null;
    try {
      const t = JSON.parse(move.turn) as Turn;
      if (!t || !Array.isArray(t.statements)) return null;
      return {
        type: "submitTurn",
        turn: {
          lieIndex: Number(t.lieIndex),
          statements: t.statements.map((x) => ({
            text: String(x?.text ?? ""),
            questions: Array.isArray(x?.questions)
              ? x.questions.map(String)
              : [],
          })),
        },
      };
    } catch {
      return null;
    }
  }
  if (move.type === "vote") {
    const vote: Vote = move.vote === "abstain" ? "abstain" : Number(move.vote);
    return { type: "vote", voter: from, vote };
  }
  return null;
}

const path = (code: string, ...rest: string[]) =>
  ["liar", code, ...rest].join("/");

function readGame(raw: unknown): LiarOnline | null {
  if (typeof raw !== "string") return null;
  try {
    const g = JSON.parse(raw) as LiarOnline;
    return g && Array.isArray(g.players) && typeof g.phase === "string"
      ? g
      : null;
  } catch {
    return null;
  }
}

export function readLiarLobby(raw: unknown): LiarLobbyState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.phase !== "lobby" && r.phase !== "playing") return null;
  const players: Record<string, LiarLobbyPlayer> = {};
  if (r.players && typeof r.players === "object") {
    for (const [id, p] of Object.entries(
      r.players as Record<string, unknown>,
    )) {
      const x = p as Record<string, unknown> | null;
      if (x && typeof x.name === "string")
        players[id] = {
          name: x.name,
          joinedAt: Number(x.joinedAt) || 0,
          avatar: parseAvatar(x.avatar),
        };
    }
  }
  return {
    phase: r.phase,
    createdAt: Number(r.createdAt) || 0,
    players,
    game: readGame(r.game),
  };
}

export async function createLiarLobby(): Promise<string> {
  const d = database();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const result = await runTransaction(ref(d, path(code)), (current) =>
      current === null ? { phase: "lobby", createdAt: Date.now() } : undefined,
    );
    if (result.committed) {
      await onDisconnect(ref(d, path(code))).remove();
      return code;
    }
  }
  throw new Error("Could not find a free room code. Try again.");
}

export function watchLiarLobby(
  code: string,
  onChange: (s: LiarLobbyState | null) => void,
  onError: (message: string) => void,
): () => void {
  return onValue(
    ref(database(), path(code)),
    (snap) => onChange(readLiarLobby(snap.val())),
    () => onError("Lost the connection to the room."),
  );
}

export async function liarLobbyExists(code: string): Promise<boolean> {
  return (await get(ref(database(), path(code, "phase")))).exists();
}

export async function joinLiarLobby(
  code: string,
  id: string,
  name: string,
  avatar: AvatarSpec | null,
): Promise<void> {
  const d = database();
  await set(ref(d, path(code, "players", id)), {
    name: name.trim().slice(0, 24),
    joinedAt: serverTimestamp(),
    ...(avatar ? { avatar: JSON.stringify(avatar) } : {}),
  });
  await onDisconnect(ref(d, path(code, "players", id))).remove();
}

export function leaveLiarLobby(code: string, id: string): Promise<void> {
  return remove(ref(database(), path(code, "players", id)));
}

export function setLiarLobby(
  code: string,
  change: { phase?: "lobby" | "playing"; game?: null; actions?: null },
): Promise<void> {
  return update(ref(database(), path(code)), change);
}

export function publishLiarGame(code: string, game: LiarOnline): Promise<void> {
  return set(ref(database(), path(code, "game")), JSON.stringify(game));
}

export async function sendLiarMove(
  code: string,
  by: string,
  move: LiarMove,
): Promise<void> {
  await push(ref(database(), path(code, "actions")), { by, ...move });
}

export function watchLiarMoves(
  code: string,
  onMove: (by: string, move: LiarMove) => void,
): () => void {
  return onChildAdded(ref(database(), path(code, "actions")), (snap) => {
    const v = snap.val() as ({ by?: unknown } & LiarMove) | null;
    void remove(snap.ref);
    if (v && typeof v.by === "string" && typeof v.type === "string")
      onMove(v.by, v);
  });
}

export function closeLiarLobby(code: string): Promise<void> {
  return remove(ref(database(), path(code)));
}

export function liarJoinLink(code: string): string {
  const url = new URL(window.location.href);
  url.hash = `liar=${code}`;
  return url.toString();
}

export function liarCodeFromHash(hash: string): string | null {
  const m = /liar=([a-z0-9]{5})/i.exec(hash);
  return m ? m[1].toUpperCase() : null;
}
