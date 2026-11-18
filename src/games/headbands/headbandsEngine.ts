import { HEADBANDS_LIMITS, answerFor, isEligible, type HeadbandsIdentity, type HeadbandsMode } from "../../game-files/schema/headbands";

/** Pure Headbands rules. React screens only render this state and dispatch actions. */

/** The exact allowed response set: Yes / No / Almost / Unsure. */
export type GroupAnswer = "yes" | "no" | "almost" | "unsure";
export const GROUP_ANSWERS: readonly GroupAnswer[] = ["yes", "no", "almost", "unsure"];

/** How sure a player is about a guess. Recorded only; it never changes the check. */
export type GuessConfidence = "correct" | "likely" | "uncertain";

/** Identity lifecycle: Assigned -> Ready -> Asking -> Guessed -> Passed -> Reviewed. */
export type IdentityStatus = "assigned" | "ready" | "asking" | "guessed" | "passed" | "reviewed";

export interface Rules {
  continueAfterYes: boolean;
  unlimitedGuesses: boolean;
  /** Block a question already asked by the same player. Off by default. */
  duplicateQuestionCheck?: boolean;
  /** Guesses allowed per identity before it is marked passed. 0 or unset = no limit. */
  maxGuessesPerIdentity?: number;
}

export interface PlayerSetup {
  name: string;
  identityId: string;
  /** Stable id, such as an online lobby player id. Defaults to p1, p2… */
  id?: string;
}

export interface Player {
  id: string;
  name: string;
  identityId: string;
  solved: boolean;
  /** 1 for the first player to solve, and so on. */
  solvedOrder: number | null;
  /** True when the host marked the guess correct. */
  byHost: boolean;
  removed: boolean;
  questions: number;
  guesses: number;
  /** Lifecycle state of this player's identity. */
  status?: IdentityStatus;
  /** Times this player passed (skipped) a turn. */
  passes?: number;
  /** Turn on which this identity was first played. */
  startedTurn?: number | null;
  /** Wall-clock start of the first turn, when known. */
  startedAt?: number | null;
  /** Reason given when the host overrode the result. */
  overrideReason?: string | null;
  /** Confidence given with the latest guess. */
  confidence?: GuessConfidence | null;
}

export interface QuestionRecord {
  playerId: string;
  question: string;
  answer: GroupAnswer;
  turn: number;
}

export type GuessOutcome = { playerId: string; correct: boolean; guess: string; confidence?: GuessConfidence };

/** One line of the activity log. Never holds an unsolved identity. */
export type LogEntry = { turn: number } & (
  | { kind: "ask"; playerId: string; question: string; answer: GroupAnswer; by: string | null }
  | { kind: "guess"; playerId: string; guess: string; correct: boolean; confidence?: GuessConfidence }
  | { kind: "skip"; playerId: string; byHost: boolean }
  | { kind: "solved"; playerId: string; reason?: string }
  | { kind: "duplicate"; playerId: string }
  | { kind: "removed"; playerId: string }
  | { kind: "undo" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "end" }
);

/** A question the current player asked on their device, waiting for the group's answer. Empty when asked out loud. */
export interface PendingQuestion {
  playerId: string;
  question: string;
}

const MAX_LOG = 300;

export interface SessionState {
  mode: HeadbandsMode;
  rules: Rules;
  players: Player[];
  /** Player ids in turn order. */
  order: string[];
  current: string | null;
  /** Counts every turn taken, starting at 1. */
  turn: number;
  /** The group can see the current card. Every new turn starts covered. */
  cardVisible: boolean;
  paused: boolean;
  phase: "play" | "over";
  endedEarly: boolean;
  /** Unsolved identities are shown in the recap. */
  revealed: boolean;
  history: QuestionRecord[];
  /** Feedback for the latest guess this turn. Never holds the answer. */
  lastGuess: GuessOutcome | null;
  /** The state before the latest host override, while it can still be undone. */
  undo: SessionState | null;
  /** Everything that happened, oldest first. */
  log: LogEntry[];
  pending: PendingQuestion | null;
  /** Bumped on every change, for conflict-safe last-write handling online. */
  revision?: number;
  /** Set when the last question was rejected as a repeat. Cleared on the next action. */
  duplicateRejected?: boolean;
}

