import type { GauntletFile, WildEffect } from "../../game-files/schema/gauntlet";

/** Pure, host-authoritative Gauntlet state machine. Every transition returns the same object when it does nothing. */

export type LaneType = "quickfire" | "puzzle" | "wild";
export const LANES: LaneType[] = ["quickfire", "puzzle", "wild"];
export type ChoiceTier = "safe" | "bold" | "unknown";
export type GauntletMode = "standard" | "survival";
export type Phase = "lobby" | "warmup" | "laneChoice" | "laneRound" | "intermission" | "choice" | "chaos" | "final" | "results";
export type TurnKind = "warmup" | LaneType | "choice" | "chaos" | "climb" | "crossroads" | "lock" | "summit";

export const LANE_ROUNDS = 2;
export const MAX_STREAK_MULTIPLIER = 5;
export const MAX_UNDO = 60;
export const MAX_ANSWER_LENGTH = 200;
export const POINTS = {
  warmup: 100,
  quickfire: 100,
  puzzle: [500, 350, 200],
  wild: 250,
  bounty: 400,
  shiftBonus: 100,
  choice: { safe: 300, bold: 600, unknown: 450 } as Record<ChoiceTier, number>,
  boldPenalty: 100,
  chaos: 300,
  climb: 200,
  crossroads: 500,
  crossroadsPenalty: 250,
  lock: 400,
  summit: 750,
};
const ITEMS_PER_LANE: Record<LaneType, number> = { quickfire: 4, puzzle: 1, wild: 2 };
const CHAOS_PER_MATCH = 2;
const CLIMB_PER_FINALIST = 2;

export interface GauntletPlayer {
  id: string;
  name: string;
  ready: boolean;
}

export interface GauntletTeam {
  id: string;
  name: string;
  players: GauntletPlayer[];
  eliminated: boolean;
}

export interface TimerState {
  durationMs: number;
  remainingMs: number;
  /** Host timestamp when the timer last started running; null when paused or stopped. */
  runningSince: number | null;
  expired: boolean;
}

export interface Turn {
  kind: TurnKind;
  /** Null means every team may answer (shared prompts: warm-up, chaos, summit). */
  teamId: string | null;
  itemIndex: number;
  tier?: ChoiceTier;
  hintsUsed: number;
  submission: { teamId: string; text: string } | null;
  resolved: boolean;
  outcome?: "correct" | "wrong" | "partial" | "pass" | "expired";
  points?: number;
  /** Milliseconds from the turn opening to the answer arriving. */
  answerMs?: number;
}

export interface WildModifier {
  effect: WildEffect;
  teamId: string;
}

export interface Options {
  mode: GauntletMode;
  /** Classroom safe mode: no team is ever eliminated. */
  safeMode: boolean;
  allowNegativeScores: boolean;
  roundSeconds: number;
}

export interface DeckSizes {
  warmup: number;
  quickfire: number;
  puzzle: number;
  wild: number;
  choice: number;
  chaos: number;
  climb: number;
  crossroads: number;
  lock: number;
  summit: number;
}

export interface GauntletState {
  sessionId: string;
  revision: number;
  phase: Phase;
  options: Options;
  sizes: DeckSizes;
  wildEffects: WildEffect[];
  teams: GauntletTeam[];
  activeTeamId: string | null;
  laneSelections: Record<string, LaneType>;
  choiceSelections: Record<string, ChoiceTier>;
  roundIndex: number;
  turns: Turn[];
  turnIndex: number;
  timer: TimerState;
  scores: Record<string, number>;
  streaks: Record<string, number>;
  bestStreaks: Record<string, number>;
  eliminationHistory: string[];
  wildModifier: WildModifier | null;
  finalists: string[];
  cursors: Partial<Record<keyof DeckSizes, number>>;
  log: string[];
  /** Snapshots for undo; the newest is last. */
  history: GauntletState[];
  winners: string[];
  /** Worst rank each team held at any point, for the comeback award. */
  worstRank?: Record<string, number>;
  /** Quickest correct answer so far. */
  fastest?: { teamId: string; ms: number } | null;
  /** Teams that landed a Bold challenge. */
  boldWins?: string[];
}

export interface TeamSetup {
  name: string;
  players: string[];
}

const idleTimer = (ms = 0): TimerState => ({ durationMs: ms, remainingMs: ms, runningSince: null, expired: false });

