import { describe, expect, it } from "vitest";
import { createGame, nextDecision, step } from "../src/games/gridiron/gmEngine";
import { generateLeague } from "../src/games/gridiron/gmLeague";
import { buildPlayScript } from "../src/games/gridiron/gmPlayScript";
import { CONCEPTS } from "../src/games/gridiron/gmRoutes";
import { mulberry32 } from "../src/games/gridiron/gmRandom";
import {
  DEF_CATALOG,
  DEF_PLAYS,
  OFF_CATALOG,
  OFF_PLAYS,
  aiDefCall,
  aiOffCall,
  defName,
  getDefensivePlays,
  getOffensivePlays,
  playName,
  resolveDefensiveName,
  resolvePlayName,
  validateDefensivePlay,
  validateOffensivePlay,
  type Situation,
} from "../src/games/gridiron/gmPlaybook";
import {
  createCustomPlay,
  customPlaysOf,
  deleteCustomPlay,
  draftFromBuiltIn,
  duplicateCustomPlay,
  exportCustomPlaysJson,
  importCustomPlaysJson,
  newCustomPlayDraft,
  parseCustomPlays,
  patchDraft,
  serializeCustomPlays,
  updateCustomPlay,
  validateCustomPlay,
  withCustomPlays,
  type CustomPlay,
  type CustomPlayDraft,
} from "../src/games/gridiron/gmCustomPlays";
import { OFF_SCHEMES, COVERAGES, type GamePlan, type OffCall } from "../src/games/gridiron/gmTypes";

const L = generateLeague(42);
const PLAN: GamePlan = { passRatio: 55, aggression: 50, blitz: 40, tempo: 50, twoPoint: "Situational" };

function mk(draft: CustomPlayDraft, list: CustomPlay[] = []): CustomPlay[] {
  const r = createCustomPlay(list, draft);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plays;
}

function sits(): Situation[] {
  const out: Situation[] = [];
  for (const down of [1, 2, 3, 4])
    for (const dist of [1, 2, 4, 7, 10, 15])
      for (const ballOn of [3, 25, 50, 80, 92, 98])
        for (const [quarter, clock] of [[1, 800], [2, 90], [2, 20], [3, 400], [4, 250], [4, 100], [5, 300]])
          for (const scoreDiff of [-14, -3, 0, 4, 17]) out.push({ down, dist, ballOn, quarter, clock, scoreDiff });
  return out;
}

