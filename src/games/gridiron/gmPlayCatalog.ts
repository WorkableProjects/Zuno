/**
 * Built-in play catalog and the rules that decide whether a play is something the engine can simulate.
 * Pure data + pure functions. gmPlaybook.ts (coordinator + unified catalog API) and gmCustomPlays.ts
 * (user-authored plays) both build on this module, so it must not import either of them.
 *
 * What the engine actually reads (gmEngine.ts / gmPlayScript.ts):
 *  - OffCall.personnel  -> who is on the field (offenseUnit)
 *  - OffCall.type       -> run vs pass, pass depth, pressure, play-action behaviour
 *  - OffCall.concept    -> "Sneak" (QB carries), "Draw" (blitz bonus), "RB Screen"/"Bubble" (screen target),
 *                          and the route tree for animation (gmRoutes CONCEPTS)
 *  - OffCall.gap/side   -> run lane and the play text; out-of-bounds chance for gap D
 *  - OffCall.formation  -> alignment in the play script (shotgun-type vs I-form-type vs empty)
 *  - DefCallFull.pkg    -> personnel (Nickel/Dime) and run/pass modifiers
 *  - DefCallFull.call   -> Run D / Blitz / Man / Zone modifiers
 *  - DefCallFull.shell  -> man vs zone coverage, Cover 2 deep-ball bonus, safety rushers on Man Blitz
 */
import { CONCEPTS } from "./gmRoutes";
import type { DefCall, DefCallFull, DefPackage, Formation, OffCall, Personnel, PlayType, Coverage } from "./gmTypes";

export interface ValidationIssue {
  field: string;
  message: string;
}

export type PlayOrigin = "builtin" | "custom";
export type OffGroup = "Inside Run" | "Outside Run" | "Gap Run" | "Draw" | "Quick Game" | "Intermediate" | "Deep Shots" | "Play Action" | "Screens";
export type DefGroup = "Zone" | "Man" | "Run D" | "Blitz" | "Prevent" | "Goal Line";
/** Situations a play is especially suited to. Used by the coordinator and by the picker's "recommended" section. */
export type SitTag = "short-yardage" | "goal-line" | "red-zone" | "two-minute" | "long-yardage" | "neutral";

/** Extra, optional properties a call carries when it came from a custom play. The engine ignores them. */
export interface CallMeta {
  playId?: string;
  label?: string;
}
export type OffCallEx = OffCall & CallMeta;
export type DefCallEx = DefCallFull & CallMeta;

export interface OffPlayDef {
  id: string;
  origin: PlayOrigin;
  name: string;
  tagline: string;
  call: OffCallEx;
  group: OffGroup;
  tags: SitTag[];
  /** May the AI coordinator pick this play? Always true for built-ins; custom plays only when the author opted in. */
  ai: boolean;
}

export interface DefPlayDef {
  id: string;
  origin: PlayOrigin;
  name: string;
  tagline: string;
  call: DefCallEx;
  group: DefGroup;
  tags: SitTag[];
  ai: boolean;
}

// ---------------------------------------------------------------------------
// Engine-supported value sets

export const FORMATIONS: readonly Formation[] = ["Shotgun", "Singleback", "I-Form", "Pistol", "Empty", "Goal Line"];
export const PERSONNELS: readonly Personnel[] = ["10", "11", "12", "21", "22"];
/** Types a user (or custom play) may call. kneel/spike are engine-internal. */
export const CALLABLE_TYPES: readonly PlayType[] = ["run", "short", "medium", "deep", "screen", "playaction"];
export const DEF_PACKAGES: readonly DefPackage[] = ["Base", "Nickel", "Dime", "Goal Line"];
export const DEF_CALLS: readonly DefCall[] = ["Run D", "Blitz", "Man", "Zone"];
export const SHELLS: readonly Coverage[] = ["Cover 1", "Cover 2", "Cover 3", "Man Blitz"];
export const GAPS = ["A", "B", "C", "D"] as const;