export function deckSizes(file: GauntletFile): DeckSizes {
  const c = file.content;
  return {
    warmup: c.warmup.length,
    quickfire: c.lanes.quickfire.length,
    puzzle: c.lanes.puzzle.length,
    wild: c.lanes.wild.length,
    choice: c.choice.length,
    chaos: c.chaos.length,
    climb: c.final.climb.length,
    crossroads: c.final.crossroads.length,
    lock: c.final.lock.length,
    summit: c.final.summit.length,
  };
}

export function validateTeams(teams: TeamSetup[], file: GauntletFile): string[] {
  const errors: string[] = [];
  const { minTeams, maxTeams, playersPerTeam } = file.settings;
  if (teams.length < Math.max(1, minTeams)) errors.push(`Add at least ${Math.max(1, minTeams)} teams.`);
  if (teams.length > maxTeams) errors.push(`Use at most ${maxTeams} teams.`);
  const names = new Set<string>();
  teams.forEach((t, i) => {
    const n = t.name.trim().toLowerCase();
    if (!n) errors.push(`Team ${i + 1} needs a name.`);
    else if (names.has(n)) errors.push(`Two teams are named "${t.name.trim()}".`);
    names.add(n);
    const players = t.players.filter((p) => p.trim());
    if (players.length < playersPerTeam[0] || players.length > playersPerTeam[1]) errors.push(`Team ${i + 1} needs ${playersPerTeam[0]} to ${playersPerTeam[1]} players.`);
  });
  return errors;
}

export function createGauntlet(file: GauntletFile, setup: TeamSetup[], options: Options, sessionId = "local"): GauntletState {
  const teams: GauntletTeam[] = setup.map((t, i) => ({
    id: `t${i + 1}`,
    name: t.name.trim(),
    eliminated: false,
    players: t.players.filter((p) => p.trim()).map((p, k) => ({ id: `t${i + 1}p${k + 1}`, name: p.trim(), ready: false })),
  }));
  const zero = Object.fromEntries(teams.map((t) => [t.id, 0]));
  return {
    sessionId,
    revision: 0,
    phase: "lobby",
    options,
    sizes: deckSizes(file),
    wildEffects: file.content.lanes.wild.map((w) => w.effect),
    teams,
    activeTeamId: null,
    laneSelections: {},
    choiceSelections: {},
    roundIndex: 0,
    turns: [],
    turnIndex: -1,
    timer: idleTimer(),
    scores: { ...zero },
    streaks: { ...zero },
    bestStreaks: { ...zero },
    eliminationHistory: [],
    wildModifier: null,
    finalists: [],
    cursors: {},
    log: [],
    history: [],
    winners: [],
  };
}

/* ---------- helpers ---------- */

export const activeTeams = (s: GauntletState) => s.teams.filter((t) => !t.eliminated);
export const currentTurn = (s: GauntletState): Turn | null => (s.turnIndex >= 0 && s.turnIndex < s.turns.length ? s.turns[s.turnIndex] : null);
export const teamName = (s: GauntletState, id: string | null) => s.teams.find((t) => t.id === id)?.name ?? "";
export const multiplier = (streak: number) => Math.min(MAX_STREAK_MULTIPLIER, Math.max(1, streak + 1));

/** Commits a change: snapshot for undo, bump revision, append to log. */
function commit(prev: GauntletState, next: Omit<GauntletState, "history" | "revision">, message: string): GauntletState {
  const snapshot: GauntletState = { ...prev, history: [] };
  const worstRank = { ...(prev.worstRank ?? {}) };
  if (prev.phase !== "lobby") for (const r of standings(prev)) worstRank[r.team.id] = Math.max(worstRank[r.team.id] ?? 0, r.rank);
  return { ...next, worstRank, revision: prev.revision + 1, history: [...prev.history, snapshot].slice(-MAX_UNDO), log: [...prev.log, message].slice(-100) };
}

function draw(s: { cursors: GauntletState["cursors"]; sizes: DeckSizes }, deck: keyof DeckSizes): number {
  const size = s.sizes[deck];
  const n = s.cursors[deck] ?? 0;
  s.cursors[deck] = n + 1;
  return size === 0 ? 0 : n % size;
}

