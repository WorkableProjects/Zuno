import { describe, expect, it } from "vitest";
import { BOARD_COOLDOWN_MS, BOARD_IDS, cooldownReady, isBoardId } from "../src/lib/soundboard";
import rules from "../database.rules.json";

describe("soundboard", () => {
  it("only accepts whitelisted sound ids", () => {
    for (const id of BOARD_IDS) expect(isBoardId(id)).toBe(true);
    expect(BOARD_IDS.length).toBeGreaterThanOrEqual(6);
    for (const bad of ["", "hover", "AIRHORN", "airhorn ", null, undefined, 3, {}]) expect(isBoardId(bad)).toBe(false);
  });

  it("enforces the per-device cooldown", () => {
    expect(cooldownReady(-Infinity, 0)).toBe(true);
    expect(cooldownReady(1000, 1000 + BOARD_COOLDOWN_MS - 1)).toBe(false);
    expect(cooldownReady(1000, 1000 + BOARD_COOLDOWN_MS)).toBe(true);
  });

  it("keeps the database rules in step with the whitelist", () => {
    for (const room of ["hb", "liar", "rpg"] as const) {
      const s = (rules.rules[room].$code.board.$id.s as { ".validate": string })[".validate"];
      const allowed = s.match(/\^\(([^)]*)\)\$/)![1].split("|");
      expect(allowed.sort()).toEqual([...BOARD_IDS].sort());
    }
  });
});

describe("soundboard clips", () => {
  it("only maps whitelisted ids to files that exist", async () => {
    const { BOARD_CLIPS } = await import("../src/lib/soundboard");
    const { existsSync } = await import("node:fs");
    for (const [id, file] of Object.entries(BOARD_CLIPS)) {
      expect(isBoardId(id)).toBe(true);
      expect(existsSync(`public/sounds/board/${file}`)).toBe(true);
    }
  });
});
