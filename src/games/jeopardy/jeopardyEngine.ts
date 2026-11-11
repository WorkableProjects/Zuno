import type { JeopardyFile, JeopardyQuestion } from "../../game-files/schema/jeopardy";

/** Pure session state for one hosted Jeopardy game. No React, no DOM. */

export interface TeamSetup {
  name: string;
  /** Player names shown under the team name. May be empty. */
  members: string[];
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

export interface SessionState {
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
  | { type: "reset" };

const emptyFinal = (teams: Team[]): SessionState["final"] => ({
  step: "category",
  wagers: teams.map(() => 0),
  marks: teams.map(() => 0),
  played: false,
  participants: teams.map((_, i) => i),
  tiebreaker: false,
});

export function createSession(setup: TeamSetup[], allowNegativeScores: boolean): SessionState {
  const teams: Team[] = setup.map((t, i) => ({
    name: t.name.trim() || `Team ${i + 1}`,
    members: t.members.map((m) => m.trim()).filter(Boolean),
    score: 0,
  }));
  return {
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

export function sessionReducer(file: JeopardyFile, state: SessionState, action: SessionAction): SessionState {
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
        state.teams.map((t) => ({ name: t.name, members: t.members })),
        state.allowNegativeScores,
      );
  }
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