const timerSeconds = (kind: TurnKind, o: Options, mod: WildModifier | null, teamId: string | null): number => {
  const base: Record<TurnKind, number> = { warmup: 10, quickfire: 10, puzzle: 45, wild: o.roundSeconds, choice: o.roundSeconds, chaos: 30, climb: 20, crossroads: 30, lock: 30, summit: 10 };
  let secs = base[kind];
  if (mod?.effect === "suddenLight" && (kind === "quickfire" || kind === "wild" || kind === "puzzle") && teamId) secs = Math.max(5, secs - 5);
  return secs;
};

/** Opens turn i (or clears it). Mutates a fresh copy only. */
function openTurn(s: GauntletState, i: number, now: number): GauntletState {
  const turn = s.turns[i];
  if (!turn) return { ...s, turnIndex: i, activeTeamId: null, timer: idleTimer() };
  const ms = timerSeconds(turn.kind, s.options, s.wildModifier, turn.teamId) * 1000;
  const wildModifier = turn.kind === "wild" && turn.teamId ? { effect: s.wildEffects[turn.itemIndex], teamId: turn.teamId } : s.wildModifier;
  return { ...s, turnIndex: i, activeTeamId: turn.teamId, wildModifier, timer: { durationMs: ms, remainingMs: ms, runningSince: now, expired: false } };
}

const mkTurn = (kind: TurnKind, teamId: string | null, itemIndex: number, tier?: ChoiceTier): Turn => ({ kind, teamId, itemIndex, tier, hintsUsed: 0, submission: null, resolved: false });

/** Builds the turn queue for a phase. */
function buildTurns(s: GauntletState): Turn[] {
  const teams = activeTeams(s);
  const c = { cursors: { ...s.cursors }, sizes: s.sizes };
  const turns: Turn[] = [];
  if (s.phase === "warmup") for (let i = 0; i < s.sizes.warmup; i++) turns.push(mkTurn("warmup", null, i));
  if (s.phase === "laneRound")
    for (const t of teams) {
      const lane = s.laneSelections[t.id];
      for (let k = 0; k < ITEMS_PER_LANE[lane]; k++) turns.push(mkTurn(lane, t.id, draw(c, lane)));
    }
  if (s.phase === "choice") for (const t of teams) turns.push(mkTurn("choice", t.id, draw(c, "choice"), s.choiceSelections[t.id]));
  if (s.phase === "chaos") for (let i = 0; i < Math.min(CHAOS_PER_MATCH, s.sizes.chaos); i++) turns.push(mkTurn("chaos", null, draw(c, "chaos")));
  if (s.phase === "final") {
    const fin = s.finalists;
    for (let r = 0; r < CLIMB_PER_FINALIST; r++) for (const id of fin) turns.push(mkTurn("climb", id, draw(c, "climb")));
    for (const id of fin) turns.push(mkTurn("crossroads", id, draw(c, "crossroads")));
    for (const id of fin) turns.push(mkTurn("lock", id, draw(c, "lock")));
    turns.push(mkTurn("summit", null, draw(c, "summit")));
  }
  s.cursors = c.cursors;
  return turns;
}

function enterPhase(s: GauntletState, phase: Phase, now: number): GauntletState {
  let next: GauntletState = { ...s, phase, turns: [], turnIndex: -1, activeTeamId: null, timer: idleTimer(), cursors: { ...s.cursors } };
  if (phase === "laneChoice") next.laneSelections = {};
  if (phase === "choice") next.choiceSelections = {};
  if (phase === "laneRound" || phase === "chaos" || phase === "final" || phase === "warmup") {
    if (phase === "final") next.finalists = pickFinalists(next);
    next.turns = buildTurns(next);
    next = openTurn(next, 0, now);
  }
  if (phase === "results") next.winners = computeWinners(next);
  return next;
}

/** Top three active teams, keeping everyone tied at the cut. */
export function pickFinalists(s: GauntletState): string[] {
  const ranked = activeTeams(s).sort((a, b) => s.scores[b.id] - s.scores[a.id]);
  if (ranked.length <= 3) return ranked.map((t) => t.id);
  const cut = s.scores[ranked[2].id];
  return ranked.filter((t, i) => i < 3 || s.scores[t.id] === cut).map((t) => t.id);
}

/** Everyone tied for the top score among non-eliminated teams wins. Never a random sole winner. */
export function computeWinners(s: GauntletState): string[] {
  const pool = activeTeams(s).length > 0 ? activeTeams(s) : s.teams;
  if (pool.length === 0) return [];
  const top = Math.max(...pool.map((t) => s.scores[t.id]));
  return pool.filter((t) => s.scores[t.id] === top).map((t) => t.id);
}

