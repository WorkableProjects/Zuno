import { describe, expect, it } from "vitest";
import { validateGameFile } from "../src/game-files/schema/validateGameFile";
import type { PartyAction } from "../src/games/party/types";
import { shuffle } from "../src/games/party/types";
import { partyCodeFromHash } from "../src/games/party/partyRoom";
import { bjReducer, createBlackjack, handTotal, isBlackjack, toBjOnline, type BjState, type Card } from "../src/games/blackjack/bjEngine";
import { createDraw, drawPrivate, drawReducer, toDrawOnline, type DrawState } from "../src/games/drawit/drawEngine";
import { cleanSurvey, createFeud, feudPrivate, feudReducer, matchAnswer, toFeudOnline, type FeudState } from "../src/games/feud/feudEngine";

const players = (n: number) => ["a", "b", "c", "d"].slice(0, n).map((id) => ({ id, name: id.toUpperCase() }));
const mv = (by: string, move: Record<string, unknown>): PartyAction => ({ type: "move", by, move });
const tick: PartyAction = { type: "tick" };

describe("shared", () => {
  it("shuffles deterministically and keeps every item", () => {
    const [a] = shuffle([1, 2, 3, 4, 5], 42);
    const [b] = shuffle([1, 2, 3, 4, 5], 42);
    expect(a).toEqual(b);
    expect(a.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("reads join links", () => {
    expect(partyCodeFromHash("#draw=abcde")).toEqual({ kind: "draw", code: "ABCDE" });
    expect(partyCodeFromHash("#rpg=abcde")).toBeNull();
  });
  it("validates the sample-shaped files", () => {
    const base = { schemaVersion: 1, metadata: { title: "T" }, appearance: { accentColor: "#123456", backgroundPreset: "aurora" }, content: {} };
    expect(validateGameFile({ ...base, gameType: "blackjack", settings: { minBet: 25 } }).ok).toBe(true);
    expect(validateGameFile({ ...base, gameType: "drawit", settings: { rounds: 99 } }).ok).toBe(false);
    expect(validateGameFile({ ...base, gameType: "feud", settings: { strikes: 3 } }).ok).toBe(true);
  });
});

describe("blackjack", () => {
  const settings = { startingChips: 1000, minBet: 10, betSeconds: 10, turnSeconds: 10, rounds: 3 };
  /** A table with a stacked shoe: cards are dealt from the front. */
  const rigged = (n: number, shoe: Card[]): BjState => ({ ...createBlackjack(players(n), settings, 1), shoe: [...shoe, ...createBlackjack(players(n), settings, 2).shoe] });

  it("totals hands with soft aces", () => {
    expect(handTotal(["AS", "6H"])).toEqual({ total: 17, soft: true });
    expect(handTotal(["AS", "6H", "10D"])).toEqual({ total: 17, soft: false });
    expect(handTotal(["AS", "AH", "9D"]).total).toBe(21);
    expect(isBlackjack({ cards: ["AS", "KH"] })).toBe(true);
    expect(isBlackjack({ cards: ["AS", "KH"], split: true })).toBe(false);
  });

  it("deals once everyone bets and hides the hole card", () => {
    // Deal order: A1, B1, dealer up, A2, B2, dealer hole.
    let s = rigged(2, ["10S", "9S", "7D", "8S", "7S", "QH"]);
    s = bjReducer(s, mv("a", { type: "bet", amount: 100 }));
    expect(s.phase).toBe("betting");
    s = bjReducer(s, mv("b", { type: "bet", amount: 50 }));
    expect(s.phase).toBe("playing");
    expect(s.players[0].chips).toBe(900);
    const o = toBjOnline(s);
    expect(o.dealer).toEqual(["7D", "??"]);
    expect(JSON.stringify(o)).not.toContain("QH");
    expect(o.turn).toEqual({ id: "a", hand: 0 });
  });

  it("pays wins, pushes and losses after the dealer plays", () => {
    // A: 10+8=18, B: 9+7=16, dealer 7+QH=17.
    let s = rigged(2, ["10S", "9S", "7D", "8S", "7S", "QH"]);
    s = bjReducer(bjReducer(s, mv("a", { type: "bet", amount: 100 })), mv("b", { type: "bet", amount: 50 }));
    s = bjReducer(s, mv("a", { type: "stand" }));
    s = bjReducer(s, mv("b", { type: "stand" }));
    expect(s.phase).toBe("dealer");
    s = bjReducer(s, tick);
    expect(s.phase).toBe("results");
    expect(s.hands.a[0].result).toBe("win");
    expect(s.hands.b[0].result).toBe("lose");
    expect(s.players.find((p) => p.id === "a")!.chips).toBe(1100);
    expect(s.players.find((p) => p.id === "b")!.chips).toBe(950);
  });

  it("pays blackjack 3 to 2 and busts lose", () => {
    // A: A+K blackjack, B: 10+6 then hits 9 = bust, dealer 9+8.
    let s = rigged(2, ["AS", "10S", "9D", "KS", "6S", "8H", "9C"]);
    s = bjReducer(bjReducer(s, mv("a", { type: "bet", amount: 100 })), mv("b", { type: "bet", amount: 100 }));
    expect(s.turn?.id).toBe("b");
    s = bjReducer(s, mv("b", { type: "hit" }));
    expect(s.hands.b[0].cards.length).toBe(3);
    while (s.phase !== "results") s = bjReducer(s, tick);
    expect(s.hands.a[0].result).toBe("blackjack");
    expect(s.players.find((p) => p.id === "a")!.chips).toBe(1150);
    expect(s.hands.b[0].result).toBe("bust");
  });

  it("splits a pair and doubles", () => {
    // A: 8,8 split → 8+3, 8+2. Dealer 10+7.
    let s = rigged(1, ["8S", "10D", "8H", "7C", "3S", "2S", "10H"]);
    s = bjReducer(s, mv("a", { type: "bet", amount: 100 }));
    expect(toBjOnline(s).canSplit).toBe(true);
    s = bjReducer(s, mv("a", { type: "split" }));
    expect(s.hands.a.length).toBe(2);
    expect(s.players[0].chips).toBe(800);
    s = bjReducer(s, mv("a", { type: "double" }));
    expect(s.hands.a[0].bet).toBe(200);
    expect(s.turn).toEqual({ id: "a", hand: 1 });
  });

  it("rejects moves out of turn and bets below the minimum", () => {
    const s = createBlackjack(players(2), settings, 3);
    expect(bjReducer(s, mv("a", { type: "bet", amount: 5 }))).toBe(s);
    expect(bjReducer(s, mv("a", { type: "hit" }))).toBe(s);
  });

  it("refunds open bets when the host ends the game", () => {
    let s = createBlackjack(players(2), settings, 4);
    s = bjReducer(s, mv("a", { type: "bet", amount: 300 }));
    s = bjReducer(s, { type: "end" });
    expect(s.phase).toBe("over");
    expect(s.players[0].chips).toBe(1000);
  });

  it("ends after the set number of rounds", () => {
    let s: BjState = { ...createBlackjack(players(1), { ...settings, rounds: 1 }, 5) };
    s = bjReducer(s, mv("a", { type: "bet", amount: 10 }));
    for (let i = 0; i < 80 && s.phase !== "over"; i++) s = s.phase === "playing" ? bjReducer(s, mv("a", { type: "stand" })) : bjReducer(s, tick);
    expect(s.phase).toBe("over");
  });
});

describe("draw it", () => {
  const settings = { rounds: 1, drawSeconds: 60, customWords: "rocket ship, cat, dog", onlyCustom: true, hints: true };
  const start = (): DrawState => createDraw(players(3), settings, 7);

  it("offers the drawer three secret words", () => {
    const s = start();
    expect(s.phase).toBe("pick");
    expect(drawPrivate(s, "a").choices.length).toBe(3);
    expect(drawPrivate(s, "b").choices).toEqual([]);
    expect(JSON.stringify(toDrawOnline(s))).not.toContain(s.choices[0]);
  });

  it("masks the word and scores fast guessers and the drawer", () => {
    let s = start();
    const word = s.choices[0];
    s = drawReducer(s, mv("a", { type: "pick", index: 0 }));
    expect(s.phase).toBe("draw");
    expect(toDrawOnline(s).mask.join("")).not.toContain(word.slice(0, 2));
    expect(drawPrivate(s, "a").word).toBe(word);
    s = drawReducer(s, mv("b", { type: "guess", text: "nope" }));
    s = drawReducer(s, mv("b", { type: "guess", text: word.toUpperCase() }));
    expect(s.turnPoints.b).toBeGreaterThan(0);
    expect(drawPrivate(s, "b").word).toBe(word);
    s = drawReducer(s, mv("c", { type: "guess", text: word }));
    expect(s.phase).toBe("reveal");
    expect(s.turnPoints.a).toBeGreaterThan(0);
    expect(s.players.find((p) => p.id === "b")!.score).toBeGreaterThan(s.players.find((p) => p.id === "c")!.score);
    expect(toDrawOnline(s).reveal).toBe(word);
  });

  it("never lets the drawer or a solver say the word in chat", () => {
    let s = start();
    const word = s.choices[0];
    s = drawReducer(s, mv("a", { type: "pick", index: 0 }));
    const before = s.chat.length;
    s = drawReducer(s, mv("a", { type: "guess", text: `it is ${word}` }));
    expect(s.chat.length).toBe(before);
  });

  it("flags a guess one letter off as close, privately", () => {
    let s: DrawState = { ...start(), choices: ["rocket ship", "cat", "dog"] };
    s = drawReducer(s, mv("a", { type: "pick", index: 0 }));
    s = drawReducer(s, mv("b", { type: "guess", text: "rocketshp" }));
    expect(drawPrivate(s, "b").close).toBe("rocketshp");
    expect(drawPrivate(s, "c").close).toBeNull();
  });

  it("rotates drawers and ends after the rounds", () => {
    let s = start();
    for (let i = 0; i < 1000 && s.phase !== "over"; i++) s = drawReducer(s, tick);
    expect(s.phase).toBe("over");
  });

  it("reveals hints as time runs low", () => {
    let s: DrawState = { ...start(), choices: ["rocket ship", "cat", "dog"] };
    s = drawReducer(s, mv("a", { type: "pick", index: 0 }));
    for (let i = 0; i < 31; i++) s = drawReducer(s, tick);
    expect(s.hinted.length).toBe(1);
  });
});

describe("survey feud", () => {
  const settings = { maxAnswers: 6, writeSeconds: 100, guessSeconds: 20, strikes: 2 };
  const survey = (prompt: string, answers: Array<[string, number]>) => ({ type: "survey", prompt, answers: answers.map(([text, points]) => ({ text, points })) });
  const written = (): FeudState => {
    let s = createFeud(players(3), settings);
    s = feudReducer(s, mv("a", survey("Name a pet", [["dog", 40], ["cat", 30], ["fish / goldfish", 20], ["hamster", 10]])));
    s = feudReducer(s, mv("b", survey("Name a fruit", [["apple", 50], ["banana", 30], ["orange", 20]])));
    return feudReducer(s, mv("c", survey("Name a color", [["red", 50], ["blue", 30], ["green", 20]])));
  };

  it("cleans surveys: sorted, deduped, at least three answers", () => {
    expect(cleanSurvey("a", { prompt: "Name a pet", answers: [{ text: "dog", points: 5 }, { text: "cat", points: 50 }] }, 6)).toBeNull();
    const sv = cleanSurvey("a", { prompt: "Name a pet", answers: [{ text: "dog", points: 5 }, { text: "Dog", points: 9 }, { text: "cat", points: 50 }, { text: "rat", points: 7 }, { text: "x", points: 0 }] }, 6)!;
    expect(sv.answers.map((a) => a.text)).toEqual(["cat", "rat", "dog"]);
  });

  it("matches plurals, alternatives and small typos", () => {
    const answers = [
      { text: "dog", points: 1 },
      { text: "fish / goldfish", points: 1 },
      { text: "hamster", points: 1 },
    ];
    expect(matchAnswer("Dogs", answers, [false, false, false])).toBe(0);
    expect(matchAnswer("goldfish", answers, [false, false, false])).toBe(1);
    expect(matchAnswer("hamstr", answers, [false, false, false])).toBe(2);
    expect(matchAnswer("dog", answers, [true, false, false])).toBeNull();
  });

  it("starts rounds once everyone has written, hosted by the author", () => {
    const s = written();
    expect(s.phase).toBe("guess");
    const o = toFeudOnline(s);
    expect(o.host).toBe("a");
    expect(o.board.every((x) => x === null)).toBe(true);
    expect(JSON.stringify(o)).not.toContain("hamster");
    expect(feudPrivate(s, "a").answers?.length).toBe(4);
    expect(feudPrivate(s, "b").answers).toBeNull();
    expect(s.guesser).toBe("b");
  });

  it("scores a matched guess and passes the turn", () => {
    let s = written();
    s = feudReducer(s, mv("b", { type: "guess", text: "cats" }));
    expect(s.phase).toBe("show");
    expect(s.players.find((p) => p.id === "b")!.score).toBe(30);
    s = feudReducer(s, tick);
    s = feudReducer(s, tick);
    s = feudReducer(s, tick);
    expect(s.guesser).toBe("c");
  });

  it("lets the round host judge an unmatched guess", () => {
    let s = written();
    s = feudReducer(s, mv("b", { type: "guess", text: "puppy" }));
    expect(s.phase).toBe("judge");
    expect(feudReducer(s, mv("c", { type: "judge", index: 0 }))).toBe(s);
    s = feudReducer(s, mv("a", { type: "judge", index: 0 }));
    expect(s.players.find((p) => p.id === "b")!.score).toBe(40);
  });

  it("ends a round after the strikes and moves to the next survey", () => {
    let s = written();
    s = feudReducer(s, mv("b", { type: "guess", text: "zebra" }));
    s = feudReducer(s, mv("a", { type: "judge", index: -1 }));
    expect(s.strikes).toBe(1);
    for (let i = 0; i < 3; i++) s = feudReducer(s, tick);
    s = feudReducer(s, mv("c", { type: "guess", text: "lion" }));
    s = feudReducer(s, mv("a", { type: "judge", index: -1 }));
    for (let i = 0; i < 3; i++) s = feudReducer(s, tick);
    expect(s.phase).toBe("roundEnd");
    expect(toFeudOnline(s).board.every(Boolean)).toBe(true);
    for (let i = 0; i < 8; i++) s = feudReducer(s, tick);
    expect(toFeudOnline(s).host).toBe("b");
  });

  it("skips writers who never finished and ends when nobody wrote", () => {
    let s = createFeud(players(3), settings);
    for (let i = 0; i < 100; i++) s = feudReducer(s, tick);
    expect(s.phase).toBe("over");
  });
});
