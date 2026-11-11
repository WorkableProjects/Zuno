import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/game-files/schema/common";
import { eligibleIdentities, type HeadbandsFile, type HeadbandsIdentity } from "../src/game-files/schema/headbands";
import { validateGameFile, validateGameFileText } from "../src/game-files/schema/validateGameFile";
import {
  createSession,
  deckOf,
  isCorrectGuess,
  randomAssign,
  sessionReducer,
  setupProblems,
  type Rules,
  type SessionAction,
  type SessionState,
} from "../src/games/headbands/headbandsEngine";

const sampleText = readFileSync(new URL("../public/samples/everyday-things.zuno.json", import.meta.url), "utf8");
const PNG = "data:image/png;base64,iVBORw0KGgo=";

function base(identities: unknown[], settings: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    gameType: "headbands",
    metadata: { title: "Deck", description: "", author: "", coverImage: null },
    appearance: { accentColor: "#FFB454", backgroundPreset: "horizon" },
    content: { identities },
    settings: { defaultMode: "text", continueAfterYes: false, unlimitedGuesses: false, allowDuplicateAssignments: false, maxPlayers: 8, ...settings },
  };
}
const ident = (id: string, text: string, image: string | null = null, subtext: string | null = null) => ({ id, text, image, subtext });
const errorsOf = (raw: unknown) => {
  const r = validateGameFile(raw, "headbands");
  return r.ok ? [] : r.errors;
};

describe("headbands validator", () => {
  it("accepts the sample deck in both modes", () => {
    const r = validateGameFileText(sampleText, "headbands");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const file = r.file as HeadbandsFile;
    expect(eligibleIdentities(file, "text").length).toBeGreaterThanOrEqual(8);
    expect(eligibleIdentities(file, "image").length).toBeGreaterThanOrEqual(8);
  });

  it("rejects the wrong game type and schema version", () => {
    expect(validateGameFileText(sampleText, "jeopardy").ok).toBe(false);
    expect(errorsOf({ ...base([ident("a", "A"), ident("b", "B")]), schemaVersion: 2 })[0]).toMatch(/newer format/);
  });

  it("rejects missing content and empty decks", () => {
    const { content: _c, ...noContent } = base([]);
    expect(errorsOf(noContent)[0]).toMatch(/content/);
    expect(errorsOf(base([]))[0]).toMatch(/empty/);
  });

  it("needs text on every identity and at least two identities", () => {
    expect(errorsOf(base([ident("a", ""), ident("b", "B")])).join(" ")).toMatch(/Identity 1's text is missing/);
    expect(errorsOf(base([ident("a", "A")])).join(" ")).toMatch(/at least two/);
  });

  it("renames duplicate IDs with a warning", () => {
    const r = validateGameFile(base([ident("a", "A"), ident("a", "B")]), "headbands");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.file as HeadbandsFile).content.identities.map((i) => i.id)).toEqual(["a", "a-2"]);
    expect(r.warnings.join(" ")).toMatch(/duplicate/);
  });

  it("rejects unsafe or unsupported images", () => {
    expect(errorsOf(base([ident("a", "A", "javascript:alert(1)", "A"), ident("b", "B")])).join(" ")).toMatch(/image/);
    expect(errorsOf(base([ident("a", "A", "http://example.com/a.png", "A"), ident("b", "B")])).join(" ")).toMatch(/https/);
    expect(errorsOf(base([ident("a", "A", "data:text/html;base64,PGI+", "A"), ident("b", "B")])).join(" ")).toMatch(/unsupported format/);
    const huge = "data:image/png;base64," + "A".repeat(Math.ceil((LIMITS.maxImageBytes * 4) / 3) + 8);
    expect(errorsOf(base([ident("a", "A", huge, "A"), ident("b", "B")])).join(" ")).toMatch(/too large/);
  });

  it("keeps half-finished image cards out of Image Mode", () => {
    const r = validateGameFile(base([ident("a", "A", PNG, null), ident("b", "B", null, "B"), ident("c", "C", PNG, "C"), ident("d", "D", PNG, "D")]), "headbands");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(eligibleIdentities(r.file as HeadbandsFile, "image").map((i) => i.id)).toEqual(["c", "d"]);
    expect(eligibleIdentities(r.file as HeadbandsFile, "text")).toHaveLength(4);
    expect(r.warnings.join(" ")).toMatch(/half of an image card/);
  });

  it("rejects image as default mode without two image identities", () => {
    expect(errorsOf(base([ident("a", "A", PNG, "A"), ident("b", "B")], { defaultMode: "image" })).join(" ")).toMatch(/Image Mode needs at least two/);
  });

  it("checks settings types", () => {
    const errs = errorsOf(base([ident("a", "A"), ident("b", "B")], { defaultMode: "video", continueAfterYes: "yes", maxPlayers: 9 })).join(" ");
    expect(errs).toMatch(/defaultMode/);
    expect(errs).toMatch(/continueAfterYes/);
    expect(errs).toMatch(/maxPlayers/);
  });

  it("refuses script tags in text", () => {
    expect(errorsOf(base([ident("a", "<script>x</script>"), ident("b", "B")])).join(" ")).toMatch(/script/);
  });
});

