import { beforeAll, describe, expect, it } from "vitest";
import { createGame, finishGame, nextDecision, normalizeOffCall, runPlay, simulateGame, step, type GameState, type PlayRecord } from "../src/games/gridiron/gmEngine";
import { generateLeague } from "../src/games/gridiron/gmLeague";
import { DEF_PLAYS, OFF_PLAYS } from "../src/games/gridiron/gmPlaybook";
import { buildPlayScript } from "../src/games/gridiron/gmPlayScript";
import type { StatLine, TeamGameStats } from "../src/games/gridiron/gmTypes";

const L = generateLeague(42);
const teamsFor = (i: number) => {
  const h = L.teams[i % 32];
  let a = L.teams[(i * 5 + 1) % 32];
  if (a === h) a = L.teams[(i + 2) % 32];
  return { home: h, away: a };
};

interface Before {
  down: number; dist: number; ballOn: number; poss: 0 | 1; phase: string; quarter: number; clock: number;
  score: [number, number]; team: [TeamGameStats, TeamGameStats]; stats: Record<number, StatLine>; hadReview: boolean; timeouts: [number, number];
}
interface Ev { b: Before; rec: PlayRecord; g: GameState; after: Before; mode: string; seed: number }

const snapshot = (g: GameState): Before => ({
  down: g.down, dist: g.dist, ballOn: g.ballOn, poss: g.poss, phase: g.phase, quarter: g.quarter, clock: g.clock,
  score: [g.score[0], g.score[1]], team: [{ ...g.team[0] }, { ...g.team[1] }], stats: Object.fromEntries(Object.entries(g.stats).map(([k, v]) => [k, { ...v }])),
  hadReview: !!g.review, timeouts: [g.timeouts[0], g.timeouts[1]],
});

/** Plays whole games and reports every step. "ai" lets both coordinators call; "user" forces cycling play calls and 4th-down gambles. */
function scan(games: number, seed0: number, mode: "ai" | "user", cb: (e: Ev) => void) {
  for (let i = 0; i < games; i++) {
    const { home, away } = teamsFor(i + seed0);
    const g = createGame({ home, away, players: L.players, seed: seed0 + i, playoff: i % 3 === 0 });
    let guard = 0;
    let k = 0;
    while (g.phase !== "final" && guard++ < 2500) {
      const b = snapshot(g);
      let rec: PlayRecord | null;
      if (mode === "user" && g.phase === "play" && !g.review) {
        k++;
        const call = { ...OFF_PLAYS[(k * 7 + i) % OFF_PLAYS.length], side: (k % 2 ? 1 : -1) as 1 | -1 };
        rec = runPlay(g, { id: `p${k}`, name: "t", call }, { def: DEF_PLAYS[(k + i) % DEF_PLAYS.length], fourth: k % 4 === 0 ? "go" : undefined });
      } else rec = step(g);
      if (rec) cb({ b, rec, g, after: snapshot(g), mode, seed: seed0 + i });
    }
    expect(g.phase).toBe("final");
  }
}

let events: Ev[] = [];
beforeAll(() => {
  events = [];
  const keep = (e: Ev) => events.push({ ...e, g: undefined as unknown as GameState });
  scan(160, 3000, "ai", keep);
  scan(160, 5000, "user", keep);
}, 180000);

const scrim = (e: Ev) => e.b.phase === "play" && !e.b.hadReview && e.rec.spec.special === null;
const ofKind = (k: string) => events.filter((e) => scrim(e) && e.rec.spec.outcome.kind === k);
/** The play ended without a possession change caused by the period turning over (halftime / overtime reset possession). */
const sameSide = (e: Ev) => e.after.poss === e.b.poss && e.after.quarter === e.b.quarter;
const inPeriod = (e: Ev) => e.after.quarter === e.b.quarter;
const eq = (a: number, b: number, ctx?: string) => expect(a - b, ctx).toBeCloseTo(0, 6);
const penaltyOf = (name: string) => events.filter((e) => scrim(e) && inPeriod(e) && e.rec.spec.outcome.kind === "penalty" && e.rec.spec.outcome.penalty?.name === name);
const statDelta = (e: Ev, id: number, key: keyof StatLine) => ((e.after.stats[id]?.[key] as number) ?? 0) - ((e.b.stats[id]?.[key] as number) ?? 0);
const teamDelta = (e: Ev, key: keyof TeamGameStats) => e.after.team[e.b.poss][key] - e.b.team[e.b.poss][key];

