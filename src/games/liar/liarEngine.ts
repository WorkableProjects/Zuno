/**
 * LIAR session rules as pure functions. React only renders this state.
 * Private statements and the lie marker live in memory for one session and are never saved.
 */

export const STATEMENT_COUNT = 3;
export const MIN_PLAYERS = 3;

export interface Player {
  id: string;
  name: string;
  removed?: boolean;
}

export interface Statement {
  text: string;
  /** At least one follow-up question per statement. */
  questions: string[];
}

export interface Turn {
  statements: Statement[];
  /** Index of the lie. Never shown before reveal. */
  lieIndex: number;
}

export type Vote = number | "abstain";
export type Phase = "prep" | "discuss" | "vote" | "reveal" | "done";

/** Spec phase names (Writing -> Assigned -> Reading -> Questioning -> Voting -> Reveal -> Scoring) mapped from engine phases. */
export const PHASE_LABEL: Record<Phase, string> = {
  prep: "Writing",
  discuss: "Questioning",
  vote: "Voting",
  reveal: "Reveal",
  done: "Scoring",
};

export interface Options {
  rounds: number;
  scoring: boolean;
  allowAbstain: boolean;
  /** Show vote totals while voting is open. Off by default: totals appear at reveal. */
  liveResults?: boolean;
  /** Hide who voted for what in the reveal. */
  anonymousVotes?: boolean;
  /** Streak bonus: +1 for a voter's second consecutive correct guess and onward. */
  streakBonus?: boolean;
  /** Discussion length in seconds, used by presets and the session estimate. */
  discussSeconds?: number;
  /** Hide follow-up question hints from the group (Hardcore). */
  hideHints?: boolean;
}

export const MAX_STATEMENT_LENGTH = 200;

/** One vote change, kept for audit. */
export interface VoteRevision {
  round: number;
  turnIndex: number;
  voter: string;
  vote: Vote;
  confidence?: number;
  /** Ordinal of this revision for the voter in this turn: 1 is the initial vote. */
  revision: number;
}

/** One score change with the exact rule that caused it. */
export type ScoreRule = "caughtLie" | "fooledPlayers" | "streak" | "hostFix";
export interface ScoreEvent {
  round: number;
  turnIndex: number;
  playerId: string;
  points: number;
  rule: ScoreRule;
  explanation: string;
}

export const SCORE_RULES: Record<Exclude<ScoreRule, "hostFix">, string> = {
  caughtLie: "+1 to each voter who picks the lie.",
  fooledPlayers: "+1 to the storyteller for every voter fooled (at least one needed).",
  streak: "+1 streak bonus for a second correct pick in a row (only if enabled).",
};

/** The ordered rule list to show before a round. */
export function scoreRulesFor(options: Options): string[] {
  if (!options.scoring) return ["Casual play: no points, just a recap."];
  const list = [SCORE_RULES.caughtLie, SCORE_RULES.fooledPlayers, "Wrong picks and abstentions never lose points."];
  if (options.streakBonus) list.push(SCORE_RULES.streak);
  return list;
}

/** Rough session length in minutes from players, rounds and discussion length. */
export function estimateMinutes(players: number, rounds: number, discussSeconds = 60): number {
  const perTurn = 1.5 + discussSeconds / 60 + 1; // write/read, discuss, vote and reveal
  return Math.max(1, Math.round(Math.max(players, 1) * Math.max(rounds, 1) * perTurn));
}

export interface LiarPreset {
  id: "party" | "quick" | "hardcore" | "local";
  label: string;
  description: string;
  options: Options;
}

export const LIAR_PRESETS: LiarPreset[] = [
  { id: "party", label: "Party", description: "6-12 players, 60-second discussion, points on.", options: { rounds: 1, scoring: true, allowAbstain: false, discussSeconds: 60 } },
  { id: "quick", label: "Quick", description: "4-8 players, 30-second discussion, two rounds.", options: { rounds: 2, scoring: true, allowAbstain: false, discussSeconds: 30 } },
  { id: "hardcore", label: "Hardcore", description: "5-10 players, no follow-up hints, points on.", options: { rounds: 1, scoring: true, allowAbstain: false, discussSeconds: 60, hideHints: true } },
  { id: "local", label: "Local", description: "Pass-and-play statement entry on one device.", options: { rounds: 1, scoring: false, allowAbstain: true, discussSeconds: 60 } },
];

export interface RecapEntry {
  round: number;
  storytellerId: string;
  turn: Turn;
  votes: Record<string, Vote>;
}