export const PERSONNEL_LABEL: Record<Personnel, string> = {
  "10": "10 (1 RB, 0 TE, 4 WR)",
  "11": "11 (1 RB, 1 TE, 3 WR)",
  "12": "12 (1 RB, 2 TE, 2 WR)",
  "21": "21 (2 RB, 1 TE, 2 WR)",
  "22": "22 (2 RB, 2 TE, 1 WR)",
};

/** Personnel that can line up in each formation (a fullback needs a backfield slot, Empty has no tight end split). */
export const FORMATION_PERSONNEL: Record<Formation, Personnel[]> = {
  Shotgun: ["10", "11", "12"],
  Singleback: ["10", "11", "12"],
  "I-Form": ["21", "22"],
  Pistol: ["11", "12"],
  Empty: ["10", "11"],
  "Goal Line": ["12", "21", "22"],
};

/** Play types that make football sense from each formation. */
export const FORMATION_TYPES: Record<Formation, PlayType[]> = {
  Shotgun: ["run", "short", "medium", "deep", "screen", "playaction"],
  Singleback: ["run", "short", "medium", "deep", "screen", "playaction"],
  "I-Form": ["run", "short", "medium", "playaction"],
  Pistol: ["run", "short", "medium", "deep", "screen", "playaction"],
  Empty: ["short", "medium", "deep", "screen"],
  "Goal Line": ["run", "playaction"],
};

/** Play types by personnel: 22 has one receiver, 21 has two. */
export const PERSONNEL_TYPES: Record<Personnel, PlayType[]> = {
  "10": ["run", "short", "medium", "deep", "screen", "playaction"],
  "11": ["run", "short", "medium", "deep", "screen", "playaction"],
  "12": ["run", "short", "medium", "deep", "screen", "playaction"],
  "21": ["run", "short", "medium", "playaction"],
  "22": ["run", "playaction"],
};

/** Run concepts and the gaps that make sense for them. */
export const RUN_CONCEPTS: Record<string, Array<"A" | "B" | "C" | "D">> = {
  "Inside Zone": ["A", "B"],
  "Outside Zone": ["C", "D"],
  Counter: ["B", "C"],
  Power: ["A", "B", "C"],
  Toss: ["C", "D"],
  Draw: ["A", "B"],
  Sneak: ["A"],
  Dive: ["A"],
  Trap: ["A", "B"],
};

/** Pass concepts (each has a route tree in gmRoutes CONCEPTS) and the play types they may be called as. */
export const PASS_CONCEPTS: Record<string, PlayType[]> = {
  "Slant-Flat": ["short"],
  "Quick Out": ["short"],
  Mesh: ["short"],
  Stick: ["short"],
  "Hitch-Seam": ["short"],
  "Curl-Flat": ["medium"],
  Dig: ["medium"],
  Smash: ["medium"],
  Levels: ["medium"],
  Flood: ["medium", "playaction"],
  "Y-Cross": ["medium"],
  Verticals: ["deep"],
  "Post-Wheel": ["deep"],
  "Deep Cross": ["deep"],
  Bootleg: ["playaction"],
  "Deep Shot": ["playaction"],
  "PA Cross": ["playaction"],
  "RB Screen": ["screen"],
  Bubble: ["screen"],
};

/** Concepts available for a type, in a stable order. */
export function conceptsForType(type: PlayType): string[] {
  if (type === "run") return Object.keys(RUN_CONCEPTS);
  return Object.keys(PASS_CONCEPTS).filter((c) => PASS_CONCEPTS[c].includes(type));
}

export function gapsForConcept(concept: string): Array<"A" | "B" | "C" | "D"> {
  return RUN_CONCEPTS[concept] ?? [...GAPS];
}

/** Valid shells for a defensive call. Man call = man shells only, Zone = zone shells, Man Blitz shell needs a blitz. */
export const CALL_SHELLS: Record<DefCall, Coverage[]> = {
  "Run D": ["Cover 1", "Cover 2", "Cover 3"],
  Blitz: ["Cover 1", "Cover 2", "Cover 3", "Man Blitz"],
  Man: ["Cover 1"],
  Zone: ["Cover 2", "Cover 3"],
};
export const PACKAGE_CALLS: Record<DefPackage, DefCall[]> = {
  Base: ["Run D", "Blitz", "Man", "Zone"],
  Nickel: ["Run D", "Blitz", "Man", "Zone"],
  Dime: ["Blitz", "Man", "Zone"],
  "Goal Line": ["Run D", "Blitz", "Zone"],
};

