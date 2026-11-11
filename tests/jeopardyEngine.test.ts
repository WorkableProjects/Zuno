import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JeopardyFile } from "../src/game-files/schema/jeopardy";
import {
  clueAmount,
  clueTimeLimit,
  createSession,
  finalAvailable,
  maxWager,
  sessionReducer,
  standings,
  tiedLeaders,
  type SessionAction,
  type SessionState,
} from "../src/games/jeopardy/jeopardyEngine";

const file = JSON.parse(readFileSync(new URL("../public/samples/science-review.zuno.json", import.meta.url), "utf8")) as JeopardyFile;
const teams = (names: string[]) => names.map((name) => ({ name, members: [] as string[] }));
const cat = file.content.categories[0];
const run = (state: SessionState, ...actions: SessionAction[]) => actions.reduce((s, a) => sessionReducer(file, s, a), state);
const open = (qi: number): SessionAction => ({ type: "open", categoryId: cat.id, questionId: cat.questions[qi].id });

describe("jeopardy session", () => {
  it("opens a clue once and marks it used", () => {
    let s = run(createSession(teams(["A", "B"]), false), open(0));
    expect(s.phase).toBe("clue");
    s = run(s, { type: "backToBoard" });
    expect(s.used).toEqual([cat.questions[0].id]);
    expect(run(s, open(0)).phase).toBe("board");
  });

  it("reveals the answer, and the explanation follows the file setting", () => {
    const s = run(createSession(teams(["A"]), false), open(0), { type: "revealAnswer" });
    expect(s.answerShown).toBe(true);
    expect(s.explanationShown).toBe(true);
    const quiet = { ...file, settings: { ...file.settings, showExplanations: false } };
    let q = sessionReducer(quiet, sessionReducer(quiet, createSession(teams(["A"]), false), open(0)), { type: "revealAnswer" });
    expect(q.explanationShown).toBe(false);
    q = sessionReducer(quiet, q, { type: "showExplanation" });
    expect(q.explanationShown).toBe(true);
  });

  it("awards and deducts for the right team, and marks toggle off", () => {
    let s = run(createSession(teams(["A", "B"]), true), open(2), { type: "mark", team: 1, mark: 1 }, { type: "mark", team: 0, mark: -1 });
    expect(s.teams.map((t) => t.score)).toEqual([-300, 300]);
    s = run(s, { type: "mark", team: 1, mark: 1 });
    expect(s.teams[1].score).toBe(0);
    s = run(s, { type: "mark", team: 0, mark: 1 });
    expect(s.teams[0].score).toBe(300);
  });

  it("holds scores at zero when negatives are off, and undo restores exactly", () => {
    let s = run(createSession(teams(["A"]), false), open(0), { type: "mark", team: 0, mark: 1 }, { type: "backToBoard" }, open(4), { type: "mark", team: 0, mark: -1 });
    expect(s.teams[0].score).toBe(0);
    s = run(s, { type: "mark", team: 0, mark: -1 });
    expect(s.teams[0].score).toBe(100);
  });

  it("runs the final round with capped wagers", () => {
    let s = run(createSession(teams(["A", "B"]), false), open(4), { type: "mark", team: 0, mark: 1 }, { type: "backToBoard" }, { type: "startFinal" });
    expect(s.phase).toBe("final");
    s = run(s, { type: "finalWager", team: 0, wager: 9999 }, { type: "finalWager", team: 1, wager: 200 }, { type: "finalNext" }, { type: "finalNext" });
    expect(s.final.wagers).toEqual([500, 200]);
    s = run(s, { type: "finalMark", team: 0, mark: -1 }, { type: "finalMark", team: 1, mark: 1 }, { type: "finish" });
    expect(s.phase).toBe("results");
    expect(s.teams.map((t) => t.score)).toEqual([0, 200]);
    expect(standings(s.teams)[0].name).toBe("B");
  });

  it("skips the final round when the file turns it off", () => {
    const off = { ...file, content: { ...file.content, finalJeopardy: { ...file.content.finalJeopardy, enabled: false } } };
    expect(sessionReducer(off, createSession(teams(["A"]), false), { type: "startFinal" }).phase).toBe("board");
  });

  it("reset clears the board and scores but keeps the teams", () => {
    const s = run(createSession(teams(["A", "B"]), false), open(0), { type: "mark", team: 0, mark: 1 }, { type: "backToBoard" }, { type: "reset" });
    expect(s.used).toEqual([]);
    expect(s.teams).toEqual([
      { name: "A", members: [], score: 0 },
      { name: "B", members: [], score: 0 },
    ]);
  });

  it("gives tied teams the same rank", () => {
    expect(standings([{ name: "A", members: [], score: 5 }, { name: "B", members: [], score: 5 }, { name: "C", members: [], score: 1 }]).map((t) => t.rank)).toEqual([1, 1, 3]);
  });
});

