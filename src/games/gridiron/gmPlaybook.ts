import { pick, type Rng } from "./gmRandom";
import type { Coverage, DefCallFull, GamePlan, OffCall, OffScheme, PlayType } from "./gmTypes";

/** Offensive play cards shown in the play-calling picker. */
export const OFF_PLAYS: Array<OffCall & { name: string }> = [
  { name: "Inside Zone", formation: "Singleback", personnel: "11", type: "run", concept: "Inside Zone", gap: "A" },
  { name: "Power O", formation: "I-Form", personnel: "21", type: "run", concept: "Power", gap: "B" },
  { name: "Outside Zone", formation: "Singleback", personnel: "12", type: "run", concept: "Outside Zone", gap: "C" },
  { name: "Toss Sweep", formation: "I-Form", personnel: "21", type: "run", concept: "Toss", gap: "D" },
  { name: "Draw", formation: "Shotgun", personnel: "11", type: "run", concept: "Draw", gap: "A" },
  { name: "QB Sneak", formation: "Goal Line", personnel: "22", type: "run", concept: "Sneak", gap: "A" },
  { name: "Slant-Flat", formation: "Shotgun", personnel: "11", type: "short", concept: "Slant-Flat" },
  { name: "Quick Outs", formation: "Shotgun", personnel: "10", type: "short", concept: "Quick Out" },
  { name: "Mesh", formation: "Shotgun", personnel: "11", type: "short", concept: "Mesh" },
  { name: "Curl-Flat", formation: "Singleback", personnel: "12", type: "medium", concept: "Curl-Flat" },
  { name: "Dig", formation: "Shotgun", personnel: "11", type: "medium", concept: "Dig" },
  { name: "Smash", formation: "Shotgun", personnel: "11", type: "medium", concept: "Smash" },
  { name: "Four Verticals", formation: "Empty", personnel: "10", type: "deep", concept: "Verticals" },
  { name: "Post-Wheel", formation: "Shotgun", personnel: "11", type: "deep", concept: "Post-Wheel" },
  { name: "PA Boot", formation: "I-Form", personnel: "21", type: "playaction", concept: "Bootleg" },
  { name: "PA Shot", formation: "Singleback", personnel: "12", type: "playaction", concept: "Deep Shot" },
  { name: "RB Screen", formation: "Shotgun", personnel: "11", type: "screen", concept: "RB Screen" },
  { name: "WR Bubble", formation: "Shotgun", personnel: "10", type: "screen", concept: "Bubble" },
];

export const DEF_PLAYS: Array<DefCallFull & { name: string }> = [
  { name: "Base Cover 3", pkg: "Base", call: "Zone", shell: "Cover 3" },
  { name: "Cover 2 Zone", pkg: "Nickel", call: "Zone", shell: "Cover 2" },
  { name: "Cover 1 Man", pkg: "Nickel", call: "Man", shell: "Cover 1" },
  { name: "Run Stack", pkg: "Base", call: "Run D", shell: "Cover 3" },
  { name: "Goal Line", pkg: "Goal Line", call: "Run D", shell: "Cover 1" },
  { name: "Zero Blitz", pkg: "Nickel", call: "Blitz", shell: "Man Blitz" },
  { name: "Fire Zone", pkg: "Nickel", call: "Blitz", shell: "Cover 3" },
  { name: "Dime Prevent", pkg: "Dime", call: "Zone", shell: "Cover 2" },
];

const SCHEME_PASS_BIAS: Record<OffScheme, number> = { "West Coast": 4, "Air Raid": 12, "Power Run": -10, Spread: 6, "Pro-Style": 0 };

export interface Situation {
  down: number;
  dist: number;
  ballOn: number; // yards from own goal
  quarter: number;
  clock: number; // seconds left in quarter
  scoreDiff: number; // offense minus defense
}

/** The offensive coordinator's call. */
export function aiOffCall(r: Rng, s: Situation, plan: GamePlan, scheme: OffScheme): OffCall {
  let passPct = plan.passRatio + SCHEME_PASS_BIAS[scheme];
  if (s.down === 3 && s.dist >= 7) passPct = 88;
  else if (s.down === 3 && s.dist >= 4) passPct = 70;
  else if (s.dist <= 2 && s.down >= 3) passPct = 35;
  else if (s.down === 2 && s.dist >= 8) passPct += 12;
  const late = s.quarter >= 4 && s.clock < 300;
  if (late && s.scoreDiff < 0) passPct = 85;
  if (late && s.scoreDiff > 0) passPct = 22;
  if (s.quarter === 2 && s.clock < 120) passPct += 20;
  if (s.ballOn >= 97 && s.dist <= 2) {
    return r() < 0.6 ? { ...OFF_PLAYS[5] } : { ...OFF_PLAYS[0], formation: "Goal Line", personnel: "22" };
  }
  const isPass = r() * 100 < passPct;
  if (!isPass) {
    const runs = OFF_PLAYS.filter((p) => p.type === "run" && p.concept !== "Sneak");
    const p = scheme === "Power Run" && r() < 0.4 ? OFF_PLAYS[1] : pick(r, runs);
    return { ...p, side: r() < 0.5 ? -1 : 1 };
  }
  const longNeed = s.dist >= 12 || (late && s.scoreDiff < -3);
  let type: PlayType;
  const roll = r();
  if (longNeed) type = roll < 0.35 ? "deep" : roll < 0.8 ? "medium" : "short";
  else if (s.down === 1 && roll < 0.18) type = "playaction";
  else if (roll < 0.09) type = "screen";
  else if (roll < (scheme === "Air Raid" ? 0.3 : 0.22)) type = "deep";
  else if (roll < 0.62) type = "short";
  else type = "medium";
  if (s.ballOn > 90 && type === "deep") type = "short";
  const options = OFF_PLAYS.filter((p) => p.type === type);
  return { ...pick(r, options), side: r() < 0.5 ? -1 : 1 };
}

/** The defensive coordinator's call. */
export function aiDefCall(r: Rng, s: Situation, plan: GamePlan, coverage: Coverage): DefCallFull {
  if (s.ballOn >= 96) return { ...DEF_PLAYS[4] };
  const blitz = plan.blitz / 100;
  if (s.quarter >= 4 && s.clock < 120 && s.scoreDiff < 0 && s.dist > 5) return { ...DEF_PLAYS[7] };
  if (s.dist <= 2 && r() < 0.6) return { ...DEF_PLAYS[3] };
  if (r() < blitz * (s.down === 3 ? 1.3 : 0.8)) return { ...(r() < 0.5 ? DEF_PLAYS[5] : DEF_PLAYS[6]) };
  if (s.down === 1 && s.dist >= 10 && r() < 0.3) return { ...DEF_PLAYS[3] };
  const pref = coverage === "Cover 1" ? DEF_PLAYS[2] : coverage === "Cover 2" ? DEF_PLAYS[1] : coverage === "Man Blitz" ? DEF_PLAYS[5] : DEF_PLAYS[0];
  return r() < 0.55 ? { ...pref } : { ...pick(r, DEF_PLAYS.slice(0, 3)) };
}

export const playName = (c: OffCall): string => OFF_PLAYS.find((p) => p.concept === c.concept)?.name ?? c.concept;
export const defName = (c: DefCallFull): string => DEF_PLAYS.find((p) => p.call === c.call && p.shell === c.shell && p.pkg === c.pkg)?.name ?? `${c.shell}`;
