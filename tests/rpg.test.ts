import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateGameFile } from "../src/game-files/schema/validateGameFile";
import { blankRpgFile, validateRpg } from "../src/game-files/schema/rpg";
import {
  MAX_DOUBLE_MISSES,
  createSession,
  isMoney,
  nextEligible,
  rpgReducer,
  settle,
  standings,
  type Choice,
  type Duel,
  type RpgAction,
  type RpgPlayer,
  type RpgState,
} from "../src/games/rpg/rpgEngine";
import { DEFAULT_ITEM_COSTS, itemInfo } from "../src/game-files/schema/rpg";
import { canStart, moveInOrder, orderedPlayers, rpgMoveToAction, rpgPrivate, toRpgOnline } from "../src/games/rpg/rpgLobby";

const ids = ["a", "b", "c", "d"];
const start = (n = 3, money = 1000, extra = {}) => createSession(ids.slice(0, n).map((id) => ({ id, name: id.toUpperCase() })), { startingMoney: money, ...extra });
const run = (s: RpgState, ...actions: RpgAction[]) => actions.reduce(rpgReducer, s);
const ticks = (s: RpgState, n: number) => run(s, ...Array.from({ length: n }, () => ({ type: "tick" }) as const));
const coins = (s: RpgState, id: string) => s.players.find((p) => p.id === id)!.coins;

/** Countdown over, A to challenge. */
const atSelect = (n = 3, money = 1000, extra = {}) => ticks(start(n, money, extra), 4);
const toBetting = (s: RpgState, target = "b", wager = 0): RpgState => run(s, { type: "challenge", by: "a", target, wager });
const toDuel = (s: RpgState) => ticks(s, s.settings.bettingSeconds);
const pickBoth = (s: RpgState, a: Choice, b: Choice, who: [string, string] = ["a", "b"]) => run(s, { type: "pick", by: who[0], choice: a }, { type: "pick", by: who[1], choice: b });
/** Plays out the result overlay so the next round (or the payout) begins. */
const overlay = (s: RpgState) => ticks(s, 3);

describe("rpg file", () => {
  const raw = () => JSON.parse(JSON.stringify(blankRpgFile())) as Record<string, any>;
  it("accepts a valid file and routes it by game type", () => {
    expect(validateGameFile(raw()).ok).toBe(true);
    expect(validateGameFile(raw(), "liar").ok).toBe(false);
  });
  it("keeps money between 100 and 1,000,000 and rejects bad settings", () => {
    for (const v of [99, 1_000_001, 10.5, "lots"]) {
      const f = raw();
      f.settings.startingMoney = v;
      expect(validateRpg(f).ok).toBe(false);
    }
    const ok = raw();
    ok.settings.startingMoney = 100;
    expect(validateRpg(ok).ok).toBe(true);
    ok.settings.startingMoney = 1_000_000;
    expect(validateRpg(ok).ok).toBe(true);
    const timers = raw();
    timers.settings.roundSeconds = 0;
    expect(validateRpg(timers).ok).toBe(false);
  });
  it("ships a valid sample file", () => {
    const text = readFileSync("public/samples/rock-paper-gamble.zuno.json", "utf8");
    expect(validateGameFile(JSON.parse(text), "rpg").ok).toBe(true);
  });
  it("defaults to 10,000 and the spec timers", () => {
    const f = blankRpgFile();
    expect(f.settings).toMatchObject({ startingMoney: 10000, selectSeconds: 15, bettingSeconds: 20, roundSeconds: 15, resultsSeconds: 8 });
  });
});

describe("validation of money", () => {
  it("only accepts whole positive numbers within the limit", () => {
    expect(isMoney(1, 10)).toBe(true);
    for (const v of [0, -5, 1.5, NaN, Infinity, "5", null, 11]) expect(isMoney(v, 10)).toBe(false);
  });
  it("rejects bad bets and leaves balances alone", () => {
    const s = toBetting(atSelect());
    for (const amount of [0, -100, 2.5, NaN, 5000]) {
      const next = run(s, { type: "bet", by: "c", target: "a", amount });
      expect(next).toBe(s);
    }
    expect(run(s, { type: "bet", by: "c", target: "zzz", amount: 10 })).toBe(s);
    expect(run(s, { type: "bet", by: "nobody", target: "a", amount: 10 })).toBe(s);
  });
  it("allows one bet per player, debited at once", () => {
    const s = run(toBetting(atSelect()), { type: "bet", by: "c", target: "a", amount: 300 });
    expect(coins(s, "c")).toBe(700);
    expect(run(s, { type: "bet", by: "c", target: "b", amount: 100 })).toBe(s);
  });
  it("rejects bad gifts and wagers", () => {
    const s = atSelect();
    for (const amount of [0, -1, 1.2, NaN, 1001]) expect(run(s, { type: "gift", by: "a", target: "b", amount })).toBe(s);
    expect(run(s, { type: "gift", by: "a", target: "a", amount: 10 })).toBe(s);
    for (const wager of [-1, 0.5, NaN, 1001]) expect(run(s, { type: "challenge", by: "a", target: "b", wager })).toBe(s);
  });
  it("lets bets, gifts and wagers up to the full balance through", () => {
    expect(coins(run(atSelect(), { type: "gift", by: "a", target: "b", amount: 1000 }), "a")).toBe(0);
    const w = toBetting(atSelect(), "b", 1000);
    expect(coins(w, "a")).toBe(0);
    expect(coins(w, "b")).toBe(0);
  });
  it("only lets the active player challenge, and only a player with money", () => {
    const s = atSelect();
    expect(run(s, { type: "challenge", by: "b", target: "c" })).toBe(s);
    expect(run(s, { type: "challenge", by: "a", target: "a" })).toBe(s);
    expect(run(s, { type: "challenge", by: "a", target: "nobody" })).toBe(s);
  });
  it("only allows gifts during challenge selection", () => {
    const s = toBetting(atSelect());
    expect(run(s, { type: "gift", by: "c", target: "a", amount: 10 })).toBe(s);
  });
});