/**
 * `from` is set when a player sent the action from their own device. The
 * reducer then checks it is theirs to make: only the current player poses,
 * guesses, skips or continues, and never answers their own question.
 * Without `from`, the action came from the host.
 */
export type SessionAction =
  | { type: "showCard" }
  | { type: "hideCard" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "pose"; question: string; from?: string }
  /** The group's answer. With no question, the pending one is used. */
  | { type: "ask"; question?: string; answer: GroupAnswer; from?: string }
  | { type: "guess"; text: string; confidence?: GuessConfidence; from?: string }
  | { type: "markCorrect"; playerId?: string; reason?: string }
  | { type: "undoOverride" }
  /** Leave the guess feedback. Ends the turn unless Unlimited Guesses keeps it. */
  | { type: "continue"; from?: string }
  | { type: "skip"; from?: string }
  | { type: "move"; playerId: string; by: -1 | 1 }
  | { type: "remove"; playerId: string }
  | { type: "end" }
  | { type: "reveal" }
  | { type: "restart" };

export type Deck = ReadonlyMap<string, HeadbandsIdentity>;

export function deckOf(identities: HeadbandsIdentity[]): Deck {
  return new Map(identities.map((i) => [i.id, i]));
}

/** Case-insensitive, ignores outer whitespace and repeated inner spaces. No fuzzy matching. */
export function normalizeGuess(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function isCorrectGuess(guess: string, identity: HeadbandsIdentity, mode: HeadbandsMode): boolean {
  const g = normalizeGuess(guess);
  return g !== "" && g === normalizeGuess(answerFor(identity, mode));
}

/** Fisher–Yates with an injectable random source for tests. */
export function shuffle<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deals one eligible identity per player. Unique by default; when duplicates
 * are allowed, identities marked allowDuplicate fill any shortfall.
 * Returns null when there are not enough identities.
 */
export function randomAssign(count: number, eligible: readonly HeadbandsIdentity[], allowDuplicates: boolean, random: () => number = Math.random): string[] | null {
  const dealt = shuffle(eligible, random)
    .slice(0, count)
    .map((i) => i.id);
  if (dealt.length === count) return dealt;
  if (!allowDuplicates) return null;
  const pool = eligible.filter((i) => i.allowDuplicate);
  if (pool.length === 0) return null;
  while (dealt.length < count) dealt.push(pool[Math.floor(random() * pool.length)].id);
  return shuffle(dealt, random);
}

/** How many more identities a deal needs, or 0 when there are enough. */
export function shortfall(count: number, eligible: readonly HeadbandsIdentity[], allowDuplicates: boolean): number {
  if (allowDuplicates && eligible.some((i) => i.allowDuplicate)) return 0;
  return Math.max(0, count - eligible.length);
}

export interface SetupCheck {
  players: PlayerSetup[];
  mode: HeadbandsMode;
  deck: Deck;
  allowDuplicates: boolean;
  maxPlayers: number;
  /** Players write the identities after setup, so the deck is not checked. */
  custom?: boolean;
}

/**
 * Players write for each other around a circle: the player at position i
 * writes the identity for the player at position i + 1, and the last writes
 * for the first. `circle` holds player indexes in writing order.
 * Returns, for each writing step, who writes and who it is for.
 */
export function writingPairs(circle: readonly number[]): Array<{ writer: number; target: number }> {
  if (circle.length < 2) return [];
  return circle.map((writer, i) => ({ writer, target: circle[(i + 1) % circle.length] }));
}

/** Problems with one written identity, or [] when it can be played in the mode. */
export function customIdentityProblems(entry: { text: string; image: string | null; subtext: string | null }, mode: HeadbandsMode): string[] {
  const out: string[] = [];
  const label = mode === "image" ? (entry.subtext ?? "") : entry.text;
  if (mode === "image" && !entry.image) out.push("Add a picture.");
  if (label.trim() === "") out.push(mode === "image" ? "Write the answer that goes under the picture." : "Write something for them to guess.");
  if (label.trim().length > HEADBANDS_LIMITS.maxLabelLength) out.push(`Keep it under ${HEADBANDS_LIMITS.maxLabelLength} characters.`);
  if (/<\s*script\b/i.test(label)) out.push("Plain text only, no code.");
  return out;
}

/** Everything that stops a session from starting, in words the host can act on. */
export function setupProblems({ players, mode, deck, allowDuplicates, maxPlayers, custom }: SetupCheck): string[] {
  const problems: string[] = [];
  const max = Math.min(maxPlayers, HEADBANDS_LIMITS.maxPlayers);
  if (players.length < HEADBANDS_LIMITS.minPlayers) problems.push(`Add at least ${HEADBANDS_LIMITS.minPlayers} players to start.`);
  if (players.length > max) problems.push(`This game allows up to ${max} players.`);
  const blanks = players.filter((p) => p.name.trim() === "").length;
  if (blanks > 0) problems.push(blanks === 1 ? "One player has no name." : `${blanks} players have no name.`);
  if (custom) return problems;

  const eligible = [...deck.values()].filter((i) => isEligible(i, mode));
  const short = shortfall(players.length, eligible, allowDuplicates);
  if (short > 0) {
    problems.push(
      `${mode === "image" ? "Image Mode" : "Text Mode"} has ${eligible.length} usable ${eligible.length === 1 ? "identity" : "identities"} for ${players.length} players. Add ${short} more, or remove ${short === 1 ? "a player" : `${short} players`}.`,
    );
  }

  const unassigned = players.filter((p) => !p.identityId).length;
  if (unassigned > 0) problems.push(unassigned === 1 ? "One player has no identity yet." : `${unassigned} players have no identity yet.`);
  const notUsable = players.filter((p) => p.identityId && !(deck.get(p.identityId) && isEligible(deck.get(p.identityId)!, mode))).length;
  if (notUsable > 0) problems.push(`${notUsable === 1 ? "One assigned identity does" : `${notUsable} assigned identities do`} not work in ${mode === "image" ? "Image" : "Text"} Mode. Reassign ${notUsable === 1 ? "it" : "them"}.`);

  const seen = new Map<string, number>();
  for (const p of players) if (p.identityId) seen.set(p.identityId, (seen.get(p.identityId) ?? 0) + 1);
  const repeated = [...seen.entries()].filter(([id, n]) => n > 1 && !(allowDuplicates && deck.get(id)?.allowDuplicate));
  if (repeated.length > 0) problems.push("Two or more players have the same identity. Give each player a different one.");
  return problems;
}

export function createSession(players: PlayerSetup[], mode: HeadbandsMode, rules: Rules): SessionState {
  const list: Player[] = players.map((p, i) => ({
    id: p.id ?? `p${i + 1}`,
    name: p.name.trim(),
    identityId: p.identityId,
    solved: false,
    solvedOrder: null,
    byHost: false,
    removed: false,
    questions: 0,
    guesses: 0,
    status: "assigned",
    passes: 0,
    startedTurn: null,
    startedAt: null,
    overrideReason: null,
    confidence: null,
  }));
  return {
    mode,
    rules,
    players: list,
    order: list.map((p) => p.id),
    current: list[0]?.id ?? null,
    turn: 1,
    cardVisible: false,
    paused: false,
    phase: "play",
    endedEarly: false,
    revealed: false,
    history: [],
    lastGuess: null,
    undo: null,
    log: [],
    pending: null,
    revision: 0,
  };
}

const isActive = (p: Player) => !p.solved && !p.removed;

export function getPlayer(state: SessionState, id: string | null): Player | undefined {
  return id ? state.players.find((p) => p.id === id) : undefined;
}

/** Players still in the turn order. */
export function activePlayers(state: SessionState): Player[] {
  return state.order.map((id) => getPlayer(state, id)!).filter((p) => !p.removed);
}

/** The next unsolved player after `from`, wrapping around. May return `from` itself. */
export function nextUnsolved(state: SessionState, from: string | null): string | null {
  const ids = state.order.filter((id) => isActive(getPlayer(state, id)!));
  if (ids.length === 0) return null;
  const start = from ? state.order.indexOf(from) : -1;
  for (let step = 1; step <= state.order.length; step++) {
    const id = state.order[(start + step + state.order.length) % state.order.length];
    if (isActive(getPlayer(state, id)!)) return id;
  }
  return ids[0];
}

function patchPlayer(state: SessionState, id: string, change: Partial<Player>): SessionState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) };
}