/** Standings with shared ranks for ties (1, 1, 3). Eliminated teams rank below survivors. */
export function standings(s: GauntletState): Array<{ team: GauntletTeam; score: number; rank: number }> {
  const sorted = [...s.teams].sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || s.scores[b.id] - s.scores[a.id]);
  return sorted.map((team, i) => {
    const first = sorted.findIndex((t) => t.eliminated === team.eliminated && s.scores[t.id] === s.scores[team.id]);
    return { team, score: s.scores[team.id], rank: (first === -1 ? i : first) + 1 };
  });
}

const applyScore = (s: GauntletState, teamId: string, delta: number): Record<string, number> => {
  const raw = s.scores[teamId] + delta;
  return { ...s.scores, [teamId]: s.options.allowNegativeScores ? raw : Math.max(0, raw) };
};

const turnOpen = (s: GauntletState): Turn | null => {
  const t = currentTurn(s);
  return t && !t.resolved ? t : null;
};

const stopTimer = (t: TimerState, now: number): TimerState => ({ ...t, remainingMs: remaining(t, now), runningSince: null });

export function remaining(t: TimerState, now: number): number {
  return t.runningSince === null ? t.remainingMs : Math.max(0, t.remainingMs - (now - t.runningSince));
}

/** The full value a correct answer on this turn is worth. */
export function turnValue(s: GauntletState, turn: Turn, teamId: string): number {
  switch (turn.kind) {
    case "warmup":
      return POINTS.warmup;
    case "quickfire":
      return POINTS.quickfire * multiplier(s.streaks[teamId]);
    case "puzzle":
      return POINTS.puzzle[Math.min(turn.hintsUsed, 2)];
    case "wild": {
      const e = s.wildEffects[turn.itemIndex];
      return e === "double" ? POINTS.wild * 2 : e === "bounty" ? POINTS.bounty : POINTS.wild;
    }
    case "choice":
      return POINTS.choice[turn.tier ?? "safe"];
    case "chaos":
      return POINTS.chaos;
    case "climb":
      return POINTS.climb;
    case "crossroads":
      return POINTS.crossroads;
    case "lock":
      return POINTS.lock;
    case "summit":
      return POINTS.summit;
  }
}

function wrongPenalty(s: GauntletState, turn: Turn): number {
  if (turn.kind === "choice" && turn.tier === "bold") return POINTS.boldPenalty;
  if (turn.kind === "crossroads") return POINTS.crossroadsPenalty;
  if (turn.kind === "wild" && s.wildEffects[turn.itemIndex] === "double") return POINTS.wild;
  return 0;
}

/* ---------- lobby transitions ---------- */

export function joinTeam(s: GauntletState, teamId: string, name: string): GauntletState {
  const clean = name.trim().slice(0, 24);
  const team = s.teams.find((t) => t.id === teamId);
  if (s.phase !== "lobby" || !team || !clean || team.players.length >= 8) return s;
  const player = { id: `${teamId}p${Date.now().toString(36)}${team.players.length}`, name: clean, ready: false };
  return commit(s, { ...s, teams: s.teams.map((t) => (t.id === teamId ? { ...t, players: [...t.players, player] } : t)) }, `${clean} joined ${team.name}`);
}

export function movePlayer(s: GauntletState, playerId: string, toTeamId: string): GauntletState {
  const from = s.teams.find((t) => t.players.some((p) => p.id === playerId));
  const to = s.teams.find((t) => t.id === toTeamId);
  if (s.phase !== "lobby" || !from || !to || from === to || to.players.length >= 8) return s;
  const player = from.players.find((p) => p.id === playerId)!;
  const teams = s.teams.map((t) => (t === from ? { ...t, players: t.players.filter((p) => p.id !== playerId) } : t === to ? { ...t, players: [...t.players, { ...player, ready: false }] } : t));
  return commit(s, { ...s, teams }, `${player.name} moved to ${to.name}`);
}

export function setReady(s: GauntletState, playerId: string, ready: boolean): GauntletState {
  if (s.phase !== "lobby") return s;
  let found = false;
  const teams = s.teams.map((t) => ({ ...t, players: t.players.map((p) => (p.id === playerId && p.ready !== ready ? ((found = true), { ...p, ready }) : p)) }));
  return found ? commit(s, { ...s, teams }, `Readiness changed`) : s;
}

export const allReady = (s: GauntletState) => s.teams.every((t) => t.players.length > 0 && t.players.every((p) => p.ready));