describe("built-in playbook catalog", () => {
  it("is large, coherent and valid", () => {
    expect(OFF_CATALOG.length).toBeGreaterThanOrEqual(30);
    expect(OFF_CATALOG.length).toBeLessThanOrEqual(50);
    expect(DEF_CATALOG.length).toBeGreaterThanOrEqual(20);
    for (const p of OFF_CATALOG) {
      expect(validateOffensivePlay(p.call), p.id).toEqual([]);
      expect(p.tagline.length, p.id).toBeGreaterThan(10);
      expect(p.origin).toBe("builtin");
      if (p.call.type !== "run") expect(CONCEPTS[p.call.concept], p.id).toBeTruthy();
    }
    for (const p of DEF_CATALOG) expect(validateDefensivePlay(p.call), p.id).toEqual([]);
  });

  it("has unique ids, names and calls", () => {
    for (const cat of [OFF_CATALOG, DEF_CATALOG] as const) {
      expect(new Set(cat.map((p) => p.id)).size).toBe(cat.length);
      expect(new Set(cat.map((p) => p.name.toLowerCase())).size).toBe(cat.length);
    }
    const offKeys = OFF_CATALOG.map((p) => [p.call.formation, p.call.personnel, p.call.type, p.call.concept, p.call.gap ?? ""].join("|"));
    expect(new Set(offKeys).size).toBe(offKeys.length);
    const defKeys = DEF_CATALOG.map((p) => [p.call.pkg, p.call.call, p.call.shell].join("|"));
    expect(new Set(defKeys).size).toBe(defKeys.length);
  });

  it("covers every type, formation, personnel, package and shell", () => {
    for (const t of ["run", "short", "medium", "deep", "screen", "playaction"]) expect(OFF_CATALOG.filter((p) => p.call.type === t).length, t).toBeGreaterThanOrEqual(2);
    for (const f of ["Shotgun", "Singleback", "I-Form", "Pistol", "Empty", "Goal Line"]) expect(OFF_CATALOG.some((p) => p.call.formation === f), f).toBe(true);
    for (const p of ["10", "11", "12", "21", "22"]) expect(OFF_CATALOG.some((x) => x.call.personnel === p), p).toBe(true);
    for (const k of ["Base", "Nickel", "Dime", "Goal Line"]) expect(DEF_CATALOG.some((p) => p.call.pkg === k), k).toBe(true);
    for (const k of ["Run D", "Blitz", "Man", "Zone"]) expect(DEF_CATALOG.some((p) => p.call.call === k), k).toBe(true);
    for (const k of COVERAGES) expect(DEF_CATALOG.some((p) => p.call.shell === k), k).toBe(true);
  });

  it("keeps the v2 flat lists and name resolution working", () => {
    expect(OFF_PLAYS).toHaveLength(OFF_CATALOG.length);
    expect(DEF_PLAYS).toHaveLength(DEF_CATALOG.length);
    for (const p of OFF_PLAYS) expect(playName(p)).toBe(p.name);
    for (const p of DEF_PLAYS) expect(defName(p)).toBe(p.name);
    expect(playName({ formation: "Shotgun", personnel: "11", type: "run", concept: "Nonexistent", gap: "A" })).toBe("Nonexistent");
  });

  it("every built-in play simulates and animates with finite, in-bounds coordinates", () => {
    const def = DEF_CATALOG[0].call;
    OFF_CATALOG.forEach((p, i) => {
      const g = createGame({ home: L.teams[3], away: L.teams[4], players: L.players, seed: 1000 + i });
      let guard = 0;
      while (nextDecision(g).kind !== "play" && guard++ < 50) step(g);
      expect(nextDecision(g).kind).toBe("play");
      const rec = step(g, { off: { ...p.call, side: 1 }, def });
      expect(rec, p.id).toBeTruthy();
      expect(rec!.spec.off?.concept).toBe(p.call.concept);
      const script = buildPlayScript(rec!.spec);
      expect(script.frames.length).toBeGreaterThan(5);
      for (const f of script.frames) for (let k = 0; k < 44; k++) expect(Number.isFinite(f[k]), p.id).toBe(true);
    });
  });

  it("every defensive call simulates", () => {
    DEF_CATALOG.forEach((p, i) => {
      const g = createGame({ home: L.teams[3], away: L.teams[4], players: L.players, seed: 2000 + i });
      let guard = 0;
      while (nextDecision(g).kind !== "play" && guard++ < 50) step(g);
      const rec = step(g, { off: OFF_CATALOG[i % OFF_CATALOG.length].call, def: p.call });
      expect(rec, p.id).toBeTruthy();
      expect(defName(rec!.spec.def!)).toBe(p.name);
      for (const f of buildPlayScript(rec!.spec).frames) for (let k = 0; k < 44; k++) expect(Number.isFinite(f[k])).toBe(true);
    });
  });
});

describe("validation rules", () => {
  const ok: OffCall = { formation: "Shotgun", personnel: "11", type: "short", concept: "Slant-Flat" };
  it("accepts a good call and rejects bad combinations", () => {
    expect(validateOffensivePlay(ok)).toEqual([]);
    expect(validateOffensivePlay({ ...ok, formation: "I-Form" }).some((i) => i.field === "personnel")).toBe(true); // 11 in I-Form
    expect(validateOffensivePlay({ ...ok, personnel: "22", formation: "I-Form" }).some((i) => i.field === "type")).toBe(true); // 22 passes
    expect(validateOffensivePlay({ ...ok, formation: "Goal Line", personnel: "22", type: "deep", concept: "Verticals" }).some((i) => i.field === "type")).toBe(true);
    expect(validateOffensivePlay({ ...ok, concept: "Verticals" }).some((i) => i.field === "concept")).toBe(true); // wrong depth
    expect(validateOffensivePlay({ ...ok, concept: "Made Up" }).some((i) => i.field === "concept")).toBe(true);
    expect(validateOffensivePlay({ ...ok, gap: "A" }).some((i) => i.field === "gap")).toBe(true);
    expect(validateOffensivePlay({ formation: "Shotgun", personnel: "11", type: "run", concept: "Power" }).some((i) => i.field === "gap")).toBe(true);
    expect(validateOffensivePlay({ formation: "Shotgun", personnel: "11", type: "run", concept: "Toss", gap: "A" }).some((i) => i.field === "gap")).toBe(true);
    expect(validateOffensivePlay({ formation: "Empty", personnel: "10", type: "run", concept: "Draw", gap: "A" }).length).toBeGreaterThan(0);
    expect(validateOffensivePlay({ ...ok, type: "kneel" }).length).toBeGreaterThan(0);
    expect(validateOffensivePlay({ ...ok, formation: "Empty", type: "screen", concept: "RB Screen" }).some((i) => i.field === "formation")).toBe(true);
    expect(validateOffensivePlay(null).length).toBe(1);
  });
  it("validates defensive combinations", () => {
    expect(validateDefensivePlay({ pkg: "Nickel", call: "Zone", shell: "Cover 3" })).toEqual([]);
    expect(validateDefensivePlay({ pkg: "Dime", call: "Run D", shell: "Cover 3" }).some((i) => i.field === "call")).toBe(true);
    expect(validateDefensivePlay({ pkg: "Base", call: "Zone", shell: "Cover 1" }).some((i) => i.field === "shell")).toBe(true);
    expect(validateDefensivePlay({ pkg: "Base", call: "Man", shell: "Man Blitz" }).some((i) => i.field === "shell")).toBe(true);
    expect(validateDefensivePlay({ pkg: "Bogus" as never, call: "Zone", shell: "Cover 3" }).some((i) => i.field === "pkg")).toBe(true);
  });
});

