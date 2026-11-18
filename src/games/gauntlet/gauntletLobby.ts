import { get, onChildAdded, onDisconnect, onValue, push, ref, remove, runTransaction, serverTimestamp, set, update } from "firebase/database";
import type { GauntletFile } from "../../game-files/schema/gauntlet";
import { database, makeCode } from "../headbands/lobby";
import * as G from "./gauntletEngine";

/**
 * Online Gauntlet under /gauntlet/{code}. The host device runs the engine and
 * publishes a public view to /game. Answers stay on the host until a turn is
 * resolved, and secret Choice tiers stay hidden until revealed.
 */

export interface GauntletLobbyPlayer {
  name: string;
  joinedAt: number;
  team: number | null;
}

export interface GauntletLobbyState {
  phase: "lobby" | "playing";
  createdAt: number;
  hostAway: boolean;
  teams: string[];
  players: Record<string, GauntletLobbyPlayer>;
  game: GauntletPublic | null;
}

export interface PublicTurn {
  kind: G.TurnKind;
  teamId: string | null;
  prompt: string;
  choices?: string[];
  statements?: string[];
  hints: string[];
  submittedBy: string | null;
  resolved: boolean;
  outcome: G.Turn["outcome"] | null;
  points: number | null;
  /** Present only once the turn is resolved. */
  answer: string | null;
  value: number | null;
}

export interface GauntletPublic {
  revision: number;
  sessionId: string;
  phase: G.Phase;
  roundIndex: number;
  teams: Array<{ id: string; name: string; eliminated: boolean; players: string[] }>;
  scores: Record<string, number>;
  streaks: Record<string, number>;
  activeTeamId: string | null;
  picker: string | null;
  lanes: Record<string, G.LaneType>;
  lockedLanes: G.LaneType[];
  /** Which teams have locked a Choice tier, never which tier until revealed. */
  choiceLocked: string[];
  turn: PublicTurn | null;
  turnNumber: number;
  turnCount: number;
  timer: { remainingMs: number; running: boolean; sentAt: number };
  winners: string[];
}

export type GauntletMove = { type: "answer" | "lane" | "choice" | "ready"; value: string };

export function publicTurn(file: GauntletFile, s: G.GauntletState): PublicTurn | null {
  const t = G.currentTurn(s);
  if (!t) return null;
  const c = file.content;
  let q: { prompt: string; answer: string; choices?: string[]; hints?: string[] };
  let statements: string[] | undefined;
  switch (t.kind) {
    case "warmup": q = c.warmup[t.itemIndex]; break;
    case "quickfire": q = c.lanes.quickfire[t.itemIndex]; break;
    case "puzzle": q = c.lanes.puzzle[t.itemIndex]; break;
    case "wild": q = c.lanes.wild[t.itemIndex]; break;
    case "choice": q = c.choice[t.itemIndex][t.tier ?? "safe"]; break;
    case "chaos": q = c.chaos[t.itemIndex]; break;
    case "climb": q = c.final.climb[t.itemIndex]; break;
    case "crossroads": q = c.final.crossroads[t.itemIndex]; break;
    case "summit": q = c.final.summit[t.itemIndex]; break;
    case "lock": {
      const l = c.final.lock[t.itemIndex];
      q = { prompt: l.prompt, answer: `Statement ${l.falseIndex + 1} is false` };
      statements = l.statements;
      break;
    }
  }
  return {
    kind: t.kind,
    teamId: t.teamId,
    prompt: q?.prompt ?? "",
    choices: q?.choices,
    statements,
    hints: (q?.hints ?? []).slice(0, t.hintsUsed),
    submittedBy: t.submission?.teamId ?? null,
    resolved: t.resolved,
    outcome: t.outcome ?? null,
    points: t.points ?? null,
    answer: t.resolved ? (q?.answer ?? null) : null,
    value: t.teamId && !t.resolved ? G.turnValue(s, t, t.teamId) : null,
  };
}

export function toGauntletPublic(file: GauntletFile, s: G.GauntletState, now = Date.now()): GauntletPublic {
  return {
    revision: s.revision,
    sessionId: s.sessionId,
    phase: s.phase,
    roundIndex: s.roundIndex,
    teams: s.teams.map((t) => ({ id: t.id, name: t.name, eliminated: t.eliminated, players: t.players.map((p) => p.name) })),
    scores: s.scores,
    streaks: s.streaks,
    activeTeamId: s.activeTeamId,
    picker: s.phase === "laneChoice" ? G.nextPicker(s) : null,
    lanes: s.laneSelections,
    lockedLanes: s.phase === "laneChoice" ? G.LANES.filter((l) => G.laneLocked(s, l)) : [],
    choiceLocked: Object.keys(s.choiceSelections),
    turn: publicTurn(file, s),
    turnNumber: s.turnIndex + 1,
    turnCount: s.turns.length,
    timer: { remainingMs: G.remaining(s.timer, now), running: s.timer.runningSince !== null && !s.timer.expired, sentAt: now },
    winners: s.winners,
  };
}

/** Applies a phone's move on the host. Only the player's own team can act. */
export function applyGauntletMove(s: G.GauntletState, teamId: string | null, move: GauntletMove, now: number): G.GauntletState {
  if (!teamId) return s;
  if (move.type === "answer") return G.submitAnswer(s, teamId, String(move.value).slice(0, G.MAX_ANSWER_LENGTH), now);
  if (move.type === "lane") return G.chooseLane(s, teamId, move.value as G.LaneType);
  if (move.type === "choice") return G.submitChoice(s, teamId, move.value as G.ChoiceTier);
  return s;
}