describe("flow", () => {
  it("counts 3, 2, 1, GO and then opens the first challenge", () => {
    let s = start();
    expect(s.phase).toBe("countdown");
    expect(s.timeLeft).toBe(3);
    s = ticks(s, 3);
    expect(s.phase).toBe("countdown");
    expect(s.timeLeft).toBe(0);
    s = ticks(s, 1);
    expect(s.phase).toBe("select");
    expect(s.timeLeft).toBe(15);
    expect(s.players[s.active].id).toBe("a");
  });
  it("starts everyone on the starting money", () => {
    expect(start(4, 250).players.every((p) => p.coins === 250)).toBe(true);
  });
  it("runs betting for 20s then the first round for 15s", () => {
    let s = toBetting(atSelect());
    expect(s.phase).toBe("betting");
    expect(s.timeLeft).toBe(20);
    s = ticks(s, 19);
    expect(s.phase).toBe("betting");
    s = ticks(s, 1);
    expect(s.phase).toBe("duel");
    expect(s.timeLeft).toBe(15);
    expect(s.duel?.round).toBe(1);
  });
  it("auto-skips a challenger who runs out of time", () => {
    let s = atSelect();
    s = ticks(s, 14);
    expect(s.phase).toBe("select");
    expect(s.players[s.active].id).toBe("a");
    s = ticks(s, 1);
    expect(s.phase).toBe("select");
    expect(s.players[s.active].id).toBe("b");
    expect(s.timeLeft).toBe(15);
  });
  it("skips broke players when picking the next challenger", () => {
    const s = atSelect(4);
    const broke = { ...s, players: s.players.map((p) => (p.id === "b" ? { ...p, coins: 0 } : p)) };
    expect(nextEligible(broke.players, 0)).toBe(2);
    expect(ticks(broke, 15).players[ticks(broke, 15).active].id).toBe("c");
    expect(nextEligible(broke.players.map((p) => ({ ...p, coins: 0 })), 0)).toBe(-1);
    // A broke player cannot be challenged either.
    expect(run(broke, { type: "challenge", by: "a", target: "b" })).toBe(broke);
  });
  it("rotates the challenger after each duel and skips someone who went broke", () => {
    let s = toDuel(toBetting(atSelect(3, 1000), "b", 1000));
    // a wins 3 rounds; b loses their whole stack and is broke
    for (let i = 0; i < 3; i++) s = overlay(pickBoth(s, "rock", "scissors"));
    expect(s.phase).toBe("results");
    expect(coins(s, "a")).toBe(2000);
    expect(coins(s, "b")).toBe(0);
    s = ticks(s, 8);
    expect(s.phase).toBe("select");
    // a challenged, then b would be next but is broke, so c is up.
    expect(s.players[s.active].id).toBe("c");
    expect(s.match).toBe(2);
  });
  it("lets a gift bring a broke player back", () => {
    let s = atSelect(3);
    s = { ...s, players: s.players.map((p) => (p.id === "b" ? { ...p, coins: 0 } : p)) };
    s = run(s, { type: "gift", by: "c", target: "b", amount: 100 });
    expect(coins(s, "b")).toBe(100);
    expect(coins(s, "c")).toBe(900);
  });
});