describe("custom play model", () => {
  it("opens with a valid default draft for each unit", () => {
    for (const unit of ["offense", "defense"] as const) {
      const r = validateCustomPlay(newCustomPlayDraft(unit));
      expect(r.ok).toBe(true);
    }
  });

  it("creates valid offense and defense plays with namespaced ids", () => {
    let list = mk({ ...newCustomPlayDraft("offense"), name: "My Dig", concept: "Dig", type: "medium" });
    list = mk({ ...newCustomPlayDraft("defense", list), name: "My Blitz", pkg: "Dime", call: "Blitz", shell: "Cover 3" }, list);
    expect(list.map((p) => p.id)).toEqual(["custom-off-my-dig", "custom-def-my-blitz"]);
    expect(list.every((p) => p.schema === 1 && p.enabled)).toBe(true);
  });

  it("returns field errors for invalid drafts", () => {
    const r = validateCustomPlay({ unit: "offense", name: "X", formation: "I-Form", personnel: "11", type: "deep", concept: "Slant-Flat" });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["name", "personnel", "type"]));
    expect(validateCustomPlay({ unit: "defense", name: "Bad Call", pkg: "Dime", call: "Run D", shell: "Cover 3" }).ok).toBe(false);
  });

  it("enforces unique names against built-ins and other custom plays, per unit", () => {
    const base = newCustomPlayDraft("offense");
    expect(createCustomPlay([], { ...base, name: "  inside   ZONE " }).ok).toBe(false);
    const list = mk({ ...base, name: "Alpha" });
    const dup = createCustomPlay(list, { ...base, name: "alpha" });
    expect(dup.ok).toBe(false);
    // Same name on the other side of the ball is fine.
    expect(createCustomPlay(list, { ...newCustomPlayDraft("defense"), name: "Alpha" }).ok).toBe(true);
    expect(createCustomPlay(list, { ...newCustomPlayDraft("defense"), name: "Zero Blitz" }).ok).toBe(false);
  });

  it("generates deterministic ids that never collide", () => {
    let list: CustomPlay[] = [];
    list = mk({ ...newCustomPlayDraft("offense"), name: "Go Deep" }, list);
    list = mk({ ...newCustomPlayDraft("offense"), name: "Go-Deep" }, list); // same slug
    expect(new Set(list.map((p) => p.id)).size).toBe(2);
    expect(list.map((p) => p.id)).toEqual(["custom-off-go-deep", "custom-off-go-deep-2"].map((x, i) => (i === 0 ? x : list[1].id)));
    const again = mk({ ...newCustomPlayDraft("offense"), name: "Go Deep" }, []);
    expect(again[0].id).toBe(list[0].id);
  });

  it("edits, duplicates and deletes", () => {
    let list = mk({ ...newCustomPlayDraft("offense"), name: "Alpha" });
    const id = list[0].id;
    const upd = updateCustomPlay(list, id, { ...newCustomPlayDraft("offense"), name: "Alpha 2", concept: "Quick Out" });
    expect(upd.ok).toBe(true);
    if (upd.ok) {
      expect(upd.play.id).toBe(id);
      expect(upd.play.rev).toBe(2);
      list = upd.plays;
    }
    expect(updateCustomPlay(list, id, { ...newCustomPlayDraft("defense"), name: "Alpha 2" }).ok).toBe(false);
    expect(updateCustomPlay(list, "nope", newCustomPlayDraft("offense")).ok).toBe(false);
    // Renaming to its own name is allowed; to a built-in is not.
    expect(updateCustomPlay(list, id, { ...newCustomPlayDraft("offense"), name: "Alpha 2" }).ok).toBe(true);
    expect(updateCustomPlay(list, id, { ...newCustomPlayDraft("offense"), name: "Mesh" }).ok).toBe(false);
    const dup = duplicateCustomPlay(list, id);
    expect(dup.ok).toBe(true);
    if (dup.ok) {
      expect(dup.plays).toHaveLength(2);
      expect(dup.play.id).not.toBe(id);
      expect(dup.play.name).not.toBe("Alpha 2");
      expect(dup.play.aiEligible).toBe(false);
      list = dup.plays;
    }
    list = deleteCustomPlay(list, id);
    expect(list).toHaveLength(1);
    expect(deleteCustomPlay(list, "missing")).toHaveLength(1);
  });

  it("copies a built-in into a valid draft and keeps drafts valid through patchDraft", () => {
    const d = draftFromBuiltIn("power-o")!;
    expect(d.basedOn).toBe("power-o");
    expect(validateCustomPlay(d).ok).toBe(true);
    expect(draftFromBuiltIn("zero-blitz") && validateCustomPlay(draftFromBuiltIn("zero-blitz")!).ok).toBe(true);
    expect(draftFromBuiltIn("nope")).toBeNull();
    // Walk many field changes: the draft must always validate.
    let x = newCustomPlayDraft("offense");
    for (const patch of [{ formation: "I-Form" }, { formation: "Empty" }, { type: "run" }, { formation: "Goal Line" }, { type: "playaction" }, { personnel: "22" }, { type: "run", concept: "Toss" }, { formation: "Pistol" }, { type: "screen" }, { concept: "Bubble" }, { type: "deep" }] as Array<Partial<CustomPlayDraft>>) {
      x = patchDraft(x, patch);
      expect(validateCustomPlay(x).ok, JSON.stringify(x)).toBe(true);
    }
    let y = newCustomPlayDraft("defense");
    for (const patch of [{ pkg: "Dime" }, { call: "Man" }, { pkg: "Goal Line" }, { call: "Blitz", shell: "Man Blitz" }, { pkg: "Base" }, { call: "Run D" }] as Array<Partial<CustomPlayDraft>>) {
      y = patchDraft(y, patch);
      expect(validateCustomPlay(y).ok, JSON.stringify(y)).toBe(true);
    }
  });
});

