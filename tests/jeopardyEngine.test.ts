import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JeopardyFile } from "../src/game-files/schema/jeopardy";
import { createSession, sessionReducer, standings, type SessionAction, type SessionState } from "../src/games/jeopardy/jeopardyEngine";

const file = JSON.parse(readFileSync(new URL("../public/samples/science-review.zuno.json", import.meta.url), "utf8")) as JeopardyFile;
const cat = file.content.categories[0];
const run = (state: SessionState, ...actions: SessionAction[]) => actions.reduce((s, a) => sessionReducer(file, s, a), state);
const open = (qi: number): SessionAction => ({ type: "open", categoryId: cat.id, questionId: cat.questions[qi].id });

describe("jeopardy session", () => {
  it("opens a clue once and marks it used", () => {
    let s = run(createSession(["A", "B"], false), open(0));
    expect(s.phase).toBe("clue");
    s = run(s, { type: "backToBoard" });
    expect(s.used).toEqual([cat.questions[0].id]);
    expect(run(s, open(0)).phase).toBe("board");
  });

  it("reveals the answer, and the explanation follows the file setting", () => {
    const s = run(createSession(["A"], false), open(0), { type: "revealAnswer" });
    expect(s.answerShown).toBe(true);
    expect(s.explanationShown).toBe(true);
    const quiet = { ...file, settings: { ...file.settings, showExplanations: false } };
    let q = sessionReducer(quiet, sessionReducer(quiet, createSession(["A"], false), open(0)), { type: "revealAnswer" });
    expect(q.explanationShown).toBe(false);
    q = sessionReducer(quiet, q, { type: "showExplanation" });
    expect(q.explanationShown).toBe(true);
  });

  it("awards and deducts for the right team, and marks toggle off", () => {
    let s = run(createSession(["A", "B"], true), open(2), { type: "mark", team: 1, mark: 1 }, { type: "mark", team: 0, mark: -1 });
    expect(s.teams.map((t) => t.score)).toEqual([-300, 300]);
    s = run(s, { type: "mark", team: 1, mark: 1 });
    expect(s.teams[1].score).toBe(0);
    s = run(s, { type: "mark", team: 0, mark: 1 });
    expect(s.teams[0].score).toBe(300);
  });

  it("holds scores at zero when negatives are off, and undo restores exactly", () => {
    let s = run(createSession(["A"], false), open(0), { type: "mark", team: 0, mark: 1 }, { type: "backToBoard" }, open(4), { type: "mark", team: 0, mark: -1 });
    expect(s.teams[0].score).toBe(0);
    s = run(s, { type: "mark", team: 0, mark: -1 });
    expect(s.teams[0].score).toBe(100);
  });

  it("runs the final round with capped wagers", () => {
    let s = run(createSession(["A", "B"], false), open(4), { type: "mark", team: 0, mark: 1 }, { type: "backToBoard" }, { type: "startFinal" });
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
    expect(sessionReducer(off, createSession(["A"], false), { type: "startFinal" }).phase).toBe("board");
  });

  it("reset clears the board and scores but keeps the teams", () => {
    const s = run(createSession(["A", "B"], false), open(0), { type: "mark", team: 0, mark: 1 }, { type: "backToBoard" }, { type: "reset" });
    expect(s.used).toEqual([]);
    expect(s.teams).toEqual([
      { name: "A", score: 0 },
      { name: "B", score: 0 },
    ]);
  });

  it("gives tied teams the same rank", () => {
    expect(standings([{ name: "A", score: 5 }, { name: "B", score: 5 }, { name: "C", score: 1 }]).map((t) => t.rank)).toEqual([1, 1, 3]);
  });
});