/** Ends the turn. If nobody is left to guess, the game is over. */
function advance(state: SessionState): SessionState {
  const next = nextUnsolved(state, state.current);
  if (next === null) return finish(state);
  return { ...state, current: next, turn: state.turn + 1, cardVisible: false, lastGuess: null, pending: null };
}

function logged(state: SessionState, entry: LogEntry): SessionState {
  const log = [...state.log, entry];
  return { ...state, log: log.length > MAX_LOG ? log.slice(-MAX_LOG) : log };
}

function finish(state: SessionState): SessionState {
  const everyoneSolved = state.players.every((p) => p.solved || p.removed);
  return { ...state, phase: "over", current: null, cardVisible: false, paused: false, lastGuess: null, pending: null, revealed: everyoneSolved || state.revealed };
}

function solve(state: SessionState, id: string, byHost: boolean): SessionState {
  const order = state.players.filter((p) => p.solved).length + 1;
  return patchPlayer(state, id, { solved: true, solvedOrder: order, byHost });
}

/** Pure reducer with lifecycle bookkeeping and a revision counter. */
export function sessionReducer(deck: Deck, state: SessionState, action: SessionAction): SessionState {
  const next = reduce(deck, state, action);
  if (next === state) return state;
  return { ...withLifecycle(next), revision: (state.revision ?? 0) + 1 };
}