describe("persistence", () => {
  const lib = (): CustomPlay[] => {
    let l = mk({ ...newCustomPlayDraft("offense"), name: "Rocket Dig", type: "medium", concept: "Dig", tagline: "Test play" });
    l = mk({ ...newCustomPlayDraft("offense"), name: "Rocket Run", type: "run", concept: "Power", gap: "B", side: -1, formation: "I-Form", personnel: "21" }, l);
    return mk({ ...newCustomPlayDraft("defense"), name: "Rocket D", pkg: "Dime", call: "Blitz", shell: "Cover 2" }, l);
  };

  it("round-trips through JSON as part of a career-like object", () => {
    const career = withCustomPlays({ seed: 1, other: "x" } as { seed: number; other: string; customPlays?: unknown }, lib());
    const back = JSON.parse(JSON.stringify(career));
    expect(customPlaysOf(back)).toEqual(lib());
    expect(parseCustomPlays(back.customPlays).changed).toBe(false);
    expect(parseCustomPlays(serializeCustomPlays(lib())).plays).toEqual(lib());
  });

  it("old careers without customPlays get an empty library, and catalogs still work", () => {
    expect(customPlaysOf({})).toEqual([]);
    expect(customPlaysOf(undefined)).toEqual([]);
    expect(getOffensivePlays({})).toHaveLength(OFF_CATALOG.length);
    expect(getDefensivePlays(null)).toHaveLength(DEF_CATALOG.length);
  });

  it("survives corrupt data without throwing and keeps the valid entries", () => {
    const good = lib();
    const raw = [
      good[0],
      null,
      42,
      "x",
      { unit: "offense", name: "Broken", formation: "I-Form", personnel: "11", type: "short", concept: "Slant-Flat" },
      { unit: "defense", name: "Bad Def", pkg: "Dime", call: "Run D", shell: "Cover 3" },
      { unit: "offense" },
      { unit: "sideways", name: "Nope" },
      { ...good[0], unsupported: "ignored", id: good[0].id }, // duplicate id + name
      good[2],
    ];
    const rep = parseCustomPlays(raw);
    expect(rep.plays.length).toBe(3);
    expect(rep.dropped.length).toBe(7);
    expect(rep.changed).toBe(true);
    expect(new Set(rep.plays.map((p) => p.id)).size).toBe(3);
    expect(new Set(rep.plays.filter((p) => p.unit === "offense").map((p) => p.name.toLowerCase())).size).toBe(rep.plays.filter((p) => p.unit === "offense").length);
    expect("unsupported" in rep.plays[1]).toBe(false);
    for (const junk of [undefined, null, 5, "text", {}, { plays: "no" }, [[]], { version: 99, plays: [{}] }]) expect(() => parseCustomPlays(junk)).not.toThrow();
    expect(parseCustomPlays({ version: 99, plays: good }).plays).toHaveLength(3);
  });

  it("migrates the legacy bare array and unversioned entries", () => {
    const legacy = lib().map(({ schema: _s, rev: _r, ...rest }) => rest);
    const rep = parseCustomPlays(legacy);
    expect(rep.plays).toHaveLength(3);
    expect(rep.plays.every((p) => p.schema === 1 && p.rev === 1)).toBe(true);
    expect(rep.changed).toBe(true);
  });

  it("repairs entries colliding with built-in names and ids", () => {
    const rep = parseCustomPlays([{ unit: "offense", id: "inside-zone", name: "Inside Zone", formation: "Shotgun", personnel: "11", type: "short", concept: "Mesh" }]);
    expect(rep.plays).toHaveLength(1);
    expect(rep.plays[0].name).not.toBe("Inside Zone");
    expect(rep.plays[0].id.startsWith("custom-off-")).toBe(true);
  });

  it("exports and imports JSON, merging with conflict repair", () => {
    const json = exportCustomPlaysJson(lib());
    const a = importCustomPlaysJson(json, []);
    expect(a.merged).toEqual(lib());
    const b = importCustomPlaysJson(json, lib());
    expect(b.merged).toHaveLength(6);
    expect(new Set(b.merged.map((p) => p.id)).size).toBe(6);
    expect(importCustomPlaysJson("not json", lib()).merged).toHaveLength(3);
    expect(importCustomPlaysJson("not json", lib()).dropped).toHaveLength(1);
  });

  it("does not leak between careers", () => {
    const a = withCustomPlays({ customPlays: undefined as unknown }, lib());
    const b = withCustomPlays({ customPlays: undefined as unknown }, []);
    expect(customPlaysOf(a)).toHaveLength(3);
    expect(customPlaysOf(b)).toHaveLength(0);
    expect(getOffensivePlays(b)).toHaveLength(OFF_CATALOG.length);
    expect(getOffensivePlays(a)).toHaveLength(OFF_CATALOG.length + 2);
  });
});