export type StatementMark = "suspicious" | "reviewed";

export interface LiarState {
  players: Player[];
  options: Options;
  /** Zero-based round. */
  round: number;
  /** Position in the turn order within the round. */
  turnIndex: number;
  phase: Phase;
  turn: Turn | null;
  votes: Record<string, Vote>;
  scores: Record<string, number>;
  recap: RecapEntry[];
  paused: boolean;
  endedEarly: boolean;
  /** Increments on every accepted action, for stale-update checks. */
  revision?: number;
  /** Optional confidence (0-100) per voter for the current turn. */
  confidence?: Record<string, number>;
  /** Every vote change, for audit. */
  voteLog?: VoteRevision[];
  /** Every score change with its rule. */
  scoreLog?: ScoreEvent[];
  /** Per-player notes on statements in the current turn. */
  marks?: Record<string, Record<number, StatementMark>>;
  /** Consecutive correct picks per player, for the streak bonus. */
  streaks?: Record<string, number>;
}

export type LiarAction =
  | { type: "submitTurn"; turn: Turn }
  | { type: "startVoting" }
  | { type: "vote"; voter: string; vote: Vote; confidence?: number }
  | { type: "mark"; player: string; statement: number; mark: StatementMark | null }
  | { type: "closeVoting" }
  | { type: "fixLie"; lieIndex: number }
  | { type: "next" }
  | { type: "skipTurn" }
  | { type: "removePlayer"; id: string }
  | { type: "pause"; paused: boolean }
  | { type: "end" };

export interface Result<T> {
  ok: boolean;
  errors: string[];
  value: T;
}

/** Errors that stop a game from starting. Empty means it can start. */
export function validateSetup(names: string[], options: Options, minPlayers = MIN_PLAYERS, maxPlayers = 10): string[] {
  const errors: string[] = [];
  const clean = names.map((n) => n.trim());
  if (clean.length < minPlayers) errors.push(`LIAR needs at least ${minPlayers} players.`);
  if (clean.length > maxPlayers) errors.push(`LIAR supports at most ${maxPlayers} players.`);
  if (clean.some((n) => n === "")) errors.push("Every player needs a name.");
  const lower = clean.filter(Boolean).map((n) => n.toLowerCase());
  if (new Set(lower).size !== lower.length) errors.push("Player names must be different.");
  if (!Number.isInteger(options.rounds) || options.rounds < 1) errors.push("Choose at least one round.");
  return errors;
}

/** Every problem that stops a storyteller turn from starting. */
export function validateTurn(turn: Turn): string[] {
  const errors: string[] = [];
  if (turn.statements.length !== STATEMENT_COUNT) {
    errors.push(`A turn needs exactly ${STATEMENT_COUNT} statements.`);
    return errors;
  }
  turn.statements.forEach((s, i) => {
    if (s.text.trim() === "") errors.push(`Statement ${i + 1} is empty.`);
    else if (s.text.trim().length > MAX_STATEMENT_LENGTH) errors.push(`Statement ${i + 1} is longer than ${MAX_STATEMENT_LENGTH} characters.`);
    if (!s.questions.some((q) => q.trim() !== "")) errors.push(`Statement ${i + 1} needs at least one follow-up question.`);
  });
  const texts = turn.statements.map((s) => s.text.trim().toLowerCase()).filter(Boolean);
  if (new Set(texts).size !== texts.length) errors.push("Two statements are the same. Make each one different.");
  if (!Number.isInteger(turn.lieIndex) || turn.lieIndex < 0 || turn.lieIndex >= STATEMENT_COUNT) {
    errors.push("Mark exactly one statement as the lie.");
  }
  return errors;
}

export function cleanTurn(turn: Turn): Turn {
  return {
    lieIndex: turn.lieIndex,
    statements: turn.statements.map((s) => ({ text: s.text.trim(), questions: s.questions.map((q) => q.trim()).filter(Boolean) })),
  };
}

export function createSession(names: string[], options: Options): LiarState {
  return createSessionWith(
    names.map((n, i) => ({ id: `p${i + 1}`, name: n.trim() })),
    options,
  );
}

/** A session with given player ids, as online games use the lobby's ids. */
export function createSessionWith(list: Player[], options: Options): LiarState {
  const players = list.map((p) => ({ id: p.id, name: p.name.trim() }));
  return {
    players,
    options,
    round: 0,
    turnIndex: 0,
    phase: "prep",
    turn: null,
    votes: {},
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    recap: [],
    paused: false,
    endedEarly: false,
    revision: 0,
    confidence: {},
    voteLog: [],
    scoreLog: [],
    marks: {},
    streaks: {},
  };
}