/** Derives each identity's lifecycle status from session facts. */
function withLifecycle(state: SessionState): SessionState {
  let changed = false;
  const players = state.players.map((p) => {
    let status: IdentityStatus;
    if (state.phase === "over") status = "reviewed";
    else if (p.solved) status = "guessed";
    else if (p.removed) status = "passed";
    else if (p.id === state.current) status = p.questions > 0 || p.guesses > 0 ? "asking" : "ready";
    else if ((p.passes ?? 0) > 0 && p.questions === 0 && p.guesses === 0) status = "passed";
    else status = p.questions > 0 || p.guesses > 0 ? "asking" : "assigned";
    const startedTurn = p.startedTurn ?? (p.id === state.current ? state.turn : null);
    if (status === p.status && startedTurn === (p.startedTurn ?? null)) return p;
    changed = true;
    return { ...p, status, startedTurn, startedAt: p.startedAt ?? (startedTurn !== null ? Date.now() : null) };
  });
  return changed ? { ...state, players } : state;
}

function reduce(deck: Deck, state: SessionState, action: SessionAction): SessionState {
  // Only an override can be undone, and only until something else happens.
  const base = state.duplicateRejected ? { ...state, duplicateRejected: false } : state;
  const s = action.type === "undoOverride" || action.type === "continue" ? base : { ...base, undo: null };
  const current = getPlayer(s, s.current);
  // A player's device may only act for the current player, and may not answer its own question.
  const from = "from" in action ? action.from : undefined;
  if (from !== undefined) {
    if (!getPlayer(s, from) || getPlayer(s, from)!.removed) return state;
    if (action.type === "ask" ? from === s.current : from !== s.current) return state;
    // Phones answer only a typed question that is waiting, so a second tap cannot answer the next turn.
    if (action.type === "ask" && s.pending?.playerId !== s.current) return state;
  }

  switch (action.type) {
    case "showCard":
      return s.phase === "play" && !s.paused ? { ...s, cardVisible: true } : s;
    case "hideCard":
      return { ...s, cardVisible: false };
    case "pause":
      return s.phase === "play" && !s.paused ? logged({ ...s, paused: true, cardVisible: false }, { kind: "pause", turn: s.turn }) : s;
    case "resume":
      return s.paused ? logged({ ...s, paused: false }, { kind: "resume", turn: s.turn }) : s;

    case "pose": {
      if (s.phase !== "play" || s.paused || !current || s.lastGuess) return s;
      // An empty question is fine: the player asked it out loud.
      return { ...s, pending: { playerId: current.id, question: action.question.trim().slice(0, 200) } };
    }

    case "ask": {
      if (s.phase !== "play" || s.paused || !current || s.lastGuess) return s;
      const question = (action.question ?? "").trim() || (s.pending?.playerId === current.id ? s.pending.question : "");
      if (s.rules.duplicateQuestionCheck && question && isRepeatQuestion(s, current.id, question)) {
        return logged({ ...s, pending: null, duplicateRejected: true }, { kind: "duplicate", playerId: current.id, turn: s.turn });
      }
      const record: QuestionRecord = { playerId: current.id, question, answer: action.answer, turn: s.turn };
      let next: SessionState = { ...patchPlayer(s, current.id, { questions: current.questions + 1 }), history: [...s.history, record], lastGuess: null, pending: null };
      next = logged(next, { kind: "ask", playerId: current.id, question, answer: action.answer, by: from ?? null, turn: s.turn });
      // "Unsure" lets the player rephrase. "Yes" keeps the turn only when the house rule says so.
      if (action.answer === "unsure") return next;
      if ((action.answer === "yes" || action.answer === "almost") && s.rules.continueAfterYes) return next;
      return advance(next);
    }

    case "guess": {
      if (s.phase !== "play" || s.paused || !current || s.lastGuess) return s;
      if (action.text.trim() === "") return s;
      const identity = deck.get(current.identityId);
      const correct = !!identity && isCorrectGuess(action.text, identity, s.mode);
      const guess = action.text.trim().slice(0, 200);
      let next = patchPlayer(s, current.id, { guesses: current.guesses + 1 });
      const confidence = action.confidence;
      next = patchPlayer(next, current.id, { confidence: confidence ?? null });
      next = { ...next, pending: null, lastGuess: { playerId: current.id, correct, guess, ...(confidence ? { confidence } : {}) } };
      next = logged(next, { kind: "guess", playerId: current.id, guess, correct, turn: s.turn, ...(confidence ? { confidence } : {}) });
      if (correct) return solve(next, current.id, false);
      const max = s.rules.maxGuessesPerIdentity ?? 0;
      // Out of attempts: the identity is passed and stays in the recap, never deleted.
      if (max > 0 && current.guesses + 1 >= max) return patchPlayer(next, current.id, { removed: true, passes: (current.passes ?? 0) + 1 });
      return next;
    }

    case "continue": {
      if (s.phase !== "play" || !s.lastGuess) return s;
      const turnOver = s.lastGuess.correct || !s.rules.unlimitedGuesses;
      return turnOver ? advance(s) : { ...s, lastGuess: null };
    }

    case "markCorrect": {
      const id = action.playerId ?? s.current;
      const target = getPlayer(s, id);
      if (s.phase !== "play" || !target || target.solved || target.removed) return s;
      const reason = action.reason?.trim().slice(0, 120) || undefined;
      const solved = logged(patchPlayer(solve(s, target.id, true), target.id, { overrideReason: reason ?? null }), { kind: "solved", playerId: target.id, turn: s.turn, ...(reason ? { reason } : {}) });
      return { ...solved, lastGuess: target.id === s.current ? { playerId: target.id, correct: true, guess: s.lastGuess?.guess ?? "" } : solved.lastGuess, undo: state };
    }

    case "undoOverride":
      return state.undo ? logged(state.undo, { kind: "undo", turn: state.undo.turn }) : state;

    case "skip":
      return s.phase === "play" && current && !s.paused ? advance(logged(patchPlayer(s, current.id, { passes: (current.passes ?? 0) + 1 }), { kind: "skip", playerId: current.id, byHost: from === undefined, turn: s.turn })) : s;

    case "move": {
      const i = s.order.indexOf(action.playerId);
      const j = i + action.by;
      if (i === -1 || j < 0 || j >= s.order.length) return s;
      const order = [...s.order];
      [order[i], order[j]] = [order[j], order[i]];
      return { ...s, order };
    }

    case "remove": {
      const target = getPlayer(s, action.playerId);
      if (!target || target.removed || s.phase !== "play") return s;
      const next = logged(patchPlayer(s, target.id, { removed: true }), { kind: "removed", playerId: target.id, turn: s.turn });
      if (target.id !== s.current) return next;
      return advance(next);
    }

    case "end":
      return s.phase === "play" ? { ...finish(logged(s, { kind: "end", turn: s.turn })), endedEarly: true } : s;
    case "reveal":
      return s.phase === "over" ? { ...s, revealed: true } : s;
    case "restart":
      return createSession(
        s.players.filter((p) => !p.removed).map((p) => ({ name: p.name, identityId: p.identityId, id: p.id })),
        s.mode,
        s.rules,
      );
  }
}