describe("unified catalog and name resolution", () => {
  it("adds only valid, enabled custom plays after the built-ins", () => {
    let list = mk({ ...newCustomPlayDraft("offense"), name: "On Play" });
    list = mk({ ...newCustomPlayDraft("offense"), name: "Off Play", enabled: false }, list);
    list = mk({ ...newCustomPlayDraft("defense"), name: "On D" }, list);
    const career = { customPlays: list };
    const off = getOffensivePlays(career);
    expect(off.map((p) => p.name).slice(-1)).toEqual(["On Play"]);
    expect(getOffensivePlays(career, { includeDisabled: true })).toHaveLength(OFF_CATALOG.length + 2);
    expect(getDefensivePlays(career).slice(-1)[0].origin).toBe("custom");
    expect(off.slice(-1)[0].call.playId).toBe("custom-off-on-play");
  });

  it("resolves custom names via label, with the career's current name winning", () => {
    const list = mk({ ...newCustomPlayDraft("offense"), name: "Old Name" });
    const call = getOffensivePlays({ customPlays: list }).slice(-1)[0].call;
    expect(playName(call)).toBe("Old Name");
    const renamed = updateCustomPlay(list, list[0].id, { ...newCustomPlayDraft("offense"), name: "New Name" });
    expect(renamed.ok && resolvePlayName(call, { customPlays: renamed.plays })).toBe("New Name");
    expect(resolvePlayName(call, { customPlays: [] })).toBe("Old Name"); // deleted play: label still reads fine
    const dl = mk({ ...newCustomPlayDraft("defense"), name: "My Shell" });
    const dcall = getDefensivePlays({ customPlays: dl }).slice(-1)[0].call;
    expect(resolveDefensiveName(dcall)).toBe("My Shell");
  });
});

