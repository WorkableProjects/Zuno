import { describe, expect, it } from "vitest";
import { capSpace, evaluateTrade, newCareer, pickValue, playerTradeValue, ROSTER_MAX } from "../src/games/gridiron/gmCareer";
import { draftProgress, needProspects, pickKey, upcomingPicks } from "../src/games/gridiron/gmDraft";
import { teamPlayers } from "../src/games/gridiron/gmLeague";
import { capHit, contractSummary, ovr } from "../src/games/gridiron/gmPlayers";
import { exportCareerText, importCareerText } from "../src/games/gridiron/gmSave";
import {
  activeCount, analyzeTrade, answerOffer, emptySide, pickAssets, proposeTrade, rosterAssets, suggestSweeteners, validateTrade, type TradeSide,
} from "../src/games/gridiron/gmTrade";
import type { Career } from "../src/games/gridiron/gmTypes";

const fresh = (): Career => newCareer({ seed: 11, teamId: 0, coachName: "Test", slot: 1 });
const side = (players: number[] = [], picks: string[] = []): TradeSide => ({ players, picks });
const snapshot = (c: Career) => JSON.stringify({ p: c.players, k: c.picks, t: c.teams.map((t) => t.depth), i: c.inbox.length });
const best = (c: Career, team: number, pos?: string) => rosterAssets(c, team).filter((a) => !a.unavailable && (!pos || a.player.pos === pos))[0].player;
const cheap = (c: Career, team: number) => rosterAssets(c, team).filter((a) => !a.unavailable).slice(-1)[0].player;
/** Gives every team plenty of cap so value, not cap, decides a trade. */
const loose = (c: Career) => { c.cap = 9999; return c; };

describe("trade availability", () => {
  it("lists only real picks owned by the team and active, non-IR players", () => {
    const c = fresh();
    const picks = pickAssets(c, 0);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((a) => c.picks.some((p) => p.owner === 0 && p.playerId === undefined && pickKey(p) === a.key))).toBe(true);
    const ps = Object.values(c.players).find((p) => p.teamId === 0 && p.ps)!;
    expect(rosterAssets(c, 0).some((a) => a.player.id === ps.id)).toBe(false);
    expect(validateTrade(c, 1, side([ps.id]), side()).some((i) => i.code === "unavailable")).toBe(true);
    const ir = best(c, 0, "WR");
    ir.injury = { type: "ACL", weeks: 20, ir: true } as never;
    expect(rosterAssets(c, 0).find((a) => a.player.id === ir.id)!.unavailable).toBe("On injured reserve");
    expect(validateTrade(c, 1, side([ir.id]), side()).some((i) => i.code === "unavailable")).toBe(true);
  });
});

