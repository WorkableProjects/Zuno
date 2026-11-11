import { HEADBANDS_LIMITS, answerFor, isEligible, type HeadbandsIdentity, type HeadbandsMode } from "../../game-files/schema/headbands";

/** Pure Headbands rules. React screens only render this state and dispatch actions. */

export type GroupAnswer = "yes" | "no" | "unsure";

export interface Rules {
  continueAfterYes: boolean;
  unlimitedGuesses: boolean;
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
}

export interface QuestionRecord {
  playerId: string;
  question: string;
  answer: GroupAnswer;
  turn: number;
}

export type GuessOutcome = { playerId: string; correct: boolean; guess: string };

/** One line of the activity log. Never holds an unsolved identity. */
export type LogEntry = { turn: number } & (
  | { kind: "ask"; playerId: string; question: string; answer: GroupAnswer; by: string | null }
  | { kind: "guess"; playerId: string; guess: string; correct: boolean }
  | { kind: "skip"; playerId: string; byHost: boolean }
  | { kind: "solved"; playerId: string }
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
  | { type: "guess"; text: string; from?: string }
  | { type: "markCorrect"; playerId?: string }
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

export function sessionReducer(deck: Deck, state: SessionState, action: SessionAction): SessionState {
  // Only an override can be undone, and only until something else happens.
  const s = action.type === "undoOverride" || action.type === "continue" ? state : { ...state, undo: null };
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
      const record: QuestionRecord = { playerId: current.id, question, answer: action.answer, turn: s.turn };
      let next: SessionState = { ...patchPlayer(s, current.id, { questions: current.questions + 1 }), history: [...s.history, record], lastGuess: null, pending: null };
      next = logged(next, { kind: "ask", playerId: current.id, question, answer: action.answer, by: from ?? null, turn: s.turn });
      // "Unsure" lets the player rephrase. "Yes" keeps the turn only when the house rule says so.
      if (action.answer === "unsure") return next;
      if (action.answer === "yes" && s.rules.continueAfterYes) return next;
      return advance(next);
    }

    case "guess": {
      if (s.phase !== "play" || s.paused || !current || s.lastGuess) return s;
      if (action.text.trim() === "") return s;
      const identity = deck.get(current.identityId);
      const correct = !!identity && isCorrectGuess(action.text, identity, s.mode);
      const guess = action.text.trim().slice(0, 200);
      let next = patchPlayer(s, current.id, { guesses: current.guesses + 1 });
      next = { ...next, pending: null, lastGuess: { playerId: current.id, correct, guess } };
      next = logged(next, { kind: "guess", playerId: current.id, guess, correct, turn: s.turn });
      return correct ? solve(next, current.id, false) : next;
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
      const solved = logged(solve(s, target.id, true), { kind: "solved", playerId: target.id, turn: s.turn });
      return { ...solved, lastGuess: target.id === s.current ? { playerId: target.id, correct: true, guess: s.lastGuess?.guess ?? "" } : solved.lastGuess, undo: state };
    }

    case "undoOverride":
      return state.undo ? logged(state.undo, { kind: "undo", turn: state.undo.turn }) : state;

    case "skip":
      return s.phase === "play" && current && !s.paused ? advance(logged(s, { kind: "skip", playerId: current.id, byHost: from === undefined, turn: s.turn })) : s;

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
  const answer = (a: GroupAnswer) => (a === "yes" ? "Yes" : a === "no" ? "No" : "Not sure");
  switch (entry.kind) {
    case "ask": {
      const q = entry.question ? `“${entry.question}”` : "a question out loud";
      return `${nameOf(entry.playerId)} asked ${q}: ${answer(entry.answer)}${entry.by ? ` (${nameOf(entry.by)})` : ""}`;
    }
    case "guess":
      return `${nameOf(entry.playerId)} guessed “${entry.guess}”${entry.correct ? ", correct" : ", not it"}`;
    case "skip":
      return entry.byHost ? `The host skipped ${nameOf(entry.playerId)}’s turn` : `${nameOf(entry.playerId)} skipped their turn`;
    case "solved":
      return `The host marked ${nameOf(entry.playerId)} solved`;
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