/* ---------- play transitions ---------- */

/** Lanes stay open until ceil(teams/3) teams hold them, so 3 or fewer teams never share a lane. */
export function laneLocked(s: GauntletState, lane: LaneType): boolean {
  const cap = Math.ceil(activeTeams(s).length / LANES.length);
  return Object.values(s.laneSelections).filter((l) => l === lane).length >= cap;
}

/** Teams pick in standings order: the next team without a lane. */
export function nextPicker(s: GauntletState): string | null {
  const order = activeTeams(s).sort((a, b) => s.scores[b.id] - s.scores[a.id]);
  return order.find((t) => !s.laneSelections[t.id])?.id ?? null;
}

export function chooseLane(s: GauntletState, teamId: string, lane: LaneType): GauntletState {
  if (s.phase !== "laneChoice" || nextPicker(s) !== teamId || !LANES.includes(lane) || laneLocked(s, lane)) return s;
  return commit(s, { ...s, laneSelections: { ...s.laneSelections, [teamId]: lane }, activeTeamId: teamId }, `${teamName(s, teamId)} chose ${lane}`);
}

export function submitChoice(s: GauntletState, teamId: string, tier: ChoiceTier): GauntletState {
  const team = s.teams.find((t) => t.id === teamId);
  if (s.phase !== "choice" || s.turns.length > 0 || !team || team.eliminated || !["safe", "bold", "unknown"].includes(tier) || s.choiceSelections[teamId]) return s;
  return commit(s, { ...s, choiceSelections: { ...s.choiceSelections, [teamId]: tier } }, `${team.name} locked a choice`);
}

export function submitAnswer(s: GauntletState, teamId: string, text: string, now: number): GauntletState {
  const turn = turnOpen(s);
  const clean = text.trim();
  const team = s.teams.find((t) => t.id === teamId);
  if (!turn || !team || team.eliminated || !clean || clean.length > MAX_ANSWER_LENGTH) return s;
  if (turn.teamId !== null && turn.teamId !== teamId) return s;
  if (s.timer.expired || remaining(s.timer, now) <= 0) return s;
  if (turn.submission) return s;
  const turns = s.turns.map((t, i) => (i === s.turnIndex ? { ...t, submission: { teamId, text: clean }, answerMs: s.timer.durationMs - remaining(s.timer, now) } : t));
  return commit(s, { ...s, turns, timer: stopTimer(s.timer, now) }, `${team.name} answered`);
}

/** Reveals the next puzzle hint, lowering the reward. */
export function revealHint(s: GauntletState): GauntletState {
  const turn = turnOpen(s);
  if (!turn || turn.kind !== "puzzle" || turn.hintsUsed >= 2) return s;
  return commit(s, { ...s, turns: s.turns.map((t, i) => (i === s.turnIndex ? { ...t, hintsUsed: t.hintsUsed + 1 } : t)) }, "Hint revealed");
}

function resolveWith(s: GauntletState, outcome: NonNullable<Turn["outcome"]>, teamId: string | null, points: number, now: number, message: string): GauntletState {
  const turns = s.turns.map((t, i) => (i === s.turnIndex ? { ...t, resolved: true, outcome, points } : t));
  return commit(s, { ...s, turns, timer: { ...stopTimer(s.timer, now), expired: outcome === "expired" || s.timer.expired }, activeTeamId: teamId ?? s.activeTeamId }, message);
}

/**
 * Host accepts or rejects. For shared turns (teamId null) the host names the team.
 * Wrong answers break the streak; quickfire uses the 1x to 5x streak multiplier.
 */