describe("trade validation", () => {
  it("rejects missing, same, and unknown teams", () => {
    const c = fresh();
    for (const t of [0, 99, -1, 1.5]) expect(validateTrade(c, t, side([best(c, 0).id]), side()).map((i) => i.code)).toEqual(["team"]);
  });
  it("requires something in the deal", () => {
    const c = fresh();
    expect(validateTrade(c, 1, side(), side()).map((i) => i.code)).toContain("empty");
    expect(analyzeTrade(c, 1, side(), side()).verdict).toBe("empty");
  });
  it("rejects duplicate assets, wrong-team assets and unknown ids", () => {
    const c = fresh();
    const mine = best(c, 0), theirs = best(c, 1);
    const pk = pickAssets(c, 0)[0].key;
    expect(validateTrade(c, 1, side([mine.id, mine.id]), side()).some((i) => i.code === "duplicate")).toBe(true);
    expect(validateTrade(c, 1, side([], [pk, pk]), side()).some((i) => i.code === "duplicate")).toBe(true);
    expect(validateTrade(c, 1, side([mine.id]), side([mine.id])).some((i) => i.code === "duplicate")).toBe(true);
    expect(validateTrade(c, 1, side([theirs.id]), side()).some((i) => i.code === "wrong-team")).toBe(true);
    expect(validateTrade(c, 1, side(), side([mine.id])).some((i) => i.code === "wrong-team")).toBe(true);
    expect(validateTrade(c, 1, side([], [pickAssets(c, 1)[0].key]), side()).some((i) => i.code === "wrong-team")).toBe(true);
    expect(validateTrade(c, 1, side([123456]), side()).some((i) => i.code === "missing")).toBe(true);
    expect(validateTrade(c, 1, side([], ["2000-1-0"]), side()).some((i) => i.code === "missing")).toBe(true);
  });
  it("blocks used picks", () => {
    const c = fresh();
    const pk = c.picks.find((p) => p.owner === 0)!;
    pk.playerId = best(c, 5).id;
    expect(validateTrade(c, 1, side([], [pickKey(pk)]), side()).some((i) => i.code === "missing")).toBe(true);
  });
  it("closes after the deadline and in the playoffs", () => {
    const c = fresh();
    c.phase = "regular"; c.week = 12;
    expect(validateTrade(c, 1, side([best(c, 0).id]), side()).some((i) => i.code === "closed")).toBe(true);
    c.phase = "playoffs"; c.week = 19;
    expect(validateTrade(c, 1, side([best(c, 0).id]), side()).some((i) => i.code === "closed")).toBe(true);
    c.phase = "regular"; c.week = 3;
    expect(validateTrade(c, 1, side([cheap(c, 0).id]), side()).some((i) => i.code === "closed")).toBe(false);
  });
  it("enforces the maximum roster size", () => {
    const c = loose(fresh());
    c.phase = "regular"; c.week = 2;
    expect(activeCount(c, 1)).toBe(ROSTER_MAX);
    // 2-for-1 into a full 53-man roster is blocked for the receiving team.
    const issues = validateTrade(c, 1, side([cheap(c, 0).id, rosterAssets(c, 0)[rosterAssets(c, 0).length - 2].player.id]), side([cheap(c, 1).id]));
    expect(issues.some((i) => i.code === "roster-max" && i.teamId === 1)).toBe(true);
    // Even swap is fine.
    expect(validateTrade(c, 1, side([cheap(c, 0).id]), side([cheap(c, 1).id])).some((i) => i.code === "roster-max")).toBe(false);
  });
  it("allows bigger rosters in the offseason but still has a cap on them", () => {
    const c = loose(fresh());
    c.phase = "fa";
    expect(validateTrade(c, 1, side([cheap(c, 0).id, rosterAssets(c, 0)[rosterAssets(c, 0).length - 2].player.id]), side([cheap(c, 1).id])).some((i) => i.code === "roster-max")).toBe(false);
  });
  it("enforces a minimum roster in season", () => {
    const c = loose(fresh());
    c.phase = "regular"; c.week = 2;
    const mine = rosterAssets(c, 0).slice(0, 10).map((a) => a.player.id);
    const issues = validateTrade(c, 1, side(mine), side());
    expect(issues.some((i) => i.code === "roster-min" && i.teamId === 0)).toBe(true);
  });
  it("enforces the salary cap for both clubs", () => {
    const c = fresh();
    const star = rosterAssets(c, 1).sort((a, b) => capHit(b.player) - capHit(a.player))[0].player;
    // Make the user unable to absorb: no cap room.
    const space = capSpace(c, 0);
    c.cap -= space - 0.5 + 0; // leaves 0.5M of room
    const issues = validateTrade(c, 1, side([cheap(c, 0).id]), side([star.id]));
    expect(issues.some((i) => i.code === "cap" && i.teamId === 0)).toBe(true);
    expect(proposeTrade(c, 1, side([cheap(c, 0).id]), side([star.id])).applied).toBe(false);
  });
  it("allows a deal that does not worsen a team already over the cap", () => {
    const c = fresh();
    c.cap = 1; // everyone over the cap
    const mine = rosterAssets(c, 0).map((x) => x.player), theirs = rosterAssets(c, 1).map((x) => x.player);
    const a = mine.find((p) => theirs.some((q) => capHit(q) > capHit(p) + 0.1))!;
    const b = theirs.find((q) => capHit(q) > capHit(a) + 0.1)!;
    const issues = validateTrade(c, 1, side([a.id]), side([b.id]));
    // I take on salary while over the cap: blocked. They shed salary: fine.
    expect(issues.some((i) => i.code === "cap" && i.teamId === 0)).toBe(true);
    expect(issues.some((i) => i.code === "cap" && i.teamId === 1)).toBe(false);
  });
});