describe("custom plays in the engine", () => {
  function snap(off: OffCall | undefined, def?: ReturnType<typeof aiDefCall>, seed = 31) {
    const g = createGame({ home: L.teams[3], away: L.teams[4], players: L.players, seed });
    let guard = 0;
    while (nextDecision(g).kind !== "play" && guard++ < 50) step(g);
    return step(g, { off, def })!;
  }

  it("a custom run uses the engine's run route, stats and label", () => {
    const list = mk({ ...newCustomPlayDraft("offense"), name: "Custom Counter", type: "run", concept: "Counter", gap: "C", formation: "Pistol", personnel: "12", side: -1 });
    const call = getOffensivePlays({ customPlays: list }).slice(-1)[0].call;
    const rec = snap(call);
    expect(["run", "fumble", "penalty", "safety"]).toContain(rec.spec.outcome.kind);
    expect(rec.spec.off?.gap).toBe("C");
    expect(rec.spec.off?.side).toBe(-1);
    expect(rec.text.length).toBeGreaterThan(5);
    expect(resolvePlayName(rec.spec.off!)).toBe("Custom Counter");
    expect(snap(call).spec.outcome).toEqual(rec.spec.outcome); // deterministic
  });

  it("a custom pass resolves as a pass with a route tree and animates", () => {
    const list = mk({ ...newCustomPlayDraft("offense"), name: "Custom Levels", type: "medium", concept: "Levels", formation: "Shotgun", personnel: "10" });
    const call = getOffensivePlays({ customPlays: list }).slice(-1)[0].call;
    let passes = 0;
    for (let s = 0; s < 12; s++) {
      const rec = snap(call, undefined, 500 + s);
      if (["complete", "incomplete", "interception", "sack", "scramble"].includes(rec.spec.outcome.kind)) passes++;
      const script = buildPlayScript(rec.spec);
      expect(script.frames.length).toBeGreaterThan(5);
      for (const f of script.frames) for (let k = 0; k < 44; k++) expect(Number.isFinite(f[k])).toBe(true);
    }
    expect(passes).toBeGreaterThan(6);
  });

  it("a custom defensive call is applied and named", () => {
    const list = mk({ ...newCustomPlayDraft("defense"), name: "Custom Heat", pkg: "Dime", call: "Blitz", shell: "Cover 2" });
    const dcall = getDefensivePlays({ customPlays: list }).slice(-1)[0].call;
    const rec = snap(OFF_CATALOG[6].call, dcall);
    expect(rec.spec.def).toMatchObject({ pkg: "Dime", call: "Blitz", shell: "Cover 2" });
    expect(resolveDefensiveName(rec.spec.def!)).toBe("Custom Heat");
  });

  it("a defense custom call and an offense custom call behave exactly like their built-in twins", () => {
    const twin = OFF_CATALOG.find((p) => p.id === "dig")!.call;
    const list = mk({ ...newCustomPlayDraft("offense"), ...twin, name: "Dig Twin" });
    const c = getOffensivePlays({ customPlays: list }).slice(-1)[0].call;
    for (const seed of [11, 12, 13]) expect(snap(c, undefined, seed).spec.outcome).toEqual(snap({ ...twin }, undefined, seed).spec.outcome);
  });
});

