// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { advance, newCareer } from "../src/games/gridiron/gmCareer";
import {
  deleteCareer, exportCareerText, importCareerText, loadCareer, loadCareerResult, migrateCareer, readIndex, rebuildIndex, saveCareer, saveCareerResult, type SavedCareer,
} from "../src/games/gridiron/gmSave";
import { validateGameFileText } from "../src/game-files/schema/validateGameFile";
import { sanitizeCustomPlays, validateGridiron } from "../src/game-files/schema/gridiron";

class MemStorage {
  data = new Map<string, string>();
  quota = false;
  broken = false;
  getItem(k: string) {
    if (this.broken) throw new Error("blocked");
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error("blocked");
    if (this.quota) throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    this.data.set(k, v);
  }
  removeItem(k: string) {
    if (this.broken) throw new Error("blocked");
    this.data.delete(k);
  }
}
let ls: MemStorage;
beforeEach(() => {
  ls = new MemStorage();
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = ls;
});

const make = (slot = 1, team = 3) => newCareer({ seed: 11, teamId: team, coachName: "Tester", slot });

describe("gridiron saves", () => {
  it("round-trips a career through a slot (localStorage fallback)", async () => {
    const c = make();
    advance(c);
    expect((await saveCareerResult(c)).ok).toBe(true);
    const back = await loadCareer(1);
    expect(back).not.toBeNull();
    expect(back!.week).toBe(c.week);
    expect(back!.coachName).toBe("Tester");
    expect(back!.players).toEqual(JSON.parse(JSON.stringify(c.players)));
    expect(readIndex()[0].team).toContain(c.teams[3].name);
  });

  it("keeps three slots separate and tracks user team changes", async () => {
    await saveCareer(make(1, 2));
    await saveCareer(make(2, 9));
    await saveCareer(make(3, 20));
    expect((await loadCareer(1))!.userTeam).toBe(2);
    expect((await loadCareer(2))!.userTeam).toBe(9);
    expect((await loadCareer(3))!.userTeam).toBe(20);
    await saveCareer(make(2, 14));
    expect((await loadCareer(2))!.userTeam).toBe(14);
    expect(readIndex()).toHaveLength(3);
    expect(await deleteCareer(1)).toBe(true);
    expect(await loadCareer(1)).toBeNull();
    expect(readIndex().map((x) => x.slot).sort()).toEqual([2, 3]);
  });

  it("reports corrupt JSON and structural damage without throwing", async () => {
    ls.data.set("zuno.gridiron.slot1", "{not json");
    expect(await loadCareerResult(1)).toMatchObject({ status: "corrupt" });
    ls.data.set("zuno.gridiron.slot2", JSON.stringify({ version: 1, teams: [] }));
    expect(await loadCareerResult(2)).toMatchObject({ status: "corrupt" });
    expect(await loadCareerResult(3)).toEqual({ status: "empty" });
    const idx = await rebuildIndex();
    expect(idx.filter((x) => x.corrupt).map((x) => x.slot)).toEqual([1, 2]);
  });

  it("migrates an old v1 save: adds saveVersion, empty customPlays and defaults", async () => {
    const c = make() as unknown as Record<string, unknown>;
    delete c.saveVersion;
    delete c.customPlays;
    delete c.coachMode;
    delete c.log;
    delete c.deadCap;
    ls.data.set("zuno.gridiron.slot2", JSON.stringify(c));
    const r = await loadCareerResult(2);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.career.saveVersion).toBe(2);
    expect(r.career.customPlays).toEqual([]);
    expect(r.career.coachMode).toBe(false);
    expect(r.career.log).toEqual([]);
    expect(r.career.deadCap).toEqual({});
    expect(r.career.slot).toBe(2);
    expect(r.notes[0]).toMatch(/Upgraded/);
  });

  it("rejects saves from a newer format and bad versions", () => {
    const c = { ...make(), saveVersion: 99 };
    expect(migrateCareer(c).ok).toBe(false);
    expect(migrateCareer({ ...make(), version: 2 }).ok).toBe(false);
    expect(migrateCareer(null).ok).toBe(false);
  });

  it("stores custom plays and drops unsafe ones", async () => {
    const c = make() as SavedCareer;
    c.customPlays = [
      { id: "cp-1", name: "Mesh Shallow", extra: { nested: [1, 2] } },
      { id: "cp-1", name: "Dupe" },
      { id: "bad id!", name: "Bad" },
      { id: "cp-3", name: "" },
      "nope" as never,
    ];
    await saveCareer(c);
    const back = (await loadCareer(1)) as SavedCareer;
    expect(back.customPlays).toHaveLength(1);
    expect(back.customPlays![0]).toMatchObject({ id: "cp-1", name: "Mesh Shallow", extra: { nested: [1, 2] } });
    expect(sanitizeCustomPlays("x").problems.length).toBe(1);
    expect(sanitizeCustomPlays(undefined).plays).toEqual([]);
  });

  it("surfaces quota errors and does not report success", async () => {
    ls.quota = true;
    const c = make();
    const r = await saveCareerResult(c);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("quota");
    expect(r.error).toMatch(/full/i);
    expect(readIndex()).toEqual([]);
  });

  it("handles storage that is blocked entirely", async () => {
    ls.broken = true;
    const r = await saveCareerResult(make());
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("unavailable");
    expect(readIndex()).toEqual([]);
    expect(await loadCareerResult(1)).toEqual({ status: "empty" });
  });

  it("rejects a slot that does not exist", async () => {
    const c = make();
    c.slot = 7;
    expect((await saveCareerResult(c)).ok).toBe(false);
  });
});

