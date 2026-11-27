/**
 * Playbook: unified play catalog (built-in + custom), name resolution and the AI coordinators.
 *
 * - Built-in data and engine-support rules live in gmPlayCatalog.ts.
 * - Custom plays live in gmCustomPlays.ts and reach the catalog via `getOffensivePlays(career)`.
 * - The coordinators are deterministic for a given Rng and are situation-aware. Custom plays are only
 *   ever considered when the caller passes `opts.custom` AND the play is `aiEligible` and enabled.
 */
import { customPlaysOf, customToDefDef, customToOffDef, type CustomPlay } from "./gmCustomPlays";
import {
  DEF_CATALOG,
  OFF_CATALOG,
  findBuiltinDef,
  findBuiltinOff,
  validateDefensivePlay,
  validateOffensivePlay,
  type DefCallEx,
  type DefPlayDef,
  type OffCallEx,
  type OffPlayDef,
} from "./gmPlayCatalog";
import type { Rng } from "./gmRandom";
import type { Coverage, DefCallFull, GamePlan, OffCall, OffScheme, Weather } from "./gmTypes";

export { DEF_CATALOG, OFF_CATALOG, validateDefensivePlay, validateOffensivePlay };
export type { DefPlayDef, OffPlayDef, OffCallEx, DefCallEx };

/** Flat v2-compatible lists (call fields + name). Prefer getOffensivePlays/getDefensivePlays. */
export const OFF_PLAYS: Array<OffCall & { name: string }> = OFF_CATALOG.map((p) => ({ name: p.name, ...p.call }));
export const DEF_PLAYS: Array<DefCallFull & { name: string }> = DEF_CATALOG.map((p) => ({ name: p.name, ...p.call }));

// ---------------------------------------------------------------------------
// Unified catalog API

export interface CatalogOptions {
  /** Include custom plays the player switched off (for the library/editor). Default false. */
  includeDisabled?: boolean;
}

type CareerLike = { customPlays?: unknown } | null | undefined;

function customsFor(career: CareerLike, includeDisabled?: boolean): CustomPlay[] {
  return customPlaysOf(career).filter((p) => includeDisabled || p.enabled);
}

/** Built-in offensive plays followed by the career's valid, enabled custom plays. Never empty. */
export function getOffensivePlays(career?: CareerLike, opts: CatalogOptions = {}): OffPlayDef[] {
  const customs = customsFor(career, opts.includeDisabled).flatMap((p) => (p.unit === "offense" ? [customToOffDef(p)] : []));
  return [...OFF_CATALOG, ...customs];
}

export function getDefensivePlays(career?: CareerLike, opts: CatalogOptions = {}): DefPlayDef[] {
  const customs = customsFor(career, opts.includeDisabled).flatMap((p) => (p.unit === "defense" ? [customToDefDef(p)] : []));
  return [...DEF_CATALOG, ...customs];
}

/** The OffCall to hand to the engine for a catalog entry. */
export const offCallFor = (p: OffPlayDef, side: -1 | 1 = 1): OffCallEx => ({ ...p.call, side: p.call.side ?? side });
export const defCallFor = (p: DefPlayDef): DefCallEx => ({ ...p.call });

/**
 * Display name for an offensive call. Custom calls carry their own label; otherwise match a built-in
 * (exact, then concept+formation, then concept). With `career`, a custom play's current name wins over a stale label.
 */
export function resolvePlayName(c: OffCall & { playId?: string; label?: string }, career?: CareerLike): string {
  if (c.playId && career) {
    const cur = customsFor(career, true).find((p) => p.id === c.playId);
    if (cur) return cur.name;
  }
  if (c.label) return c.label;
  return findBuiltinOff(c)?.name ?? c.concept;
}

export function resolveDefensiveName(c: DefCallFull & { playId?: string; label?: string }, career?: CareerLike): string {
  if (c.playId && career) {
    const cur = customsFor(career, true).find((p) => p.id === c.playId);
    if (cur) return cur.name;
  }
  if (c.label) return c.label;
  return findBuiltinDef(c)?.name ?? `${c.shell}`;
}