const deckList: HeadbandsIdentity[] = [
  { id: "pizza", text: "Pizza", image: PNG, subtext: "Pizza slice" },
  { id: "eiffel", text: "Eiffel Tower", image: null, subtext: null },
  { id: "dog", text: "Golden Retriever", image: PNG, subtext: "Dog" },
  { id: "cat", text: "Cat", image: null, subtext: null, allowDuplicate: true },
];
const deck = deckOf(deckList);
const rules = (r: Partial<Rules> = {}): Rules => ({ continueAfterYes: false, unlimitedGuesses: false, ...r });
const run = (s: SessionState, ...actions: SessionAction[]) => actions.reduce((st, a) => sessionReducer(deck, st, a), s);
const two = (r?: Partial<Rules>) =>
  createSession(
    [
      { name: "Ana", identityId: "pizza" },
      { name: "Ben", identityId: "eiffel" },
    ],
    "text",
    rules(r),
  );

describe("headbands setup", () => {
  const check = (names: string[], ids: string[], allowDuplicates = false, mode: "text" | "image" = "text") =>
    setupProblems({ players: names.map((name, i) => ({ name, identityId: ids[i] ?? "" })), mode, deck, allowDuplicates, maxPlayers: 8 });

  it("starts with two players, refuses one", () => {
    expect(check(["A", "B"], ["pizza", "eiffel"])).toEqual([]);
    expect(check(["A"], ["pizza"]).join(" ")).toMatch(/at least 2/);
  });

  it("allows eight players when the deck is big enough", () => {
    const big = deckOf(Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, text: `X${i}`, image: null, subtext: null })));
    const ids = randomAssign(8, [...big.values()], false)!;
    expect(new Set(ids).size).toBe(8);
    expect(setupProblems({ players: ids.map((id, i) => ({ name: `P${i}`, identityId: id })), mode: "text", deck: big, allowDuplicates: false, maxPlayers: 8 })).toEqual([]);
  });

  it("explains a short deck", () => {
    expect(check(["A", "B", "C"], [], false, "image").join(" ")).toMatch(/2 usable identities for 3 players. Add 1 more/);
    expect(randomAssign(3, eligibleImage(), false)).toBeNull();
  });

  it("rejects blank names, missing and duplicate assignments", () => {
    const p = check(["A", " "], ["pizza", "pizza"]).join(" ");
    expect(p).toMatch(/no name/);
    expect(p).toMatch(/same identity/);
    expect(check(["A", "B"], ["pizza", ""]).join(" ")).toMatch(/no identity/);
  });

  it("allows duplicates only when enabled and marked", () => {
    expect(check(["A", "B"], ["cat", "cat"], true)).toEqual([]);
    expect(check(["A", "B"], ["cat", "cat"], false).join(" ")).toMatch(/same identity/);
    expect(check(["A", "B"], ["pizza", "pizza"], true).join(" ")).toMatch(/same identity/);
  });

  it("rejects text-only identities in Image Mode", () => {
    expect(check(["A", "B"], ["pizza", "eiffel"], false, "image").join(" ")).toMatch(/does not work in Image Mode/);
  });
});

function eligibleImage() {
  return deckList.filter((i) => i.image && i.subtext);
}

