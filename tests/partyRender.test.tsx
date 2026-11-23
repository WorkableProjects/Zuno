import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { blackjackDef } from "../src/games/blackjack/bjDef";
import { drawDef } from "../src/games/drawit/drawDef";
import { feudDef } from "../src/games/feud/feudDef";
import type { AnyPartyDef, PartyAction } from "../src/games/party/types";

const players = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bo" },
  { id: "c", name: "Cy" },
];

/** Plays a game forward with a script and renders every device's view at each step. */
function renderAll(def: AnyPartyDef, script: Array<(s: unknown) => PartyAction | null>) {
  let s = def.create(players, def.defaultSettings, 11);
  const seen = new Set<string>();
  let lastPhase = "";
  for (let step = 0; step < 4000; step++) {
    const o = { ...def.toOnline(s), rev: step };
    seen.add(o.phase);
    const render = o.phase !== lastPhase || step % 40 === 0;
    lastPhase = o.phase;
    for (const p of render ? players : []) {
      const html = renderToString(
        <def.Play code="ABCDE" me={p.id} lobby={{ phase: "playing", createdAt: 0, players: {}, order: [], note: "", game: o }} game={o} priv={def.privateOf(s, p.id)} send={async () => undefined} busy={false} avatarOf={() => null} />,
      );
      expect(html.length).toBeGreaterThan(100);
    }
    if (def.isOver(s)) break;
    let acted = false;
    for (const f of script) {
      const a = f(s);
      if (a) {
        const next = def.reduce(s, a);
        if (next !== s) {
          s = next;
          acted = true;
          break;
        }
      }
    }
    if (!acted) s = def.reduce(s, { type: "tick" });
  }
  return seen;
}

const mv = (by: string, move: Record<string, unknown>): PartyAction => ({ type: "move", by, move });

describe("party game screens render in every phase", () => {
  it("blackjack", () => {
    const seen = renderAll(blackjackDef, [
      () => mv("a", { type: "bet", amount: 50 }),
      () => mv("b", { type: "bet", amount: 20 }),
      () => mv("c", { type: "bet", amount: 10 }),
      (s) => {
        const t = (s as { turn: { id: string } | null }).turn;
        return t ? mv(t.id, { type: "hit" }) : null;
      },
    ]);
    expect([...seen]).toEqual(expect.arrayContaining(["betting", "playing", "results", "over"]));
  });
  it("draw it", () => {
    const seen = renderAll(drawDef, [
      (s) => mv((s as { players: Array<{ id: string }>; drawerIndex: number }).players[(s as { drawerIndex: number }).drawerIndex].id, { type: "pick", index: 1 }),
      (s) => {
        const d = s as { word: string | null; phase: string };
        return d.word && d.phase === "draw" ? mv("b", { type: "guess", text: d.word }) : null;
      },
    ]);
    expect([...seen]).toEqual(expect.arrayContaining(["pick", "draw", "reveal", "over"]));
  });
  it("survey feud", () => {
    const sv = { type: "survey", prompt: "Name a pet", answers: [{ text: "dog", points: 40 }, { text: "cat", points: 30 }, { text: "fish", points: 20 }] };
    const seen = renderAll(feudDef, [
      ...["a", "b", "c"].map((id) => (s: unknown) => ((s as { phase: string; surveys: Record<string, unknown> }).phase === "write" && !(s as { surveys: Record<string, unknown> }).surveys[id] ? mv(id, sv) : null)),
      (s) => {
        const g = (s as { guesser: string | null; phase: string }).guesser;
        return g && (s as { phase: string }).phase === "guess" ? mv(g, { type: "guess", text: "llama" }) : null;
      },
    ]);
    expect([...seen]).toEqual(expect.arrayContaining(["write", "guess", "judge", "show", "roundEnd", "over"]));
  });
});