export const playName = (c: OffCall): string => resolvePlayName(c);
export const defName = (c: DefCallFull): string => resolveDefensiveName(c);

// ---------------------------------------------------------------------------
// Coordinators

export interface Situation {
  down: number;
  dist: number;
  ballOn: number; // yards from own goal
  quarter: number; // 5+ = overtime
  clock: number; // seconds left in quarter
  scoreDiff: number; // offense minus defense
  /** Optional extras. The engine may fill these in; coordinators work without them. */
  timeouts?: number; // timeouts remaining for the offense
  weather?: Weather;
}

export interface AiOptions {
  /** Custom plays the coordinator may use. Only plays with enabled && aiEligible are ever picked. Omit for built-ins only. */
  custom?: readonly CustomPlay[];
  /** Weather, if not on the Situation. */
  weather?: Weather;
  /** For the defense: the offense's game plan (pass/run lean). */
  oppPlan?: GamePlan;
}

const SCHEME_PASS_BIAS: Record<OffScheme, number> = { "West Coast": 4, "Air Raid": 12, "Power Run": -10, Spread: 6, "Pro-Style": 0 };

function weightedPick<T>(r: Rng, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  const ws = items.map((it) => {
    const w = Math.max(0, weight(it));
    total += w;
    return w;
  });
  if (total <= 0) return items[Math.floor(r() * items.length)];
  let roll = r() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= ws[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

function offPool(opts?: AiOptions): OffPlayDef[] {
  const base: OffPlayDef[] = [...OFF_CATALOG];
  for (const p of opts?.custom ?? []) {
    if (p.unit !== "offense") continue;
    const d = customToOffDef(p);
    if (d.ai && validateOffensivePlay(d.call).length === 0) base.push(d);
  }
  return base;
}

function defPool(opts?: AiOptions): DefPlayDef[] {
  const base: DefPlayDef[] = [...DEF_CATALOG];
  for (const p of opts?.custom ?? []) {
    if (p.unit !== "defense") continue;
    const d = customToDefDef(p);
    if (d.ai && validateDefensivePlay(d.call).length === 0) base.push(d);
  }
  return base;
}

/** How well a play suits an offensive scheme (1 = neutral). */
function schemeFit(p: OffPlayDef, scheme: OffScheme): number {
  const f = p.call.formation;
  const g = p.group;
  switch (scheme) {
    case "Power Run":
      return (g === "Gap Run" || g === "Inside Run" ? 1.6 : 1) * (f === "I-Form" || f === "Goal Line" ? 1.4 : 1) * (g === "Play Action" ? 1.5 : 1) * (g === "Deep Shots" ? 0.7 : 1);
    case "Air Raid":
      return (g === "Deep Shots" ? 1.7 : g === "Intermediate" ? 1.2 : 1) * (f === "Empty" ? 1.5 : f === "Shotgun" ? 1.2 : 1) * (f === "I-Form" ? 0.5 : 1);
    case "West Coast":
      return (g === "Quick Game" ? 1.5 : g === "Intermediate" ? 1.3 : g === "Screens" ? 1.3 : 1) * (g === "Deep Shots" ? 0.7 : 1);
    case "Spread":
      return (f === "Shotgun" || f === "Pistol" || f === "Empty" ? 1.5 : 1) * (g === "Draw" ? 1.3 : 1) * (f === "I-Form" ? 0.5 : 1);
    default:
      return (f === "Singleback" || f === "I-Form" ? 1.3 : 1) * (g === "Play Action" ? 1.4 : 1);
  }
}

/** The offensive coordinator's call. Deterministic for a given Rng. Never returns an invalid play. */
export function aiOffCall(r: Rng, s: Situation, plan: GamePlan, scheme: OffScheme, opts?: AiOptions): OffCallEx {
  const pool = offPool(opts);
  const weather = opts?.weather ?? s.weather;
  const bad = weather === "Rain" || weather === "Snow" || weather === "Wind";
  const overtime = s.quarter >= 5;
  const late = s.quarter >= 4 && s.clock < 300 && !overtime;
  const twoMin = (s.quarter === 2 || s.quarter === 4) && s.clock < 120;
  const shortNeed = s.dist <= 2;
  const redZone = s.ballOn >= 80;
  const backedUp = s.ballOn < 8;
  const goalLine = s.ballOn >= 97 && s.dist <= 2;

  let passPct = plan.passRatio + SCHEME_PASS_BIAS[scheme];
  if (s.down === 3 && s.dist >= 7) passPct = 88;
  else if (s.down === 3 && s.dist >= 4) passPct = 70;
  else if (s.dist <= 2 && s.down >= 3) passPct = 35;
  else if (s.down === 4 && s.dist <= 2) passPct = 30;
  else if (s.down === 4) passPct = Math.max(passPct, 75);
  else if (s.down === 2 && s.dist >= 8) passPct += 12;
  else if (s.down === 1 && s.dist >= 15) passPct += 8;
  if (late && s.scoreDiff < 0) passPct = 85;
  if (late && s.scoreDiff > 0) passPct = 22;
  if (late && s.scoreDiff > 8) passPct = 12;
  if (s.quarter === 2 && s.clock < 120) passPct += 20;
  if (twoMin && s.scoreDiff < 0 && !late) passPct = Math.max(passPct, 80);
  if (plan.tempo > 70 && twoMin && s.scoreDiff <= 0) passPct += 5;
  if (bad) passPct -= 8;
  if (redZone && !goalLine) passPct -= 4;
  if (backedUp) passPct -= 8;
  passPct = Math.min(95, Math.max(5, passPct));

  const fits = (p: OffPlayDef): number => {
    let w = schemeFit(p, scheme);
    const t = p.call.type;
    const heavy = p.call.formation === "Goal Line";
    if (heavy && s.ballOn < 88) return 0.01;
    if (heavy && !(shortNeed || s.ballOn >= 95)) w *= 0.3;
    if (p.call.personnel === "22" && !(shortNeed || redZone)) w *= 0.4;
    if (shortNeed || (s.down === 4 && s.dist <= 3)) w *= p.tags.includes("short-yardage") ? 3 : 0.5;
    if (redZone) w *= p.tags.includes("red-zone") ? 2 : 0.3;
    if (twoMin && s.scoreDiff < 0 && t !== "run") w *= p.tags.includes("two-minute") ? 2.5 : 0.3;
    if (s.dist >= 8 && s.down >= 2) {
      w *= p.tags.includes("long-yardage") ? 2.2 : 0.4;
      if (p.call.concept === "Draw") w *= 0.5;
    }
    if (backedUp && (t === "deep" || t === "screen" || p.call.concept === "Deep Shot")) w *= 0.3;
    if (late && s.scoreDiff > 0 && t === "run") w *= p.group === "Inside Run" || p.group === "Gap Run" ? 1.4 : 0.8;
    if (bad && (t === "deep" || p.call.concept === "Deep Shot")) w *= 0.5;
    return w;
  };
  const choose = (cands: OffPlayDef[], side: -1 | 1): OffCallEx => {
    const list = cands.length ? cands : pool;
    const p = weightedPick(r, list, fits);
    return { ...p.call, side: p.call.side ?? side };
  };

  if (goalLine) {
    const gl = pool.filter((p) => p.tags.includes("goal-line"));
    const wGl = (p: OffPlayDef) => (p.call.concept === "Sneak" ? 3 : p.call.concept === "Dive" ? 2.5 : p.call.type === "run" ? 2 : 0.8 * (passPct > 50 ? 1.5 : 1));
    const p = weightedPick(r, gl.length ? gl : pool, wGl);
    return { ...p.call, side: p.call.side ?? (r() < 0.5 ? -1 : 1) };
  }

  const isPass = r() * 100 < passPct;
  const side: -1 | 1 = r() < 0.5 ? -1 : 1;
  if (!isPass) return choose(pool.filter((p) => p.call.type === "run" && p.call.concept !== "Sneak"), side);

  const longNeed = s.dist >= 12 || (late && s.scoreDiff < -3);
  const roll = r();
  let type: OffPlayDef["call"]["type"];
  if (longNeed) type = roll < 0.35 ? "deep" : roll < 0.8 ? "medium" : "short";
  else if (twoMin && s.scoreDiff < 0) type = roll < 0.55 ? "short" : roll < 0.9 ? "medium" : "deep";
  else if (shortNeed) type = roll < 0.55 ? "short" : roll < 0.8 ? "playaction" : "medium";
  else if (s.down === 1 && roll < 0.18) type = "playaction";
  else if (roll < 0.09) type = "screen";
  else if (roll < (scheme === "Air Raid" ? 0.3 : 0.22)) type = "deep";
  else if (roll < 0.62) type = "short";
  else type = "medium";
  if (s.ballOn > 80 && type === "deep") type = s.ballOn > 90 ? "short" : "medium";
  if (bad && type === "deep" && roll < 0.5) type = "medium";
  let cands = pool.filter((p) => p.call.type === type);
  if (!cands.length) cands = pool.filter((p) => p.call.type !== "run");
  return choose(cands, side);
}

/** The defensive coordinator's call. Deterministic for a given Rng. Never returns an invalid call. */
export function aiDefCall(r: Rng, s: Situation, plan: GamePlan, coverage: Coverage, opts?: AiOptions): DefCallEx {
  const pool = defPool(opts);
  const blitz = plan.blitz / 100;
  const goalLine = s.ballOn >= 96;
  const redZone = s.ballOn >= 88;
  const shortNeed = s.dist <= 2;
  const longNeed = s.dist >= 8;
  const thirdLong = s.down === 3 && s.dist >= 7;
  const lateLead = s.quarter >= 4 && s.quarter < 5 && s.clock < 180 && s.scoreDiff < 0 && s.scoreDiff >= -16; // offense trailing
  const prevent = lateLead && s.dist > 5 && (s.clock < 120 || s.ballOn < 55);
  const halfEnd = s.quarter === 2 && s.clock < 30 && s.ballOn < 60;
  const clockBurn = s.quarter >= 4 && s.quarter < 5 && s.clock < 300 && s.scoreDiff > 0; // offense leading, will run
  const oppPass = opts?.oppPlan?.passRatio ?? 50;

  const w = (p: DefPlayDef): number => {
    const c = p.call;
    let x = 1;
    const gl = c.pkg === "Goal Line";
    const dime = c.pkg === "Dime";
    const zoneDime = dime && c.call === "Zone";
    if (c.shell === coverage) x *= 2.2;
    if (coverage === "Man Blitz" && c.call === "Blitz") x *= 1.8;
    if (c.call === "Blitz") {
      x *= 0.15 + blitz * 2.2;
      if (s.down === 3) x *= 1.5;
      if (s.down === 1) x *= 0.6;
      if (c.shell === "Man Blitz" && blitz < 0.6) x *= 0.5;
    }
    if (c.call === "Run D") x *= s.down === 1 && s.dist >= 10 ? 0.9 : 0.5 + (oppPass < 45 ? 0.8 : 0);
    if (oppPass >= 60 && (c.pkg === "Nickel" || dime)) x *= 1.3;
    if (oppPass <= 40 && c.call === "Run D") x *= 1.4;
    if (gl) x *= goalLine ? 30 : 0.05;
    if (shortNeed) {
      x *= c.call === "Run D" ? 9 : dime ? 0.1 : 0.6;
      if (s.down >= 3 && c.call === "Blitz") x *= 1.2;
    }
    if (redZone && !goalLine) {
      if (dime) x *= 0.3;
      if (c.call === "Man" || c.call === "Blitz") x *= 1.3;
    }
    if (longNeed && s.down >= 2) {
      x *= c.call === "Run D" ? 0.15 : c.pkg === "Nickel" || dime ? 2 : 1;
    }
    if (thirdLong) x *= dime ? 2.5 : c.pkg === "Nickel" ? 1.3 : 0.7;
    if (prevent) x *= zoneDime ? 14 : dime ? 2 : 0.4;
    if (halfEnd) x *= zoneDime ? 5 : 0.7;
    if (clockBurn && c.call === "Run D") x *= 2.2;
    if (s.ballOn < 10 && c.call === "Blitz") x *= 1.3;
    return x;
  };
  const list = pool.length ? pool : [...DEF_CATALOG];
  const p = weightedPick(r, list, w);
  return { ...p.call };
}
