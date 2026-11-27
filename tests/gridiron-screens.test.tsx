import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { newCareer } from "../src/games/gridiron/gmCareer";
import { createCustomPlay, newCustomPlayDraft, type CustomPlay } from "../src/games/gridiron/gmCustomPlays";
import { Hub } from "../src/games/gridiron/screens/Hub";
import { History, Leaders, Standings } from "../src/games/gridiron/screens/League";
import { Playbook } from "../src/games/gridiron/screens/Playbook";
import { DepthChart, PlayerCard, Roster, Staff } from "../src/games/gridiron/screens/Team";
import { Ctx } from "../src/games/gridiron/screens/ui";

type Cx = ReturnType<typeof newCareer> & { customPlays?: CustomPlay[] };
const make = () => newCareer({ seed: 11, teamId: 3, coachName: "T", slot: 1 }) as Cx;
const render = (el: () => JSX.Element, c: Cx = make()) =>
  renderToString(createElement(Ctx.Provider, { value: { c, update: () => {}, openPlayer: () => {}, go: () => {} } }, createElement(el)));

describe("management screens render", () => {
  it("hub, roster, depth chart, staff, standings, leaders and history", () => {
    expect(render(() => createElement(Hub, { onPlay: () => {}, onWatch: () => {}, onAdvance: () => {} }))).toContain("Injury report");
    const roster = render(Roster);
    for (const t of ["Search", "Starter", "role=\"region\"", "players shown"]) expect(roster).toContain(t);
    expect(render(DepthChart)).toContain("Auto-fill depth chart");
    expect(render(Staff)).toContain("Available coaches");
    expect(render(Standings)).toContain("Legend");
    expect(render(Leaders)).toContain("season totals");
    expect(render(History)).toContain("Trophy room");
  });
  it("player card handles a missing player", () => {
    const c = make();
    const html = renderToString(createElement(Ctx.Provider, { value: { c, update: () => {}, openPlayer: () => {}, go: () => {} } }, createElement(PlayerCard, { id: -5, onClose: () => {} })));
    expect(html).toContain("Player not found");
  });
});

describe("playbook library", () => {
  it("shows built-in plays, filters and the no-route-drawing note", () => {
    const html = render(Playbook).replace(/<!-- -->/g, "");
    for (const t of ["Playbook library", "Search", "Category", "Formation", "Personnel", "New offense play", "Copy to custom", "routes are not drawn"]) expect(html).toContain(t);
  });
  it("lists saved custom plays with edit, duplicate and delete", () => {
    const c = make();
    const r = createCustomPlay([], { ...newCustomPlayDraft("offense", []), name: "My Slant Shot" });
    expect(r.ok).toBe(true);
    if (r.ok) c.customPlays = r.plays;
    const html = render(Playbook, c);
    for (const t of ["My Slant Shot", "Edit My Slant Shot", "Duplicate My Slant Shot", "Delete My Slant Shot", "Available in live games"]) expect(html).toContain(t);
  });
  it("tolerates a career saved before custom plays existed", () => {
    const c = make();
    delete c.customPlays;
    expect(() => render(Playbook, c)).not.toThrow();
  });
});