export function solvedCount(state: SessionState): number {
  return state.players.filter((p) => p.solved).length;
}

/** "Player 2 of 5": position among players still in the order. */
export function turnPosition(state: SessionState): { index: number; total: number } {
  const list = activePlayers(state);
  return { index: Math.max(0, list.findIndex((p) => p.id === state.current)) + 1, total: list.length };
}

/** One log line in plain words, such as "Maya guessed “Owl”, not it". */
export function describeLog(entry: LogEntry, nameOf: (id: string) => string): string {
  const answer = answerLabel;
  switch (entry.kind) {
    case "ask": {
      const q = entry.question ? `“${entry.question}”` : "a question out loud";
      return `${nameOf(entry.playerId)} asked ${q}: ${answer(entry.answer)}${entry.by ? ` (${nameOf(entry.by)})` : ""}`;
    }
    case "guess":
      return `${nameOf(entry.playerId)} guessed “${entry.guess}”${entry.correct ? ", correct" : ", not it"}${entry.confidence ? ` (${CONFIDENCE_LABELS[entry.confidence]})` : ""}`;
    case "skip":
      return entry.byHost ? `The host skipped ${nameOf(entry.playerId)}’s turn` : `${nameOf(entry.playerId)} skipped their turn`;
    case "solved":
      return `Host override: ${nameOf(entry.playerId)} marked solved${entry.reason ? ` (${entry.reason})` : ""}`;
    case "duplicate":
      return `${nameOf(entry.playerId)} repeated a question; ask something new`;
    case "removed":
      return `${nameOf(entry.playerId)} left the game`;
    case "undo":
      return "The host undid the last change";
    case "pause":
      return "The host paused the game";
    case "resume":
      return "The game resumed";
    case "end":
      return "The host ended the game";
  }
}