describe("headbands session", () => {
  it("covers the card at the start of every turn", () => {
    let s = run(two(), { type: "showCard" });
    expect(s.cardVisible).toBe(true);
    s = run(s, { type: "ask", question: "Am I food?", answer: "no" });
    expect(s.current).toBe("p2");
    expect(s.cardVisible).toBe(false);
  });

  it("passes the turn after every answer by default and keeps it on Yes when set", () => {
    expect(run(two(), { type: "ask", question: "", answer: "yes" }).current).toBe("p2");
    expect(run(two({ continueAfterYes: true }), { type: "ask", question: "", answer: "yes" }).current).toBe("p1");
    expect(run(two({ continueAfterYes: true }), { type: "ask", question: "", answer: "no" }).current).toBe("p2");
    expect(run(two(), { type: "ask", question: "", answer: "unsure" }).current).toBe("p1");
  });

  it("records question history", () => {
    const s = run(two(), { type: "ask", question: " Am I food? ", answer: "yes" });
    expect(s.history).toEqual([{ playerId: "p1", question: "Am I food?", answer: "yes", turn: 1 }]);
    expect(s.players[0].questions).toBe(1);
  });

  it("marks the right player solved on a correct guess, ignoring case and spaces", () => {
    let s = run(two(), { type: "guess", text: "  pIZZA " });
    expect(s.lastGuess?.correct).toBe(true);
    expect(s.players[0]).toMatchObject({ solved: true, solvedOrder: 1, guesses: 1 });
    expect(s.players[1].solved).toBe(false);
    s = run(s, { type: "continue" });
    expect(s.current).toBe("p2");
  });

  it("compares against the subtext in Image Mode", () => {
    expect(isCorrectGuess("Pizza slice", deckList[0], "image")).toBe(true);
    expect(isCorrectGuess("Pizza", deckList[0], "image")).toBe(false);
    expect(isCorrectGuess("Golden Retrievr", deckList[2], "text")).toBe(false);
  });

  it("never puts the answer in state after a wrong guess", () => {
    const s = run(two(), { type: "guess", text: "Burger" });
    expect(s.lastGuess).toEqual({ playerId: "p1", correct: false, guess: "Burger" });
    expect(JSON.stringify(s)).not.toMatch(/Pizza/);
  });

  it("ends the turn after a wrong guess unless guesses are unlimited", () => {
    expect(run(two(), { type: "guess", text: "Burger" }, { type: "continue" }).current).toBe("p2");
    const s = run(two({ unlimitedGuesses: true }), { type: "guess", text: "Burger" }, { type: "continue" });
    expect(s.current).toBe("p1");
    expect(s.lastGuess).toBeNull();
  });

  it("skips solved players and finishes when everyone solves", () => {
    let s = run(two(), { type: "guess", text: "pizza" }, { type: "continue" });
    s = run(s, { type: "ask", question: "", answer: "no" });
    expect(s.current).toBe("p2");
    s = run(s, { type: "guess", text: "eiffel tower" }, { type: "continue" });
    expect(s.phase).toBe("over");
    expect(s.revealed).toBe(true);
  });

  it("lets the host override and undo it", () => {
    let s = run(two(), { type: "guess", text: "Piza" }, { type: "markCorrect" });
    expect(s.players[0]).toMatchObject({ solved: true, byHost: true });
    s = run(s, { type: "undoOverride" });
    expect(s.players[0].solved).toBe(false);
    expect(s.lastGuess?.correct).toBe(false);
  });

  it("skips, reorders and removes players", () => {
    const three = createSession(
      [
        { name: "A", identityId: "pizza" },
        { name: "B", identityId: "eiffel" },
        { name: "C", identityId: "dog" },
      ],
      "text",
      rules(),
    );
    expect(run(three, { type: "skip" }).current).toBe("p2");
    expect(run(three, { type: "move", playerId: "p3", by: -1 }).order).toEqual(["p1", "p3", "p2"]);
    const s = run(three, { type: "remove", playerId: "p1" });
    expect(s.current).toBe("p2");
    expect(run(s, { type: "skip" }, { type: "skip" }).current).toBe("p2");
  });

  it("ends early without revealing, then reveals on request", () => {
    let s = run(two(), { type: "end" });
    expect(s).toMatchObject({ phase: "over", endedEarly: true, revealed: false });
    s = run(s, { type: "reveal" });
    expect(s.revealed).toBe(true);
  });

  it("restarts with the same identities", () => {
    const s = run(two(), { type: "guess", text: "pizza" }, { type: "continue" }, { type: "restart" });
    expect(s.players.every((p) => !p.solved)).toBe(true);
    expect(s.players.map((p) => p.identityId)).toEqual(["pizza", "eiffel"]);
    expect(s.current).toBe("p1");
  });

  it("pause hides the card and blocks play", () => {
    const s = run(two(), { type: "showCard" }, { type: "pause" }, { type: "ask", question: "", answer: "no" });
    expect(s.cardVisible).toBe(false);
    expect(s.current).toBe("p1");
  });
});