export function resolveAnswer(s: GauntletState, correct: boolean, now: number, forTeamId?: string): GauntletState {
  const turn = turnOpen(s);
  if (!turn) return s;
  const teamId = turn.teamId ?? forTeamId ?? turn.submission?.teamId ?? null;
  if (!teamId || !activeTeams(s).some((t) => t.id === teamId)) return s;
  const name = teamName(s, teamId);
  if (correct) {
    const value = turnValue(s, turn, teamId);
    let scores = applyScore(s, teamId, value);
    if (turn.kind === "wild" && s.wildEffects[turn.itemIndex] === "shift") {
      const others = activeTeams(s).filter((t) => t.id !== teamId);
      if (others.length) {
        const low = others.reduce((a, b) => (scores[b.id] < scores[a.id] ? b : a));
        scores = { ...scores, [low.id]: scores[low.id] + POINTS.shiftBonus };
      }
    }
    const streak = s.streaks[teamId] + 1;
    const next = resolveWith(s, "correct", teamId, value, now, `${name} correct +${value}`);
    const ms = turn.submission?.teamId === teamId ? turn.answerMs : undefined;
    const fastest = ms !== undefined && (!s.fastest || ms < s.fastest.ms) ? { teamId, ms } : (s.fastest ?? null);
    const boldWins = turn.kind === "choice" && turn.tier === "bold" ? [...(s.boldWins ?? []), teamId] : s.boldWins;
    return { ...next, fastest, boldWins, scores, streaks: { ...s.streaks, [teamId]: streak }, bestStreaks: { ...s.bestStreaks, [teamId]: Math.max(s.bestStreaks[teamId], streak) } };
  }
  // A shared turn stays open for other teams after a wrong answer.
  const penalty = wrongPenalty(s, turn);
  const scores = penalty ? applyScore(s, teamId, -penalty) : s.scores;
  if (turn.teamId === null) {
    const turns = s.turns.map((t, i) => (i === s.turnIndex ? { ...t, submission: null } : t));
    return { ...commit(s, { ...s, turns }, `${name} wrong`), scores, streaks: { ...s.streaks, [teamId]: 0 } };
  }
  const next = resolveWith(s, "wrong", teamId, -penalty, now, `${name} wrong${penalty ? ` -${penalty}` : ""}`);
  return { ...next, scores, streaks: { ...s.streaks, [teamId]: 0 } };
}

/** Host-awarded partial credit, up to the full value. Streak is unchanged. */
export function awardPartialCredit(s: GauntletState, points: number, now: number, forTeamId?: string): GauntletState {
  const turn = turnOpen(s);
  if (!turn || !Number.isFinite(points) || points <= 0) return s;
  const teamId = turn.teamId ?? forTeamId ?? turn.submission?.teamId ?? null;
  if (!teamId || !activeTeams(s).some((t) => t.id === teamId)) return s;
  const award = Math.min(Math.round(points), turnValue(s, turn, teamId));
  const next = resolveWith(s, "partial", teamId, award, now, `${teamName(s, teamId)} partial +${award}`);
  return { ...next, scores: applyScore(s, teamId, award) };
}

/** Host confirms a pass. No points, no penalty, the streak survives. */
export function passQuestion(s: GauntletState, now: number): GauntletState {
  const turn = turnOpen(s);
  if (!turn) return s;
  return resolveWith(s, "pass", turn.teamId, 0, now, "Passed");
}

/** Timer ran out. Resolves the turn exactly once; later calls do nothing. */
export function expireTimer(s: GauntletState, now: number): GauntletState {
  const turn = turnOpen(s);
  if (!turn || s.timer.expired || s.timer.runningSince === null || remaining(s.timer, now) > 0) return s;
  const next = resolveWith(s, "expired", turn.teamId, 0, now, "Time expired");
  return turn.teamId && (turn.kind === "quickfire" || turn.kind === "warmup") ? { ...next, streaks: { ...s.streaks, [turn.teamId]: 0 } } : next;
}

export function pauseTimer(s: GauntletState, now: number): GauntletState {
  if (!turnOpen(s) || s.timer.expired) return s;
  const t = s.timer;
  const timer = t.runningSince === null ? { ...t, runningSince: now } : stopTimer(t, now);
  return commit(s, { ...s, timer }, t.runningSince === null ? "Timer resumed" : "Timer paused");
}

export function activateWildModifier(s: GauntletState, effect: WildEffect, teamId: string): GauntletState {
  if (!s.teams.some((t) => t.id === teamId)) return s;
  return commit(s, { ...s, wildModifier: { effect, teamId } }, `Wild: ${effect}`);
}

/** Eliminates a team. Safe mode never eliminates, and the last team standing is never removed. */
export function eliminateTeam(s: GauntletState, teamId: string): GauntletState {
  const team = s.teams.find((t) => t.id === teamId);
  if (s.options.safeMode || !team || team.eliminated || activeTeams(s).length <= 1) return s;
  return commit(
    s,
    { ...s, teams: s.teams.map((t) => (t.id === teamId ? { ...t, eliminated: true } : t)), eliminationHistory: [...s.eliminationHistory, teamId] },
    `${team.name} eliminated`,
  );
}