describe("round rules", () => {
  const duelState = () => toDuel(toBetting(atSelect()));
  it("scores a win and holds picks back until both are in", () => {
    let s = run(duelState(), { type: "pick", by: "a", choice: "rock" });
    expect(s.duel?.last).toBeNull();
    expect(toRpgOnline(s).duel?.picked).toEqual(["a"]);
    expect(JSON.stringify(toRpgOnline(s))).not.toContain("rock");
    s = run(s, { type: "pick", by: "b", choice: "scissors" });
    expect(s.duel?.score.a).toBe(1);
    expect(s.duel?.last?.winner).toBe("a");
    expect(s.duel?.overlay).toBe(3);
  });
  it("ignores spectators, unknown choices and a second pick", () => {
    const s = duelState();
    expect(run(s, { type: "pick", by: "c", choice: "rock" })).toBe(s);
    expect(run(s, { type: "pick", by: "a", choice: "dynamite" as Choice })).toBe(s);
    const once = run(s, { type: "pick", by: "a", choice: "rock" });
    expect(run(once, { type: "pick", by: "a", choice: "paper" })).toBe(once);
  });
  it("replays a tie without scoring", () => {
    let s = pickBoth(duelState(), "paper", "paper");
    expect(s.duel?.last?.winner).toBeNull();
    expect(s.duel?.score).toEqual({ a: 0, b: 0 });
    s = overlay(s);
    expect(s.phase).toBe("duel");
    expect(s.duel?.round).toBe(2);
    expect(s.duel?.picks).toEqual({});
    expect(s.timeLeft).toBe(15);
  });
  it("gives the round to the player who picked when the other runs out of time", () => {
    let s = run(duelState(), { type: "pick", by: "b", choice: "paper" });
    s = ticks(s, 15);
    expect(s.duel?.last?.winner).toBe("b");
    expect(s.duel?.last?.reason).toBe("miss");
    expect(s.duel?.score.b).toBe(1);
    // The pick that was made is revealed once the round closes.
    expect(s.duel?.last?.picks).toEqual({ a: null, b: "paper" });
  });
  it("calls it a tie when both miss", () => {
    const s = ticks(duelState(), 15);
    expect(s.duel?.last?.winner).toBeNull();
    expect(s.duel?.last?.reason).toBe("bothMiss");
    expect(s.duel?.score).toEqual({ a: 0, b: 0 });
    expect(s.duel?.doubleMisses).toBe(1);
  });
  it("resets the double-miss streak when someone picks", () => {
    let s = overlay(ticks(duelState(), 15));
    s = overlay(ticks(s, 15));
    expect(s.duel?.doubleMisses).toBe(2);
    s = overlay(pickBoth(s, "rock", "rock"));
    expect(s.duel?.doubleMisses).toBe(0);
  });
  it("voids the duel after three double misses in a row and refunds every stake", () => {
    let s = toBetting(atSelect(3, 1000), "b", 200);
    s = run(s, { type: "bet", by: "c", target: "a", amount: 300 }, { type: "bet", by: "a", target: "b", amount: 50 });
    expect(coins(s, "a")).toBe(750);
    s = toDuel(s);
    for (let i = 0; i < MAX_DOUBLE_MISSES; i++) {
      expect(s.phase).toBe("duel");
      s = ticks(s, 15);
      if (i < MAX_DOUBLE_MISSES - 1) s = overlay(s);
    }
    expect(s.phase).toBe("results");
    expect(s.result?.void).toBe(true);
    expect(s.players.map((p) => p.coins)).toEqual([1000, 1000, 1000]);
  });
  it("lets only a clean tie-free score of three end the duel", () => {
    let s = duelState();
    s = overlay(pickBoth(s, "rock", "scissors"));
    s = overlay(pickBoth(s, "rock", "rock"));
    s = overlay(pickBoth(s, "scissors", "rock", ["a", "b"]));
    s = overlay(pickBoth(s, "paper", "rock"));
    expect(s.phase).toBe("duel");
    expect(s.duel?.score).toEqual({ a: 2, b: 1 });
    s = overlay(pickBoth(s, "paper", "rock"));
    expect(s.phase).toBe("results");
    expect(s.result?.winner).toBe("a");
  });
});

describe("payout", () => {
  const players = (): RpgPlayer[] => ["a", "b", "c", "d"].map((id) => ({ id, name: id, coins: 1000 }));
  const duel = (stakes: Duel["stakes"]): Duel => ({ challenger: "a", challengee: "b", wager: 0, stakes, score: { a: 3, b: 0 }, round: 3, picks: {}, last: null, overlay: 0, doubleMisses: 0, mines: [], intercepts: [], itemDelta: {} });

  it("gives the winner the whole pool and backers of the winner twice their stake", () => {
    // stakes were already taken from balances when they were placed
    const stakes: Duel["stakes"] = [
      { by: "a", target: "a", amount: 100, kind: "wager" },
      { by: "b", target: "b", amount: 100, kind: "wager" },
      { by: "c", target: "a", amount: 200, kind: "bet" },
      { by: "d", target: "b", amount: 50, kind: "bet" },
    ];
    const held = players().map((p) => ({ ...p, coins: p.coins - stakes.filter((x) => x.by === p.id).reduce((n, x) => n + x.amount, 0) }));
    const { players: after, settlement } = settle(held, duel(stakes), "a");
    const bal = Object.fromEntries(after.map((p) => [p.id, p.coins]));
    expect(settlement.pool).toBe(450);
    // a: 900 + 450. b: 900 (lost the wager). c: 800 + 2x200 (backed the winner). d: 950 (lost the bet).
    expect(bal).toEqual({ a: 1350, b: 900, c: 1200, d: 950 });
    expect(settlement.delta).toEqual({ a: 350, b: -100, c: 200, d: -50 });
    expect(settlement.backers).toEqual(["c"]);
    expect(settlement.loser).toBe("b");
  });
  it("lets a duelist's own bets feed the pool without a double payout", () => {
    const stakes: Duel["stakes"] = [{ by: "a", target: "a", amount: 100, kind: "bet" }];
    const { players: after } = settle(players().map((p) => (p.id === "a" ? { ...p, coins: 900 } : p)), duel(stakes), "a");
    expect(after.find((p) => p.id === "a")!.coins).toBe(1000);
  });
  it("pays nothing extra when nobody staked", () => {
    const { players: after, settlement } = settle(players(), duel([]), "b");
    expect(after.map((p) => p.coins)).toEqual([1000, 1000, 1000, 1000]);
    expect(settlement.pool).toBe(0);
  });
  it("pays out through the reducer with a wager and a backer", () => {
    let s = toBetting(atSelect(3, 1000), "b", 100);
    s = run(s, { type: "bet", by: "c", target: "a", amount: 200 });
    s = toDuel(s);
    for (let i = 0; i < 3; i++) s = overlay(pickBoth(s, "paper", "rock"));
    expect(s.phase).toBe("results");
    expect(coins(s, "a")).toBe(900 + 400);
    expect(coins(s, "b")).toBe(900);
    expect(coins(s, "c")).toBe(800 + 400);
    expect(s.log[0]).toContain("won the duel");
  });
});

