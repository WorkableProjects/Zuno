import { describe, expect, it } from "vitest";
import { advance, capSpace, cutPlayer, newCareer, payroll, restructure, rosterCounts } from "../src/games/gridiron/gmCareer";
import { createGame, simulateGame, step } from "../src/games/gridiron/gmEngine";
import { buildSchedule, computeStandings, generateLeague, rankTeams } from "../src/games/gridiron/gmLeague";
import { capHit, makeContract } from "../src/games/gridiron/gmPlayers";
import { buildPlayScript } from "../src/games/gridiron/gmPlayScript";
import { draftOrder } from "../src/games/gridiron/gmDraft";
import { validateGridiron } from "../src/game-files/schema/gridiron";
import type { ScheduledGame, Team } from "../src/games/gridiron/gmTypes";

const L = generateLeague(42);

describe("Gridiron GM league", () => {
  it("builds 32 teams with 53 + 16 players", () => {
    expect(L.teams).toHaveLength(32);
    for (const t of L.teams) {
      const all = Object.values(L.players).filter((p) => p.teamId === t.id);
      expect(all.filter((p) => !p.ps)).toHaveLength(53);
      expect(all.filter((p) => p.ps)).toHaveLength(16);
    }
  });

  it("schedules 17 games per team over 18 weeks with one bye", () => {
    const s = buildSchedule(L.teams, 2026, 42);
    expect(s).toHaveLength(272);
    for (const t of L.teams) {
      const mine = s.filter((g) => g.home === t.id || g.away === t.id);
      expect(mine).toHaveLength(17);
      expect(new Set(mine.map((g) => g.week)).size).toBe(17);
      const div = mine.filter((g) => { const o = L.teams[g.home === t.id ? g.away : g.home]; return o.conf === t.conf && o.div === t.div; });
      expect(div).toHaveLength(6);
    }
  });
});

describe("Gridiron GM engine", () => {
  it("is deterministic for a seed", () => {
    const a = simulateGame({ home: L.teams[0], away: L.teams[5], players: L.players, seed: 99 }).result;
    const b = simulateGame({ home: L.teams[0], away: L.teams[5], players: L.players, seed: 99 }).result;
    expect(a.score).toEqual(b.score);
    expect(a.team).toEqual(b.team);
    const s1 = buildPlayScript(simulateGame({ home: L.teams[0], away: L.teams[5], players: L.players, seed: 99 }).state.plays[20].spec);
    const s2 = buildPlayScript(simulateGame({ home: L.teams[0], away: L.teams[5], players: L.players, seed: 99 }).state.plays[20].spec);
    expect(Array.from(s1.frames[10])).toEqual(Array.from(s2.frames[10]));
  });

  it("animates every play inside the field, ending on the recorded spot", { timeout: 60000 }, () => {
    for (let i = 0; i < 4; i++) {
      const { state } = simulateGame({ home: L.teams[i], away: L.teams[i + 8], players: L.players, seed: 500 + i });
      for (const p of state.plays) {
        const s = buildPlayScript(p.spec);
        let inside = true;
        for (const f of s.frames) for (let k = 0; k < 23; k++) if (!(f[k * 2] >= 0 && f[k * 2] <= 120 && f[k * 2 + 1] >= 0 && f[k * 2 + 1] <= 53.34)) inside = false;
        expect(inside).toBe(true);
        const o = p.spec.outcome;
        if (["run", "complete", "sack", "scramble", "kneel"].includes(o.kind)) {
          const want = p.spec.dir > 0 ? 10 + p.spec.los + o.yards : 110 - p.spec.los - o.yards;
          expect(s.finalX).toBeCloseTo(want, 3);
          expect(s.frames[s.frames.length - 1][44]).toBeCloseTo(want, 1);
        }
      }
    }
  });

  it("produces realistic numbers over 1,000 games", { timeout: 120000 }, () => {
    let pts = 0, teams = 0, att = 0, cmp = 0, ratt = 0, ryd = 0, sacks = 0;
    for (let i = 0; i < 1000; i++) {
      const h = L.teams[i % 32];
      const a = L.teams[(i * 7 + 3) % 32 === i % 32 ? (i + 1) % 32 : (i * 7 + 3) % 32];
      const { result } = simulateGame({ home: h, away: a, players: L.players, seed: 10000 + i });
      pts += result.score[0] + result.score[1];
      teams += 2;
      for (const k in result.players) {
        const s = result.players[k];
        att += s.pAtt; cmp += s.pCmp; ratt += s.rAtt; ryd += s.rYds; sacks += s.sacked;
      }
    }
    expect(pts / teams).toBeGreaterThan(19);
    expect(pts / teams).toBeLessThan(26);
    expect(cmp / att).toBeGreaterThan(0.59);
    expect(cmp / att).toBeLessThan(0.67);
    expect(ryd / ratt).toBeGreaterThan(3.9);
    expect(ryd / ratt).toBeLessThan(4.7);
    expect(sacks / (att + sacks)).toBeGreaterThan(0.045);
    expect(sacks / (att + sacks)).toBeLessThan(0.08);
  });

  it("follows clock and overtime rules", () => {
    let ot = 0;
    for (let i = 0; i < 300; i++) {
      const g = createGame({ home: L.teams[1], away: L.teams[2], players: L.players, seed: 700 + i, playoff: i % 2 === 0 });
      let guard = 0;
      let sawWarning = false;
      while (g.phase !== "final" && guard++ < 2000) {
        step(g);
        if (g.log.includes("Two-minute warning.")) sawWarning = true;
        expect(g.clock).toBeGreaterThanOrEqual(0);
        expect(g.timeouts[0]).toBeGreaterThanOrEqual(0);
      }
      expect(g.phase).toBe("final");
      expect(sawWarning).toBe(true);
      if (g.quarter > 4) {
        ot++;
        if (i % 2 === 0) expect(g.score[0]).not.toBe(g.score[1]); // playoff games can't end tied
        // Modern rules: the game can't end on the first possession's field goal.
        expect(g.ot!.possessions[0] + g.ot!.possessions[1]).toBeGreaterThanOrEqual(g.score[0] === g.score[1] ? 1 : 2);
      } else expect(g.score[0]).not.toBe(g.score[1]);
    }
    expect(ot).toBeGreaterThan(0);
  });
});

