import { describe, expect, it } from "vitest";
import { blankHeadbandsFile } from "../src/game-files/schema/headbands";
import { lobbyToGame } from "../src/games/headbands/HeadbandsLobby";
import { createSession, customIdentityProblems, deckOf, describeLog, sessionReducer, writingPairs } from "../src/games/headbands/headbandsEngine";
import { codeFromHash, makeCode, moveToAction, normalizeCode, readLobby, syncCircle, type LobbyState } from "../src/games/headbands/lobby";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const rules = { continueAfterYes: false, unlimitedGuesses: false };

describe("writing circle", () => {
  it("has each player write for the next, the last for the first", () => {
    expect(writingPairs([0, 1, 2])).toEqual([
      { writer: 0, target: 1 },
      { writer: 1, target: 2 },
      { writer: 2, target: 0 },
    ]);
    expect(writingPairs([2, 0, 1]).map((p) => `${p.writer}>${p.target}`)).toEqual(["2>0", "0>1", "1>2"]);
    expect(writingPairs([0])).toEqual([]);
  });

  it("adds newcomers in join order and drops leavers", () => {
    const players = { a: { name: "A", joinedAt: 1 }, c: { name: "C", joinedAt: 3 }, d: { name: "D", joinedAt: 2 } };
    expect(syncCircle(["c", "b", "a"], players)).toEqual(["c", "a", "d"]);
  });
});

describe("custom identities", () => {
  it("accepts any text, and needs a picture plus answer in Image Mode", () => {
    expect(customIdentityProblems({ text: "My left shoe", image: null, subtext: null }, "text")).toEqual([]);
    expect(customIdentityProblems({ text: " ", image: null, subtext: null }, "text")).toHaveLength(1);
    expect(customIdentityProblems({ text: "", image: null, subtext: "Cat" }, "image").join(" ")).toMatch(/picture/);
    expect(customIdentityProblems({ text: "", image: PNG, subtext: "" }, "image").join(" ")).toMatch(/answer/);
    expect(customIdentityProblems({ text: "x".repeat(121), image: null, subtext: null }, "text").join(" ")).toMatch(/120/);
    expect(customIdentityProblems({ text: "<script>", image: null, subtext: null }, "text").join(" ")).toMatch(/Plain text/);
  });
});

describe("lobby to game", () => {
  const lobby: LobbyState = {
    phase: "writing",
    mode: "text",
    createdAt: 0,
    players: { m: { name: "Maya", joinedAt: 1 }, b: { name: "Ben", joinedAt: 2 }, i: { name: "Ivy", joinedAt: 3 } },
    circle: ["m", "i", "b"],
    entries: { m: { text: "Owl", image: null, subtext: null }, i: { text: "Moon", image: null, subtext: null }, b: { text: "Toast", image: null, subtext: null } },
    game: null,
  };

  it("gives each player what the previous writer wrote, in circle order", () => {
    const { file, start } = lobbyToGame(blankHeadbandsFile(), lobby, rules);
    const deck = deckOf(file.content.identities);
    const got = Object.fromEntries(start.players.map((p) => [p.name, deck.get(p.identityId)?.text]));
    expect(got).toEqual({ Ivy: "Owl", Ben: "Moon", Maya: "Toast" });
    expect(start.players.map((p) => p.name)).toEqual(["Maya", "Ivy", "Ben"]);
  });

  it("plays image entries with the answer as subtext", () => {
    const img = { ...lobby, mode: "image" as const, entries: { m: { text: "Owl", image: PNG, subtext: "Owl" }, i: { text: "Moon", image: PNG, subtext: "Moon" }, b: { text: "Toast", image: PNG, subtext: "Toast" } } };
    const { file, start } = lobbyToGame(blankHeadbandsFile(), img, rules);
    const deck = deckOf(file.content.identities);
    let s = createSession(start.players, start.mode, start.rules);
    s = sessionReducer(deck, s, { type: "guess", text: "toast" });
    expect(s.players[0]).toMatchObject({ name: "Maya", solved: true });
  });
});