/** Fields that change the simulation vs. fields that are only shown to the player. */
export const OFF_SIM_FIELDS = ["formation", "personnel", "type", "concept", "gap", "side"] as const;
export const DEF_SIM_FIELDS = ["pkg", "call", "shell"] as const;

// ---------------------------------------------------------------------------
// Validation (pure rules over a call)

const isIn = <T,>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

export function validateOffensivePlay(call: Partial<OffCall> | null | undefined): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  if (!call || typeof call !== "object") return [{ field: "call", message: "Missing play call." }];
  const { formation, personnel, type, concept, gap, side } = call;
  if (!isIn(FORMATIONS, formation)) add("formation", "Choose a formation.");
  if (!isIn(PERSONNELS, personnel)) add("personnel", "Choose a personnel grouping.");
  if (!isIn(CALLABLE_TYPES, type)) add("type", "Choose a play type.");
  if (typeof concept !== "string" || !concept) add("concept", "Choose a concept.");
  if (side !== undefined && side !== -1 && side !== 1) add("side", "Direction must be left or right.");
  if (issues.length) return issues;
  const f = formation as Formation;
  const p = personnel as Personnel;
  const t = type as PlayType;
  const c = concept as string;
  if (!FORMATION_PERSONNEL[f].includes(p)) add("personnel", `${f} cannot line up in ${p} personnel (allowed: ${FORMATION_PERSONNEL[f].join(", ")}).`);
  if (!FORMATION_TYPES[f].includes(t)) add("type", `A ${t === "playaction" ? "play-action" : t} play does not fit ${f}.`);
  if (!PERSONNEL_TYPES[p].includes(t)) add("type", `${p} personnel cannot run a ${t === "playaction" ? "play-action" : t} play.`);
  if (t === "run") {
    if (!(c in RUN_CONCEPTS)) add("concept", `"${c}" is not a run concept the engine supports.`);
    else if (!isIn(GAPS, gap)) add("gap", "Choose a run gap.");
    else if (!RUN_CONCEPTS[c].includes(gap)) add("gap", `${c} runs through the ${RUN_CONCEPTS[c].join(" or ")} gap.`);
  } else {
    if (!(c in PASS_CONCEPTS) || !CONCEPTS[c]) add("concept", `"${c}" is not a pass concept the engine supports.`);
    else if (!PASS_CONCEPTS[c].includes(t)) add("concept", `${c} is not a ${t === "playaction" ? "play-action" : t} concept.`);
    if (gap) add("gap", "Only run plays have a gap.");
    if (c === "RB Screen" && (f === "Empty" || f === "I-Form" || f === "Goal Line")) add("formation", "RB Screen needs a back in the backfield (Shotgun, Singleback or Pistol).");
    if (c === "Bubble" && p !== "10" && p !== "11") add("personnel", "Bubble screen needs three or more receivers (10 or 11 personnel).");
  }
  return issues;
}

export function validateDefensivePlay(call: Partial<DefCallFull> | null | undefined): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  if (!call || typeof call !== "object") return [{ field: "call", message: "Missing defensive call." }];
  const { pkg, call: dc, shell } = call;
  if (!isIn(DEF_PACKAGES, pkg)) add("pkg", "Choose a defensive package.");
  if (!isIn(DEF_CALLS, dc)) add("call", "Choose a call.");
  if (!isIn(SHELLS, shell)) add("shell", "Choose a shell.");
  if (issues.length) return issues;
  if (!PACKAGE_CALLS[pkg as DefPackage].includes(dc as DefCall)) add("call", `${pkg} cannot run ${dc} (allowed: ${PACKAGE_CALLS[pkg as DefPackage].join(", ")}).`);
  if (!CALL_SHELLS[dc as DefCall].includes(shell as Coverage)) add("shell", `${dc} cannot use ${shell} (allowed: ${CALL_SHELLS[dc as DefCall].join(", ")}).`);
  return issues;
}