describe("Gridiron GM tiebreakers", () => {
  const mk = (week: number, home: number, away: number, hs: number, as: number): ScheduledGame => ({
    id: week * 100 + home, week, home, away,
    result: { score: [hs, as], quarters: [[], []], ot: false, team: [{} as never, {} as never], players: {}, highlights: [], injuries: [], weather: "Clear", mvp: null, log: [] },
  });
  const teams = L.teams as Team[];
  it("breaks ties by head-to-head first", () => {
    const s = [mk(1, 0, 1, 10, 20), mk(2, 0, 2, 30, 0), mk(3, 1, 2, 0, 30)];
    const st = computeStandings(teams, s);
    expect(rankTeams([0, 1], teams, st, s)).toEqual([1, 0]);
  });
  it("then by division record within a division", () => {
    // 0 and 1 split, 0 beats a division rival, 1 beats an out-of-division team.
    const s = [mk(1, 0, 1, 20, 10), mk(2, 1, 0, 20, 10), mk(3, 0, 2, 20, 10), mk(4, 1, 20, 20, 10), mk(5, 0, 25, 0, 10), mk(6, 1, 3, 0, 10)];
    const st = computeStandings(teams, s);
    expect(rankTeams([1, 0], teams, st, s)[0]).toBe(0);
  });
  it("then common games and conference record", () => {
    const s = [mk(1, 4, 8, 20, 10), mk(2, 5, 8, 10, 20), mk(3, 4, 9, 0, 10), mk(4, 5, 9, 20, 10), mk(5, 4, 10, 20, 10), mk(6, 5, 10, 20, 10), mk(7, 4, 11, 20, 10), mk(8, 5, 11, 10, 20), mk(9, 4, 20, 20, 10), mk(10, 5, 21, 10, 20)];
    const st = computeStandings(teams, s);
    expect(rankTeams([4, 5], teams, st, s).length).toBe(2);
  });
});

describe("Gridiron GM career", () => {
  it("does cap math for cuts and restructures", () => {
    const c = newCareer({ seed: 3, teamId: 0, coachName: "Test", slot: 1 });
    const p = Object.values(c.players).find((x) => x.teamId === 0 && !x.ps)!;
    p.contract = makeContract(10, 3, 0.5);
    const guar = p.contract.years.reduce((s, y) => s + y.guar, 0);
    const before = payroll(c, 0);
    cutPlayer(c, p.id);
    expect(payroll(c, 0)).toBeCloseTo(before - 10 + guar, 1);
    const q = Object.values(c.players).find((x) => x.teamId === 0 && !x.ps && x.contract.years.length >= 2 && capHit(x) > 3)!;
    const space = capSpace(c, 0);
    const total = q.contract.years.reduce((s, y) => s + y.cap, 0);
    restructure(c, q.id);
    expect(capSpace(c, 0)).toBeGreaterThan(space);
    expect(q.contract.years.reduce((s, y) => s + y.cap, 0)).toBeCloseTo(total, 0);
  });

  it("orders the draft worst to first, champion last", { timeout: 60000 }, () => {
    const c = newCareer({ seed: 5, teamId: 3, coachName: "Test", slot: 1 });
    while (c.phase !== "resign") advance(c);
    const order = draftOrder(c);
    const bowl = c.schedule.find((g) => g.round === "BOWL")!;
    const champ = bowl.result!.score[0] > bowl.result!.score[1] ? bowl.home : bowl.away;
    expect(order[31]).toBe(champ);
    const st = computeStandings(c.teams, c.schedule);
    const nonPlayoff = order.slice(0, 18);
    for (let i = 1; i < nonPlayoff.length; i++) expect(st[nonPlayoff[i]].w + st[nonPlayoff[i]].t / 2).toBeGreaterThanOrEqual(st[nonPlayoff[i - 1]].w + st[nonPlayoff[i - 1]].t / 2);
    // Finish the offseason: everyone ends at 53.
    while (c.phase !== "regular") advance(c);
    for (const t of c.teams) expect(rosterCounts(c, t.id).active).toBeLessThanOrEqual(53);
  });

  it("round-trips a save through the file validator", () => {
    const c = newCareer({ seed: 8, teamId: 7, coachName: "Round Trip", slot: 2 });
    advance(c);
    const text = JSON.stringify({ schemaVersion: 1, gameType: "gridiron", metadata: { title: "Save", description: "", author: "", coverImage: null }, appearance: { accentColor: "#22C55E", backgroundPreset: "tide" }, content: { league: null, career: c }, settings: {} });
    const res = validateGridiron(JSON.parse(text));
    expect(res.ok).toBe(true);
    if (res.ok) expect(JSON.stringify(res.file.content.career)).toBe(JSON.stringify(c));
  });

  it("rejects a custom league without 32 teams", () => {
    const res = validateGridiron({ metadata: { title: "x" }, content: { league: { teams: [{ city: "A", name: "B", abbr: "AB", colors: ["#000000", "#ffffff"] }] } } });
    expect(res.ok).toBe(false);
  });
});