describe("room codes", () => {
  it("makes and reads codes without look-alike characters", () => {
    expect(makeCode(() => 0)).toBe("AAAAA");
    expect(makeCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(normalizeCode(" ab-c d9z ")).toBe("ABCD9");
    expect(codeFromHash("#join=dzyt3")).toBe("DZYT3");
    expect(codeFromHash("#other")).toBeNull();
  });

  it("reads only well-formed lobby data", () => {
    expect(readLobby(null)).toBeNull();
    expect(readLobby({ phase: "party" })).toBeNull();
    const l = readLobby({ phase: "lobby", mode: "image", players: { a: { name: "A", joinedAt: 1 }, x: 5 }, circle: ["a", "ghost", 3], entries: { a: { text: 1 } } });
    expect(l?.players).toEqual({ a: { name: "A", joinedAt: 1 } });
    expect(l?.circle).toEqual(["a"]);
    expect(l?.entries.a).toEqual({ text: "", image: null, subtext: null });
  });
});

describe("online play", () => {
  const deck = deckOf([
    { id: "a", text: "Owl", image: null, subtext: null },
    { id: "b", text: "Moon", image: null, subtext: null },
    { id: "c", text: "Toast", image: null, subtext: null },
  ]);
  const fresh = () =>
    createSession(
      [
        { id: "maya", name: "Maya", identityId: "a" },
        { id: "ben", name: "Ben", identityId: "b" },
        { id: "ivy", name: "Ivy", identityId: "c" },
      ],
      "text",
      rules,
    );
  const run = (...actions: Parameters<typeof sessionReducer>[2][]) => actions.reduce((s, a) => sessionReducer(deck, s, a), fresh());

  it("keeps lobby ids as player ids", () => {
    expect(fresh().order).toEqual(["maya", "ben", "ivy"]);
  });

  it("lets the current player pose a question and another player answer it", () => {
    const s = run({ type: "pose", question: "Am I a bird?", from: "maya" }, { type: "ask", answer: "yes", from: "ben" });
    expect(s.history[0]).toMatchObject({ playerId: "maya", question: "Am I a bird?", answer: "yes" });
    expect(s.log[0]).toMatchObject({ kind: "ask", playerId: "maya", by: "ben" });
    expect(s.pending).toBeNull();
    expect(s.current).toBe("ben");
  });

  it("ignores moves that are not the sender's to make", () => {
    expect(run({ type: "pose", question: "Hi?", from: "ben" }).pending).toBeNull();
    expect(run({ type: "pose", question: "Am I food?", from: "maya" }, { type: "ask", answer: "yes", from: "maya" }).history).toEqual([]);
    expect(run({ type: "guess", text: "Owl", from: "ivy" }).log).toEqual([]);
    expect(run({ type: "skip", from: "ben" }).current).toBe("maya");
    // No typed question waiting: a phone cannot answer, so a double tap cannot answer the next turn.
    expect(run({ type: "pose", question: "Bird?", from: "maya" }, { type: "ask", answer: "no", from: "ben" }, { type: "ask", answer: "no", from: "ivy" }).history).toHaveLength(1);
  });

  it("logs guesses and skips", () => {
    const s = run({ type: "guess", text: "Cat", from: "maya" }, { type: "continue", from: "maya" }, { type: "skip", from: "ben" }, { type: "skip" });
    expect(s.log.map((e) => e.kind)).toEqual(["guess", "skip", "skip"]);
    const names = (id: string) => ({ maya: "Maya", ben: "Ben", ivy: "Ivy" })[id] ?? id;
    expect(s.log.map((e) => describeLog(e, names))).toEqual(["Maya guessed “Cat”, not it", "Ben skipped their turn", "The host skipped Ivy’s turn"]);
    expect(s.current).toBe("maya");
  });

  it("keeps ids when the round restarts", () => {
    const s = run({ type: "remove", playerId: "ben" }, { type: "restart" });
    expect(s.order).toEqual(["maya", "ivy"]);
    expect(s.log).toEqual([]);
  });

  it("parses the published game and turns phone moves into actions", () => {
    const game = { phase: "play", mode: "text", rules, turn: 1, current: "maya", paused: false, revealed: false, endedEarly: false, order: [], players: [], pending: null, lastGuess: null, log: [] };
    expect(readLobby({ phase: "playing", mode: "text", game: JSON.stringify(game) })?.game).toEqual(game);
    expect(readLobby({ phase: "playing", mode: "text", game: "{oops" })?.game).toBeNull();
    expect(moveToAction({ type: "ask", answer: "maybe" as never }, "ben")).toBeNull();
    expect(moveToAction({ type: "skip" }, "ben")).toEqual({ type: "skip", from: "ben" });
  });
});

describe("questions are optional", () => {
  const deck = deckOf([
    { id: "a", text: "Owl", image: null, subtext: null },
    { id: "b", text: "Moon", image: null, subtext: null },
  ]);
  const start = () => createSession([{ id: "maya", name: "Maya", identityId: "a" }, { id: "ben", name: "Ben", identityId: "b" }], "text", rules);

  it("lets a player ask out loud and the group answer from their phones", () => {
    let s = sessionReducer(deck, start(), { type: "pose", question: "  ", from: "maya" });
    expect(s.pending).toEqual({ playerId: "maya", question: "" });
    s = sessionReducer(deck, s, { type: "ask", answer: "no", from: "ben" });
    expect(s.history[0]).toMatchObject({ playerId: "maya", question: "", answer: "no" });
    expect(describeLog(s.log[0], (id) => (id === "maya" ? "Maya" : "Ben"))).toBe("Maya asked a question out loud: No (Ben)");
  });

  it("lets a player skip without asking anything", () => {
    const s = sessionReducer(deck, start(), { type: "skip", from: "maya" });
    expect(s.current).toBe("ben");
    expect(s.history).toEqual([]);
  });
});
