import type { JeopardyFile, JeopardyQuestion } from "../../game-files/schema/jeopardy";

/** Pure session state for one hosted Jeopardy game. No React, no DOM. */

export interface TeamSetup {
  name: string;
  /** Player names shown under the team name. May be empty. */
  members: string[];
  /** Optional team color (hex). */
  color?: string;
  /** Optional two-letter initials shown on buzzers and tiles. */
  initials?: string;
}

export interface Team extends TeamSetup {
  score: number;
}

/** A Daily Double in progress. team is the index of the team that found it. */
export interface DailyDoubleState {
  team: number;
  wager: number;
  /** True once the wager is locked and the clue is shown. */
  locked: boolean;
}

/** 1 = answered right, -1 = answered wrong, 0 = no change. */
export type Mark = 1 | -1 | 0;

export type Phase = "board" | "clue" | "final" | "results";
export type FinalStep = "category" | "clue" | "answer";

/** Strict per-clue phase: Available -> Revealing -> Buzzing -> Answering -> Judging -> Resolved. */
export type CluePhase = "revealing" | "buzzing" | "answering" | "judging" | "resolved";
export const CLUE_PHASES: CluePhase[] = ["revealing", "buzzing", "answering", "judging", "resolved"];

export type ClueOutcome = "correct" | "incorrect" | "noResponse" | "skipped";
/** Board tile status, as shown in the legend. */
export type ClueStatus = "available" | "open" | "correct" | "incorrect" | "skipped";

export interface ClueRecord {
  categoryId: string;
  questionId: string;
  outcome: ClueOutcome;
  /** Teams that answered, in order, with their final mark. */
  attempts: Array<{ team: number; mark: Mark }>;
  /** Team that answered right, if any. */
  winner: number | null;
  /** True if the host changed a score by hand while this clue was open. */
  override: boolean;
  value: number;
}

export interface ScoreEvent {
  revision: number;
  team: number;
  before: number;
  after: number;
  reason: string;
  questionId?: string;
}

export interface SessionOptions {
  /** More than one team may attempt a clue after a wrong answer. Default true. */
  multipleAttempts?: boolean;
  /** Buzzing before the host opens buzzing locks that team out of the clue. Default true. */
  lockoutPremature?: boolean;
  sessionId?: string;
}

/** The parts of a session saved for undo. */
export type Snapshot = Omit<SessionState, "undo">;

export interface SessionState {
  sessionId: string;
  /** Bumped on every accepted change. */
  revision: number;
  options: Required<Omit<SessionOptions, "sessionId">>;
  paused: boolean;
  cluePhase: CluePhase | null;
  /** Teams that buzzed on the open clue, in order. First is answering. */
  buzzQueue: number[];
  /** Teams locked out of the open clue (wrong or premature). */
  lockedOut: number[];
  /** Host changed a score by hand while the current clue was open. */
  override: boolean;
  history: ScoreEvent[];
  clueLog: ClueRecord[];
  /** Snapshots for undo, newest last. */
  undo: Snapshot[];
  phase: Phase;
  teams: Team[];
  allowNegativeScores: boolean;
  used: string[];
  /** Clue on screen, if any. */
  current: { categoryId: string; questionId: string } | null;
  answerShown: boolean;
  explanationShown: boolean;
  /** Marks given for the clue on screen, one per team. */
  marks: Mark[];
  /** Each team's score when the clue on screen (or the final round) opened. */
  base: number[];
  /** Set while the clue on screen is a Daily Double. */
  dailyDouble: DailyDoubleState | null;
  /** participants: indices of the teams playing the final question. */
  final: { step: FinalStep; wagers: number[]; marks: Mark[]; played: boolean; participants: number[]; tiebreaker: boolean };
}

export type SessionAction =
  | { type: "open"; categoryId: string; questionId: string }
  | { type: "revealAnswer" }
  | { type: "showExplanation" }
  | { type: "mark"; team: number; mark: Mark }
  | { type: "backToBoard" }
  | { type: "startFinal" }
  | { type: "finalNext" }
  | { type: "finalWager"; team: number; wager: number }
  | { type: "finalMark"; team: number; mark: Mark }
  | { type: "finish" }
  | { type: "ddTeam"; team: number }
  | { type: "ddWager"; wager: number }
  | { type: "ddLock" }
  /** Host override for special rules. Not clamped. Keeps mark toggles consistent. */
  | { type: "setScore"; team: number; score: number }
  | { type: "adjustScore"; team: number; delta: number }
  | { type: "reset" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "openBuzzers" }
  | { type: "buzz"; team: number }
  | { type: "clearBuzz" }
  /** Resolve the open clue without anyone answering. */
  | { type: "skip" }
  | { type: "undo" };

