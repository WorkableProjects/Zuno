import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { newCareer, gameSeed } from "../src/games/gridiron/gmCareer";
import { createGame, runPlay, step, nextDecision, type GameState } from "../src/games/gridiron/gmEngine";
import { createCustomPlay, newCustomPlayDraft } from "../src/games/gridiron/gmCustomPlays";
import { defCallFor, getDefensivePlays, getOffensivePlays, offCallFor } from "../src/games/gridiron/gmPlaybook";
import { GameDay, accentOn, afterSit, downText, inkOn, resultOf, snapOfRecord, snapSit } from "../src/games/gridiron/screens/GameDay";
import { PlayPicker, filterPlays, suggest, wantedTags, type PickSit } from "../src/games/gridiron/screens/PlayPicker";
import { Ctx } from "../src/games/gridiron/screens/ui";
import type { Career } from "../src/games/gridiron/gmTypes";

const career = (): Career => newCareer({ seed: 7, teamId: 2, coachName: "T", slot: 1 });
const provide = (c: Career, el: JSX.Element) => createElement(Ctx.Provider, { value: { c, update: () => {}, openPlayer: () => {}, go: () => {} } }, el);

function game(c: Career, userTeam: 0 | 1 | null = null): GameState {
  const sg = c.schedule.find((x) => x.home === c.userTeam || x.away === c.userTeam)!;
  return createGame({ home: c.teams[sg.home], away: c.teams[sg.away], players: c.players, seed: gameSeed(c, sg), week: sg.week, userTeam });
}

describe("game day screen", () => {
  it("renders the broadcast bar, controls, field and side panels", () => {
    const c = career();
    const sg = c.schedule.find((x) => x.home === c.userTeam || x.away === c.userTeam)!;
    const html = renderToString(provide(c, createElement(GameDay, { game: sg, userSide: sg.home === c.userTeam ? 0 : 1, onDone: () => {} })));
    for (const t of ["Scorebug", "Playback controls", "Speed", "Replay", "Timeout", "Drive", "Quarter", "Field view", "Camera", 'role="tablist"', "Play by play", "Plays appear here"]) expect(html).toContain(t);
    expect(html).toContain('aria-live="polite"');
  });
  it("explains disabled controls instead of hiding them", () => {
    const c = career();
    const sg = c.schedule.find((x) => x.home === c.userTeam || x.away === c.userTeam)!;
    const html = renderToString(provide(c, createElement(GameDay, { game: sg, userSide: null, onDone: () => {} })));
    expect(html).toContain("Timeouts are only available when you coach.");
  });
});

