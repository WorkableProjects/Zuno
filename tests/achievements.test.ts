import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, applyEvent, cleanProgress, mergeProgress, type ProgressMap } from "../src/lib/achievements";
import { canEquip, findCosmetic, isAdminEmail, type Inventory } from "../src/lib/cosmetics";
import { parseAvatar } from "../src/components/avatar/avatarData";

const play = (m: ProgressMap, gameType: string) => applyEvent(m, { type: "gameStarted", gameType, online: false }, 1000);

describe("achievements", () => {
  it("tracks incremental progress and unlocks once at the goal", () => {
    let m: ProgressMap = {};
    const first = play(m, "jeopardy");
    expect(first.unlocked.map((a) => a.id)).toContain("first-game");
    m = first.next;
    expect(m.regular.count).toBe(1);
    for (let i = 0; i < 8; i++) m = play(m, "jeopardy").next;
    expect(m.regular).toMatchObject({ count: 9 });
    expect(m.regular.at).toBeUndefined();
    const tenth = play(m, "jeopardy");
    expect(tenth.unlocked.map((a) => a.id)).toEqual(["regular"]);
    expect(tenth.next.regular).toMatchObject({ count: 10, at: 1000 });
    // Never unlocks twice.
    expect(play(tenth.next, "jeopardy").unlocked.map((a) => a.id)).not.toContain("regular");
  });
  it("counts distinct games for Explorer and distinct themes for Stylist", () => {
    let m: ProgressMap = {};
    for (const g of ["jeopardy", "jeopardy", "liar"]) m = play(m, g).next;
    expect(m.explorer.count).toBe(2);
    for (const t of ["ocean", "ocean", "vice", "dark"]) m = applyEvent(m, { type: "themeChanged", theme: t }).next;
    expect(m.stylist.at).toBeTypeOf("number");
  });
  it("ignores irrelevant events without touching progress", () => {
    const { next, unlocked } = applyEvent({}, { type: "builderOpened" });
    expect(unlocked.map((a) => a.id)).toEqual(["builder"]);
    expect(next["first-game"]).toBeUndefined();
  });
  it("cleans network input and merges devices without losing progress", () => {
    expect(cleanProgress({ regular: { count: 999 }, bogus: { count: 1 }, host: "x" })).toEqual({ regular: { count: 10 } });
    const merged = mergeProgress({ regular: { count: 4 }, explorer: { count: 1, seen: ["liar"] } }, { regular: { count: 7, at: 5 }, explorer: { count: 1, seen: ["rpg"] } });
    expect(merged.regular).toEqual({ count: 7, at: 5 });
    expect(merged.explorer.count).toBe(2);
    expect(ACHIEVEMENTS.every((a) => a.goal > 0)).toBe(true);
  });
});

describe("cosmetics", () => {
  const inv: Inventory = { grantedDecorations: ["neon"], grantedNameStyles: [], achievements: ["first-game"], admin: false };
  it("mirrors the rules for who may equip what", () => {
    expect(canEquip(findCosmetic("decoration", "ring")!, inv)).toBe(true);
    expect(canEquip(findCosmetic("decoration", "neon")!, inv)).toBe(true);
    expect(canEquip(findCosmetic("decoration", "gold")!, inv)).toBe(false);
    expect(canEquip(findCosmetic("decoration", "first-game")!, inv)).toBe(true);
    expect(canEquip(findCosmetic("decoration", "explorer")!, inv)).toBe(false);
    expect(canEquip(findCosmetic("decoration", "zuno")!, inv)).toBe(false);
    expect(canEquip(findCosmetic("nameStyle", "zuno")!, { ...inv, admin: true })).toBe(true);
  });
  it("recognises only the verified admin email, in any case", () => {
    expect(isAdminEmail("ItzDutchs@gmail.com ", true)).toBe(true);
    expect(isAdminEmail("itzdutchs@gmail.com", false)).toBe(false);
    expect(isAdminEmail("someone@gmail.com", true)).toBe(false);
  });
  it("avatars keep valid cosmetic ids and drop junk", () => {
    expect(parseAvatar({ color: "#112233", deco: "ring", style: "accent" })).toMatchObject({ deco: "ring", style: "accent" });
    const bad = parseAvatar({ color: "#112233", deco: "<script>", style: 5 });
    expect(bad).toEqual({ color: "#112233", emoji: null, photo: null });
  });
});