const emptyFinal = (teams: Team[]): SessionState["final"] => ({
  step: "category",
  wagers: teams.map(() => 0),
  marks: teams.map(() => 0),
  played: false,
  participants: teams.map((_, i) => i),
  tiebreaker: false,
});

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSession(setup: TeamSetup[], allowNegativeScores: boolean, options: SessionOptions = {}): SessionState {
  const teams: Team[] = setup.map((t, i) => {
    const team: Team = {
      name: t.name.trim() || `Team ${i + 1}`,
      members: t.members.map((m) => m.trim()).filter(Boolean),
      score: 0,
    };
    if (t.color) team.color = t.color;
    if (t.initials) team.initials = t.initials;
    return team;
  });
  return {
    sessionId: options.sessionId ?? newId(),
    revision: 0,
    options: { multipleAttempts: options.multipleAttempts ?? true, lockoutPremature: options.lockoutPremature ?? true },
    paused: false,
    cluePhase: null,
    buzzQueue: [],
    lockedOut: [],
    override: false,
    history: [],
    clueLog: [],
    undo: [],
    phase: "board",
    teams,
    allowNegativeScores,
    used: [],
    current: null,
    answerShown: false,
    explanationShown: false,
    marks: teams.map(() => 0),
    base: teams.map(() => 0),
    dailyDouble: null,
    final: emptyFinal(teams),
  };
}

/** Indices of the teams sharing the top score, when more than one team does. */
export function tiedLeaders(teams: Team[]): number[] {
  if (teams.length < 2) return [];
  const top = Math.max(...teams.map((t) => t.score));
  const tied = teams.flatMap((t, i) => (t.score === top ? [i] : []));
  return tied.length > 1 ? tied : [];
}

/** Whether the One Final Question can be started now (ignores phase). */
export function finalAvailable(file: JeopardyFile, state: SessionState): boolean {
  const f = file.content.finalJeopardy;
  if (!f.enabled || state.final.played) return false;
  return f.mode === "always" || tiedLeaders(state.teams).length > 0;
}

/** Seconds for the clue: question override, else the file default. 0 = no timer. */
export function clueTimeLimit(file: JeopardyFile, q: JeopardyQuestion): number {
  return q.timeLimit ?? file.settings.timeLimitSeconds;
}

export function findQuestion(file: JeopardyFile, categoryId: string, questionId: string): JeopardyQuestion | undefined {
  return file.content.categories.find((c) => c.id === categoryId)?.questions.find((q) => q.id === questionId);
}

export function totalClues(file: JeopardyFile): number {
  return file.content.categories.reduce((n, c) => n + c.questions.length, 0);
}

function clamp(score: number, allowNegative: boolean): number {
  return allowNegative ? score : Math.max(0, score);
}

/**
 * Marks are toggles. A team's score is always its score from when the clue
 * opened plus or minus the amount, so undoing a mark gives the points back
 * exactly, even when a deduction was held at zero.
 */
function scoreWithMark(state: SessionState, team: number, mark: Mark, amount: number): Team[] {
  return state.teams.map((t, i) => (i === team ? { ...t, score: clamp(state.base[i] + mark * amount, state.allowNegativeScores) } : t));
}

/** Points the clue on screen is worth: the wager on a Daily Double. */
export function clueAmount(state: SessionState, q: JeopardyQuestion): number {
  return state.dailyDouble ? state.dailyDouble.wager : q.value;
}