const ddCat = file.content.categories.find((c) => c.questions.some((q) => q.dailyDouble))!;
const ddQ = ddCat.questions.find((q) => q.dailyDouble)!;
const openDD: SessionAction = { type: "open", categoryId: ddCat.id, questionId: ddQ.id };
const withScores = (scores: number[]) => run(createSession(teams(scores.map((_, i) => `T${i}`)), true), ...scores.map((_, i): SessionAction => ({ type: "adjustScore", team: i, delta: scores[i] })));
const finalFile = (mode: "always" | "tiebreaker") => ({ ...file, content: { ...file.content, finalJeopardy: { ...file.content.finalJeopardy, enabled: true, mode } } });
const runWith = (f: JeopardyFile, state: SessionState, ...actions: SessionAction[]) => actions.reduce((s, a) => sessionReducer(f, s, a), state);

describe("daily double", () => {
  it("sets dailyDouble on open and refuses the answer until locked", () => {
    let s = run(createSession(teams(["A", "B"]), false), openDD);
    expect(s.dailyDouble).toEqual({ team: 0, wager: 0, locked: false });
    expect(run(s, { type: "revealAnswer" }).answerShown).toBe(false);
    s = run(s, { type: "ddLock" });
    expect(s.dailyDouble?.locked).toBe(true);
    expect(run(s, { type: "revealAnswer" }).answerShown).toBe(true);
  });

  it("clamps the wager to maxWager and refuses changes once locked", () => {
    let s = run(withScores([200, 0]), openDD, { type: "ddWager", wager: 99999 });
    expect(s.dailyDouble?.wager).toBe(maxWager(file, 200));
    expect(maxWager(file, 200)).toBe(500);
    s = run(s, { type: "ddWager", wager: -5 });
    expect(s.dailyDouble?.wager).toBe(0);
    s = run(s, { type: "ddWager", wager: 300 }, { type: "ddLock" }, { type: "ddWager", wager: 100 });
    expect(s.dailyDouble?.wager).toBe(300);
    expect(clueAmount(s, ddQ)).toBe(300);
  });

  it("only lets the daily double team be marked, once locked, using the wager", () => {
    let s = run(withScores([1000, 1000]), openDD, { type: "ddTeam", team: 1 }, { type: "ddWager", wager: 400 });
    expect(run(s, { type: "mark", team: 1, mark: 1 }).teams[1].score).toBe(1000);
    s = run(s, { type: "ddLock" });
    expect(run(s, { type: "mark", team: 0, mark: 1 }).teams[0].score).toBe(1000);
    s = run(s, { type: "mark", team: 1, mark: -1 });
    expect(s.teams.map((t) => t.score)).toEqual([1000, 600]);
    s = run(s, { type: "mark", team: 1, mark: 1 });
    expect(s.teams[1].score).toBe(1400);
  });

  it("clears the daily double when going back to the board", () => {
    expect(run(createSession(teams(["A"]), false), openDD, { type: "ddLock" }, { type: "backToBoard" }).dailyDouble).toBeNull();
  });
});

