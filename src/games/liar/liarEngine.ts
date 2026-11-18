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

export interface Options {
  rounds: number;
  scoring: boolean;
  allowAbstain: boolean;
}

export interface RecapEntry {
  round: number;
  storytellerId: string;
  turn: Turn;
  votes: Record<string, Vote>;
}

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
}

export type LiarAction =
  | { type: "submitTurn"; turn: Turn }
  | { type: "startVoting" }
  | { type: "vote"; voter: string; vote: Vote }
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
    if (!s.questions.some((q) => q.trim() !== "")) errors.push(`Statement ${i + 1} needs at least one follow-up question.`);
  });
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

export function winners(s: LiarState): Player[] {
  if (!s.options.scoring) return [];
  const list = activePlayers(s);
  const top = Math.max(...list.map((p) => s.scores[p.id] ?? 0));
  return top > 0 ? list.filter((p) => (s.scores[p.id] ?? 0) === top) : [];
}

function advance(s: LiarState): LiarState {
  const count = activePlayers(s).length;
  const base = { ...s, turn: null, votes: {}, phase: "prep" as Phase };
  if (s.turnIndex + 1 < count) return { ...base, turnIndex: s.turnIndex + 1 };
  if (s.round + 1 < s.options.rounds) return { ...base, round: s.round + 1, turnIndex: 0 };
  return { ...base, phase: "done" };
}

/**
 * Applies one action. Invalid actions return the same state, so a stray click
 * can never corrupt a game or discard a turn.
 */
export function liarReducer(s: LiarState, a: LiarAction): LiarState {
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
      return { ...s, votes: { ...s.votes, [a.voter]: a.vote } };
    }
    case "closeVoting": {
      const st = storyteller(s);
      if (s.phase !== "vote" || !s.turn || !st) return s;
      const delta = scoreTurn(s.options, st.id, s.turn, s.votes);
      const scores = { ...s.scores };
      for (const [id, n] of Object.entries(delta)) scores[id] = (scores[id] ?? 0) + n;
      return {
        ...s,
        phase: "reveal",
        scores,
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
      return { ...s, turn: fixed, scores, recap: [...s.recap.slice(0, -1), { ...last, turn: fixed }] };
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
  const base = { ...s, turn: null, votes: {}, phase: "prep" as Phase };
  if (position < count) return { ...base, turnIndex: position };
  if (s.round + 1 < s.options.rounds) return { ...base, round: s.round + 1, turnIndex: 0 };
  return { ...base, phase: "done" };
}

/** Turns played versus turns the game was set to have. */
export function progress(s: LiarState): { turn: number; of: number; round: number; rounds: number } {
  const of = activePlayers(s).length;
  return { turn: Math.min(s.turnIndex + 1, of), of, round: Math.min(s.round + 1, s.options.rounds), rounds: s.options.rounds };
}