function coreReducer(file: JeopardyFile, state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "open": {
      if (state.phase !== "board") return state;
      if (state.used.includes(action.questionId)) return state;
      const opened = findQuestion(file, action.categoryId, action.questionId);
      if (!opened) return state;
      return {
        ...state,
        phase: "clue",
        current: { categoryId: action.categoryId, questionId: action.questionId },
        answerShown: false,
        explanationShown: false,
        marks: state.teams.map(() => 0),
        base: state.teams.map((t) => t.score),
        dailyDouble: opened.dailyDouble ? { team: 0, wager: 0, locked: false } : null,
      };
    }
    case "ddTeam": {
      if (state.phase !== "clue" || !state.dailyDouble || state.dailyDouble.locked) return state;
      if (action.team < 0 || action.team >= state.teams.length) return state;
      const max = maxWager(file, state.teams[action.team].score);
      return { ...state, dailyDouble: { ...state.dailyDouble, team: action.team, wager: Math.min(state.dailyDouble.wager, max) } };
    }
    case "ddWager": {
      if (state.phase !== "clue" || !state.dailyDouble || state.dailyDouble.locked) return state;
      const max = maxWager(file, state.teams[state.dailyDouble.team].score);
      const wager = Math.max(0, Math.min(max, Math.floor(action.wager) || 0));
      return { ...state, dailyDouble: { ...state.dailyDouble, wager } };
    }
    case "ddLock":
      if (state.phase !== "clue" || !state.dailyDouble) return state;
      return { ...state, dailyDouble: { ...state.dailyDouble, locked: true } };
    case "setScore":
    case "adjustScore": {
      const t = state.teams[action.team];
      if (!t) return state;
      const next = action.type === "setScore" ? Math.round(action.score) : t.score + Math.round(action.delta);
      if (!Number.isFinite(next)) return state;
      const delta = next - t.score;
      return {
        ...state,
        teams: state.teams.map((x, i) => (i === action.team ? { ...x, score: next } : x)),
        base: state.base.map((b, i) => (i === action.team ? b + delta : b)),
      };
    }
    case "revealAnswer":
      if (state.phase !== "clue") return state;
      if (state.dailyDouble && !state.dailyDouble.locked) return state;
      return { ...state, answerShown: true, explanationShown: file.settings.showExplanations };
    case "showExplanation":
      if (state.phase !== "clue" || !state.answerShown) return state;
      return { ...state, explanationShown: true };
    case "mark": {
      if (state.phase !== "clue" || !state.current) return state;
      const q = findQuestion(file, state.current.categoryId, state.current.questionId);
      if (!q) return state;
      if (state.dailyDouble && (!state.dailyDouble.locked || action.team !== state.dailyDouble.team)) return state;
      const previous = state.marks[action.team];
      const next: Mark = previous === action.mark ? 0 : action.mark;
      return {
        ...state,
        teams: scoreWithMark(state, action.team, next, clueAmount(state, q)),
        marks: state.marks.map((m, i) => (i === action.team ? next : m)),
      };
    }
    case "backToBoard": {
      if (state.phase !== "clue" || !state.current) return state;
      return {
        ...state,
        phase: "board",
        used: [...state.used, state.current.questionId],
        current: null,
        answerShown: false,
        explanationShown: false,
        dailyDouble: null,
      };
    }
    case "startFinal": {
      // From the board, or from results to break a tie.
      if ((state.phase !== "board" && state.phase !== "results") || !finalAvailable(file, state)) return state;
      const tiebreaker = file.content.finalJeopardy.mode === "tiebreaker";
      return {
        ...state,
        phase: "final",
        base: state.teams.map((t) => t.score),
        final: { ...emptyFinal(state.teams), tiebreaker, participants: tiebreaker ? tiedLeaders(state.teams) : state.teams.map((_, i) => i) },
      };
    }
    case "finalWager": {
      if (state.phase !== "final" || state.final.step === "answer" || state.final.tiebreaker) return state;
      if (!state.final.participants.includes(action.team)) return state;
      const max = maxWager(file, state.teams[action.team].score);
      const wager = Math.max(0, Math.min(max, Math.floor(action.wager) || 0));
      return { ...state, final: { ...state.final, wagers: state.final.wagers.map((w, i) => (i === action.team ? wager : w)) } };
    }
    case "finalNext": {
      if (state.phase !== "final") return state;
      const step: FinalStep = state.final.step === "category" ? "clue" : "answer";
      return { ...state, final: { ...state.final, step } };
    }
    case "finalMark": {
      if (state.phase !== "final" || state.final.step !== "answer") return state;
      if (!state.final.participants.includes(action.team)) return state;
      const previous = state.final.marks[action.team];
      const next: Mark = previous === action.mark ? 0 : action.mark;
      // Tiebreaker: right = +1 point, wrong = no change.
      const amount = state.final.tiebreaker ? (next === 1 ? 1 : 0) : state.final.wagers[action.team];
      return {
        ...state,
        teams: scoreWithMark(state, action.team, next, amount),
        final: { ...state.final, marks: state.final.marks.map((m, i) => (i === action.team ? next : m)) },
      };
    }
    case "finish": {
      const used = state.phase === "clue" && state.current ? [...state.used, state.current.questionId] : state.used;
      return { ...state, phase: "results", used, current: null, dailyDouble: null, final: { ...state.final, played: state.final.played || state.phase === "final" } };
    }
    case "reset":
      return createSession(
        state.teams.map((t) => {
          const s: TeamSetup = { name: t.name, members: t.members };
          if (t.color) s.color = t.color;
          if (t.initials) s.initials = t.initials;
          return s;
        }),
        state.allowNegativeScores,
        { ...state.options },
      );
    default:
      return state;
  }
}