export const activePlayers = (s: LiarState) => s.players.filter((p) => !p.removed);

export function storyteller(s: LiarState): Player | null {
  if (s.phase === "done") return null;
  return activePlayers(s)[s.turnIndex] ?? null;
}

/** Players who must vote on this turn: everyone active except the storyteller. */
export function voters(s: LiarState): Player[] {
  const st = storyteller(s);
  return activePlayers(s).filter((p) => p.id !== st?.id);
}

export function votesIn(s: LiarState): number {
  const ids = new Set(voters(s).map((p) => p.id));
  return Object.keys(s.votes).filter((id) => ids.has(id)).length;
}

export function allVotesIn(s: LiarState): boolean {
  return voters(s).length > 0 && votesIn(s) === voters(s).length;
}

/** The statements the group may see. The lie is only included once revealed. */
export function publicTurn(s: LiarState): { statements: Statement[]; lieIndex: number | null } | null {
  if (!s.turn) return null;
  const revealed = s.phase === "reveal" || s.phase === "done";
  return { statements: s.turn.statements, lieIndex: revealed ? s.turn.lieIndex : null };
}

/** Vote counts per statement, plus abstentions. Only meaningful once voting has closed. */
export function tally(votes: Record<string, Vote>): { counts: number[]; abstained: number } {
  const counts = Array.from({ length: STATEMENT_COUNT }, () => 0);
  let abstained = 0;
  for (const v of Object.values(votes)) {
    if (v === "abstain") abstained++;
    else if (counts[v] !== undefined) counts[v]++;
  }
  return { counts, abstained };
}

/** Score changes for one turn. Casual play returns nothing. */
export function scoreTurn(options: Options, storytellerId: string, turn: Turn, votes: Record<string, Vote>): Record<string, number> {
  if (!options.scoring) return {};
  const delta: Record<string, number> = {};
  let fooled = 0;
  for (const [id, v] of Object.entries(votes)) {
    if (id === storytellerId || v === "abstain") continue;
    if (v === turn.lieIndex) delta[id] = (delta[id] ?? 0) + 1;
    else fooled++;
  }
  if (fooled > 0) delta[storytellerId] = fooled;
  return delta;
}

/** Score changes for one turn as events naming the rule behind each. */
export function scoreEvents(s: LiarState, storytellerId: string, turn: Turn, votes: Record<string, Vote>): ScoreEvent[] {
  if (!s.options.scoring) return [];
  const at = { round: s.round, turnIndex: s.turnIndex };
  const out: ScoreEvent[] = [];
  let fooled = 0;
  for (const [id, v] of Object.entries(votes)) {
    if (id === storytellerId || v === "abstain") continue;
    if (v === turn.lieIndex) {
      out.push({ ...at, playerId: id, points: 1, rule: "caughtLie", explanation: "Picked the lie." });
      if (s.options.streakBonus && (s.streaks?.[id] ?? 0) >= 1) out.push({ ...at, playerId: id, points: 1, rule: "streak", explanation: "Streak bonus: correct again." });
    } else fooled++;
  }
  if (fooled > 0) out.push({ ...at, playerId: storytellerId, points: fooled, rule: "fooledPlayers", explanation: `Fooled ${fooled} ${fooled === 1 ? "player" : "players"}.` });
  return out;
}

function nextStreaks(prev: Record<string, number>, storytellerId: string, turn: Turn, votes: Record<string, Vote>): Record<string, number> {
  const out = { ...prev };
  for (const [id, v] of Object.entries(votes)) {
    if (id === storytellerId) continue;
    out[id] = v === turn.lieIndex ? (out[id] ?? 0) + 1 : 0;
  }
  return out;
}

/** Points from events, summed per player. */
export function sumEvents(events: ScoreEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.playerId] = (out[e.playerId] ?? 0) + e.points;
  return out;
}

/** Each voter's revisions this turn, oldest first: their vote path. */
export function votePaths(s: LiarState, round = s.round, turnIndex = s.turnIndex): Record<string, VoteRevision[]> {
  const out: Record<string, VoteRevision[]> = {};
  for (const r of s.voteLog ?? []) if (r.round === round && r.turnIndex === turnIndex) (out[r.voter] ??= []).push(r);
  return out;
}

/** Statements with the most votes; more than one means a tie. */
export function topSuspects(votes: Record<string, Vote>): number[] {
  const { counts } = tally(votes);
  const top = Math.max(...counts);
  return top === 0 ? [] : counts.flatMap((c, i) => (c === top ? [i] : []));
}