describe("coordinators", () => {
  const all = sits();

  it("never return an invalid call, for any scheme, situation or coverage", () => {
    let n = 0;
    for (const scheme of OFF_SCHEMES) {
      const r = mulberry32(7 + n);
      for (const s of all.filter((_, i) => i % 7 === n % 7)) {
        const c = aiOffCall(r, s, PLAN, scheme);
        expect(validateOffensivePlay(c), JSON.stringify([scheme, s, c])).toEqual([]);
      }
      n++;
    }
    for (const cov of COVERAGES) {
      const r = mulberry32(99 + n++);
      for (const s of all.filter((_, i) => i % 5 === 0)) expect(validateDefensivePlay(aiDefCall(r, s, PLAN, cov))).toEqual([]);
    }
  });

  it("are deterministic for a seed and the same input", () => {
    for (const s of all.filter((_, i) => i % 97 === 0)) {
      expect(aiOffCall(mulberry32(5), s, PLAN, "Spread")).toEqual(aiOffCall(mulberry32(5), s, PLAN, "Spread"));
      expect(aiDefCall(mulberry32(5), s, PLAN, "Cover 3")).toEqual(aiDefCall(mulberry32(5), s, PLAN, "Cover 3"));
    }
  });

  it("have no empty category: extreme plans still produce every pass type", () => {
    const seen = new Set<string>();
    const r = mulberry32(3);
    for (let i = 0; i < 4000; i++) seen.add(aiOffCall(r, { down: 1 + (i % 3), dist: 3 + (i % 14), ballOn: 20 + (i % 55), quarter: 1, clock: 500, scoreDiff: 0 }, { ...PLAN, passRatio: 100 }, "Air Raid").type);
    for (const t of ["short", "medium", "deep", "playaction", "screen"]) expect(seen.has(t), t).toBe(true);
    const r2 = mulberry32(4);
    for (let i = 0; i < 400; i++) expect(aiOffCall(r2, all[i * 13 % all.length], { ...PLAN, passRatio: 0 }, "Power Run").type).toBeDefined();
  });

  it("offense reads the situation", () => {
    const count = (s: Situation, scheme: (typeof OFF_SCHEMES)[number], f: (c: OffCall) => boolean, plan = PLAN) => {
      const r = mulberry32(21);
      let k = 0;
      for (let i = 0; i < 1500; i++) if (f(aiOffCall(r, s, plan, scheme))) k++;
      return k / 1500;
    };
    const first: Situation = { down: 1, dist: 10, ballOn: 30, quarter: 1, clock: 700, scoreDiff: 0 };
    // Goal line: heavy sets / sneaks, no deep passes.
    const gl = count({ down: 1, dist: 1, ballOn: 99, quarter: 2, clock: 500, scoreDiff: 0 }, "Pro-Style", (c) => c.formation === "Goal Line");
    expect(gl).toBe(1);
    // 3rd and long: mostly passes, mostly medium/deep.
    expect(count({ down: 3, dist: 12, ballOn: 40, quarter: 2, clock: 500, scoreDiff: 0 }, "Pro-Style", (c) => c.type !== "run")).toBeGreaterThan(0.8);
    expect(count({ down: 3, dist: 12, ballOn: 40, quarter: 2, clock: 500, scoreDiff: 0 }, "Pro-Style", (c) => c.type === "medium" || c.type === "deep")).toBeGreaterThan(0.5);
    // 3rd and 1: heavily short-yardage plays.
    expect(count({ down: 3, dist: 1, ballOn: 50, quarter: 2, clock: 500, scoreDiff: 0 }, "Pro-Style", (c) => c.type === "run")).toBeGreaterThan(0.5);
    // Leading late: run. Trailing late: pass.
    expect(count({ down: 2, dist: 7, ballOn: 40, quarter: 4, clock: 120, scoreDiff: 10 }, "Spread", (c) => c.type === "run")).toBeGreaterThan(0.7);
    expect(count({ down: 2, dist: 7, ballOn: 40, quarter: 4, clock: 120, scoreDiff: -10 }, "Power Run", (c) => c.type !== "run")).toBeGreaterThan(0.7);
    // Two-minute drill: no screens/PA heavy sets trailing, no deep passes in the red zone.
    expect(count({ down: 1, dist: 10, ballOn: 85, quarter: 3, clock: 500, scoreDiff: 0 }, "Air Raid", (c) => c.type === "deep")).toBe(0);
    // Schemes differ: Power Run runs more than Air Raid on neutral downs; Air Raid throws deep more.
    expect(count(first, "Power Run", (c) => c.type === "run")).toBeGreaterThan(count(first, "Air Raid", (c) => c.type === "run") + 0.1);
    expect(count(first, "Air Raid", (c) => c.type === "deep")).toBeGreaterThan(count(first, "West Coast", (c) => c.type === "deep"));
    expect(count(first, "Spread", (c) => c.formation === "Shotgun" || c.formation === "Pistol" || c.formation === "Empty")).toBeGreaterThan(count(first, "Power Run", (c) => c.formation === "Shotgun" || c.formation === "Pistol" || c.formation === "Empty"));
    // Bad weather trims the deep game.
    const r = mulberry32(8);
    let clearDeep = 0;
    let rainDeep = 0;
    for (let i = 0; i < 1500; i++) {
      if (aiOffCall(r, { ...first, weather: "Clear" }, PLAN, "Air Raid").type === "deep") clearDeep++;
      if (aiOffCall(r, { ...first, weather: "Rain" }, PLAN, "Air Raid").type === "deep") rainDeep++;
    }
    expect(rainDeep).toBeLessThan(clearDeep);
  });

  it("defense reads the situation", () => {
    const frac = (s: Situation, f: ReturnType<typeof aiDefCall> extends infer C ? (c: C) => boolean : never, plan = PLAN, cov: (typeof COVERAGES)[number] = "Cover 3") => {
      const r = mulberry32(2);
      let k = 0;
      for (let i = 0; i < 1500; i++) if (f(aiDefCall(r, s, plan, cov))) k++;
      return k / 1500;
    };
    const base: Situation = { down: 1, dist: 10, ballOn: 40, quarter: 2, clock: 500, scoreDiff: 0 };
    expect(frac({ ...base, ballOn: 98, dist: 1 }, (c) => c.pkg === "Goal Line")).toBeGreaterThan(0.8);
    expect(frac({ ...base, ballOn: 40, dist: 1, down: 3 }, (c) => c.call === "Run D")).toBeGreaterThan(0.5);
    expect(frac({ ...base, down: 3, dist: 12 }, (c) => c.pkg === "Dime")).toBeGreaterThan(0.3);
    expect(frac({ ...base, down: 3, dist: 12 }, (c) => c.call === "Run D")).toBeLessThan(0.1);
    expect(frac({ ...base, quarter: 4, clock: 60, scoreDiff: -6, dist: 12, down: 2 }, (c) => c.pkg === "Dime" && c.call === "Zone")).toBeGreaterThan(0.5);
    expect(frac(base, (c) => c.call === "Blitz", { ...PLAN, blitz: 90 })).toBeGreaterThan(frac(base, (c) => c.call === "Blitz", { ...PLAN, blitz: 5 }) + 0.2);
    expect(frac(base, (c) => c.shell === "Cover 2", PLAN, "Cover 2")).toBeGreaterThan(frac(base, (c) => c.shell === "Cover 2", PLAN, "Cover 3"));
    expect(frac(base, (c) => c.call === "Man" || c.shell === "Cover 1", PLAN, "Cover 1")).toBeGreaterThan(frac(base, (c) => c.call === "Man" || c.shell === "Cover 1", PLAN, "Cover 3"));
  });
});