describe("whole-game invariants", () => {
  it("keeps down, distance, field position, clock and score valid after every play", { timeout: 120000 }, () => {
    let plays = 0;
    for (const mode of ["ai", "user"] as const) {
      scan(60, mode === "ai" ? 100 : 400, mode, ({ rec, after, b, seed }) => {
        plays++;
        const ctx = `${mode} seed ${seed} play ${rec.n} ${rec.text}`;
        expect(rec.after, ctx).toBeDefined();
        if (after.phase === "play") {
          expect(after.down, ctx).toBeGreaterThanOrEqual(1);
          expect(after.down, ctx).toBeLessThanOrEqual(4);
          expect(after.dist, ctx).toBeGreaterThanOrEqual(1);
          expect(after.ballOn, ctx).toBeGreaterThanOrEqual(1);
          expect(after.ballOn, ctx).toBeLessThanOrEqual(99);
          expect(after.ballOn + after.dist, ctx).toBeLessThanOrEqual(100); // the line to gain is never past the goal line
        }
        expect(after.clock, ctx).toBeGreaterThanOrEqual(0);
        expect(after.clock, ctx).toBeLessThanOrEqual(900);
        if (!b.hadReview) { // an overturned call is the only way a score goes down
          expect(after.score[0]).toBeGreaterThanOrEqual(b.score[0]);
          expect(after.score[1]).toBeGreaterThanOrEqual(b.score[1]);
        }
        expect(rec.down === 0 || (rec.down >= 1 && rec.down <= 4), ctx).toBe(true);
        expect(rec.ballOn, ctx).toBeGreaterThanOrEqual(0);
        expect(rec.ballOn, ctx).toBeLessThanOrEqual(100);
      });
    }
    expect(plays).toBeGreaterThan(6000);
  });

  it("closes every drive, balances quarter scores and reconciles team vs player stats", { timeout: 120000 }, () => {
    for (let i = 0; i < 40; i++) {
      const { home, away } = teamsFor(i);
      const g = simulateGame({ home, away, players: L.players, seed: 900 + i }).state;
      g.drives.forEach((d, ix) => {
        if (ix < g.drives.length - 1) expect(d.result, `seed ${900 + i} drive ${ix}`).not.toBe("");
      });
      for (const s of [0, 1] as const) {
        expect(g.qScores[s].reduce((a, b) => a + b, 0)).toBe(g.score[s]);
        const t = g.team[s];
        expect(t.totalYds).toBe(t.passYds + t.rushYds);
        const tm = s === 0 ? home : away;
        let py = 0, ry = 0, rec = 0, sackYds = 0;
        for (const id in g.stats) {
          if (g.players[+id]?.teamId !== tm.id) continue;
          py += g.stats[id].pYds; ry += g.stats[id].rYds; rec += g.stats[id].recYds;
        }
        for (const p of g.plays) if (p.poss === s && ["sack"].includes(p.spec.outcome.kind)) sackYds += p.spec.outcome.yards;
        for (const p of g.plays) if (p.poss === s && p.spec.outcome.kind === "fumble" && p.spec.outcome.carrierIdx === 0 && p.spec.outcome.yards < 0 && p.spec.off?.type !== "run") sackYds += p.spec.outcome.yards;
        expect(ry).toBe(t.rushYds);
        expect(rec).toBe(py); // every passing yard is a receiving yard
        expect(t.passYds).toBe(py + sackYds); // team net passing includes sack yardage
      }
    }
  });

  it("derives final score from the scoring plays in the log", { timeout: 120000 }, () => {
    for (let i = 0; i < 40; i++) {
      const { home, away } = teamsFor(i);
      const g = simulateGame({ home, away, players: L.players, seed: 1200 + i }).state;
      let prev: [number, number] = [0, 0];
      for (const p of g.plays) {
        const d = [p.score[0] - prev[0], p.score[1] - prev[1]];
        expect(d[0] >= 0 && d[1] >= 0).toBe(true);
        if (d[0] + d[1] > 0) expect(p.scoring, `${p.text}`).toBe(true);
        else expect(p.scoring && !["pat", "twopoint"].includes(p.spec.outcome.kind)).toBe(false);
        prev = p.score;
      }
      expect(prev).toEqual(g.score);
    }
  });

  it("is repeatable for the same seed and the same calls", () => {
    const run = () => {
      const log: string[] = [];
      scan(3, 777, "user", ({ rec, after }) => log.push(`${rec.text}|${after.down}|${after.dist}|${after.ballOn}|${after.clock}|${after.score}`));
      return log;
    };
    expect(run()).toEqual(run());
  });

  it("replays every script to the recorded spot, inside the field", { timeout: 120000 }, () => {
    scan(12, 2500, "ai", ({ rec }) => {
      const sc = buildPlayScript(rec.spec);
      const o = rec.spec.outcome;
      for (const f of sc.frames) for (let k = 0; k < 23; k++) expect(f[k * 2] >= 0 && f[k * 2] <= 120 && f[k * 2 + 1] >= 0 && f[k * 2 + 1] <= 53.34).toBe(true);
      if (["run", "complete", "sack", "kneel", "scramble"].includes(o.kind)) {
        const want = rec.spec.dir > 0 ? 10 + rec.spec.los + o.yards : 110 - rec.spec.los - o.yards;
        expect(sc.finalX).toBeCloseTo(want, 3);
      }
      if (o.kind === "incomplete") {
        const snapX = rec.spec.dir > 0 ? 10 + rec.spec.los : 110 - rec.spec.los;
        expect(sc.finalX).toBeCloseTo(snapX, 3);
      }
    });
  });
});