/** Tally visible to players: hidden until reveal unless live results are on. */
export function visibleTally(s: LiarState): ReturnType<typeof tally> | null {
  if (s.phase === "reveal" || s.phase === "done" || (s.phase === "vote" && s.options.liveResults)) return tally(s.votes);
  return null;
}

/**
 * State safe to broadcast: no lie marker, no other players' votes or marks
 * before reveal. Statements are only included once the turn is submitted.
 */
export function broadcastState(s: LiarState, viewerId?: string): LiarState {
  const revealed = s.phase === "reveal" || s.phase === "done";
  const turn = s.turn && !revealed ? { ...s.turn, lieIndex: -1 } : s.turn;
  const own = <T,>(rec: Record<string, T> | undefined) => (viewerId && rec && viewerId in rec ? { [viewerId]: rec[viewerId] } : {});
  const votes = revealed ? (s.options.anonymousVotes ? {} : s.votes) : own(s.votes);
  return {
    ...s,
    turn,
    votes,
    confidence: revealed && !s.options.anonymousVotes ? s.confidence : own(s.confidence),
    marks: own(s.marks),
    voteLog: revealed && !s.options.anonymousVotes ? s.voteLog : (s.voteLog ?? []).filter((r) => r.voter === viewerId),
    recap: s.options.anonymousVotes ? s.recap.map((r) => ({ ...r, votes: {} })) : s.recap,
  };
}

/** True when an incoming update is older than the state already held. */
export function isStale(current: LiarState, incoming: LiarState): boolean {
  return (incoming.revision ?? 0) < (current.revision ?? 0);
}

export function winners(s: LiarState): Player[] {
  if (!s.options.scoring) return [];
  const list = activePlayers(s);
  const top = Math.max(...list.map((p) => s.scores[p.id] ?? 0));
  return top > 0 ? list.filter((p) => (s.scores[p.id] ?? 0) === top) : [];
}

function advance(s: LiarState): LiarState {
  const count = activePlayers(s).length;
  const base = { ...s, turn: null, votes: {}, confidence: {}, marks: {}, phase: "prep" as Phase };
  if (s.turnIndex + 1 < count) return { ...base, turnIndex: s.turnIndex + 1 };
  if (s.round + 1 < s.options.rounds) return { ...base, round: s.round + 1, turnIndex: 0 };
  return { ...base, phase: "done" };
}

/**
 * Applies one action. Invalid actions return the same state, so a stray click
 * can never corrupt a game or discard a turn.
 */
export function liarReducer(s: LiarState, a: LiarAction): LiarState {
  const next = reduce(s, a);
  return next === s ? s : { ...next, revision: (s.revision ?? 0) + 1 };
}