describe("game end", () => {
  it("ends when only one player has money, and ranks by balance", () => {
    let s = toDuel(toBetting(atSelect(2, 500), "b", 500));
    for (let i = 0; i < 3; i++) s = overlay(pickBoth(s, "rock", "scissors"));
    expect(s.phase).toBe("results");
    s = ticks(s, 8);
    expect(s.phase).toBe("over");
    expect(s.endedEarly).toBe(false);
    expect(standings(s).map((p) => [p.id, p.coins])).toEqual([
      ["a", 1000],
      ["b", 0],
    ]);
  });
  it("lets the host end the game and refunds a duel in progress", () => {
    let s = run(toBetting(atSelect(3, 1000), "b", 100), { type: "bet", by: "c", target: "a", amount: 300 });
    expect(coins(s, "c")).toBe(700);
    s = run(s, { type: "endGame" });
    expect(s.phase).toBe("over");
    expect(s.endedEarly).toBe(true);
    expect(s.players.map((p) => p.coins)).toEqual([1000, 1000, 1000]);
    expect(run(s, { type: "tick" })).toBe(s);
  });
  it("breaks standings ties by turn order and counts players who left", () => {
    const s = run(start(3), { type: "removePlayer", id: "a" });
    expect(standings(s).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(nextEligible(s.players, -1)).toBe(1);
  });
  it("ends at the start of a turn when everyone else has left", () => {
    let s = atSelect(3);
    s = run(s, { type: "removePlayer", id: "b" }, { type: "removePlayer", id: "c" });
    s = ticks(s, 15);
    expect(s.phase).toBe("over");
  });
});

describe("messages from phones", () => {
  it("takes the sender from the inbox, never from the message", () => {
    expect(rpgMoveToAction({ type: "pick", choice: "rock", by: "someoneElse" }, "me")).toEqual({ type: "pick", by: "me", choice: "rock" });
    expect(rpgMoveToAction({ type: "bet", target: "x", amount: 5 }, "me")).toEqual({ type: "bet", by: "me", target: "x", amount: 5 });
    expect(rpgMoveToAction({ type: "challenge", target: "x" }, "me")).toEqual({ type: "challenge", by: "me", target: "x", wager: 0 });
  });
  it("drops malformed moves", () => {
    for (const m of [null, 5, {}, { type: "pick", choice: "fire" }, { type: "bet", amount: 5 }, { type: "teleport", target: "x" }]) expect(rpgMoveToAction(m, "me")).toBeNull();
  });
  it("spoofed sender fields cannot act as someone else in the engine", () => {
    const s = toDuel(toBetting(atSelect()));
    const action = rpgMoveToAction({ type: "pick", choice: "rock", by: "a" }, "c")!;
    expect(rpgReducer(s, action)).toBe(s);
  });
});

describe("lobby helpers", () => {
  const lp = (joinedAt: number, ready = false) => ({ name: "x", joinedAt, avatar: null, ready });
  it("orders by the host's order and appends newcomers", () => {
    const lobby = { players: { a: lp(1), b: lp(2), c: lp(3) }, order: ["c", "zzz", "a"] };
    expect(orderedPlayers(lobby).map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(moveInOrder(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });
  it("needs two players and everyone but the host ready", () => {
    expect(canStart([{ id: "h", ready: false }], "h")).toBe(false);
    expect(canStart([{ id: "h", ready: false }, { id: "p", ready: false }], "h")).toBe(false);
    expect(canStart([{ id: "h", ready: false }, { id: "p", ready: true }], "h")).toBe(true);
    expect(canStart([{ id: "p", ready: true }, { id: "q", ready: true }], "h")).toBe(false);
  });
});

describe("items", () => {
  const rich = (n = 4) => atSelect(n, 10000);
  const buy = (s: RpgState, by: string, item: "bomb" | "nuke" | "landmine" | "interceptor") => run(s, { type: "buy", by, item });
  const withCoins = (s: RpgState, c: Record<string, number>): RpgState => ({ ...s, players: s.players.map((p) => ({ ...p, coins: c[p.id] ?? p.coins })) });

  describe("shop", () => {
    it("debits at once and holds one of each", () => {
      const s = buy(rich(), "b", "bomb");
      expect(coins(s, "b")).toBe(7000);
      expect(s.inventory.b).toEqual(["bomb"]);
      expect(buy(s, "b", "bomb")).toBe(s);
      expect(toRpgOnline(s).itemCounts.b).toBe(1);
      expect(JSON.stringify(toRpgOnline(s))).not.toContain('"inventory"');
    });
    it("rejects when it cannot be afforded, wrong phase, broke, off", () => {
      const s = rich();
      expect(buy(withCoins(s, { b: 2999 }), "b", "bomb").inventory.b).toBeUndefined();
      expect(buy(withCoins(s, { b: 0 }), "b", "landmine").inventory.b).toBeUndefined();
      expect(buy(toBetting(s), "c", "landmine").inventory.c).toBeUndefined();
      expect(buy(atSelect(3, 10000, { items: false }), "b", "landmine").inventory.b).toBeUndefined();
    });
    it("never leaves the buyer broke: cost must be below the balance", () => {
      const s = rich();
      expect(buy(withCoins(s, { b: 500 }), "b", "landmine").inventory.b).toBeUndefined();
      const ok = buy(withCoins(s, { b: 501 }), "b", "landmine");
      expect(coins(ok, "b")).toBe(1);
    });
    it("rejects Landmine and Interceptor below 3 active players", () => {
      const two = atSelect(2, 10000);
      expect(buy(two, "b", "landmine").inventory.b).toBeUndefined();
      expect(buy(two, "b", "interceptor").inventory.b).toBeUndefined();
      expect(buy(two, "b", "bomb").inventory.b).toEqual(["bomb"]);
      const three = withCoins(rich(4), { c: 0, d: 0 });
      expect(buy(three, "b", "landmine").inventory.b).toBeUndefined();
      expect(buy(atSelect(3, 10000), "b", "interceptor").inventory.b).toEqual(["interceptor"]);
    });
    it("honours per-item cost overrides", () => {
      const s = buy(atSelect(3, 10000, { itemCosts: { ...DEFAULT_ITEM_COSTS, landmine: 100 } }), "b", "landmine");
      expect(coins(s, "b")).toBe(9900);
    });
    it("describes items from the room's costs", () => {
      expect(itemInfo("nuke", { ...DEFAULT_ITEM_COSTS, nuke: 12000 }).lines.join(" ")).toContain("$12,000");
    });
  });

  describe("atomic bomb", () => {
    const armed = (wire = 1) => {
      let s = withCoins(buy(rich(4), "a", "bomb"), { a: 7000, b: 1000, c: 2000, d: 4000 });
      s = run(s, { type: "useBomb", by: "a", target: "b", wire });
      return s;
    };
    it("starts a 10 second defuse and hides the wire", () => {
      const s = armed();
      expect(s.phase).toBe("bomb");
      expect(s.timeLeft).toBe(10);
      expect(s.inventory.a).toEqual([]);
      expect(JSON.stringify(toRpgOnline(s))).not.toContain('"wire"');
    });
    it("is defused by the right wire", () => {
      const s = run(armed(1), { type: "cutWire", by: "b", wire: 1 });
      expect(s.phase).toBe("select");
      expect(s.timeLeft).toBe(15);
      expect(s.active).toBe(0);
      expect(coins(s, "b")).toBe(1000);
      expect(coins(s, "a")).toBe(7000);
    });
    it("detonates on a wrong wire: 90% target, 30% next in order, 10% others", () => {
      const s = run(armed(1), { type: "cutWire", by: "b", wire: 0 });
      expect(coins(s, "b")).toBe(100);
      expect(coins(s, "c")).toBe(1400);
      expect(coins(s, "d")).toBe(3600);
      expect(coins(s, "a")).toBe(7000 + 900 + 600 + 400);
      expect(s.phase).toBe("select");
      expect(s.active).toBe(0);
    });
    it("detonates on timeout and skips broke players for the 30%", () => {
      let s = armed(2);
      s = withCoins(s, { c: 0 });
      s = ticks(s, 10);
      expect(s.phase).toBe("select");
      expect(coins(s, "b")).toBe(100);
      expect(coins(s, "d")).toBe(4000 - 1200);
    });
    it("floors partial coins and only the target can cut", () => {
      let s = withCoins(buy(rich(3), "a", "bomb"), { a: 7000, b: 19, c: 9 });
      s = run(s, { type: "useBomb", by: "a", target: "b", wire: 0 });
      expect(run(s, { type: "cutWire", by: "c", wire: 0 })).toBe(s);
      expect(run(s, { type: "cutWire", by: "b", wire: 7 })).toBe(s);
      s = run(s, { type: "cutWire", by: "b", wire: 2 });
      expect(coins(s, "b")).toBe(2);
      expect(coins(s, "c")).toBe(9 - 2);
    });
    it("rejects bad use", () => {
      const s = buy(rich(), "a", "bomb");
      expect(run(s, { type: "useBomb", by: "a", target: "a" })).toBe(s);
      expect(run(s, { type: "useBomb", by: "a", target: "zzz" })).toBe(s);
      expect(run(s, { type: "useBomb", by: "b", target: "c" })).toBe(s);
      expect(run(withCoins(s, { b: 0 }), { type: "useBomb", by: "a", target: "b" }).phase).toBe("select");
      expect(run(toBetting(s), { type: "useBomb", by: "a", target: "c" }).phase).toBe("betting");
    });
    it("fizzles if the target leaves", () => {
      const s = run(armed(), { type: "removePlayer", id: "b" });
      expect(s.phase).toBe("select");
      expect(coins(s, "a")).toBe(7000);
    });
  });

  describe("nuke", () => {
    const launched = () => {
      const s = withCoins(buy(rich(4), "a", "nuke"), { a: 2000, b: 4000, c: 1000, d: 3000 });
      return run(s, { type: "useNuke", by: "a" });
    };
    it("opens a 15 second vote", () => {
      const s = launched();
      expect(s.phase).toBe("nukeVote");
      expect(s.timeLeft).toBe(15);
    });
    it("fizzles on strictly more Block and refunds 50%", () => {
      const s = run(launched(), { type: "vote", by: "b", vote: "block" }, { type: "vote", by: "c", vote: "block" }, { type: "vote", by: "d", vote: "allow" });
      expect(s.phase).toBe("select");
      expect(coins(s, "a")).toBe(2000 + 4000);
    });
    it("proceeds on a tie, and silence counts as Allow", () => {
      let s = run(launched(), { type: "vote", by: "b", vote: "block" }, { type: "vote", by: "c", vote: "allow" });
      s = ticks(s, 15);
      expect(s.phase).toBe("nukeDuel");
      expect(s.nuke?.target).toBe("b");
      let s2 = run(launched(), { type: "vote", by: "b", vote: "block" });
      s2 = ticks(s2, 15);
      expect(s2.phase).toBe("nukeDuel");
    });
    it("ignores repeat votes and non-voters", () => {
      const s = run(launched(), { type: "vote", by: "b", vote: "block" });
      expect(run(s, { type: "vote", by: "b", vote: "allow" })).toBe(s);
      expect(run(s, { type: "vote", by: "a", vote: "block" })).toBe(s);
    });
    const duel = () => ticks(launched(), 15);
    it("Impact: winner takes 25% from everyone", () => {
      const s = run(duel(), { type: "pick", by: "a", choice: "rock" }, { type: "pick", by: "b", choice: "scissors" });
      expect(s.phase).toBe("select");
      expect(coins(s, "b")).toBe(3000);
      expect(coins(s, "c")).toBe(750);
      expect(coins(s, "d")).toBe(2250);
      expect(coins(s, "a")).toBe(2000 + 1000 + 250 + 750);
    });
    it("Backfire: user loses 75%, split evenly among the others", () => {
      const s = run(duel(), { type: "pick", by: "a", choice: "rock" }, { type: "pick", by: "b", choice: "paper" });
      expect(coins(s, "a")).toBe(500);
      expect(coins(s, "b")).toBe(4500);
      expect(coins(s, "c")).toBe(1500);
      expect(coins(s, "d")).toBe(3500);
    });
    it("replays ties and backfires after 3", () => {
      let s = duel();
      for (let i = 0; i < 2; i++) {
        s = run(s, { type: "pick", by: "a", choice: "rock" }, { type: "pick", by: "b", choice: "rock" });
        expect(s.phase).toBe("nukeDuel");
        expect(s.nuke?.ties).toBe(i + 1);
      }
      s = run(s, { type: "pick", by: "a", choice: "rock" }, { type: "pick", by: "b", choice: "rock" });
      expect(s.phase).toBe("select");
      expect(coins(s, "a")).toBe(500);
    });
    it("a missed pick loses the round", () => {
      const s = ticks(run(duel(), { type: "pick", by: "a", choice: "rock" }), 15);
      expect(coins(s, "a")).toBeGreaterThan(2000);
    });
    it("fizzles when the duel target leaves mid-duel", () => {
      let s = withCoins(buy(rich(4), "a", "nuke"), { a: 2000, b: 4000, c: 1000, d: 3000 });
      s = run(s, { type: "useNuke", by: "a" }, { type: "vote", by: "b", vote: "allow" }, { type: "vote", by: "c", vote: "allow" }, { type: "vote", by: "d", vote: "allow" });
      expect(s.phase).toBe("nukeDuel");
      s = run(s, { type: "removePlayer", id: "b" });
      expect(s.phase).toBe("select");
      expect(s.nuke).toBeNull();
    });
    it("rejects bad use and non-duelist picks", () => {
      const s = buy(rich(), "a", "nuke");
      expect(run(toBetting(s), { type: "useNuke", by: "a" }).phase).toBe("betting");
      expect(run(s, { type: "useNuke", by: "b" })).toBe(s);
      const d = duel();
      expect(run(d, { type: "pick", by: "c", choice: "rock" })).toBe(d);
    });
  });

  describe("landmine", () => {
    const mined = (symbol: Choice = "rock") => {
      let s = withCoins(buy(rich(4), "c", "landmine"), {});
      s = toBetting(s);
      return run(s, { type: "useMine", by: "c", symbol });
    };
    it("pays 250 from each duelist when both throw its symbol, once", () => {
      let s = toDuel(mined("rock"));
      const before = coins(s, "c");
      s = pickBoth(s, "rock", "rock");
      expect(coins(s, "c")).toBe(before + 500);
      expect(coins(s, "a")).toBe(9750);
      s = overlay(s);
      s = pickBoth(s, "rock", "rock");
      expect(coins(s, "c")).toBe(before + 500);
    });
    it("does not trigger on a different symbol", () => {
      const s = pickBoth(toDuel(mined("paper")), "rock", "rock");
      expect(coins(s, "c")).toBe(9500);
    });
    it("caps at the duelist's balance", () => {
      let s = withCoins(mined("rock"), { a: 100 });
      s = pickBoth(toDuel(s), "rock", "rock");
      expect(coins(s, "a")).toBe(0);
      expect(coins(s, "c")).toBe(9500 + 100 + 250);
    });
    it("tracks several mines separately", () => {
      let s = buy(buy(rich(4), "c", "landmine"), "d", "landmine");
      s = toBetting(s);
      s = run(s, { type: "useMine", by: "c", symbol: "rock" }, { type: "useMine", by: "d", symbol: "paper" });
      s = pickBoth(toDuel(s), "paper", "paper");
      expect(coins(s, "d")).toBe(9500 + 500);
      expect(coins(s, "c")).toBe(9500);
    });
    it("hides the symbol", () => {
      const s = mined("scissors");
      expect(JSON.stringify(toRpgOnline(s))).not.toContain("scissors");
      expect(rpgPrivate(s, "c").mine).toBe("scissors");
      expect(rpgPrivate(s, "d").mine).toBeNull();
    });
    it("rejects duelists, wrong phase, duplicates and missing item", () => {
      const s = toBetting(buy(buy(rich(), "a", "landmine"), "c", "landmine"));
      expect(run(s, { type: "useMine", by: "a", symbol: "rock" })).toBe(s);
      expect(run(s, { type: "useMine", by: "b", symbol: "rock" })).toBe(s);
      expect(run(s, { type: "useMine", by: "d", symbol: "rock" })).toBe(s);
      expect(run(s, { type: "useMine", by: "c", symbol: "fire" as Choice })).toBe(s);
      const placed = run(s, { type: "useMine", by: "c", symbol: "rock" });
      expect(run(placed, { type: "useMine", by: "c", symbol: "paper" })).toBe(placed);
      const sel = buy(rich(), "c", "landmine");
      expect(run(sel, { type: "useMine", by: "c", symbol: "rock" })).toBe(sel);
    });
  });

  describe("interceptor", () => {
    const finish = (s: RpgState, aWins: boolean) => {
      s = toDuel(s);
      for (let i = 0; i < 3; i++) s = overlay(aWins ? pickBoth(s, "rock", "scissors") : pickBoth(s, "scissors", "rock"));
      return s;
    };
    const setup = (call: string, wager = 0) => {
      let s = buy(rich(4), "c", "interceptor");
      s = toBetting(s, "b", wager);
      return run(s, { type: "useIntercept", by: "c", winner: call });
    };
    it("steals max(2x wager, 200) on a correct call", () => {
      let s = finish(setup("a"), true);
      expect(s.phase).toBe("results");
      expect(coins(s, "c")).toBe(8500 + 200);
      expect(coins(s, "b")).toBe(9800);
      s = finish(setup("a", 500), true);
      expect(coins(s, "c")).toBe(8500 + 1000);
    });
    it("caps at the loser's balance", () => {
      const s = finish(withCoins(setup("a", 100), { b: 0 }), true);
      expect(coins(s, "b")).toBe(0);
      expect(coins(s, "c")).toBe(8500 + 0);
    });
    it("pays 200 to the winner on a wrong call, capped at balance", () => {
      let s = finish(setup("b"), true);
      expect(coins(s, "c")).toBe(8300);
      expect(coins(s, "a")).toBe(10200);
      s = finish(withCoins(setup("b"), { c: 50 }), true);
      expect(coins(s, "c")).toBe(0);
    });
    it("shows the settlement in the results delta and hides the pick", () => {
      expect(JSON.stringify(toRpgOnline(setup("a")))).not.toContain('"intercept"');
      expect(finish(setup("a"), true).result?.delta.c).toBe(200);
    });
    it("rejects duelists, duplicates, bad winner", () => {
      const s = toBetting(buy(buy(rich(), "a", "interceptor"), "c", "interceptor"));
      expect(run(s, { type: "useIntercept", by: "a", winner: "a" })).toBe(s);
      expect(run(s, { type: "useIntercept", by: "c", winner: "d" })).toBe(s);
      const placed = run(s, { type: "useIntercept", by: "c", winner: "a" });
      expect(run(placed, { type: "useIntercept", by: "c", winner: "b" })).toBe(placed);
    });
  });

  it("refunds Landmine and Interceptor costs when the duel is void", () => {
    let s = buy(buy(rich(4), "c", "landmine"), "d", "interceptor");
    s = toBetting(s);
    s = run(s, { type: "useMine", by: "c", symbol: "rock" }, { type: "useIntercept", by: "d", winner: "a" });
    expect(coins(s, "c")).toBe(9500);
    s = toDuel(s);
    for (let i = 0; i < 3; i++) s = ticks(s, 15 + 3);
    expect(s.result?.void).toBe(true);
    expect(coins(s, "c")).toBe(10000);
    expect(coins(s, "d")).toBe(10000);
  });

  it("phone moves map to actions with the sender from the inbox", () => {
    expect(rpgMoveToAction({ type: "buy", item: "bomb", by: "x" }, "me")).toEqual({ type: "buy", by: "me", item: "bomb" });
    expect(rpgMoveToAction({ type: "buy", item: "gun" }, "me")).toBeNull();
    const b = rpgMoveToAction({ type: "bomb", target: "t", wire: 0 }, "me");
    expect(b).toMatchObject({ type: "useBomb", by: "me", target: "t" });
    expect(rpgMoveToAction({ type: "vote", vote: "maybe" }, "me")).toBeNull();
    expect(rpgMoveToAction({ type: "mine", choice: "rock" }, "me")).toEqual({ type: "useMine", by: "me", symbol: "rock" });
  });

  it("validates item settings in files", () => {
    const f = JSON.parse(JSON.stringify(blankRpgFile())) as Record<string, any>;
    f.settings.itemCosts = { bomb: 1 };
    expect(validateRpg(f).ok).toBe(false);
    f.settings.itemCosts = { bomb: 4000 };
    f.settings.items = false;
    const r = validateRpg(f);
    expect(r.ok && r.file.settings.items).toBe(false);
    expect(r.ok && r.file.settings.itemCosts.nuke).toBe(8000);
  });
});

describe("new items", () => {
  const rich = (n = 4) => atSelect(n, 10000);
  const give = (s: RpgState, id: string, items: RpgState["inventory"][string]): RpgState => ({ ...s, inventory: { ...s.inventory, [id]: items } });

  it("Pickpocket steals 15% of the target", () => {
    const s = run(give(rich(), "b", ["pickpocket"]), { type: "usePickpocket", by: "b", target: "c" });
    expect(coins(s, "c")).toBe(8500);
    expect(coins(s, "b")).toBe(11500);
    expect(s.inventory.b).toEqual([]);
    expect(s.event?.kind).toBe("pickpocket");
  });
  it("Shield blocks a Pickpocket and both are spent", () => {
    const s = run(give(give(rich(), "b", ["pickpocket"]), "c", ["shield"]), { type: "usePickpocket", by: "b", target: "c" });
    expect(coins(s, "c")).toBe(10000);
    expect(s.inventory.b).toEqual([]);
    expect(s.inventory.c).toEqual([]);
  });
  it("Shield blocks a bomb detonation", () => {
    let s = run(give(give(rich(), "a", ["bomb"]), "b", ["shield"]), { type: "useBomb", by: "a", target: "b", wire: 0 });
    s = run(s, { type: "cutWire", by: "b", wire: 1 });
    expect(coins(s, "b")).toBe(10000);
    expect(coins(s, "c")).toBe(7000);
    expect(s.inventory.b).toEqual([]);
  });
  it("Insurance refunds half the wager to the loser", () => {
    let s = give(rich(), "b", ["insurance"]);
    s = ticks(toBetting(s, "b", 1000), 20);
    for (let r = 0; r < 3; r++) {
      s = run(s, { type: "pick", by: "a", choice: "rock" }, { type: "pick", by: "b", choice: "scissors" });
      s = ticks(s, 3);
    }
    expect(s.phase).toBe("results");
    expect(coins(s, "b")).toBe(9500);
    expect(s.inventory.b).toEqual([]);
  });
  it("maps the pickpocket move", () => {
    expect(rpgMoveToAction({ type: "pickpocket", target: "c" }, "me")).toEqual({ type: "usePickpocket", by: "me", target: "c" });
  });
});