const path = (code: string, ...rest: string[]) => ["gauntlet", code, ...rest].join("/");
const STALE_ROOM_MS = 6 * 60 * 60 * 1000;

export function readGauntletLobby(raw: unknown): GauntletLobbyState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.phase !== "lobby" && r.phase !== "playing") return null;
  const players: Record<string, GauntletLobbyPlayer> = {};
  for (const [id, p] of Object.entries((r.players ?? {}) as Record<string, Record<string, unknown> | null>))
    if (p && typeof p.name === "string") players[id] = { name: p.name, joinedAt: Number(p.joinedAt) || 0, team: typeof p.team === "number" ? p.team : null };
  let teams: string[] = [];
  let game: GauntletPublic | null = null;
  try {
    teams = typeof r.teams === "string" ? (JSON.parse(r.teams) as string[]).map(String) : [];
  } catch {
    /* ignore */
  }
  try {
    const g = typeof r.game === "string" ? (JSON.parse(r.game) as GauntletPublic) : null;
    game = g && Array.isArray(g.teams) ? g : null;
  } catch {
    /* ignore */
  }
  return { phase: r.phase, createdAt: Number(r.createdAt) || 0, hostAway: !!r.hostAway, teams, players, game };
}

/** True when an incoming broadcast is older than the one on screen. */
export const isStaleGauntlet = (current: GauntletPublic | null, incoming: GauntletPublic | null) =>
  !!current && !!incoming && current.sessionId === incoming.sessionId && incoming.revision < current.revision;

/** Opens a room. An abandoned room older than six hours with the same code is replaced. */
export async function createGauntletLobby(teams: string[]): Promise<string> {
  const d = database();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeCode();
    const result = await runTransaction(ref(d, path(code)), (cur: { createdAt?: number } | null) =>
      cur === null || Date.now() - Number(cur?.createdAt ?? 0) > STALE_ROOM_MS ? { phase: "lobby", createdAt: Date.now(), teams: JSON.stringify(teams) } : undefined,
    );
    if (result.committed) {
      await markHost(code);
      return code;
    }
  }
  throw new Error("Could not find a free room code. Try again.");
}

/** Host is here; flag the room if the host's connection drops so phones can wait. */
export async function markHost(code: string): Promise<void> {
  const r = ref(database(), path(code, "hostAway"));
  await set(r, false);
  await onDisconnect(r).set(true);
}

export function watchGauntletLobby(code: string, onChange: (s: GauntletLobbyState | null) => void, onError: (m: string) => void): () => void {
  return onValue(ref(database(), path(code)), (snap) => onChange(readGauntletLobby(snap.val())), () => onError("Lost the connection to the room."));
}

export async function gauntletLobbyExists(code: string): Promise<boolean> {
  return (await get(ref(database(), path(code, "phase")))).exists();
}

export async function joinGauntletLobby(code: string, id: string, name: string, team: number | null): Promise<void> {
  const r = ref(database(), path(code, "players", id));
  await set(r, { name: name.trim().slice(0, 24), joinedAt: serverTimestamp(), ...(team === null ? {} : { team }) });
  await onDisconnect(r).cancel();
}

export const leaveGauntletLobby = (code: string, id: string) => remove(ref(database(), path(code, "players", id)));
export const setGauntletPhase = (code: string, phase: "lobby" | "playing") => update(ref(database(), path(code)), { phase });
export const publishGauntlet = (code: string, game: GauntletPublic) => set(ref(database(), path(code, "game")), JSON.stringify(game));
export const sendGauntletMove = (code: string, by: string, move: GauntletMove) => push(ref(database(), path(code, "actions")), { by, type: move.type, value: String(move.value).slice(0, 200) }).then(() => undefined);
export const closeGauntletLobby = (code: string) => remove(ref(database(), path(code)));

export function watchGauntletMoves(code: string, onMove: (by: string, move: GauntletMove) => void): () => void {
  return onChildAdded(ref(database(), path(code, "actions")), (snap) => {
    const v = snap.val() as { by?: unknown; type?: unknown; value?: unknown } | null;
    void remove(snap.ref);
    if (v && typeof v.by === "string" && typeof v.type === "string") onMove(v.by, { type: v.type as GauntletMove["type"], value: String(v.value ?? "") });
  });
}

export function gauntletJoinLink(code: string): string {
  const url = new URL(window.location.href);
  url.hash = `gl=${code}`;
  return url.toString();
}

export function gauntletCodeFromHash(hash: string): string | null {
  const m = /gl=([a-z0-9]{5})/i.exec(hash);
  return m ? m[1].toUpperCase() : null;
}

/* ---------- host refresh restore ---------- */

const HOST_KEY = "zuno.gl.host";
export interface HostSave {
  code: string;
  file: GauntletFile;
  state: G.GauntletState;
  seats: Record<string, string>;
  savedAt: number;
}

export function saveHost(save: Omit<HostSave, "savedAt">): void {
  try {
    localStorage.setItem(HOST_KEY, JSON.stringify({ ...save, state: { ...save.state, history: save.state.history.slice(-10) }, savedAt: Date.now() }));
  } catch {
    /* storage full: restore is best effort */
  }
}

export function loadHost(): HostSave | null {
  try {
    const s = JSON.parse(localStorage.getItem(HOST_KEY) ?? "null") as HostSave | null;
    return s && s.code && s.state && Date.now() - s.savedAt < STALE_ROOM_MS ? s : null;
  } catch {
    return null;
  }
}

export function clearHost(): void {
  try {
    localStorage.removeItem(HOST_KEY);
  } catch {
    /* optional */
  }
}