// ---------------------------------------------------------------------------
// Derivations shared by built-in and custom plays

export function offGroup(call: OffCall): OffGroup {
  switch (call.type) {
    case "run":
      if (call.concept === "Draw") return "Draw";
      if (call.concept === "Outside Zone" || call.concept === "Toss") return "Outside Run";
      if (call.concept === "Power" || call.concept === "Counter") return "Gap Run";
      return "Inside Run";
    case "short": return "Quick Game";
    case "medium": return "Intermediate";
    case "deep": return "Deep Shots";
    case "playaction": return "Play Action";
    default: return "Screens";
  }
}

const SHORT_YARDAGE_RUNS = ["Dive", "Sneak", "Power", "Trap", "Inside Zone"];
const SHORT_YARDAGE_PASSES = ["Stick", "Slant-Flat", "Smash"];
const RED_ZONE_MEDIUM = ["Smash", "Flood", "Curl-Flat", "Y-Cross"];
const RED_ZONE_PA = ["Bootleg", "PA Cross", "Flood"];

export function offTags(call: OffCall): SitTag[] {
  const tags: SitTag[] = ["neutral"];
  const t = call.type;
  if (call.formation === "Goal Line") tags.push("goal-line", "short-yardage", "red-zone");
  if ((t === "run" && SHORT_YARDAGE_RUNS.includes(call.concept) && call.gap !== "C" && call.gap !== "D") || (t === "short" && SHORT_YARDAGE_PASSES.includes(call.concept))) tags.push("short-yardage");
  if (t === "run" || t === "short" || (t === "medium" && RED_ZONE_MEDIUM.includes(call.concept)) || (t === "playaction" && RED_ZONE_PA.includes(call.concept))) tags.push("red-zone");
  if ((t === "short" || t === "medium" || t === "deep") && !tags.includes("goal-line")) tags.push("two-minute");
  if (t === "medium" || t === "deep" || t === "screen" || call.concept === "Draw") tags.push("long-yardage");
  return [...new Set(tags)];
}

export function defGroup(call: DefCallFull): DefGroup {
  if (call.pkg === "Goal Line") return "Goal Line";
  if (call.pkg === "Dime" && call.call === "Zone") return "Prevent";
  if (call.call === "Run D") return "Run D";
  if (call.call === "Blitz") return "Blitz";
  if (call.call === "Man") return "Man";
  return "Zone";
}

export function defTags(call: DefCallFull): SitTag[] {
  const tags: SitTag[] = ["neutral"];
  if (call.pkg === "Goal Line") tags.push("goal-line", "short-yardage", "red-zone");
  if (call.call === "Run D") tags.push("short-yardage");
  if (call.pkg === "Dime" || (call.call === "Zone" && call.shell === "Cover 2") || call.call === "Man") tags.push("long-yardage", "two-minute");
  if (call.call === "Blitz" || call.call === "Man") tags.push("red-zone");
  return [...new Set(tags)];
}

// ---------------------------------------------------------------------------
// Built-in offensive catalog. The first 18 keep the v2 order and values.

type O = [id: string, name: string, f: Formation, p: Personnel, t: PlayType, concept: string, gap: "A" | "B" | "C" | "D" | undefined, tagline: string];