export const CONFIDENCE_LABELS: Record<GuessConfidence, string> = { correct: "Correct", likely: "Likely", uncertain: "Uncertain" };

export function answerLabel(a: GroupAnswer): string {
  return a === "yes" ? "Yes" : a === "no" ? "No" : a === "almost" ? "Almost" : "Unsure";
}

export const STATUS_LABELS: Record<IdentityStatus, string> = {
  assigned: "Assigned",
  ready: "Ready",
  asking: "Asking",
  guessed: "Guessed",
  passed: "Passed",
  reviewed: "Reviewed",
};

/** Same player already asked this question (normalized). */
export function isRepeatQuestion(state: SessionState, playerId: string, question: string): boolean {
  const q = normalizeGuess(question).replace(/[?!.]+$/, "");
  if (!q) return false;
  return state.history.some((h) => h.playerId === playerId && normalizeGuess(h.question).replace(/[?!.]+$/, "") === q);
}

/** Questions asked in the active turn, oldest first. */
export function turnHistory(state: SessionState): QuestionRecord[] {
  return state.history.filter((h) => h.turn === state.turn && h.playerId === state.current);
}

/** Activity log filters. */
export type LogFilter = "all" | "questions" | "guesses" | "skips" | "overrides" | "system";
export const LOG_FILTERS: Array<[LogFilter, string]> = [
  ["all", "All"],
  ["questions", "Questions"],
  ["guesses", "Guesses"],
  ["skips", "Skips"],
  ["overrides", "Overrides"],
  ["system", "System"],
];

