import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { newCareer } from "../src/games/gridiron/gmCareer";
import { Cap, DraftRoom, FreeAgency, Trades } from "../src/games/gridiron/screens/Front";
import { Ctx } from "../src/games/gridiron/screens/ui";

const render = (el: () => JSX.Element, phase?: "draft" | "fa") => {
  const c = newCareer({ seed: 7, teamId: 2, coachName: "T", slot: 1 });
  if (phase) c.phase = phase;
  return renderToString(createElement(Ctx.Provider, { value: { c, update: () => {}, openPlayer: () => {}, go: () => {} } }, createElement(el)));
};

describe("front office screens render", () => {
  it("trade builder shows both sides, partner, steps and value meter", () => {
    const html = render(Trades);
    for (const t of ["You give", "You receive", "Trade partner", "Deal summary", "Review trade", "Clear deal", "Roster assets", "Draft assets"]) expect(html).toContain(t);
    expect(html).toContain('role="tablist"');
  });
  it("renders contracts, free agency and draft room", () => {
    expect(render(Cap)).toContain("Active roster");
    expect(render(FreeAgency, "fa")).toContain("Free agents");
    expect(render(DraftRoom)).toContain("draft class");
  });
});