const OFF_ROWS: O[] = [
  ["inside-zone", "Inside Zone", "Singleback", "11", "run", "Inside Zone", "A", "Patient zone read of the A-gap; the back picks his cut."],
  ["power-o", "Power O", "I-Form", "21", "run", "Power", "B", "Pulling guard and fullback lead through the B-gap."],
  ["outside-zone", "Outside Zone", "Singleback", "12", "run", "Outside Zone", "C", "Stretch to the edge with two tight ends sealing."],
  ["toss-sweep", "Toss Sweep", "I-Form", "21", "run", "Toss", "D", "Pitch to the edge behind a lead blocker. Boom or bust."],
  ["draw", "Draw", "Shotgun", "11", "run", "Draw", "A", "Fake the pass, then hand off. Best against blitzes."],
  ["qb-sneak", "QB Sneak", "Goal Line", "22", "run", "Sneak", "A", "Quarterback keeps it behind the center for the short yards."],
  ["slant-flat", "Slant-Flat", "Shotgun", "11", "short", "Slant-Flat", undefined, "Quick slant with a flat route to hold the underneath defender."],
  ["quick-outs", "Quick Outs", "Shotgun", "10", "short", "Quick Out", undefined, "Four wide, fast outside throws to the sideline."],
  ["mesh", "Mesh", "Shotgun", "11", "short", "Mesh", undefined, "Two crossers rub underneath. A man-coverage beater."],
  ["curl-flat", "Curl-Flat", "Singleback", "12", "medium", "Curl-Flat", undefined, "Curl at 12 yards with a flat route to pull the defender down."],
  ["dig", "Dig", "Shotgun", "11", "medium", "Dig", undefined, "Square-in at 12-15 yards, between the linebackers and safeties."],
  ["smash", "Smash", "Shotgun", "11", "medium", "Smash", undefined, "Hitch under a corner route. High-low read on the cornerback."],
  ["four-verticals", "Four Verticals", "Empty", "10", "deep", "Verticals", undefined, "Four receivers run deep; stretches coverage from hash to sideline."],
  ["post-wheel", "Post-Wheel", "Shotgun", "11", "deep", "Post-Wheel", undefined, "Post over the top with a wheel route working the sideline."],
  ["pa-boot", "PA Boot", "I-Form", "21", "playaction", "Bootleg", undefined, "Run fake, then roll out away from the pressure."],
  ["pa-shot", "PA Shot", "Singleback", "12", "playaction", "Deep Shot", undefined, "Sell the run with two tight ends, then throw deep."],
  ["rb-screen", "RB Screen", "Shotgun", "11", "screen", "RB Screen", undefined, "Let the rush come, then dump to the back behind blockers."],
  ["wr-bubble", "WR Bubble", "Shotgun", "10", "screen", "Bubble", undefined, "Quick throw to the receiver behind the line with blockers in front."],
  // v3 additions
  ["iso-dive", "Iso Dive", "I-Form", "21", "run", "Dive", "A", "Fullback isolates the linebacker; tailback hits the A-gap hard."],
  ["counter", "Counter", "Singleback", "12", "run", "Counter", "B", "Misdirection: backside guard and tight end pull to the B-gap."],
  ["pistol-counter", "Pistol Counter", "Pistol", "11", "run", "Counter", "C", "Pistol look with a pulling guard to the C-gap."],
  ["pistol-zone", "Pistol Zone", "Pistol", "12", "run", "Inside Zone", "B", "Downhill zone from the pistol with a second tight end."],
  ["wide-zone", "Wide Zone", "Shotgun", "11", "run", "Outside Zone", "D", "Shotgun stretch that bounces to the edge when the front over-pursues."],
  ["trap", "Trap", "Singleback", "11", "run", "Trap", "A", "Let the defensive tackle in, then trap him with a pulling guard."],
  ["gl-dive", "Goal Line Dive", "Goal Line", "22", "run", "Dive", "A", "Heavy set, straight ahead. Last-yard run."],
  ["gl-power", "Goal Line Power", "Goal Line", "22", "run", "Power", "B", "Heavy power with two tight ends and a fullback leading."],
  ["heavy-counter", "Heavy Counter", "I-Form", "22", "run", "Counter", "B", "Two tight ends and a fullback sell power, then counter back."],
  ["pistol-draw", "Pistol Draw", "Pistol", "11", "run", "Draw", "B", "Delayed handoff from the pistol on passing downs."],
  ["stretch-toss", "Stretch Toss", "Singleback", "12", "run", "Toss", "C", "Pitch to the strong side with tight ends sealing the edge."],
  ["stick", "Stick", "Singleback", "11", "short", "Stick", undefined, "Quick tight end stick route; easy read for short yardage."],
  ["hitch-seam", "Hitch-Seam", "Pistol", "11", "short", "Hitch-Seam", undefined, "Hitch outside, seam up the middle. Splits a two-high shell."],
  ["empty-slants", "Empty Slants", "Empty", "10", "short", "Slant-Flat", undefined, "Five-man protection-free quick game. Get the ball out fast."],
  ["heavy-slants", "Heavy Slants", "Singleback", "12", "short", "Slant-Flat", undefined, "Quick game from a run-heavy look to catch the defense in base."],
  ["levels", "Levels", "Shotgun", "11", "medium", "Levels", undefined, "Stacked digs at two depths to stress linebackers."],
  ["flood", "Flood", "Singleback", "11", "medium", "Flood", undefined, "Three receivers on one side at three depths."],
  ["y-cross", "Y-Cross", "Singleback", "12", "medium", "Y-Cross", undefined, "Tight end crosses the field behind the linebackers."],
  ["empty-dig", "Empty Dig", "Empty", "11", "medium", "Dig", undefined, "Five-wide dig. Spreads the box and the underneath coverage."],
  ["pistol-smash", "Pistol Smash", "Pistol", "11", "medium", "Smash", undefined, "Hitch-corner combination from the pistol."],
  ["deep-cross", "Deep Cross", "Shotgun", "11", "deep", "Deep Cross", undefined, "Deep crossing routes behind the linebackers; beats man coverage."],
  ["singleback-verts", "Singleback Verticals", "Singleback", "12", "deep", "Verticals", undefined, "Two tight ends release vertically with the receivers."],
  ["pa-cross", "PA Cross", "Singleback", "12", "playaction", "PA Cross", undefined, "Run fake, then a crosser over the middle."],
  ["pa-flood", "PA Flood", "I-Form", "21", "playaction", "Flood", undefined, "Play fake from the I, then flood one side of the field."],
  ["gl-boot", "Goal Line Boot", "Goal Line", "22", "playaction", "Bootleg", undefined, "Heavy-set fake with the quarterback rolling out to throw."],
  ["pistol-pa-shot", "Pistol Shot", "Pistol", "12", "playaction", "Deep Shot", undefined, "Pistol play action with a deep post."],
  ["slip-screen", "Slip Screen", "Singleback", "11", "screen", "RB Screen", undefined, "Back slips out of protection after a pass-block fake."],
];