const UNDO_LIMIT = 30;
const SCORING: ReadonlySet<SessionAction["type"]> = new Set(["mark", "finalMark", "setScore", "adjustScore", "skip", "backToBoard", "finish", "startFinal"]);

function snapshot(state: SessionState): Snapshot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { undo, ...rest } = state;
  return rest;
}

function reasonFor(file: JeopardyFile, state: SessionState, action: SessionAction): string {
  const q = state.current ? findQuestion(file, state.current.categoryId, state.current.questionId) : undefined;
  const cat = state.current ? file.content.categories.find((c) => c.id === state.current!.categoryId)?.title : undefined;
  const where = q && cat ? `${cat} ${q.value}${state.dailyDouble ? " (Daily Double)" : ""}` : "";
  switch (action.type) {
    case "mark":
      return action.mark === 0 ? `Mark cleared: ${where}` : `${action.mark === 1 ? "Correct" : "Incorrect"}: ${where}`;
    case "finalMark":
      return action.mark === 0 ? "Final mark cleared" : `Final question ${action.mark === 1 ? "correct" : "incorrect"}`;
    case "setScore":
      return "Host set score";
    case "adjustScore":
      return `Host adjustment ${action.delta >= 0 ? "+" : ""}${action.delta}`;
    default:
      return "Score change";
  }
}

/** Outcome of a clue from its marks. */
function outcomeOf(marks: Mark[], buzzed: boolean): ClueOutcome {
  if (marks.includes(1)) return "correct";
  if (marks.includes(-1)) return "incorrect";
  return buzzed ? "noResponse" : "skipped";
}

function resolveRecord(file: JeopardyFile, state: SessionState, skipped: boolean): ClueRecord | null {
  if (!state.current) return null;
  const q = findQuestion(file, state.current.categoryId, state.current.questionId);
  const order = [...state.buzzQueue, ...state.marks.flatMap((m, i) => (m !== 0 ? [i] : []))];
  const seen = new Set<number>();
  const attempts = order.filter((t) => !seen.has(t) && seen.add(t)).map((team) => ({ team, mark: state.marks[team] }));
  const winner = state.marks.indexOf(1);
  return {
    categoryId: state.current.categoryId,
    questionId: state.current.questionId,
    outcome: skipped ? "skipped" : outcomeOf(state.marks, state.buzzQueue.length > 0),
    attempts,
    winner: winner >= 0 ? winner : null,
    override: state.override,
    value: q?.value ?? 0,
  };
}

/** Teams that may still answer the open clue. */
export function eligibleTeams(state: SessionState): number[] {
  if (state.phase !== "clue") return [];
  if (state.dailyDouble) return state.dailyDouble.locked ? [state.dailyDouble.team] : [];
  if (state.marks.includes(1)) return [];
  if (!state.options.multipleAttempts && state.marks.includes(-1)) return [];
  return state.teams.flatMap((_, i) => (state.lockedOut.includes(i) || state.marks[i] === -1 ? [] : [i]));
}

/**
 * The public reducer. Wraps the scoring rules with the strict clue phase,
 * buzzers, lockout, pause, score history, clue records, revision and undo.
 * Pure: same input, same output (apart from a new sessionId on reset).
 */