describe("incomplete passes", () => {
  it("never move the ball or the line to gain, and advance the down exactly once", () => {
    const list = ofKind("incomplete").filter(sameSide);
    expect(list.length).toBeGreaterThan(300);
    for (const e of list) {
      const ctx = `seed ${e.seed} ${e.rec.text}`;
      const o = e.rec.spec.outcome;
      expect(o.yards).toBe(0);
      expect(e.after.ballOn, ctx).toBe(e.b.ballOn);
      expect(e.after.dist, ctx).toBe(e.b.dist);
      expect(e.after.down, ctx).toBe(e.b.down + 1);
      expect(e.rec.spec.los).toBe(e.b.ballOn);
      expect(e.rec.spec.firstDownAt).toBe(e.b.ballOn + e.b.dist);
      expect(o.firstDown).toBeFalsy();
      expect(teamDelta(e, "totalYds")).toBe(0);
      expect(teamDelta(e, "passYds")).toBe(0);
      expect(teamDelta(e, "rushYds")).toBe(0);
      expect(teamDelta(e, "firstDowns")).toBe(0);
      const ids = e.rec.spec.offPlayers.map((p) => p.id);
      const qb = ids[0];
      const tgt = ids[o.targetIdx!];
      expect(statDelta(e, qb, "pAtt")).toBe(1);
      expect(statDelta(e, qb, "pCmp")).toBe(0);
      expect(statDelta(e, qb, "pYds")).toBe(0);
      expect(statDelta(e, tgt, "tgt")).toBe(1);
      expect(statDelta(e, tgt, "rec")).toBe(0);
      expect(statDelta(e, tgt, "recYds")).toBe(0);
      expect(e.after.clock <= e.b.clock || e.after.quarter !== e.b.quarter).toBe(true);
      expect(e.rec.text).toMatch(/incomplete/);
      expect(e.rec.text).not.toMatch(/yard|loss of/);
    }
  });

  it("animate to the snap spot and stop the clock at every depth", { timeout: 120000 }, () => {
    const depths = new Set<string>();
    for (const e of ofKind("incomplete").filter(sameSide)) {
      depths.add(e.rec.spec.off!.type);
      const sc = buildPlayScript(e.rec.spec);
      const snapX = e.rec.spec.dir > 0 ? 10 + e.b.ballOn : 110 - e.b.ballOn;
      expect(sc.finalX).toBeCloseTo(snapX, 3);
      if (e.after.phase === "play" && e.after.quarter === e.b.quarter) expect(e.rec.after!.phase).toBe("play");
    }
    for (const t of ["short", "medium", "deep", "screen"]) expect(depths.has(t), t).toBe(true);
  });

  it("only deflections credit a pass defensed, and a flag supersedes the incomplete", () => {
    for (const e of ofKind("incomplete").filter(sameSide)) {
      const o = e.rec.spec.outcome;
      const defId = e.rec.spec.defPlayers[o.defenderIdx!].id;
      expect(statDelta(e, defId, "pd")).toBe(o.deflected ? 1 : 0);
    }
    const rp = penaltyOf("Roughing the passer");
    expect(rp.length).toBeGreaterThan(0);
    for (const e of rp) {
      const qb = e.rec.spec.offPlayers[0].id;
      expect(statDelta(e, qb, "pAtt")).toBe(0);
      for (const p of e.rec.spec.defPlayers) expect(statDelta(e, p.id, "pd")).toBe(0);
    }
  });
});