function makeOff(row: O): OffPlayDef {
  const [id, name, formation, personnel, type, concept, gap, tagline] = row;
  const call: OffCallEx = { formation, personnel, type, concept };
  if (gap) call.gap = gap;
  return { id, origin: "builtin", name, tagline, call, group: offGroup(call), tags: offTags(call), ai: true };
}

export const OFF_CATALOG: readonly OffPlayDef[] = OFF_ROWS.map(makeOff);

// ---------------------------------------------------------------------------
// Built-in defensive catalog. The first 8 keep the v2 order and values.

type D = [id: string, name: string, pkg: DefPackage, call: DefCall, shell: Coverage, tagline: string];

const DEF_ROWS: D[] = [
  ["base-cover-3", "Base Cover 3", "Base", "Zone", "Cover 3", "Three deep, four under. The sound default against anything."],
  ["cover-2-zone", "Cover 2 Zone", "Nickel", "Zone", "Cover 2", "Two safeties deep take away the deep ball; soft in the middle."],
  ["cover-1-man", "Cover 1 Man", "Nickel", "Man", "Cover 1", "Man across the board with a single deep safety."],
  ["run-stack", "Run Stack", "Base", "Run D", "Cover 3", "Stack the box to stop the run; light on the back end."],
  ["goal-line", "Goal Line", "Goal Line", "Run D", "Cover 1", "Everyone near the ball with man behind. Last-yard stand."],
  ["zero-blitz", "Zero Blitz", "Nickel", "Blitz", "Man Blitz", "All-out pressure with no deep help. High risk, high reward."],
  ["fire-zone", "Fire Zone", "Nickel", "Blitz", "Cover 3", "Send pressure and drop linemen into zone coverage."],
  ["dime-prevent", "Dime Prevent", "Dime", "Zone", "Cover 2", "Six defensive backs, deep zones. Protects a late lead."],
  // v3 additions
  ["base-cover-2", "Base Cover 2", "Base", "Zone", "Cover 2", "Two-deep zone with base personnel; sturdy against short runs."],
  ["base-cover-1", "Base Cover 1", "Base", "Man", "Cover 1", "Base personnel in man with a free safety; strong against the run."],
  ["nickel-cover-3", "Nickel Cover 3", "Nickel", "Zone", "Cover 3", "Three-deep zone with an extra corner against three-wide sets."],
  ["dime-cover-3", "Dime Cover 3", "Dime", "Zone", "Cover 3", "Dime zone that keeps everything in front of the defense."],
  ["dime-man", "Dime Man", "Dime", "Man", "Cover 1", "Man coverage with six defensive backs on passing downs."],
  ["dime-fire-zone", "Dime Fire Zone", "Dime", "Blitz", "Cover 3", "Dime personnel with a zone-blitz pressure; disguised rush."],
  ["base-zero-blitz", "Base Zero Blitz", "Base", "Blitz", "Man Blitz", "Linebackers and safeties all come. Gambles the whole back end."],
  ["base-fire-zone", "Base Fire Zone", "Base", "Blitz", "Cover 3", "Linebacker pressure with three deep behind it."],
  ["cover-2-pressure", "Cover 2 Pressure", "Nickel", "Blitz", "Cover 2", "Nickel pressure that keeps two safeties deep."],
  ["cover-1-blitz", "Cover 1 Blitz", "Nickel", "Blitz", "Cover 1", "Pressure with man coverage and a single deep safety."],
  ["nickel-run-fit", "Nickel Run Fit", "Nickel", "Run D", "Cover 3", "Run-focused nickel; adds speed without giving up the box."],
  ["run-stack-man", "Run Stack Man", "Base", "Run D", "Cover 1", "Stacked box with man outside; good in short yardage."],
  ["goal-line-zone", "Goal Line Zone", "Goal Line", "Zone", "Cover 3", "Goal-line personnel in zone to guard the pass in the red zone."],
  ["goal-line-blitz", "Goal Line Blitz", "Goal Line", "Blitz", "Man Blitz", "Send everyone at the line to the backfield."],
];

