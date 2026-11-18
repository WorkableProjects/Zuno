import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateGameFileText } from "../src/game-files/schema/validateGameFile";
import { validateGauntlet } from "../src/game-files/schema/gauntlet";

const sampleText = readFileSync(new URL("../public/samples/trivia-gauntlet.zuno.json", import.meta.url), "utf8");
const sample = () => JSON.parse(sampleText);

describe("gauntlet validator", () => {
  it("accepts the sample deck through the shared entry point", () => {
    const r = validateGameFileText(sampleText, "gauntlet");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.gameType).toBe("gauntlet");
  });

  it("has the counts the spec asks for", () => {
    const c = sample().content;
    expect(c.lanes.quickfire).toHaveLength(12);
    expect(c.lanes.puzzle).toHaveLength(6);
    expect(c.lanes.wild).toHaveLength(6);
    expect(c.choice).toHaveLength(4);
    expect(c.chaos).toHaveLength(4);
    expect(c.final.climb).toHaveLength(8);
    expect(c.final.crossroads).toHaveLength(3);
    expect(c.final.lock).toHaveLength(3);
  });

  const fails = (mut: (d: any) => void, match: RegExp) => {
    const d = sample();
    mut(d);
    const r = validateGauntlet(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(match);
  };

  it("rejects too few lane items, warm-up and climb questions", () => {
    fails((d) => (d.content.lanes.puzzle = d.content.lanes.puzzle.slice(0, 3)), /Puzzle lane list needs at least 4/);
    fails((d) => (d.content.warmup = []), /warm-up list needs at least 1/);
    fails((d) => (d.content.final.climb = d.content.final.climb.slice(0, 4)), /Final climb list needs at least 5/);
  });

  it("rejects invalid wild effects, missing choice options and bad lock challenges", () => {
    fails((d) => (d.content.lanes.wild[0].effect = "nuke"), /unknown wild effect/);
    fails((d) => delete d.content.choice[0].bold, /bold option is not a valid question/);
    fails((d) => (d.content.final.lock[0].statements = ["a", "b"]), /exactly 4 statements/);
  });

  it("rejects duplicate ids within a round, scripts, long text and unsafe images", () => {
    fails((d) => (d.content.lanes.quickfire[1].id = d.content.lanes.quickfire[0].id), /reuses the id/);
    fails((d) => (d.content.chaos[0].prompt = "<script>x</script>"), /script tag/);
    fails((d) => (d.content.warmup[0].answer = "x".repeat(300)), /longer than 200/);
    fails((d) => (d.content.warmup[0].image = "http://example.com/a.png"), /https/);
  });

  it("enforces team and player limits", () => {
    fails((d) => (d.settings.maxTeams = 17), /maxTeams/);
    fails((d) => (d.settings.playersPerTeam = [1, 9]), /playersPerTeam/);
    fails((d) => (d.settings.minTeams = 0), /minTeams/);
  });
});
