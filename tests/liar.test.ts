import { describe, expect, it } from "vitest";
import { validateGameFile, validateGameFileText } from "../src/game-files/schema/validateGameFile";
import { blankLiarFile, validateLiar, type LiarFile } from "../src/game-files/schema/liar";
import {
  allVotesIn,
  createSession,
  liarReducer,
  publicTurn,
  scoreTurn,
  storyteller,
  tally,
  validateSetup,
  validateTurn,
  winners,
  type LiarAction,
  type LiarState,
  type Options,
  type Turn,
} from "../src/games/liar/liarEngine";

const opts: Options = { rounds: 1, scoring: true, allowAbstain: false };
const turn = (lieIndex = 1): Turn => ({
  lieIndex,
  statements: [0, 1, 2].map((i) => ({ text: `Statement ${i}`, questions: [`Question ${i}?`] })),
});
const run = (s: LiarState, ...actions: LiarAction[]) => actions.reduce(liarReducer, s);
const start = (n = 3, o = opts) => createSession(Array.from({ length: n }, (_, i) => `P${i + 1}`), o);
const toVote = (s: LiarState, lie = 1) => run(s, { type: "submitTurn", turn: turn(lie) }, { type: "startVoting" });

describe("liar file", () => {
  const raw = () => JSON.parse(JSON.stringify(blankLiarFile())) as Record<string, any>;
  it("accepts a valid file and routes it by game type", () => {
    const r = validateGameFile(raw());
    expect(r.ok).toBe(true);
    expect(validateGameFile(raw(), "jeopardy").ok).toBe(false);
  });
  it("rejects bad versions, settings and prompts", () => {
    expect(validateGameFile({ ...raw(), schemaVersion: 2 }).ok).toBe(false);
    const bad = raw();
    bad.settings.maxPlayers = 99;
    bad.settings.scoringEnabled = "yes";
    expect(validateLiar(bad).ok).toBe(false);
    const dup = raw();
    dup.content.questionPrompts = [
      { id: "a", text: "What happened next?" },
      { id: "a", text: "Who was there?" },
      { id: "b", text: "  " },
    ];
    const r = validateLiar(dup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
  it("treats scripts as unsafe and strings as plain text", () => {
    const f = raw();
    f.content.questionPrompts = [{ id: "a", text: "<script>alert(1)</script>" }];
    expect(validateLiar(f).ok).toBe(false);
    f.content.questionPrompts = [{ id: "a", text: "<b>bold</b>" }];
    const r = validateLiar(f);
    expect(r.ok && (r.file as LiarFile).content.questionPrompts[0].text).toBe("<b>bold</b>");
  });
  it("validates through the text entry point", () => {
    expect(validateGameFileText(JSON.stringify(raw()), "liar").ok).toBe(true);
    expect(validateGameFileText("nope").ok).toBe(false);
  });
});

describe("liar setup and turn rules", () => {
  it("needs three players with names", () => {
    expect(validateSetup(["a", "b"], opts)).not.toEqual([]);
    expect(validateSetup(["a", "b", ""], opts)).not.toEqual([]);
    expect(validateSetup(["a", "b", "A"], opts)).not.toEqual([]);
    expect(validateSetup(["a", "b", "c"], opts)).toEqual([]);
    expect(validateSetup(Array.from({ length: 10 }, (_, i) => `p${i}`), opts)).toEqual([]);
  });
  it("requires three statements, one lie and a question each", () => {
    expect(validateTurn(turn())).toEqual([]);
    expect(validateTurn({ ...turn(), statements: turn().statements.slice(0, 2) })).not.toEqual([]);
    expect(validateTurn({ ...turn(), lieIndex: -1 })).not.toEqual([]);
    const noQ = turn();
    noQ.statements[2].questions = [" "];
    expect(validateTurn(noQ).join(" ")).toContain("Statement 3");
    const blank = turn();
    blank.statements[0].text = "";
    expect(validateTurn(blank)).not.toEqual([]);
  });
  it("does not start an invalid turn", () => {
    const s = start();
    expect(run(s, { type: "submitTurn", turn: { ...turn(), lieIndex: 7 } })).toBe(s);
  });
});

describe("liar session", () => {
  it("hides the lie until reveal", () => {
    let s = run(start(), { type: "submitTurn", turn: turn(2) });
    expect(publicTurn(s)?.lieIndex).toBeNull();
    s = run(s, { type: "startVoting" });
    expect(publicTurn(s)?.lieIndex).toBeNull();
    s = run(s, { type: "vote", voter: "p2", vote: 2 }, { type: "vote", voter: "p3", vote: 0 }, { type: "closeVoting" });
    expect(publicTurn(s)?.lieIndex).toBe(2);
  });
  it("blocks storyteller votes, late votes and bad votes; allows changing while open", () => {
    let s = toVote(start());
    expect(run(s, { type: "vote", voter: "p1", vote: 0 }).votes).toEqual({});
    expect(run(s, { type: "vote", voter: "p2", vote: 5 }).votes).toEqual({});
    expect(run(s, { type: "vote", voter: "p2", vote: "abstain" }).votes).toEqual({});
    s = run(s, { type: "vote", voter: "p2", vote: 0 }, { type: "vote", voter: "p2", vote: 2 });
    expect(s.votes).toEqual({ p2: 2 });
    const closed = run(s, { type: "closeVoting" });
    expect(run(closed, { type: "vote", voter: "p3", vote: 0 })).toBe(closed);
  });
  it("scores correct guessers and deception", () => {
    const s = run(toVote(start(4)), { type: "vote", voter: "p2", vote: 1 }, { type: "vote", voter: "p3", vote: 0 }, { type: "vote", voter: "p4", vote: 2 });
    expect(allVotesIn(s)).toBe(true);
    const r = run(s, { type: "closeVoting" });
    expect(r.scores).toEqual({ p1: 2, p2: 1, p3: 0, p4: 0 });
  });
  it("gives no deception points when everyone is right", () => {
    const r = run(toVote(start()), { type: "vote", voter: "p2", vote: 1 }, { type: "vote", voter: "p3", vote: 1 }, { type: "closeVoting" });
    expect(r.scores.p1).toBe(0);
  });
  it("casual mode assigns no points", () => {
    const r = run(toVote(start(3, { ...opts, scoring: false })), { type: "vote", voter: "p2", vote: 1 }, { type: "closeVoting" });
    expect(Object.values(r.scores).every((n) => n === 0)).toBe(true);
    expect(winners(r)).toEqual([]);
  });
  it("handles abstentions and ties by scoring only correct guesses", () => {
    const o = { ...opts, allowAbstain: true };
    const s = run(toVote(start(4, o)), { type: "vote", voter: "p2", vote: "abstain" }, { type: "vote", voter: "p3", vote: 1 }, { type: "vote", voter: "p4", vote: 0 });
    const r = run(s, { type: "closeVoting" });
    expect(r.scores).toEqual({ p1: 1, p2: 0, p3: 1, p4: 0 });
    const t = tally(r.votes);
    expect(t.counts).toEqual([1, 1, 0]);
    expect(t.abstained).toBe(1);
  });
  it("gives every player a turn each round, then finishes", () => {
    let s = start(3, { ...opts, rounds: 2 });
    const seen: string[] = [];
    while (s.phase !== "done") {
      seen.push(storyteller(s)!.id);
      s = run(s, { type: "submitTurn", turn: turn() }, { type: "startVoting" }, { type: "closeVoting" }, { type: "next" });
    }
    expect(seen).toEqual(["p1", "p2", "p3", "p1", "p2", "p3"]);
    expect(s.recap).toHaveLength(6);
  });
  it("lets the host fix an accidental lie marker and rescores", () => {
    const s = run(toVote(start()), { type: "vote", voter: "p2", vote: 1 }, { type: "vote", voter: "p3", vote: 0 }, { type: "closeVoting" });
    expect(s.scores).toEqual({ p1: 1, p2: 1, p3: 0 });
    const f = run(s, { type: "fixLie", lieIndex: 0 });
    expect(f.scores).toEqual({ p1: 1, p2: 0, p3: 1 });
    expect(f.recap[0].turn.lieIndex).toBe(0);
  });
  it("skips, removes players and updates the vote count", () => {
    let s = run(start(4), { type: "skipTurn" });
    expect(storyteller(s)!.id).toBe("p2");
    s = toVote(s);
    s = run(s, { type: "vote", voter: "p3", vote: 0 }, { type: "removePlayer", id: "p4" }, { type: "vote", voter: "p1", vote: 1 });
    expect(allVotesIn(s)).toBe(true);
    // Removing the storyteller drops their turn.
    const gone = run(s, { type: "removePlayer", id: "p2" });
    expect(gone.phase).toBe("prep");
    expect(storyteller(gone)!.id).toBe("p3");
  });
  it("ends early and restarts cleanly", () => {
    const s = run(toVote(start()), { type: "end" });
    expect(s.phase).toBe("done");
    expect(s.endedEarly).toBe(true);
    expect(s.turn).toBeNull();
    const again = createSession(["a", "b", "c"], opts);
    expect(again.phase).toBe("prep");
    expect(again.recap).toEqual([]);
  });
  it("scoreTurn ignores the storyteller's own vote", () => {
    expect(scoreTurn(opts, "p1", turn(), { p1: 1, p2: 0 })).toEqual({ p1: 1 });
  });
});