function makeDef(row: D): DefPlayDef {
  const [id, name, pkg, call, shell, tagline] = row;
  const c: DefCallEx = { pkg, call, shell };
  return { id, origin: "builtin", name, tagline, call: c, group: defGroup(c), tags: defTags(c), ai: true };
}

export const DEF_CATALOG: readonly DefPlayDef[] = DEF_ROWS.map(makeDef);

// ---------------------------------------------------------------------------
// Name helpers

/** Case/whitespace-insensitive key used for uniqueness checks. */
export const nameKey = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

const offNameKeys = new Set(OFF_CATALOG.map((p) => nameKey(p.name)));
const defNameKeys = new Set(DEF_CATALOG.map((p) => nameKey(p.name)));
export const isBuiltinOffName = (name: string): boolean => offNameKeys.has(nameKey(name));
export const isBuiltinDefName = (name: string): boolean => defNameKeys.has(nameKey(name));

const sameOff = (a: OffCall, b: OffCall) => a.concept === b.concept && a.formation === b.formation && a.personnel === b.personnel && a.type === b.type && (a.gap ?? "") === (b.gap ?? "");

/** The built-in play a call corresponds to: exact match first, then same concept + formation, then concept. */
export function findBuiltinOff(call: OffCall): OffPlayDef | undefined {
  return OFF_CATALOG.find((p) => sameOff(p.call, call)) ?? OFF_CATALOG.find((p) => p.call.concept === call.concept && p.call.formation === call.formation) ?? OFF_CATALOG.find((p) => p.call.concept === call.concept);
}

export function findBuiltinDef(call: DefCallFull): DefPlayDef | undefined {
  return DEF_CATALOG.find((p) => p.call.pkg === call.pkg && p.call.call === call.call && p.call.shell === call.shell);
}