export function sessionReducer(file: JeopardyFile, state: SessionState, action: SessionAction): SessionState {
  // Pause gate: only resume, undo and leaving are allowed while paused.
  if (state.paused && !["resume", "undo", "reset", "finish"].includes(action.type)) return state;

  const bump = (next: SessionState): SessionState => (next === state ? state : { ...next, revision: state.revision + 1 });

  switch (action.type) {
    case "pause":
      return state.phase === "results" ? state : bump({ ...state, paused: true });
    case "resume":
      return state.paused ? bump({ ...state, paused: false }) : state;
    case "undo": {
      const prev = state.undo[state.undo.length - 1];
      if (!prev) return state;
      return { ...prev, paused: false, undo: state.undo.slice(0, -1), revision: state.revision + 1 };
    }
    case "openBuzzers":
      if (state.phase !== "clue" || state.cluePhase !== "revealing" || (state.dailyDouble && !state.dailyDouble.locked)) return state;
      return bump({ ...state, cluePhase: "buzzing" });
    case "buzz": {
      if (state.phase !== "clue" || !state.cluePhase || state.cluePhase === "resolved") return state;
      if (action.team < 0 || action.team >= state.teams.length || state.dailyDouble) return state;
      if (state.buzzQueue.includes(action.team) || !eligibleTeams(state).includes(action.team)) return state;
      if (state.cluePhase === "revealing") {
        return state.options.lockoutPremature ? bump({ ...state, lockedOut: [...state.lockedOut, action.team] }) : state;
      }
      return bump({ ...state, buzzQueue: [...state.buzzQueue, action.team], cluePhase: state.cluePhase === "buzzing" ? "answering" : state.cluePhase });
    }
    case "clearBuzz":
      if (state.phase !== "clue") return state;
      return bump({ ...state, buzzQueue: [], lockedOut: [], cluePhase: state.cluePhase === "answering" ? "buzzing" : state.cluePhase });
    case "skip": {
      if (state.phase !== "clue" || !state.current) return state;
      const record = resolveRecord(file, state, true);
      // Undo any marks on a skip, so it never changes scores.
      const teams = state.teams.map((t, i) => ({ ...t, score: state.marks[i] !== 0 ? state.base[i] : t.score }));
      const next = coreReducer(file, { ...state, teams, marks: state.teams.map(() => 0) }, { type: "backToBoard" });
      return bump(withUndo(state, { ...next, cluePhase: null, buzzQueue: [], lockedOut: [], override: false, clueLog: record ? [...state.clueLog, record] : state.clueLog }));
    }
  }

  let next = coreReducer(file, state, action);
  if (next === state) return state;

  // Clue phase bookkeeping.
  switch (action.type) {
    case "open":
      next = { ...next, cluePhase: "revealing", buzzQueue: [], lockedOut: [], override: false };
      break;
    case "ddLock":
      next = { ...next, cluePhase: "answering", buzzQueue: [next.dailyDouble!.team] };
      break;
    case "revealAnswer":
      next = { ...next, cluePhase: "judging" };
      break;
    case "mark": {
      const queue = next.buzzQueue.filter((t) => t !== action.team || next.marks[t] === 0);
      const wrong = next.marks[action.team] === -1;
      const anyRight = next.marks.includes(1);
      next = {
        ...next,
        buzzQueue: wrong ? queue : next.buzzQueue,
        cluePhase: anyRight || next.answerShown ? "judging" : queue.length > 0 ? "answering" : next.cluePhase === "revealing" ? "revealing" : "buzzing",
      };
      break;
    }
    case "setScore":
    case "adjustScore":
      if (state.phase === "clue") next = { ...next, override: true };
      break;
    case "backToBoard":
    case "finish": {
      if (state.phase === "clue") {
        const record = resolveRecord(file, state, false);
        if (record) next = { ...next, clueLog: [...state.clueLog, record] };
      }
      next = { ...next, cluePhase: null, buzzQueue: [], lockedOut: [], override: false };
      break;
    }
    case "reset":
      return { ...next, revision: state.revision + 1 };
  }

  // Score history.
  const events: ScoreEvent[] = [];
  next.teams.forEach((t, i) => {
    const before = state.teams[i]?.score ?? 0;
    if (t.score !== before) events.push({ revision: state.revision + 1, team: i, before, after: t.score, reason: reasonFor(file, state, action), questionId: state.current?.questionId });
  });
  if (events.length) next = { ...next, history: [...state.history, ...events] };

  return bump(SCORING.has(action.type) ? withUndo(state, next) : next);
}

function withUndo(prev: SessionState, next: SessionState): SessionState {
  return { ...next, undo: [...prev.undo, snapshot(prev)].slice(-UNDO_LIMIT) };
}

/** Status of one clue for the board tile and legend. */
export function clueStatus(state: SessionState, questionId: string): ClueStatus {
  if (state.current?.questionId === questionId) return "open";
  const rec = [...state.clueLog].reverse().find((r) => r.questionId === questionId);
  if (rec) return rec.outcome === "correct" ? "correct" : rec.outcome === "incorrect" ? "incorrect" : "skipped";
  return state.used.includes(questionId) ? "skipped" : "available";
}