describe("scrimmage results", () => {
  it("complete passes and runs move the ball by exactly their yards and set the next down", () => {
    const list = [...ofKind("complete"), ...ofKind("run"), ...ofKind("scramble")].filter((e) => sameSide(e) && e.after.phase === "play");
    expect(list.length).toBeGreaterThan(2000);
    let firsts = 0, shorts = 0;
    for (const e of list) {
      const y = e.rec.spec.outcome.yards;
      const ctx = `seed ${e.seed} ${e.rec.text} ${JSON.stringify(e.b)}`;
      expect(e.after.ballOn, ctx).toBe(e.b.ballOn + y);
      if (y >= e.b.dist) {
        firsts++;
        expect(e.after.down, ctx).toBe(1);
        expect(e.after.dist, ctx).toBe(Math.min(10, 100 - e.after.ballOn));
        expect(e.rec.spec.outcome.firstDown).toBe(true);
        expect(teamDelta(e, "firstDowns")).toBe(1);
      } else {
        shorts++;
        expect(e.after.down, ctx).toBe(e.b.down + 1);
        expect(e.after.dist, ctx).toBe(e.b.dist - y);
        expect(e.rec.spec.outcome.firstDown).toBeFalsy();
        expect(teamDelta(e, "firstDowns")).toBe(0);
      }
    }
    expect(firsts).toBeGreaterThan(300);
    expect(shorts).toBeGreaterThan(300);
  });

  it("complete passes credit one completion, yards to QB, target and team", () => {
    for (const e of ofKind("complete").filter(sameSide)) {
      const o = e.rec.spec.outcome;
      const ids = e.rec.spec.offPlayers.map((p) => p.id);
      expect(statDelta(e, ids[0], "pAtt")).toBe(1);
      expect(statDelta(e, ids[0], "pCmp")).toBe(1);
      eq(statDelta(e, ids[0], "pYds"), o.yards);
      expect(statDelta(e, ids[o.targetIdx!], "rec")).toBe(1);
      eq(statDelta(e, ids[o.targetIdx!], "recYds"), o.yards);
      eq(teamDelta(e, "passYds"), o.yards);
      eq(teamDelta(e, "totalYds"), o.yards);
    }
  });

  it("sacks lose yards, grow the distance and never manufacture a first down", () => {
    const list = ofKind("sack").filter((e) => sameSide(e) && e.after.phase === "play");
    expect(list.length).toBeGreaterThan(30);
    for (const e of list) {
      const y = e.rec.spec.outcome.yards;
      expect(y).toBeLessThan(0);
      expect(e.after.ballOn).toBe(e.b.ballOn + y);
      expect(e.after.dist).toBe(e.b.dist - y);
      expect(e.after.down).toBe(e.b.down + 1);
      expect(teamDelta(e, "passYds")).toBe(y);
      expect(e.after.team[1 - e.b.poss].sacks - e.b.team[1 - e.b.poss].sacks).toBe(1);
      expect(statDelta(e, e.rec.spec.offPlayers[0].id, "pCmp")).toBe(0);
    }
  });

  it("third-down failures and conversions are tracked", () => {
    const thirds = events.filter((e) => scrim(e) && e.b.down === 3 && ["run", "complete", "scramble"].includes(e.rec.spec.outcome.kind) && sameSide(e) && e.after.phase === "play");
    expect(thirds.length).toBeGreaterThan(200);
    for (const e of thirds) {
      const conv = e.rec.spec.outcome.yards >= e.b.dist || e.rec.spec.outcome.touchdown;
      expect(e.after.team[e.b.poss].thirdAtt - e.b.team[e.b.poss].thirdAtt).toBe(1);
      if (!conv) {
        expect(e.after.team[e.b.poss].thirdConv - e.b.team[e.b.poss].thirdConv).toBe(0);
        expect(e.after.down).toBe(4);
      }
    }
  });

  it("goal-to-go: reaching the goal is a touchdown, otherwise down and distance stay inside the field", () => {
    const list = events.filter((e) => scrim(e) && e.b.ballOn + e.b.dist >= 100 && ["run", "complete", "scramble"].includes(e.rec.spec.outcome.kind));
    expect(list.length).toBeGreaterThan(100);
    for (const e of list) {
      const y = e.rec.spec.outcome.yards;
      if (e.b.ballOn + y >= 100) {
        expect(e.rec.spec.outcome.touchdown).toBe(true);
        expect(e.after.score[e.b.poss]).toBe(e.b.score[e.b.poss] + 6);
        expect(["pat", "final"]).toContain(e.after.phase);
      } else if (e.after.poss === e.b.poss && e.after.phase === "play") {
        expect(e.after.ballOn + e.after.dist).toBeLessThanOrEqual(100);
        expect(e.after.dist).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("touchdowns score six, credit the scorer and go to the PAT phase", () => {
    const tds = events.filter((e) => scrim(e) && e.rec.spec.outcome.touchdown && ["run", "complete", "scramble"].includes(e.rec.spec.outcome.kind));
    expect(tds.length).toBeGreaterThan(100);
    for (const e of tds) {
      expect(e.after.score[e.b.poss] - e.b.score[e.b.poss]).toBe(6);
      expect(e.rec.scoring).toBe(true);
      expect(e.rec.spec.los + e.rec.spec.outcome.yards).toBeGreaterThanOrEqual(100);
      expect(["pat", "final"]).toContain(e.after.phase);
    }
  });

  it("fourth down: gaining the line resets, failing turns the ball over at the real spot", () => {
    const fourths = events.filter((e) => scrim(e) && e.b.down === 4 && ["run", "complete", "scramble", "sack", "incomplete"].includes(e.rec.spec.outcome.kind));
    expect(fourths.length).toBeGreaterThan(40);
    let ok = 0, fail = 0;
    for (const e of fourths) {
      const o = e.rec.spec.outcome;
      const made = ["run", "complete", "scramble"].includes(o.kind) && o.yards >= e.b.dist;
      if (o.touchdown) continue;
      if (made) {
        ok++;
        expect(e.after.poss).toBe(e.b.poss);
        expect(e.after.down).toBe(1);
        expect(o.turnoverOnDowns).toBeFalsy();
      } else if (e.after.phase !== "kickoff") {
        fail++;
        const spot = e.b.ballOn + (o.kind === "incomplete" ? 0 : o.yards);
        expect(o.turnoverOnDowns, e.rec.text).toBe(true);
        expect(e.after.poss).toBe(1 - e.b.poss);
        expect(e.after.ballOn).toBe(100 - spot);
        expect(e.after.down).toBe(1);
        expect(e.after.dist).toBe(Math.min(10, 100 - e.after.ballOn));
        expect(e.rec.text).toMatch(/Turnover on downs/);
        expect(e.rec.after!.turnoverOnDowns).toBe(true);
        expect(e.after.team[e.b.poss].passYds - e.b.team[e.b.poss].passYds).toBe(o.kind === "incomplete" ? 0 : o.kind === "sack" ? o.yards : teamDelta(e, "passYds"));
      }
    }
    expect(ok).toBeGreaterThan(5);
    expect(fail).toBeGreaterThan(5);
  });

  it("kneel and spike are defined plays", () => {
    const g = createGame({ ...teamsFor(1), players: L.players, seed: 31 });
    step(g); // kickoff
    const before = { ballOn: g.ballOn, down: g.down };
    const k = runPlay(g, { call: { formation: "Shotgun", personnel: "11", type: "kneel", concept: "Kneel" } })!;
    expect(k.spec.outcome.kind).toBe("kneel");
    expect(g.ballOn).toBe(before.ballOn - 1);
    expect(g.down).toBe(before.down + 1);
    const s = runPlay(g, { call: { formation: "Shotgun", personnel: "11", type: "spike", concept: "Spike" } })!;
    expect(s.spec.outcome.kind).toBe("spike");
    expect(g.ballOn).toBe(before.ballOn - 1);
    expect(g.down).toBe(before.down + 2);
    expect(g.dist).toBe(11);
  });
});

describe("penalties", () => {
  const checkPenalty = (e: Ev) => {
    const o = e.rec.spec.outcome;
    const pen = o.penalty!;
    expect(e.after.poss).toBe(e.b.poss); // flags never change possession here
    expect(e.after.ballOn).toBe(e.b.ballOn + o.yards);
    expect(e.after.ballOn).toBeGreaterThanOrEqual(1);
    expect(e.after.ballOn).toBeLessThanOrEqual(99);
    expect(e.after.ballOn + e.after.dist).toBeLessThanOrEqual(100);
    expect(e.after.dist).toBeGreaterThanOrEqual(1);
    const side = pen.on === "off" ? e.b.poss : 1 - e.b.poss;
    expect(e.after.team[side].penalties - e.b.team[side].penalties).toBe(1);
    expect(e.after.team[side].penYds - e.b.team[side].penYds).toBe(Math.abs(o.yards));
    // A flag replaces the play: nothing the snap produced is counted.
    expect(teamDelta(e, "totalYds")).toBe(0);
    expect(teamDelta(e, "passYds")).toBe(0);
    expect(teamDelta(e, "rushYds")).toBe(0);
    for (const p of e.rec.spec.offPlayers) {
      expect(statDelta(e, p.id, "rAtt")).toBe(0);
      expect(statDelta(e, p.id, "pAtt")).toBe(0);
      expect(statDelta(e, p.id, "rec")).toBe(0);
    }
  };

  it("false start and offside are pre-snap, replay the down and never touch the clock", () => {
    for (const [name, sign] of [["False start", -1], ["Offside", 1]] as const) {
      const list = penaltyOf(name);
      expect(list.length, name).toBeGreaterThan(10);
      for (const e of list) {
        checkPenalty(e);
        if (e.rec.spec.outcome.yards !== 0) expect(Math.sign(e.rec.spec.outcome.yards)).toBe(sign);
        if (name === "False start" ? e.b.ballOn > 5 : e.b.ballOn < 95) expect(e.rec.spec.outcome.yards).toBe(sign * 5);
        else expect(Math.abs(e.rec.spec.outcome.yards)).toBeLessThanOrEqual(5);
        expect(e.after.clock).toBe(e.rec.clock); // the flag costs no game time
        if (name === "False start") {
          expect(e.after.down).toBe(e.b.down);
          expect(e.after.dist).toBe(Math.min(e.b.dist - e.rec.spec.outcome.yards, 100 - e.after.ballOn));
        } else if (e.rec.spec.outcome.yards >= e.b.dist) {
          expect(e.after.down).toBe(1);
          expect(e.rec.spec.outcome.firstDown).toBe(true);
        } else {
          expect(e.after.down).toBe(e.b.down);
          expect(e.after.dist).toBe(e.b.dist - e.rec.spec.outcome.yards);
        }
      }
    }
  });

  it("offensive holding wipes out the gain, replays the down and adds 10 (or half the distance)", () => {
    const list = penaltyOf("Offensive holding");
    expect(list.length).toBeGreaterThan(20);
    for (const e of list) {
      checkPenalty(e);
      expect(e.after.down).toBe(e.b.down);
      if (e.b.ballOn > 1) expect(e.rec.spec.outcome.yards).toBeLessThan(0);
      expect(e.rec.spec.outcome.firstDown).toBeFalsy();
      expect(e.after.dist).toBeGreaterThan(e.b.dist - 1);
      if (e.b.ballOn > 10) expect(e.rec.spec.outcome.yards).toBe(-10);
      else expect(e.rec.spec.outcome.yards).toBeGreaterThanOrEqual(-Math.floor(e.b.ballOn / 2));
      expect(e.after.dist).toBe(Math.min(e.b.dist - e.rec.spec.outcome.yards, 100 - e.after.ballOn));
    }
  });

  it("defensive pass interference and roughing are automatic first downs spotted forward", () => {
    for (const name of ["Defensive pass interference", "Roughing the passer"]) {
      const list = penaltyOf(name);
      expect(list.length, name).toBeGreaterThan(5);
      for (const e of list) {
        checkPenalty(e);
        expect(e.rec.spec.outcome.yards).toBeGreaterThan(-1);
        expect(e.rec.spec.outcome.firstDown).toBe(true);
        expect(e.after.down).toBe(1);
        expect(e.after.dist).toBe(Math.min(10, 100 - e.after.ballOn));
        expect(teamDelta(e, "firstDowns")).toBe(1);
        if (name === "Roughing the passer") expect(e.rec.spec.outcome.yards).toBeLessThanOrEqual(15);
      }
    }
  });

  it("goal-line penalties never push the ball into or past an end zone", () => {
    const near = events.filter((e) => scrim(e) && e.rec.spec.outcome.kind === "penalty" && (e.b.ballOn >= 90 || e.b.ballOn <= 10));
    expect(near.length).toBeGreaterThan(5);
    for (const e of near) checkPenalty(e);
  });
});

describe("turnovers, safeties and special teams", () => {
  it("interceptions hand over the ball in the receiver's frame, once", () => {
    const list = ofKind("interception");
    expect(list.length).toBeGreaterThan(80);
    let sixes = 0;
    for (const e of list) {
      const o = e.rec.spec.outcome;
      const spot = e.b.ballOn + o.airYards!;
      expect(o.yards).toBe(0);
      expect(e.after.team[e.b.poss].turnovers - e.b.team[e.b.poss].turnovers).toBe(1);
      expect(statDelta(e, e.rec.spec.offPlayers[0].id, "pInt")).toBe(1);
      expect(statDelta(e, e.rec.spec.defPlayers[o.defenderIdx!].id, "dInt")).toBe(1);
      expect(e.rec.big).toBe(true);
      if (o.defTouchdown) {
        sixes++;
        expect(e.after.score[1 - e.b.poss] - e.b.score[1 - e.b.poss]).toBe(6);
        expect(o.returnYards).toBe(spot);
        expect(e.rec.scoring).toBe(true);
      } else {
        expect(e.after.poss).toBe(1 - e.b.poss);
        expect(e.after.ballOn).toBe(spot >= 100 && o.returnYards === 0 ? 20 : 100 - spot + o.returnYards!);
        expect(e.after.down).toBe(1);
        expect(e.after.dist).toBe(Math.min(10, 100 - e.after.ballOn));
      }
    }
    expect(sixes).toBeGreaterThan(2);
  });

  it("fumbles: a lost fumble flips possession at the spot, a recovered one keeps downs consistent", () => {
    const list = ofKind("fumble").filter((e) => e.after.phase === "play" || e.after.phase === "pat");
    expect(list.length).toBeGreaterThan(30);
    let lost = 0, kept = 0;
    for (const e of list) {
      const o = e.rec.spec.outcome;
      if (o.recoveredByDefense) {
        lost++;
        expect(e.after.team[e.b.poss].turnovers - e.b.team[e.b.poss].turnovers).toBe(1);
        if (e.after.phase === "play") {
          expect(e.after.poss).toBe(1 - e.b.poss);
          expect(e.after.ballOn).toBe(100 - (e.b.ballOn + o.yards));
          expect(e.after.down).toBe(1);
        }
      } else {
        kept++;
        expect(e.after.team[e.b.poss].turnovers - e.b.team[e.b.poss].turnovers).toBe(0);
        if (e.after.poss === e.b.poss && e.after.phase === "play") expect(e.after.ballOn).toBe(e.b.ballOn + o.yards);
      }
      expect(e.b.ballOn + o.yards).toBeGreaterThanOrEqual(0);
    }
    expect(lost).toBeGreaterThan(5);
    expect(kept).toBeGreaterThan(5);
  });

  it("a fumble across a goal line is never a defensive recovery", () => {
    for (const e of ofKind("fumble")) {
      const o = e.rec.spec.outcome;
      if (e.b.ballOn + o.yards >= 100 || e.b.ballOn + o.yards <= 0) expect(o.recoveredByDefense).toBeFalsy();
    }
  });

  it("safeties give the defense two points, close the drive and free-kick from the 20", () => {
    const list = events.filter((e) => e.rec.spec.outcome.safety);
    expect(list.length).toBeGreaterThan(0);
    for (const e of list) {
      expect(e.after.score[1 - e.b.poss] - e.b.score[1 - e.b.poss]).toBe(2);
      expect(e.rec.text).toMatch(/SAFETY/);
      expect(e.b.ballOn + e.rec.spec.outcome.yards).toBeLessThanOrEqual(0);
      expect(e.after.phase === "kickoff" || e.after.phase === "final").toBe(true);
    }
  });

  it("punts, kickoffs and field goals leave the receiver with a valid first down", () => {
    const sp = events.filter((e) => inPeriod(e) && e.rec.spec.special && ["punt", "kickoff", "fg"].includes(e.rec.spec.special));
    const kinds = new Set<string>();
    for (const e of sp) {
      const o = e.rec.spec.outcome;
      kinds.add(e.rec.spec.special!);
      if (e.rec.spec.special === "punt") {
        expect(o.yards).toBeGreaterThan(0);
        expect(e.after.poss).toBe(1 - e.b.poss);
      }
      if (e.rec.spec.special === "fg" && o.good) expect(e.after.score[e.b.poss] - e.b.score[e.b.poss]).toBe(3);
      if (e.rec.spec.special === "fg" && !o.good) { expect(e.after.poss).toBe(1 - e.b.poss); expect(e.after.ballOn).toBeGreaterThanOrEqual(20); }
      if (e.after.phase === "play") {
        expect(e.after.down).toBe(1);
        expect(e.after.ballOn).toBeGreaterThanOrEqual(1);
        expect(e.after.ballOn).toBeLessThanOrEqual(99);
      }
    }
    expect(kinds.size).toBe(3);
  });
});

describe("clock and overtime", () => {
  it("honours the two-minute warning only in the 2nd and 4th quarters", { timeout: 120000 }, () => {
    let warned = 0;
    scan(40, 8000, "ai", ({ g, after }) => {
      if (g.log.includes("Two-minute warning.")) warned++;
      if (after.quarter === 1 || after.quarter === 3) expect(g.warned && g.quarter === 1).toBe(false);
    });
    expect(warned).toBeGreaterThan(40);
    const g = createGame({ ...teamsFor(3), players: L.players, seed: 55 });
    let guard = 0;
    while (g.phase !== "final" && guard++ < 2500) {
      const q = g.quarter;
      const before = g.log.filter((l) => l === "Two-minute warning.").length;
      step(g);
      const after = g.log.filter((l) => l === "Two-minute warning.").length;
      if (after > before) expect([2, 4]).toContain(q);
    }
  });

  it("stops the clock after incompletes and never leaves a negative or oversize clock", { timeout: 120000 }, () => {
    for (const e of ofKind("incomplete").filter(sameSide)) {
      if (e.after.quarter === e.b.quarter && e.after.phase === "play") expect(e.rec.after!.clock).toBeLessThanOrEqual(e.b.clock);
    }
    scan(30, 9000, "ai", ({ after }) => { expect(after.clock).toBeGreaterThanOrEqual(0); expect(after.clock).toBeLessThanOrEqual(900); });
  });

  it("plays overtime by the rules and never ends a regular-season game with an invalid state", { timeout: 120000 }, () => {
    let otGames = 0, ties = 0;
    for (let i = 0; i < 400; i++) {
      const playoff = i % 2 === 0;
      const g = createGame({ ...teamsFor(i), players: L.players, seed: 700 + i, playoff });
      let guard = 0;
      while (g.phase !== "final" && guard++ < 3000) step(g);
      expect(g.phase).toBe("final");
      expect(g.clock).toBeGreaterThanOrEqual(0);
      if (g.quarter > 4) {
        otGames++;
        expect(g.ot).not.toBeNull();
        if (g.score[0] === g.score[1]) {
          ties++;
          expect(playoff).toBe(false);
          expect(g.quarter).toBe(5);
        } else {
          // a sudden-death win needs both teams to have had the ball unless the first possession ended in a touchdown... which only counts after both possess
          expect(g.ot!.possessions[0] + g.ot!.possessions[1]).toBeGreaterThanOrEqual(2);
        }
      } else expect(g.score[0]).not.toBe(g.score[1]);
      if (playoff) expect(g.score[0]).not.toBe(g.score[1]);
      const r = finishGame(g);
      expect(r.ot).toBe(g.quarter > 4);
    }
    expect(otGames).toBeGreaterThan(5);
    expect(ties + otGames).toBeGreaterThan(0);
  });

  it("only ever kicks off with a valid decision and always has a next decision until final", () => {
    const g = createGame({ ...teamsFor(7), players: L.players, seed: 91 });
    let guard = 0;
    while (g.phase !== "final" && guard++ < 2500) {
      const d = nextDecision(g);
      expect(["kickoff", "play", "fourth", "pat", "challenge"]).toContain(d.kind);
      step(g);
    }
    expect(nextDecision(g).kind).toBe("final");
  });
});

describe("challenges", () => {
  function findReview(): { g: GameState; before: string; rec: PlayRecord } | null {
    for (let s = 0; s < 400; s++) {
      const g = createGame({ ...teamsFor(s), players: L.players, seed: 20000 + s });
      let guard = 0;
      while (g.phase !== "final" && guard++ < 2500) {
        const snap = JSON.stringify({ ...g, home: 0, away: 0, players: 0, plays: g.plays.length, review: 0 });
        const rec = step(g);
        if (g.review && rec) return { g, before: snap, rec };
      }
    }
    return null;
  }

  it("a reversal restores the snap, replays the alternate call and does not corrupt cumulative stats or the play list", { timeout: 120000 }, () => {
    let reversed = 0, stood = 0;
    for (let s = 0; s < 400 && (reversed < 3 || stood < 3); s++) {
      const g = createGame({ ...teamsFor(s), players: L.players, seed: 20000 + s });
      let guard = 0;
      while (g.phase !== "final" && guard++ < 2500) {
        const before = snapshot(g);
        const n = g.plays.length;
        const rec = step(g);
        if (!(g.review && rec)) continue;
        const kindBefore = rec.spec.outcome.kind;
        expect(g.plays).toHaveLength(n + 1);
        const rv = step(g, { challenge: reversed <= stood });
        if (rv) {
          reversed++;
          expect(g.plays).toHaveLength(n + 1); // the overturned play is replaced, not appended
          expect(rv.spec.outcome.kind).not.toBe(kindBefore);
          expect(rv.n).toBe(n);
          expect(rv.down).toBe(before.down);
          expect(rv.dist).toBe(before.dist);
          expect(rv.ballOn).toBe(before.ballOn);
          expect(rv.clock).toBe(before.clock);
          expect(g.challenges[0] + g.challenges[1]).toBe(4); // an overturned call keeps the challenge
          // totals reflect only the surviving outcome
          const ts = g.team[before.poss];
          expect(ts.totalYds - before.team[before.poss].totalYds).toBe(rv.spec.outcome.kind === "complete" ? rv.spec.outcome.yards : 0);
          if (rv.spec.outcome.kind === "incomplete") { expect(g.ballOn).toBe(before.ballOn); expect(g.dist).toBe(before.dist); expect(g.down).toBe(before.down + 1); }
        } else {
          stood++;
          expect(g.plays).toHaveLength(n + 1);
          expect(g.plays[n].spec.outcome.kind).toBe(kindBefore);
          if (g.challenges[0] + g.challenges[1] < 4) expect(g.plays[n].text).toMatch(/ruling stands/); // challenged and upheld
        }
        expect(g.review).toBeNull();
        break;
      }
    }
    expect(reversed).toBeGreaterThan(0);
    expect(stood).toBeGreaterThan(0);
  });

  it("finds a challengeable play at all", { timeout: 120000 }, () => { expect(findReview()).not.toBeNull(); });
});

describe("play-definition hook", () => {
  it("runPlay resolves a definition through the same path as step and tags the record", () => {
    const mk = () => { const g = createGame({ ...teamsFor(2), players: L.players, seed: 4242 }); step(g); return g; };
    const a = mk(), b = mk();
    const call = { ...OFF_PLAYS[0], side: 1 as const };
    const ra = runPlay(a, { id: "custom-1", name: "My Zone", call })!;
    const rb = step(b, { off: call })!;
    expect(ra.spec.playId).toBe("custom-1");
    expect(ra.spec.playName).toBe("My Zone");
    expect(rb.spec.playId).toBeUndefined();
    expect({ ...ra.spec, playId: undefined, playName: undefined }).toEqual({ ...rb.spec, playId: undefined, playName: undefined });
    expect([a.down, a.dist, a.ballOn, a.clock]).toEqual([b.down, b.dist, b.ballOn, b.clock]);
  });

  it("accepts a bare OffCall, repairs malformed custom calls and defaults 4th down to going for it", () => {
    const fixed = normalizeOffCall({ formation: "Shotgun", personnel: "99" as never, type: "run", concept: "" });
    expect(fixed.personnel).toBe("11");
    expect(fixed.gap).toBe("A");
    expect(fixed.side).toBe(1);
    expect(normalizeOffCall({ formation: "Shotgun", personnel: "11", type: "bogus" as never, concept: "x" }).type).toBe("short");
    const g = createGame({ ...teamsFor(4), players: L.players, seed: 66 });
    step(g);
    g.down = 4; g.dist = 3; g.ballOn = 40;
    const r = runPlay(g, { ...OFF_PLAYS[0] })!;
    expect(r.spec.special).toBeNull();
    expect(r.down).toBe(4);
    expect(r.spec.off).not.toBeNull();
  });
});

describe("regression guards", () => {
  it("whole-game results are unchanged by observation (simulateGame twice)", () => {
    const i = { ...teamsFor(9), players: L.players, seed: 123 };
    expect(simulateGame(i).result.score).toEqual(simulateGame(i).result.score);
  });

  it("a kneel never kills a 4th-down attempt the coach chose, and a spiked 4th down is a turnover", () => {
    const g = createGame({ ...teamsFor(6), players: L.players, seed: 12 });
    step(g);
    g.quarter = 4; g.clock = 30; g.score = [g.poss === 0 ? 10 : 3, g.poss === 0 ? 3 : 10]; g.down = 4; g.dist = 2; g.ballOn = 50; g.running = false; g.warned = true;
    const poss = g.poss;
    const r = step(g, { fourth: "go", off: OFF_PLAYS[0] })!;
    expect(r.spec.outcome.kind).not.toBe("kneel");
    expect(r.down).toBe(4);
    const g2 = createGame({ ...teamsFor(6), players: L.players, seed: 12 });
    step(g2);
    g2.down = 4; g2.dist = 5; g2.ballOn = 60;
    const p2 = g2.poss;
    const sp = step(g2, { off: { formation: "Shotgun", personnel: "11", type: "spike", concept: "Spike" }, fourth: "go" })!;
    expect(sp.spec.outcome.turnoverOnDowns).toBe(true);
    expect(g2.poss).not.toBe(p2);
    expect(g2.down).toBe(1);
    expect(poss === 0 || poss === 1).toBe(true);
  });
});