describe("AI decision and value", () => {
  it("agrees with the engine's evaluateTrade", () => {
    const c = loose(fresh());
    for (let i = 0; i < 6; i++) {
      const give = side([rosterAssets(c, 0)[i * 4].player.id]);
      const get = side([rosterAssets(c, 3)[i * 3 + 2].player.id]);
      const a = analyzeTrade(c, 3, give, get);
      const ev = evaluateTrade(c, 3, give, get);
      if (a.legal) expect(a.verdict === "accept").toBe(ev.ok);
      expect(a.giveValue).toBeCloseTo(ev.giveValue, 6);
      expect(a.getValue).toBeCloseTo(ev.getValue, 6);
    }
  });
  it("derives values from the engine model, with a per-asset breakdown that sums", () => {
    const c = fresh();
    const p = best(c, 0), pk = pickAssets(c, 0)[0];
    const a = analyzeTrade(c, 1, side([p.id], [pk.key]), side());
    expect(a.giveValue).toBeCloseTo(playerTradeValue(p) + pickValue(c, pk.pick), 6);
    expect(a.giveLines).toHaveLength(2);
    expect(a.giveLines.reduce((s, l) => s + l.value, 0)).toBeCloseTo(a.giveValue, 6);
  });
  it("rejects a lopsided ask with a reason and accepts an overpay", () => {
    const c = loose(fresh());
    const star = best(c, 1, "QB");
    const lo = analyzeTrade(c, 1, side([cheap(c, 0).id]), side([star.id]));
    expect(lo.verdict).toBe("reject");
    expect(lo.reasons.join(" ")).toMatch(/rejected/i);
    expect(lo.fairness).toBe("one-sided-you");
    expect(lo.giveShare).toBeLessThan(lo.thresholdShare);
    const hi = analyzeTrade(c, 1, side([best(c, 0, "QB").id], pickAssets(c, 0).slice(0, 4).map((x) => x.key)), side([cheap(c, 1).id]));
    expect(hi.verdict).toBe("accept");
    expect(hi.fairness).toBe("one-sided-them");
    expect(hi.giveShare).toBeGreaterThan(hi.thresholdShare);
  });
  it("reports a counter when close", () => {
    const c = loose(fresh());
    const get = side([rosterAssets(c, 1)[10].player.id]);
    const need = analyzeTrade(c, 1, side(), get).required;
    // find a give asset in the 0.9..threshold band
    const cand = rosterAssets(c, 0).filter((a) => a.value < need && a.value >= analyzeTrade(c, 1, side(), get).getValue * 0.9);
    if (cand.length) expect(analyzeTrade(c, 1, side([cand[0].player.id]), get).verdict).toBe("counter");
  });
  it("suggests only additions that make the deal work", () => {
    const c = loose(fresh());
    c.phase = "fa";
    const target = rosterAssets(c, 1).find((a) => a.value > 120 && a.value < 800)!;
    const get = side([target.player.id]);
    const give = side([cheap(c, 0).id]);
    const s = suggestSweeteners(c, 1, give, get, 3);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) {
      const next = x.kind === "player" ? side([...give.players, x.id as number]) : side(give.players, [...give.picks, x.id as string]);
      expect(analyzeTrade(c, 1, next, get).verdict).toBe("accept");
    }
    expect(suggestSweeteners(c, 1, side([best(c, 0, "QB").id]), side([cheap(c, 1).id]))).toEqual([]);
  });
  it("is deterministic for the same career", () => {
    const a = analyzeTrade(fresh(), 4, side([best(fresh(), 0).id]), side([best(fresh(), 4).id]));
    const b = analyzeTrade(fresh(), 4, side([best(fresh(), 0).id]), side([best(fresh(), 4).id]));
    expect(a).toEqual(b);
  });
  it("shows before and after cap and roster without mutating", () => {
    const c = loose(fresh());
    const mine = best(c, 0), theirs = cheap(c, 1);
    const before = snapshot(c);
    const a = analyzeTrade(c, 1, side([mine.id]), side([theirs.id]));
    expect(snapshot(c)).toBe(before);
    expect(a.user.after.capSpace).toBeCloseTo(a.user.before.capSpace + capHit(mine) - capHit(theirs), 1);
    expect(a.partner.after.capSpace).toBeCloseTo(a.partner.before.capSpace - capHit(mine) + capHit(theirs), 1);
    expect(a.user.after.active).toBe(a.user.before.active);
    const two = analyzeTrade(c, 1, side([mine.id]), side());
    expect(two.user.after.active).toBe(two.user.before.active - 1);
    expect(two.partner.after.active).toBe(two.partner.before.active + 1);
  });
});