/** Played and total clues for a category. */
export function categoryProgress(file: JeopardyFile, state: SessionState, categoryId: string): { played: number; total: number } {
  const c = file.content.categories.find((x) => x.id === categoryId);
  if (!c) return { played: 0, total: 0 };
  return { played: c.questions.filter((q) => state.used.includes(q.id)).length, total: c.questions.length };
}

/** Clues each team answered right and wrong. */
export function teamProgress(state: SessionState): Array<{ correct: number; incorrect: number }> {
  return state.teams.map((_, i) => ({
    correct: state.clueLog.filter((r) => r.attempts.some((a) => a.team === i && a.mark === 1)).length,
    incorrect: state.clueLog.filter((r) => r.attempts.some((a) => a.team === i && a.mark === -1)).length,
  }));
}

export interface MatchReport {
  totalClues: number;
  answered: number;
  missed: Array<{ categoryId: string; questionId: string }>;
  bestTeam: number | null;
  /** Per team, the category with the most points won. */
  strengths: Array<{ team: number; categoryId: string | null; points: number }>;
}

export function matchReport(file: JeopardyFile, state: SessionState): MatchReport {
  const answered = state.clueLog.filter((r) => r.outcome === "correct").length;
  const missed = state.clueLog.filter((r) => r.outcome !== "correct").map(({ categoryId, questionId }) => ({ categoryId, questionId }));
  const strengths = state.teams.map((_, team) => {
    const byCat = new Map<string, number>();
    for (const r of state.clueLog) if (r.winner === team) byCat.set(r.categoryId, (byCat.get(r.categoryId) ?? 0) + r.value);
    let best: string | null = null;
    let points = 0;
    for (const [c, p] of byCat) if (p > points) [best, points] = [c, p];
    return { team, categoryId: best, points };
  });
  const top = standings(state.teams);
  const bestTeam = top.length && top.filter((t) => t.rank === 1).length === 1 ? state.teams.indexOf(state.teams.find((t) => t.score === top[0].score)!) : null;
  return { totalClues: totalClues(file), answered, missed, bestTeam, strengths };
}

/** Winners: every team sharing the top score (shared winner when more than one). */
export function winners(teams: Team[]): number[] {
  if (!teams.length) return [];
  const top = Math.max(...teams.map((t) => t.score));
  return teams.flatMap((t, i) => (t.score === top ? [i] : []));
}

/** Unplayed clues, usable as a sudden-death tiebreaker clue. */
export function suddenDeathClues(file: JeopardyFile, state: SessionState): Array<{ categoryId: string; questionId: string }> {
  return file.content.categories.flatMap((c) => c.questions.filter((q) => !state.used.includes(q.id)).map((q) => ({ categoryId: c.id, questionId: q.id })));
}

/** Points that would result from a score action, for a preview before confirming. */
export function previewScore(state: SessionState, team: number, change: { set?: number; delta?: number }): number | null {
  const t = state.teams[team];
  if (!t) return null;
  const next = change.set !== undefined ? Math.round(change.set) : t.score + Math.round(change.delta ?? 0);
  return Number.isFinite(next) ? next : null;
}

/** Validates clue data before play: returns readable problems, empty when fine. */
export function boardProblems(file: JeopardyFile): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of file.content.categories) {
    if (!c.questions.length) problems.push(`${c.title || "A category"} has no clues.`);
    for (const q of c.questions) {
      if (ids.has(q.id)) problems.push(`Clue id ${q.id} is used twice.`);
      ids.add(q.id);
      if (!q.clue.trim() || !q.answer.trim()) problems.push(`${c.title} ${q.value} is missing its clue or answer.`);
      if (!Number.isFinite(q.value) || q.value < 0) problems.push(`${c.title} has a clue with an invalid value.`);
    }
  }
  return problems;
}

/** A team may wager up to its score, or up to the top clue value if it has less. */
export function maxWager(file: JeopardyFile, score: number): number {
  const top = Math.max(0, ...file.content.categories.flatMap((c) => c.questions.map((q) => q.value)));
  return Math.max(score, top);
}

/** Teams sorted by score, with shared ranks for ties. */
export function standings(teams: Team[]): Array<Team & { rank: number }> {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  return sorted.map((t) => ({ ...t, rank: sorted.findIndex((o) => o.score === t.score) + 1 }));
}