export function logCategory(entry: LogEntry): Exclude<LogFilter, "all"> {
  switch (entry.kind) {
    case "ask":
    case "duplicate":
      return "questions";
    case "guess":
      return "guesses";
    case "skip":
      return "skips";
    case "solved":
    case "undo":
    case "removed":
      return "overrides";
    default:
      return "system";
  }
}

export function filterLog(log: readonly LogEntry[], filter: LogFilter): LogEntry[] {
  return filter === "all" ? [...log] : log.filter((e) => logCategory(e) === filter);
}

/** Scores split so a correct guess and a host override never mix. */
export function scoreBreakdown(state: SessionState): { guessed: number; overridden: number; passed: number } {
  return {
    guessed: state.players.filter((p) => p.solved && !p.byHost).length,
    overridden: state.players.filter((p) => p.solved && p.byHost).length,
    passed: state.players.filter((p) => p.removed && !p.solved).length,
  };
}

/** Conflict-safe last-write: accept an incoming state only when its revision is newer. */
export function isNewerRevision(incoming: Pick<SessionState, "revision">, current: Pick<SessionState, "revision"> | null): boolean {
  if (!current) return true;
  return (incoming.revision ?? 0) > (current.revision ?? 0);
}

/** Typed reconnection state for a phone. */
export type ReconnectState =
  | { kind: "fresh" }
  | { kind: "rejoin"; lobbyCode: string; playerId: string; savedAt: number }
  | { kind: "stale"; lobbyCode: string; reason: "expired" | "removed" | "ended" };

/** Saved sessions older than this are treated as stale. */
export const STALE_SESSION_MS = 6 * 60 * 60 * 1000;

export function reconnectPolicy(saved: { lobbyCode: string; playerId: string; savedAt: number } | null, now: number, game: Pick<SessionState, "players" | "phase"> | null): ReconnectState {
  if (!saved) return { kind: "fresh" };
  if (now - saved.savedAt > STALE_SESSION_MS) return { kind: "stale", lobbyCode: saved.lobbyCode, reason: "expired" };
  if (game) {
    const me = game.players.find((p) => p.id === saved.playerId);
    if (!me || me.removed) return { kind: "stale", lobbyCode: saved.lobbyCode, reason: "removed" };
  }
  return { kind: "rejoin", ...saved };
}

/** Deck health for setup. */
export interface DeckHealth {
  text: number;
  image: number;
  duplicates: number;
  /** Short (<=12 chars) / medium / long labels as a rough difficulty mix. */
  mix: { easy: number; medium: number; hard: number };
  /** Rough minutes for a round with this many players. */
  estimatedMinutes: number;
}

export function deckHealth(identities: readonly HeadbandsIdentity[], players: number): DeckHealth {
  const seen = new Map<string, number>();
  let text = 0;
  let image = 0;
  const mix = { easy: 0, medium: 0, hard: 0 };
  for (const i of identities) {
    if (i.text.trim()) text++;
    if (i.image && i.subtext) image++;
    const key = normalizeGuess(i.text || i.subtext || "");
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    const words = key.split(" ").length;
    if (words <= 1 && key.length <= 12) mix.easy++;
    else if (words <= 3) mix.medium++;
    else mix.hard++;
  }
  const duplicates = [...seen.values()].reduce((n, c) => n + (c > 1 ? c - 1 : 0), 0);
  return { text, image, duplicates, mix, estimatedMinutes: Math.max(5, Math.round(players * 2.5)) };
}