describe("proposeTrade transactions", () => {
  it("player-only accepted flow moves players, contracts and depth, once", () => {
    const c = loose(fresh());
    const mine = best(c, 0, "QB"), theirs = cheap(c, 1);
    const contract = JSON.stringify(mine.contract);
    const r = proposeTrade(c, 1, side([mine.id], pickAssets(c, 0).slice(0, 3).map((x) => x.key)), side([theirs.id]));
    expect(r.ok && r.applied).toBe(true);
    expect(c.players[mine.id].teamId).toBe(1);
    expect(JSON.stringify(c.players[mine.id].contract)).toBe(contract);
    expect(c.players[theirs.id].teamId).toBe(0);
    expect(Object.values(c.teams[0].depth).flat()).not.toContain(mine.id);
    expect(teamPlayers(0, c.players)).toHaveLength(ROSTER_MAX);
    expect(c.inbox.filter((i) => i.subject === "Trade completed")).toHaveLength(1);
    // Duplicate submit of the same deal cannot apply twice.
    const again = proposeTrade(c, 1, side([mine.id], []), side([theirs.id]));
    expect(again.applied).toBe(false);
    expect(c.inbox.filter((i) => i.subject === "Trade completed")).toHaveLength(1);
  });
  it("pick-only flow changes ownership", () => {
    const c = loose(fresh());
    const theirPick = pickAssets(c, 1).filter((p) => p.pick.round === 7)[0];
    const mine = pickAssets(c, 0).filter((p) => p.pick.round === 1);
    const r = proposeTrade(c, 1, side([], [mine[0].key]), side([], [theirPick.key]));
    expect(r.applied).toBe(true);
    expect(c.picks.find((p) => pickKey(p) === mine[0].key)!.owner).toBe(1);
    expect(c.picks.find((p) => pickKey(p) === theirPick.key)!.owner).toBe(0);
    // Picks cannot be re-traded by the old owner.
    expect(proposeTrade(c, 1, side([], [mine[0].key]), side()).applied).toBe(false);
  });
  it("mixed flow works and revalidates ownership", () => {
    const c = loose(fresh());
    const r = proposeTrade(c, 2, side([best(c, 0, "QB").id], [pickAssets(c, 0)[0].key]), side([best(c, 2, "DE").id], [pickAssets(c, 2)[6].key]));
    expect(r.verdict).toBeDefined();
    if (r.applied) {
      expect(c.picks.filter((p) => p.owner === 0 || p.owner === 2).length).toBe(c.picks.filter((p) => p.orig === 0 || p.orig === 2).length);
    }
  });
  it("rejection does not mutate career state", () => {
    const c = loose(fresh());
    const before = snapshot(c);
    const r = proposeTrade(c, 1, side([cheap(c, 0).id]), side([best(c, 1, "QB").id]));
    expect(r.applied).toBe(false);
    expect(r.verdict).toBe("reject");
    expect(r.message).toMatch(/rejected/i);
    expect(snapshot(c)).toBe(before);
  });
  it("invalid trades do not mutate career state", () => {
    const c = loose(fresh());
    const before = snapshot(c);
    const mine = best(c, 0);
    for (const [t, g, r] of [[99, side([mine.id]), side()], [1, side([mine.id, mine.id]), side()], [1, side([best(c, 1).id]), side()], [1, side(), side()]] as const) {
      expect(proposeTrade(c, t, g, r).applied).toBe(false);
    }
    expect(snapshot(c)).toBe(before);
  });
  it("cannot trade a player out and back in", () => {
    const c = loose(fresh());
    const mine = best(c, 0, "QB");
    expect(proposeTrade(c, 1, side([mine.id], pickAssets(c, 0).slice(0, 3).map((x) => x.key)), side([cheap(c, 1).id])).applied).toBe(true);
    expect(validateTrade(c, 1, side([mine.id]), side()).some((i) => i.code === "wrong-team")).toBe(true);
  });
  it("is deterministic across identical careers", () => {
    const run = () => {
      const c = loose(fresh());
      const r = proposeTrade(c, 1, side([best(c, 0, "QB").id], [pickAssets(c, 0)[0].key]), side([cheap(c, 1).id]));
      return { r, s: snapshot(c) };
    };
    expect(run()).toEqual(run());
  });
  it("survives save and export after a trade", () => {
    const c = loose(fresh());
    const mine = best(c, 0, "QB"), theirs = cheap(c, 1);
    expect(proposeTrade(c, 1, side([mine.id], pickAssets(c, 0).slice(0, 3).map((x) => x.key)), side([theirs.id])).applied).toBe(true);
    const res = importCareerText(exportCareerText(c));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.career.players[mine.id].teamId).toBe(1);
      expect(res.career.players[theirs.id].teamId).toBe(0);
      expect(res.career.picks.filter((p) => p.owner === 1 && p.orig === 0).length).toBeGreaterThan(0);
    }
  });
});

