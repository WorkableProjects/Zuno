import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateGauntlet, type GauntletFile } from "../src/game-files/schema/gauntlet";
import * as G from "../src/games/gauntlet/gauntletEngine";

const raw = JSON.parse(readFileSync(new URL("../public/samples/trivia-gauntlet.zuno.json", import.meta.url), "utf8"));
const r = validateGauntlet(raw);
if (!r.ok) throw new Error(r.errors.join("\n"));
const file = r.file as GauntletFile;
const opts: G.Options = { mode: "standard", safeMode: false, allowNegativeScores: true, roundSeconds: 15 };
const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Team ${i + 1}`, players: [`P${i}a`, `P${i}b`] }));

function readyAll(s: G.GauntletState) {
  for (const t of s.teams) for (const p of t.players) s = G.setReady(s, p.id, true);
  return s;
}
function toLaneChoice(n = 3, o = opts) {
  let s = readyAll(G.createGauntlet(file, teams(n), o));
  s = G.advanceRound(s, 0); // warmup
  while (s.phase === "warmup") {
    s = G.passQuestion(s, 0);
    s = G.advanceRound(s, 0);
  }
  return s;
}
function toLaneRound(lanes: G.LaneType[], n = 3, o = opts) {
  let s = toLaneChoice(n, o);
  lanes.forEach((l) => (s = G.chooseLane(s, G.nextPicker(s)!, l)));
  return G.advanceRound(s, 0);
}

describe("gauntlet engine", () => {
  it("lobby needs everyone ready before the warm-up", () => {
    let s = G.createGauntlet(file, teams(3), opts);
    expect(G.advanceRound(s, 0)).toBe(s);
    s = readyAll(s);
    s = G.advanceRound(s, 0);
    expect(s.phase).toBe("warmup");
    expect(s.turns).toHaveLength(5);
  });

  it("joins and moves players only in the lobby", () => {
    let s = G.createGauntlet(file, teams(2), opts);
    s = G.joinTeam(s, "t1", "Zed");
    expect(s.teams[0].players).toHaveLength(3);
    const zed = s.teams[0].players[2].id;
    s = G.movePlayer(s, zed, "t2");
    expect(s.teams[1].players.map((p) => p.name)).toContain("Zed");
  });

  it("quickfire scoring uses a 1x-5x streak multiplier and wrong answers break it", () => {
    let s = toLaneRound(["quickfire", "puzzle", "wild"]);
    expect(s.phase).toBe("laneRound");
    const tid = s.activeTeamId!;
    expect(G.currentTurn(s)!.kind).toBe("quickfire");
    s = G.resolveAnswer(s, true, 0);
    expect(s.scores[tid]).toBe(100);
    s = G.advanceRound(s, 0);
    s = G.resolveAnswer(s, true, 0);
    expect(s.scores[tid]).toBe(300);
    s = G.advanceRound(s, 0);
    s = G.resolveAnswer(s, false, 0);
    expect(s.streaks[tid]).toBe(0);
    expect(s.scores[tid]).toBe(300);
    expect(G.multiplier(10)).toBe(5);
    expect(G.multiplier(0)).toBe(1);
  });

  it("puzzle reward drops with hints", () => {
    let s = toLaneRound(["puzzle", "quickfire", "wild"]);
    const tid = s.activeTeamId!;
    s = G.revealHint(s);
    s = G.resolveAnswer(s, true, 0);
    expect(s.scores[tid]).toBe(350);
  });

  it("locks lanes once taken with three teams, and only the picker in turn may choose", () => {
    let s = toLaneChoice(3);
    const first = G.nextPicker(s)!;
    const other = s.teams.find((t) => t.id !== first)!.id;
    expect(G.chooseLane(s, other, "quickfire")).toBe(s);
    s = G.chooseLane(s, first, "quickfire");
    expect(G.laneLocked(s, "quickfire")).toBe(true);
    const second = G.nextPicker(s)!;
    expect(G.chooseLane(s, second, "quickfire")).toBe(s);
    expect(G.chooseLane(s, first, "wild")).toBe(s);
  });

  it("invalid submissions do not change score or timer", () => {
    let s = toLaneRound(["quickfire", "puzzle", "wild"]);
    const tid = s.activeTeamId!;
    const other = s.teams.find((t) => t.id !== tid)!.id;
    for (const bad of [G.submitAnswer(s, other, "Jupiter", 0), G.submitAnswer(s, tid, "   ", 0), G.submitAnswer(s, tid, "x".repeat(500), 0), G.submitAnswer(s, "nope", "x", 0), G.submitAnswer(s, tid, "late", 999_999)]) {
      expect(bad).toBe(s);
    }
    const ok = G.submitAnswer(s, tid, "Jupiter", 1000);
    expect(ok.revision).toBe(s.revision + 1);
    expect(ok.scores).toEqual(s.scores);
    expect(G.submitAnswer(ok, tid, "again", 1000)).toBe(ok);
  });

  it("timer expiry resolves once only", () => {
    let s = toLaneRound(["quickfire", "puzzle", "wild"]);
    expect(G.expireTimer(s, 1000)).toBe(s);
    const a = G.expireTimer(s, 60_000);
    expect(G.currentTurn(a)!.outcome).toBe("expired");
    expect(G.expireTimer(a, 70_000)).toBe(a);
    expect(a.revision).toBe(s.revision + 1);
  });

  it("pause stops the clock", () => {
    let s = toLaneRound(["quickfire", "puzzle", "wild"]);
    s = G.pauseTimer(s, 4000);
    expect(G.remaining(s.timer, 50_000)).toBe(6000);
    expect(G.expireTimer(s, 50_000)).toBe(s);
  });

  it("undo restores scores and the resolved turn", () => {
    let s = toLaneRound(["quickfire", "puzzle", "wild"]);
    const before = s;
    s = G.resolveAnswer(s, true, 0);
    const u = G.undoLastAction(s);
    expect(u.scores).toEqual(before.scores);
    expect(G.currentTurn(u)!.resolved).toBe(false);
    expect(u.revision).toBeGreaterThan(s.revision);
  });

  it("partial credit is capped at the full value", () => {
    let s = toLaneRound(["puzzle", "quickfire", "wild"]);
    const tid = s.activeTeamId!;
    s = G.awardPartialCredit(s, 9999, 0);
    expect(s.scores[tid]).toBe(500);
  });

  it("elimination works, safe mode blocks it", () => {
    const s = G.createGauntlet(file, teams(4), opts);
    expect(G.eliminateTeam(s, "t1").teams[0].eliminated).toBe(true);
    const safe = G.createGauntlet(file, teams(4), { ...opts, safeMode: true });
    expect(G.eliminateTeam(safe, "t1")).toBe(safe);
  });

  it("survival mode cuts the single lowest team after a lane round", () => {
    const o: G.Options = { ...opts, mode: "survival" };
    let s = toLaneRound(["quickfire", "quickfire", "puzzle", "wild"], 4, o);
    const scorer = s.activeTeamId!;
    while (s.phase === "laneRound") {
      s = s.activeTeamId !== scorer ? G.resolveAnswer(s, true, 0) : G.passQuestion(s, 0);
      s = G.advanceRound(s, 0);
    }
    expect(s.phase).toBe("intermission");
    expect(s.eliminationHistory).toEqual([scorer]);
    const safe = toLaneRound(["quickfire", "quickfire", "puzzle", "wild"], 4, { ...o, safeMode: true });
    expect(G.survivalCut(safe)).toBeNull();
  });

  it("ties give co-winners, never a random sole winner", () => {
    let s = G.createGauntlet(file, teams(3), opts);
    s = { ...s, scores: { t1: 500, t2: 500, t3: 100 } };
    s = G.finishMatch(s);
    expect(s.phase).toBe("results");
    expect(s.winners).toEqual(["t1", "t2"]);
    expect(G.standings(s).map((x) => x.rank)).toEqual([1, 1, 3]);
  });

  it("plays a full match to results locally", () => {
    let s = toLaneChoice(3);
    let guard = 0;
    while (s.phase !== "results" && guard++ < 500) {
      if (s.phase === "laneChoice") {
        const p = G.nextPicker(s);
        if (p) s = G.chooseLane(s, p, G.LANES.find((l) => !G.laneLocked(s, l))!);
      } else if (s.phase === "choice" && s.turns.length === 0) {
        for (const t of G.activeTeams(s)) s = G.submitChoice(s, t.id, "bold");
      } else if (G.currentTurn(s) && !G.currentTurn(s)!.resolved) {
        s = G.resolveAnswer(s, true, 0, s.teams[0].id);
      }
      s = G.advanceRound(s, 0);
    }
    expect(s.phase).toBe("results");
    expect(s.winners.length).toBeGreaterThan(0);
    expect(s.finalists.length).toBe(3);
  });
});