describe("custom plays and the AI", () => {
  const sit: Situation = { down: 2, dist: 8, ballOn: 40, quarter: 2, clock: 500, scoreDiff: 0 };
  const draw = (opts?: Parameters<typeof aiOffCall>[4], n = 400) => {
    const r = mulberry32(77);
    return Array.from({ length: n }, () => aiOffCall(r, sit, PLAN, "Pro-Style", opts));
  };

  it("never uses custom plays unless explicitly passed and AI-eligible", () => {
    const list = mk({ ...newCustomPlayDraft("offense"), name: "Sneaky", type: "deep", concept: "Verticals", aiEligible: false });
    const eligible = mk({ ...newCustomPlayDraft("offense"), name: "Allowed", type: "medium", concept: "Levels", aiEligible: true });
    const baseline = draw();
    expect(baseline.some((c) => c.playId)).toBe(false);
    expect(draw({ custom: list })).toEqual(baseline); // not eligible: identical stream
    expect(draw({ custom: [] })).toEqual(baseline);
    expect(draw({ custom: eligible }).some((c) => c.playId === eligible[0].id)).toBe(true);
    const off = mk({ ...newCustomPlayDraft("offense"), name: "Allowed", type: "medium", concept: "Levels", aiEligible: true, enabled: false });
    expect(draw({ custom: off })).toEqual(baseline); // disabled
    expect(draw({ custom: eligible }).every((c) => validateOffensivePlay(c).length === 0)).toBe(true);
  });

  it("defense custom plays follow the same opt-in rule", () => {
    const list = mk({ ...newCustomPlayDraft("defense"), name: "Opt In", pkg: "Nickel", call: "Zone", shell: "Cover 3", aiEligible: true });
    const run = (opts?: Parameters<typeof aiDefCall>[4]) => {
      const r = mulberry32(12);
      return Array.from({ length: 300 }, () => aiDefCall(r, { down: 1, dist: 10, ballOn: 40, quarter: 2, clock: 500, scoreDiff: 0 }, PLAN, "Cover 3", opts));
    };
    expect(run().some((c) => c.playId)).toBe(false);
    expect(run({ custom: list }).some((c) => c.playId === list[0].id)).toBe(true);
  });
});