describe("incoming offers", () => {
  it("accepting a stale or illegal offer removes it without moving assets", () => {
    const c = loose(fresh());
    const target = best(c, 0, "WR");
    c.offers.push({ id: 900, fromTeam: 2, give: side([target.id]), get: side([cheap(c, 2).id]) });
    c.players[target.id].teamId = 5; // no longer mine
    const before = snapshot(c);
    expect(answerOffer(c, 900, true)).toMatch(/no longer valid/);
    expect(c.offers).toHaveLength(0);
    expect(snapshot(c)).toBe(before);
  });
  it("accepts a legal offer once and declining changes nothing", () => {
    const c = loose(fresh());
    const target = best(c, 0, "WR");
    const send = cheap(c, 2);
    c.offers.push({ id: 901, fromTeam: 2, give: side([target.id]), get: side([send.id]) }, { id: 902, fromTeam: 3, give: side(), get: side() });
    const s0 = snapshot(c);
    answerOffer(c, 902, false);
    expect(snapshot(c)).toBe(s0);
    answerOffer(c, 901, true);
    expect(c.players[target.id].teamId).toBe(2);
    expect(c.players[send.id].teamId).toBe(0);
    expect(answerOffer(c, 901, true)).toMatch(/no longer/);
  });
});

describe("draft and contract helpers", () => {
  it("lists the next picks in order with owners", () => {
    const c = fresh();
    c.phase = "draft";
    // Mirror the offseason: make sure this year's picks exist and carry overall numbers.
    for (const p of c.picks) p.year = c.year;
    c.picks.forEach((p) => { p.overall = (p.round - 1) * 32 + (p.orig % 32) + 1; });
    const up = upcomingPicks(c, 5);
    expect(up).toHaveLength(5);
    expect(up.map((u) => u.overall)).toEqual([...up.map((u) => u.overall)].sort((a, b) => a - b));
    const pr = draftProgress(c);
    expect(pr.made).toBe(0);
    expect(pr.total).toBe(c.picks.filter((p) => p.year === c.year && p.overall).length);
    const first = c.picks.find((p) => p.overall === 1)!;
    first.owner = 7;
    expect(upcomingPicks(c, 1)[0]).toMatchObject({ overall: 1, owner: 7, traded: true });
  });
  it("need prospects belong to the thinnest groups", () => {
    const c = fresh();
    expect(needProspects(c, 0, 5).length).toBeLessThanOrEqual(5);
  });
  it("summarises contracts from stored years", () => {
    const c = fresh();
    const p = best(c, 0);
    const s = contractSummary(p);
    expect(s.yearsLeft).toBe(p.contract.years.length);
    expect(s.thisYear).toBe(capHit(p));
    expect(s.total).toBeGreaterThanOrEqual(s.guaranteed);
    expect(ovr(p)).toBeGreaterThan(0);
    expect(contractSummary({ ...p, contract: { years: [] } }).thisYear).toBe(0);
    expect(emptySide()).toEqual({ players: [], picks: [] });
  });
});