describe("host score overrides", () => {
  it("sets and adjusts scores in any phase without clamping", () => {
    let s = run(createSession(teams(["A", "B"]), false), { type: "setScore", team: 0, score: -50 }, { type: "adjustScore", team: 1, delta: 120 });
    expect(s.teams.map((t) => t.score)).toEqual([-50, 120]);
    s = run(s, { type: "adjustScore", team: 1, delta: -20 });
    expect(s.teams[1].score).toBe(100);
  });

  it("keeps mark toggles exact after an override during a clue", () => {
    let s = run(createSession(teams(["A"]), true), open(2), { type: "mark", team: 0, mark: 1 });
    expect(s.teams[0].score).toBe(300);
    s = run(s, { type: "adjustScore", team: 0, delta: 50 });
    expect(s.teams[0].score).toBe(350);
    s = run(s, { type: "mark", team: 0, mark: 1 });
    expect(s.teams[0].score).toBe(50);
    s = run(s, { type: "mark", team: 0, mark: -1 });
    expect(s.teams[0].score).toBe(-250);
  });
});

describe("teams", () => {
  it("trims members, drops empty ones and names blank teams", () => {
    const s = createSession([{ name: " A ", members: [" Ann ", "", "  ", "Bo"] }, { name: " ", members: [] }], false);
    expect(s.teams.map((t) => t.name)).toEqual(["A", "Team 2"]);
    expect(s.teams[0].members).toEqual(["Ann", "Bo"]);
  });
});

describe("final question modes", () => {
  it("is always available in always mode, until played", () => {
    const f = finalFile("always");
    const s = createSession(teams(["A", "B"]), false);
    expect(finalAvailable(f, s)).toBe(true);
    const done = runWith(f, s, { type: "startFinal" }, { type: "finish" });
    expect(finalAvailable(f, done)).toBe(false);
  });

  it("finds tied leaders only when two or more share the top score", () => {
    expect(tiedLeaders(withScores([5, 5, 1]).teams)).toEqual([0, 1]);
    expect(tiedLeaders(withScores([5, 3]).teams)).toEqual([]);
    expect(tiedLeaders(withScores([0]).teams)).toEqual([]);
  });

  it("refuses the tiebreaker when nobody is tied", () => {
    const f = finalFile("tiebreaker");
    const s = withScores([300, 100]);
    expect(finalAvailable(f, s)).toBe(false);
    expect(runWith(f, s, { type: "startFinal" }).phase).toBe("board");
  });

  it("plays only the tied teams, with no wagers and right = +1", () => {
    const f = finalFile("tiebreaker");
    let s = runWith(f, withScores([300, 300, 100]), { type: "startFinal" });
    expect(s.phase).toBe("final");
    expect(s.final.tiebreaker).toBe(true);
    expect(s.final.participants).toEqual([0, 1]);
    s = runWith(f, s, { type: "finalWager", team: 0, wager: 200 }, { type: "finalNext" }, { type: "finalNext" });
    expect(s.final.wagers).toEqual([0, 0, 0]);
    s = runWith(f, s, { type: "finalMark", team: 2, mark: 1 }, { type: "finalMark", team: 0, mark: 1 }, { type: "finalMark", team: 1, mark: -1 });
    expect(s.teams.map((t) => t.score)).toEqual([301, 300, 100]);
  });

  it("starts the tiebreaker from the results screen", () => {
    const f = finalFile("tiebreaker");
    const s = runWith(f, withScores([200, 200]), { type: "finish" });
    expect(s.phase).toBe("results");
    expect(runWith(f, s, { type: "startFinal" }).phase).toBe("final");
  });
});

describe("clue time limit", () => {
  it("uses the question override, else the file default", () => {
    const f = { ...file, settings: { ...file.settings, timeLimitSeconds: 30 } };
    expect(clueTimeLimit(f, { ...cat.questions[0], timeLimit: undefined })).toBe(30);
    expect(clueTimeLimit(f, { ...cat.questions[0], timeLimit: 0 })).toBe(0);
    expect(clueTimeLimit(f, { ...cat.questions[0], timeLimit: 10 })).toBe(10);
  });
});