describe("gridiron export and import", () => {
  it("exports through validateGameFile and imports back with custom plays", () => {
    const c = make() as SavedCareer;
    advance(c);
    c.customPlays = [{ id: "cp-9", name: "Stick Option" }];
    const text = exportCareerText(c);
    expect(validateGameFileText(text, "gridiron").ok).toBe(true);
    const r = importCareerText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.career.customPlays).toEqual([{ id: "cp-9", name: "Stick Option" }]);
    expect(r.career.userTeam).toBe(c.userTeam);
    expect(r.career.year).toBe(c.year);
    expect(r.career.week).toBe(c.week);
    expect(Object.keys(r.career.players)).toHaveLength(Object.keys(c.players).length);
  });

  it("imports a v1 file with no customPlays and migrates it", () => {
    const c = make() as unknown as Record<string, unknown>;
    delete c.saveVersion;
    const text = JSON.stringify({ schemaVersion: 1, gameType: "gridiron", metadata: { title: "Old", description: "", author: "", coverImage: null }, appearance: { accentColor: "#22C55E", backgroundPreset: "tide" }, content: { league: null, career: c }, settings: {} });
    const r = importCareerText(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.career.customPlays).toEqual([]);
      expect(r.warnings.join(" ")).toMatch(/Upgraded/);
    }
  });

  it("rejects invalid imports with readable errors", () => {
    expect(importCareerText("not json").ok).toBe(false);
    expect(importCareerText(JSON.stringify({ schemaVersion: 1, gameType: "gridiron", metadata: { title: "x" }, content: { league: null, career: null } })).ok).toBe(false);
    const c = { ...make(), saveVersion: 5 };
    const res = validateGridiron({ metadata: { title: "x" }, content: { career: c } });
    expect(res.ok).toBe(false);
    const bad = validateGridiron({ metadata: { title: "x" }, content: { career: { ...make(), customPlays: "nope" } } });
    expect(bad.ok).toBe(false);
  });

  it("warns, but still opens, when some custom plays in a file are damaged", () => {
    const c = { ...make(), customPlays: [{ id: "ok", name: "Fine" }, { id: "", name: "Bad" }] };
    const res = validateGridiron({ metadata: { title: "x" }, content: { career: c } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warnings.join(" ")).toMatch(/custom play/);
  });
});