/** Lowest team after a lane round in survival mode. Ties for last are spared. */
export function survivalCut(s: GauntletState): string | null {
  if (s.options.mode !== "survival" || s.options.safeMode) return null;
  const teams = activeTeams(s);
  if (teams.length <= 3) return null;
  const low = Math.min(...teams.map((t) => s.scores[t.id]));
  const lowest = teams.filter((t) => s.scores[t.id] === low);
  return lowest.length === 1 ? lowest[0].id : null;
}

/** Can the host move on from here? */
export function canAdvance(s: GauntletState): boolean {
  if (s.phase === "results") return false;
  if (s.phase === "lobby") return s.teams.length > 0 && allReady(s);
  if (s.phase === "laneChoice") return nextPicker(s) === null;
  if (s.phase === "choice" && s.turns.length === 0) return activeTeams(s).every((t) => s.choiceSelections[t.id]);
  const turn = currentTurn(s);
  return !turn || turn.resolved;
}

/** Next turn, or the next stage when the queue is done. */
export function advanceRound(s: GauntletState, now: number): GauntletState {
  if (!canAdvance(s)) return s;
  const go = (phase: Phase, extra: Partial<GauntletState> = {}) => commit(s, enterPhase({ ...s, ...extra }, phase, now), `Stage: ${phase}`);
  if (s.turns.length > 0 && s.turnIndex < s.turns.length - 1) {
    return commit(s, openTurn({ ...s }, s.turnIndex + 1, now), "Next question");
  }
  switch (s.phase) {
    case "lobby":
      return go("warmup");
    case "warmup":
      return go("laneChoice");
    case "laneChoice":
      return go("laneRound");
    case "laneRound": {
      const next = go("intermission", { wildModifier: null });
      const cut = survivalCut(next);
      return cut ? { ...eliminateTeam(next, cut), history: next.history, revision: next.revision + 1 } : next;
    }
    case "intermission":
      return s.roundIndex + 1 < LANE_ROUNDS ? go("laneChoice", { roundIndex: s.roundIndex + 1 }) : go("choice");
    case "choice":
      if (s.turns.length === 0) {
        const next = { ...s, cursors: { ...s.cursors } };
        next.turns = buildTurns(next);
        return commit(s, openTurn(next, 0, now), "Choices revealed");
      }
      return go("chaos");
    case "chaos":
      return go("final");
    case "final":
      return go("results");
    default:
      return s;
  }
}

export function finishMatch(s: GauntletState): GauntletState {
  if (s.phase === "results") return s;
  return commit(s, enterPhase(s, "results", 0), "Match finished");
}

/** Restores the state before the latest transition. */
export function undoLastAction(s: GauntletState): GauntletState {
  if (s.history.length === 0) return s;
  const prev = s.history[s.history.length - 1];
  // A restored running timer comes back paused so it cannot expire instantly.
  const timer = prev.timer.runningSince === null ? prev.timer : { ...prev.timer, runningSince: null };
  return { ...prev, timer, history: s.history.slice(0, -1), revision: s.revision + 1, log: [...prev.log, "Undo"] };
}

/** Fun awards for the results screen. All derived from state, so they work after a host refresh too. */
export interface Award {
  title: string;
  team: string;
  detail: string;
}

export function awards(s: GauntletState): Award[] {
  const out: Award[] = [];
  const name = (id: string) => teamName(s, id);
  if (s.fastest) out.push({ title: "Fastest answer", team: name(s.fastest.teamId), detail: `${(s.fastest.ms / 1000).toFixed(1)} seconds` });
  const final = standings(s);
  const comeback = final
    .map((r) => ({ id: r.team.id, climb: (s.worstRank?.[r.team.id] ?? r.rank) - r.rank }))
    .sort((a, b) => b.climb - a.climb)[0];
  if (comeback && comeback.climb > 0) out.push({ title: "Biggest comeback", team: name(comeback.id), detail: `climbed ${comeback.climb} place${comeback.climb > 1 ? "s" : ""}` });
  const streak = Object.entries(s.bestStreaks).sort((a, b) => b[1] - a[1])[0];
  if (streak && streak[1] >= 2) out.push({ title: "Hot streak", team: name(streak[0]), detail: `${streak[1]} in a row` });
  const bold = s.boldWins ?? [];
  if (bold.length) out.push({ title: "Fortune favours the bold", team: [...new Set(bold)].map(name).join(", "), detail: "landed a Bold challenge" });
  return out;
}
