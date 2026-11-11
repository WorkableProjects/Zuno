import type { JeopardyFile, JeopardyQuestion } from "../../game-files/schema/jeopardy";

/** Pure session state for one hosted Jeopardy game. No React, no DOM. */

export interface Team {
  name: string;
  score: number;
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
  final: { step: FinalStep; wagers: number[]; marks: Mark[]; played: boolean };
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
  | { type: "reset" };

export function createSession(teamNames: string[], allowNegativeScores: boolean): SessionState {
  const teams = teamNames.map((name, i) => ({ name: name.trim() || `Team ${i + 1}`, score: 0 }));
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
    final: { step: "category", wagers: teams.map(() => 0), marks: teams.map(() => 0), played: false },
  };
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

export function sessionReducer(file: JeopardyFile, state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "open": {
      if (state.phase !== "board") return state;
      if (state.used.includes(action.questionId)) return state;
      if (!findQuestion(file, action.categoryId, action.questionId)) return state;
      return {
        ...state,
        phase: "clue",
        current: { categoryId: action.categoryId, questionId: action.questionId },
        answerShown: false,
        explanationShown: false,
        marks: state.teams.map(() => 0),
        base: state.teams.map((t) => t.score),
      };
    }
    case "revealAnswer":
      if (state.phase !== "clue") return state;
      return { ...state, answerShown: true, explanationShown: file.settings.showExplanations };
    case "showExplanation":
      if (state.phase !== "clue" || !state.answerShown) return state;
      return { ...state, explanationShown: true };
    case "mark": {
      if (state.phase !== "clue" || !state.current) return state;
      const q = findQuestion(file, state.current.categoryId, state.current.questionId);
      if (!q) return state;
      const previous = state.marks[action.team];
      const next: Mark = previous === action.mark ? 0 : action.mark;
      return {
        ...state,
        teams: scoreWithMark(state, action.team, next, q.value),
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
      };
    }
    case "startFinal": {
      if (!file.content.finalJeopardy.enabled || state.final.played || state.phase !== "board") return state;
      return {
        ...state,
        phase: "final",
        base: state.teams.map((t) => t.score),
        final: { step: "category", wagers: state.teams.map(() => 0), marks: state.teams.map(() => 0), played: false },
      };
    }
    case "finalWager": {
      if (state.phase !== "final" || state.final.step === "answer") return state;
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
      const previous = state.final.marks[action.team];
      const next: Mark = previous === action.mark ? 0 : action.mark;
      return {
        ...state,
        teams: scoreWithMark(state, action.team, next, state.final.wagers[action.team]),
        final: { ...state.final, marks: state.final.marks.map((m, i) => (i === action.team ? next : m)) },
      };
    }
    case "finish": {
      const used = state.phase === "clue" && state.current ? [...state.used, state.current.questionId] : state.used;
      return { ...state, phase: "results", used, current: null, final: { ...state.final, played: state.final.played || state.phase === "final" } };
    }
    case "reset":
      return createSession(
        state.teams.map((t) => t.name),
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