function reduce(s: LiarState, a: LiarAction): LiarState {
  if (a.type === "pause") return s.phase === "done" ? s : { ...s, paused: a.paused };
  if (s.phase === "done") return s;
  if (a.type === "end") return { ...s, phase: "done", endedEarly: true, turn: null, votes: {} };

  switch (a.type) {
    case "submitTurn": {
      if (s.phase !== "prep" || validateTurn(a.turn).length > 0) return s;
      return { ...s, phase: "discuss", turn: cleanTurn(a.turn), votes: {} };
    }
    case "startVoting":
      return s.phase === "discuss" ? { ...s, phase: "vote" } : s;
    case "vote": {
      if (s.phase !== "vote") return s;
      if (!voters(s).some((p) => p.id === a.voter)) return s; // storyteller, removed or unknown
      if (a.vote === "abstain") {
        if (!s.options.allowAbstain) return s;
      } else if (!Number.isInteger(a.vote) || a.vote < 0 || a.vote >= STATEMENT_COUNT) return s;
      const prior = (s.voteLog ?? []).filter((r) => r.round === s.round && r.turnIndex === s.turnIndex && r.voter === a.voter).length;
      if (s.votes[a.voter] === a.vote && a.confidence === undefined) return s;
      const confidence = a.confidence === undefined ? s.confidence ?? {} : { ...(s.confidence ?? {}), [a.voter]: Math.max(0, Math.min(100, Math.round(a.confidence))) };
      const entry: VoteRevision = { round: s.round, turnIndex: s.turnIndex, voter: a.voter, vote: a.vote, revision: prior + 1, ...(a.confidence === undefined ? {} : { confidence: confidence[a.voter] }) };
      return { ...s, votes: { ...s.votes, [a.voter]: a.vote }, confidence, voteLog: [...(s.voteLog ?? []), entry] };
    }
    case "mark": {
      if (s.phase !== "discuss" && s.phase !== "vote") return s;
      if (!activePlayers(s).some((p) => p.id === a.player) || a.statement < 0 || a.statement >= STATEMENT_COUNT) return s;
      const mine = { ...(s.marks?.[a.player] ?? {}) };
      if (a.mark === null) delete mine[a.statement];
      else mine[a.statement] = a.mark;
      return { ...s, marks: { ...(s.marks ?? {}), [a.player]: mine } };
    }
    case "closeVoting": {
      const st = storyteller(s);
      if (s.phase !== "vote" || !s.turn || !st) return s;
      const events = scoreEvents(s, st.id, s.turn, s.votes);
      const scores = { ...s.scores };
      for (const [id, n] of Object.entries(sumEvents(events))) scores[id] = (scores[id] ?? 0) + n;
      return {
        ...s,
        phase: "reveal",
        scores,
        scoreLog: [...(s.scoreLog ?? []), ...events],
        streaks: nextStreaks(s.streaks ?? {}, st.id, s.turn, s.votes),
        recap: [...s.recap, { round: s.round, storytellerId: st.id, turn: s.turn, votes: s.votes }],
      };
    }
    case "fixLie": {
      // Host override for an accidental marker, before the next turn begins.
      const st = storyteller(s);
      if (s.phase !== "reveal" || !s.turn || !st || a.lieIndex < 0 || a.lieIndex >= STATEMENT_COUNT || a.lieIndex === s.turn.lieIndex) return s;
      const last = s.recap[s.recap.length - 1];
      const undo = scoreTurn(s.options, st.id, s.turn, last.votes);
      const fixed: Turn = { ...s.turn, lieIndex: a.lieIndex };
      const redo = scoreTurn(s.options, st.id, fixed, last.votes);
      const scores = { ...s.scores };
      for (const [id, n] of Object.entries(undo)) scores[id] = (scores[id] ?? 0) - n;
      for (const [id, n] of Object.entries(redo)) scores[id] = (scores[id] ?? 0) + n;
      const at = { round: s.round, turnIndex: s.turnIndex, rule: "hostFix" as const };
      const fixLog: ScoreEvent[] = [];
      for (const id of new Set([...Object.keys(undo), ...Object.keys(redo)])) {
        const d = (redo[id] ?? 0) - (undo[id] ?? 0);
        if (d !== 0) fixLog.push({ ...at, playerId: id, points: d, explanation: `Host corrected the lie to statement ${a.lieIndex + 1}.` });
      }
      return { ...s, turn: fixed, scores, scoreLog: [...(s.scoreLog ?? []), ...fixLog], recap: [...s.recap.slice(0, -1), { ...last, turn: fixed }] };
    }
    case "next":
      return s.phase === "reveal" ? advance(s) : s;
    case "skipTurn":
      return s.phase === "reveal" ? s : advance(s);
    case "removePlayer": {
      if (activePlayers(s).length <= 1) return s;
      const st = storyteller(s);
      const idx = activePlayers(s).findIndex((p) => p.id === a.id);
      if (idx === -1) return s;
      const players = s.players.map((p) => (p.id === a.id ? { ...p, removed: true } : p));
      const votes = { ...s.votes };
      delete votes[a.id];
      const next = { ...s, players, votes };
      if (st?.id === a.id) return advanceAfterRemoval(next, idx);
      // Keep the storyteller's position when someone earlier in the order leaves.
      return idx < s.turnIndex ? { ...next, turnIndex: s.turnIndex - 1 } : next;
    }
  }
  return s;
}

/** The storyteller left: their turn is dropped and the next player takes the same position. */
function advanceAfterRemoval(s: LiarState, position: number): LiarState {
  const count = activePlayers(s).length;
  const base = { ...s, turn: null, votes: {}, confidence: {}, marks: {}, phase: "prep" as Phase };
  if (position < count) return { ...base, turnIndex: position };
  if (s.round + 1 < s.options.rounds) return { ...base, round: s.round + 1, turnIndex: 0 };
  return { ...base, phase: "done" };
}

/** Turns played versus turns the game was set to have. */
export function progress(s: LiarState): { turn: number; of: number; round: number; rounds: number } {
  const of = activePlayers(s).length;
  return { turn: Math.min(s.turnIndex + 1, of), of, round: Math.min(s.round + 1, s.options.rounds), rounds: s.options.rounds };
}