describe("scorebug situation", () => {
  it("shows the snap down and distance while a play animates and the after-state when it ends", () => {
    const g = game(career());
    let checked = 0;
    for (let i = 0; i < 400 && g.phase !== "final"; i++) {
      const before = snapSit(g);
      const r = step(g);
      if (!r) continue;
      const animating = snapOfRecord(r, before);
      expect(animating.down).toBe(r.down);
      expect(animating.dist).toBe(r.dist);
      expect(animating.ballOn).toBe(r.ballOn);
      expect(animating.score).toEqual(before.score); // scores only change when the play is over
      const done = afterSit(r.after!);
      expect(done.score).toEqual([g.score[0], g.score[1]]);
      expect(done.ballOn).toBe(g.ballOn);
      expect(done.down).toBe(g.down);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
  it("labels results from outcome flags", () => {
    const g = game(career());
    const seen = new Set<string>();
    for (let i = 0; i < 1500 && g.phase !== "final"; i++) {
      const r = step(g);
      if (!r) continue;
      const res = resultOf(r);
      expect(res.label.length).toBeGreaterThan(0);
      if (r.spec.outcome.touchdown) expect(res.label).toMatch(/Touchdown|Pick-six|Defensive touchdown/);
      if (r.spec.outcome.turnoverOnDowns) expect(res.label).toBe("Turnover on downs");
      if (r.spec.outcome.kind === "incomplete" && !r.spec.outcome.penalty) expect(res.label).toMatch(/^Incomplete/);
      seen.add(res.label);
    }
    expect(seen.has("First down")).toBe(true);
    expect(downText({ ...snapSit(g), phase: "kickoff" })).toBe("Kickoff");
    expect(downText({ down: 3, dist: 6, ballOn: 50, poss: 0, quarter: 1, clock: 1, score: [0, 0], phase: "play" })).toBe("3rd & 6");
    expect(downText({ down: 1, dist: 7, ballOn: 93, poss: 0, quarter: 1, clock: 1, score: [0, 0], phase: "play" })).toBe("1st & Goal");
  });
  it("keeps team colours readable on the dark bug", () => {
    expect(accentOn(["#111827", "#f5f5f5"])).toBe("#f5f5f5");
    expect(accentOn(["#000000", "#111111"])).toBe("#d4d8d0");
    expect(accentOn(["#fad63c", "#000000"])).toBe("#fad63c");
    expect(inkOn("#fad63c")).toBe("#101410");
    expect(inkOn("#102040")).toBe("#ffffff");
  });
});

describe("play picker", () => {
  const sit = (o: Partial<PickSit> = {}): PickSit => ({ down: 1, dist: 10, ballOn: 30, quarter: 2, clock: 600, diff: 0, ...o });
  const c = career();
  const off = getOffensivePlays(c);
  const def = getDefensivePlays(c);

  it("suggests plays for the situation, deterministically", () => {
    expect(wantedTags(sit({ dist: 1 }))).toContain("short-yardage");
    expect(wantedTags(sit({ ballOn: 97, dist: 3 }))).toEqual(expect.arrayContaining(["goal-line", "red-zone"]));
    expect(wantedTags(sit({ quarter: 4, clock: 90 }))).toContain("two-minute");
    const a = suggest(off, sit({ ballOn: 98, dist: 2 }));
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.why.includes("goal-line") || x.why.includes("short-yardage") || x.why.includes("red-zone"))).toBe(true);
    expect(suggest(off, sit({ ballOn: 98, dist: 2 })).map((x) => x.play.id)).toEqual(a.map((x) => x.play.id));
    expect(suggest(def, sit({ dist: 1 })).length).toBeGreaterThan(0);
    expect(suggest(off, sit()).length).toBeGreaterThanOrEqual(1);
  });
  it("filters by tab, search, formation and personnel", () => {
    const f = (o: object) => filterPlays(off, "offense", { tab: "all", query: "", formation: "", personnel: "", ...o }, [], []);
    expect(f({}).length).toBe(off.length);
    const runs = f({ tab: "a" });
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((p) => p.call.type === "run")).toBe(true);
    expect(f({ tab: "b" }).every((p) => p.call.type !== "run")).toBe(true);
    expect(f({ query: "zzzz-nothing" })).toEqual([]);
    expect(f({ formation: "Empty" }).every((p) => p.call.formation === "Empty")).toBe(true);
    expect(f({ tab: "starred" })).toEqual([]);
    expect(filterPlays(off, "offense", { tab: "starred", query: "", formation: "", personnel: "" }, [off[2].id], [])).toEqual([off[2]]);
    expect(filterPlays(off, "offense", { tab: "recent", query: "", formation: "", personnel: "" }, [], [off[3].id, "gone"]).map((p) => p.id)).toEqual([off[3].id]);
  });
  it("renders tabs, filters, shortcuts, a coordinator card and the empty state", () => {
    const html = renderToString(createElement(PlayPicker, { unit: "offense", plays: off, sit: sit(), storageKey: "x", onPick: () => {}, onCoordinator: () => {}, coordinatorLabel: "Let the OC pick" }));
    for (const t of ["Suggested", "Run", "Pass", "Situational", "Starred", "Recent", "Custom", "Search plays", "Any formation", "Coordinator call", 'data-key="0"', 'data-key="1"', "For this situation"]) expect(html).toContain(t);
    const dh = renderToString(createElement(PlayPicker, { unit: "defense", plays: def, sit: sit(), storageKey: "x", onPick: () => {}, onCoordinator: () => {}, coordinatorLabel: "Let the DC pick" }));
    expect(dh).toContain("Coverage");
    expect(dh).toContain("Pressure");
  });
});

describe("custom plays in game", () => {
  it("shows the user's custom plays in the picker and runs them through the engine, user only", () => {
    const c = career();
    const r = createCustomPlay([], { ...newCustomPlayDraft("offense", []), name: "Rocket Slant", concept: "Slant-Flat", type: "short" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    c.customPlays = r.plays;
    const off = getOffensivePlays(c);
    const custom = off.find((p) => p.origin === "custom")!;
    expect(custom.name).toBe("Rocket Slant");
    const html = renderToString(createElement(PlayPicker, { unit: "offense", plays: off, sit: { down: 1, dist: 10, ballOn: 30, quarter: 1, clock: 800, diff: 0 }, storageKey: "x", onPick: () => {}, onCoordinator: () => {}, coordinatorLabel: "OC" }));
    expect(html).toContain("Custom (1)");
    const g = game(c, 0);
    while (g.phase !== "play") step(g);
    const before = g.plays.length;
    const rec = runPlay(g, { id: custom.id, name: custom.name, call: offCallFor(custom, 1) });
    expect(rec).not.toBeNull();
    expect(g.plays.length).toBe(before + 1);
    expect(rec!.spec.playId).toBe(custom.id);
    expect(rec!.spec.playName).toBe("Rocket Slant");
    expect(rec!.after).toBeDefined();
    // The coordinator never receives it: an AI-called game never mentions the custom play.
    const g2 = game(c, null);
    for (let i = 0; i < 400 && g2.phase !== "final"; i++) step(g2);
    expect(g2.plays.some((p) => p.spec.playId === custom.id)).toBe(false);
    // Defense uses the same route.
    const dcall = defCallFor(getDefensivePlays(c)[0]);
    const g3 = game(c, 1);
    while (g3.phase !== "play") step(g3);
    expect(nextDecision(g3).kind).toBe("play");
    expect(step(g3, { def: dcall })).not.toBeNull();
  });
});
