/**
 * Gridiron GM play-by-play engine. Pure and deterministic: all randomness comes from a mulberry32 state stored
 * in the game, so the same seed and the same calls give the same game. Every snap is resolved into a PlaySpec,
 * which gmPlayScript turns into the 22-player animation.
 */
import { aiDefCall, aiOffCall, defName, playName, type Situation } from "./gmPlaybook";
import { SLOT_POS, winProb } from "./gmLeague";
import { emptyStats, ovr, schemeFit, shortName } from "./gmPlayers";
import { clamp, hashSeed } from "./gmRandom";
import type {
  AttrKey, DefCallFull, DepthSlot, GameResult, OffCall, Player, PlaySpec, PlayOutcome, SpecialKind, StatLine, Team, TeamGameStats, Weather,
} from "./gmTypes";

export interface PlayRecord {
  n: number;
  quarter: number;
  clock: number; // clock at the snap
  poss: 0 | 1;
  down: number;
  dist: number;
  ballOn: number;
  score: [number, number]; // after the play
  wp: number; // home win probability after the play
  text: string;
  spec: PlaySpec;
  big: boolean;
  scoring: boolean;
  drive: number;
  /** Engine state once the play was applied. The engine mutates the game synchronously, so a UI that animates the
   * play should show the snap situation (down/dist/ballOn above) until the animation ends, then this. */
  after?: PlayAfter;
}

export interface PlayAfter {
  down: number;
  dist: number;
  ballOn: number; // from the (new) offense's own goal
  poss: 0 | 1;
  phase: GameState["phase"];
  quarter: number;
  clock: number;
  score: [number, number];
  firstDown: boolean;
  turnoverOnDowns: boolean;
}

export interface Drive {
  team: 0 | 1;
  start: number; // ballOn
  plays: number;
  yards: number;
  result: string;
  quarter: number;
  startClock: number;
}

export type Decision =
  | { kind: "kickoff"; team: 0 | 1 }
  | { kind: "play"; team: 0 | 1 }
  | { kind: "fourth"; team: 0 | 1; fgDist: number }
  | { kind: "pat"; team: 0 | 1 }
  | { kind: "challenge"; team: 0 | 1; text: string }
  | { kind: "final" };

export interface StepInput {
  off?: OffCall;
  def?: DefCallFull;
  fourth?: "go" | "punt" | "fg";
  pat?: "kick" | "two";
  onside?: boolean;
  timeout?: 0 | 1; // team calling a timeout before the snap
  challenge?: boolean;
}

interface Review {
  team: 0 | 1; // team that may challenge
  snapshot: string;
  alt: PlayOutcome;
  altText: string;
  callText: string;
  ctx: Ctx;
}

interface Ctx {
  special: SpecialKind | null;
  off: OffCall | null;
  def: DefCallFull | null;
  offIds: number[];
  defIds: number[];
}

export interface GameState {
  seed: number;
  rs: number; // rng state
  home: Team;
  away: Team;
  players: Record<number, Player>;
  playoff: boolean;
  neutral: boolean;
  weather: Weather;
  score: [number, number];
  qScores: [number[], number[]];
  quarter: number; // 5+ = overtime
  clock: number;
  poss: 0 | 1;
  ballOn: number;
  down: number;
  dist: number;
  timeouts: [number, number];
  challenges: [number, number];
  phase: "kickoff" | "play" | "pat" | "final";
  openingKick: 0 | 1;
  running: boolean;
  runoff: number;
  warned: boolean;
  ot: { possessions: [number, number]; first: 0 | 1 | null } | null;
  stats: Record<number, StatLine>;
  team: [TeamGameStats, TeamGameStats];
  plays: PlayRecord[];
  drives: Drive[];
  out: number[]; // injured during this game
  injuries: Array<{ playerId: number; name: string; weeks: number }>;
  fatigue: Record<number, number>;
  review: Review | null;
  userTeam: 0 | 1 | null; // side whose decisions come from the caller
  safetyKick: boolean;
  log: string[];
}

const emptyTeamStats = (): TeamGameStats => ({ firstDowns: 0, totalYds: 0, passYds: 0, rushYds: 0, turnovers: 0, penalties: 0, penYds: 0, top: 0, sacks: 0, thirdAtt: 0, thirdConv: 0 });

export interface GameInput {
  home: Team;
  away: Team;
  players: Record<number, Player>;
  seed: number;
  playoff?: boolean;
  neutral?: boolean;
  week?: number;
  userTeam?: 0 | 1 | null;
}

export function pickWeather(home: Team, seed: number, week: number): Weather {
  if (home.dome) return "Dome";
  const r = hashSeed(seed, "wx", week) / 4294967296;
  const cold = week >= 12 || week === 0;
  if (cold && r < 0.12) return "Snow";
  if (r < 0.24) return "Rain";
  if (r < 0.34) return "Wind";
  return "Clear";
}

export function createGame(input: GameInput): GameState {
  const seed = input.seed >>> 0;
  const g: GameState = {
    seed,
    rs: seed ^ 0x5bd1e995,
    home: input.home,
    away: input.away,
    players: input.players,
    playoff: !!input.playoff,
    neutral: !!input.neutral,
    weather: pickWeather(input.home, seed, input.week ?? 1),
    score: [0, 0],
    qScores: [[0, 0, 0, 0], [0, 0, 0, 0]],
    quarter: 1,
    clock: 900,
    poss: 0,
    ballOn: 35,
    down: 1,
    dist: 10,
    timeouts: [3, 3],
    challenges: [2, 2],
    phase: "kickoff",
    openingKick: 0,
    running: false,
    runoff: 0,
    warned: false,
    ot: null,
    stats: {},
    team: [emptyTeamStats(), emptyTeamStats()],
    plays: [],
    drives: [],
    out: [],
    injuries: [],
    fatigue: {},
    review: null,
    userTeam: input.userTeam ?? null,
    safetyKick: false,
    log: [],
  };
  // Coin toss: the winner defers, so the loser kicks... the toss winner receives the second-half kick.
  g.openingKick = rand(g) < 0.5 ? 0 : 1;
  g.poss = g.openingKick;
  return g;
}

// ---------------------------------------------------------------------------
// Randomness (state lives in the game so a snapshot restores it exactly)

function rand(g: GameState): number {
  g.rs = (g.rs + 0x6d2b79f5) >>> 0;
  let t = g.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss(g: GameState, mean: number, sd: number): number {
  const u = Math.max(1e-9, rand(g));
  const v = rand(g);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function expo(g: GameState, mean: number): number {
  return -Math.log(Math.max(1e-9, 1 - rand(g))) * mean;
}
function choose<T>(g: GameState, list: readonly T[]): T {
  return list[Math.floor(rand(g) * list.length)];
}
function weighted<T>(g: GameState, list: T[], w: (x: T) => number): T {
  const total = list.reduce((s, x) => s + Math.max(0.0001, w(x)), 0);
  let roll = rand(g) * total;
  for (const x of list) {
    roll -= Math.max(0.0001, w(x));
    if (roll <= 0) return x;
  }
  return list[list.length - 1];
}

// ---------------------------------------------------------------------------
// Lineups

const teamOf = (g: GameState, side: 0 | 1) => (side === 0 ? g.home : g.away);
const other = (s: 0 | 1): 0 | 1 => (s === 0 ? 1 : 0);

function available(g: GameState, p: Player | undefined, teamId: number): p is Player {
  return !!p && p.teamId === teamId && !p.injury && !p.ps && !p.retired && !g.out.includes(p.id);
}

function slotPlayers(g: GameState, side: 0 | 1, slot: DepthSlot, count: number, exclude: number[] = []): Player[] {
  const t = teamOf(g, side);
  const out: Player[] = [];
  for (const id of t.depth[slot] ?? []) {
    const p = g.players[id];
    if (available(g, p, t.id) && !exclude.includes(p.id) && !out.includes(p)) out.push(p);
    if (out.length >= count) return out;
  }
  const pool = Object.values(g.players).filter((p) => available(g, p, t.id) && !exclude.includes(p.id) && !out.includes(p));
  const prefs = SLOT_POS[slot];
  pool.sort((a, b) => {
    const ia = prefs.indexOf(a.pos);
    const ib = prefs.indexOf(b.pos);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || ovr(b) - ovr(a);
  });
  for (const p of pool) {
    if (out.length >= count) break;
    out.push(p);
  }
  return out;
}

interface OffUnit { players: Player[]; roles: string[] }

function offenseUnit(g: GameState, side: 0 | 1, call: OffCall): OffUnit {
  const used: number[] = [];
  const take = (slot: DepthSlot, n: number) => {
    const ps = slotPlayers(g, side, slot, n, used);
    ps.forEach((p) => used.push(p.id));
    return ps;
  };
  const qb = take("QB", 1);
  const ol = [...take("LT", 1), ...take("LG", 1), ...take("C", 1), ...take("RG", 1), ...take("RT", 1)];
  const rb = take("RB", 1);
  const per = call.personnel;
  const fbs = per === "21" || per === "22" ? take("FB", 1) : [];
  const tes = take("TE", per === "12" || per === "22" ? 2 : per === "10" ? 0 : 1);
  const nWr = 4 - fbs.length - tes.length;
  const wrs = take("WR", nWr);
  const players = [...qb, ...ol, ...rb, ...wrs, ...tes, ...fbs];
  const roles = ["QB", "LT", "LG", "C", "RG", "RT", "RB", ...wrs.map(() => "WR"), ...tes.map(() => "TE"), ...fbs.map(() => "FB")];
  return { players: players.slice(0, 11), roles: roles.slice(0, 11) };
}

function defenseUnit(g: GameState, side: 0 | 1, call: DefCallFull): OffUnit {
  const t = teamOf(g, side);
  const used: number[] = [];
  const take = (slot: DepthSlot, n: number) => {
    const ps = slotPlayers(g, side, slot, n, used);
    ps.forEach((p) => used.push(p.id));
    return ps;
  };
  const front = t.defBase === "3-4" ? [...take("LE", 1), ...take("DT", 1), ...take("RE", 1), ...take("ROLB", 1)] : [...take("LE", 1), ...take("DT", 2), ...take("RE", 1)];
  const frontRoles = ["DL", "DL", "DL", t.defBase === "3-4" ? "EDGE" : "DL"];
  let lbs: Player[];
  let nb: Player[];
  if (call.pkg === "Nickel") {
    lbs = t.defBase === "3-4" ? [...take("MLB", 1), ...take("LOLB", 1)] : [...take("MLB", 1), ...take("LOLB", 1)];
    nb = [];
  } else if (call.pkg === "Dime") {
    lbs = take("MLB", 1);
    nb = [];
  } else {
    lbs = t.defBase === "3-4" ? [...take("LOLB", 1), ...take("MLB", 2)] : [...take("LOLB", 1), ...take("MLB", 1), ...take("ROLB", 1)];
    nb = [];
  }
  const cbCount = call.pkg === "Nickel" ? 3 : call.pkg === "Dime" ? 4 : 2;
  const cbs = take("CB", cbCount);
  const fs = take("FS", 1);
  const ss = take("SS", 1);
  const players = [...front, ...lbs, ...nb, ...cbs, ...fs, ...ss];
  const roles = [...frontRoles, ...lbs.map(() => "LB"), ...cbs.map((_, i) => (i < 2 ? "CB" : "NB")), "FS", "SS"];
  return { players: players.slice(0, 11), roles: roles.slice(0, 11) };
}

/** Effective attribute: fatigue, home field and scheme fit. */
function rate(g: GameState, p: Player | undefined, key: AttrKey, side: 0 | 1): number {
  if (!p) return 40;
  const t = teamOf(g, side);
  const fat = Math.min(6, (g.fatigue[p.id] ?? 0) * 0.12);
  const home = !g.neutral && side === 0 ? 1.5 : 0;
  return p.attrs[key] - fat + home + schemeFit(p, t.offScheme, t.defBase) + coachBonus(t, p);
}

function coachBonus(t: Team, p: Player): number {
  const group = { QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "WR", OT: "OL", OG: "OL", C: "OL", DE: "DL", DT: "DL", OLB: "LB", MLB: "LB", CB: "DB", FS: "DB", SS: "DB", K: "ST", P: "ST", LS: "ST" }[p.pos] as keyof Team["staff"];
  const c = t.staff[group];
  const coord = ["QB", "RB", "WR", "OL"].includes(group) ? t.staff.OC : group === "ST" ? undefined : t.staff.DC;
  return ((c?.rating ?? 60) - 60) / 25 + ((coord?.rating ?? 60) - 60) / 30;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 50);

function stat(g: GameState, id: number): StatLine {
  return (g.stats[id] ??= emptyStats());
}

// ---------------------------------------------------------------------------
// Decisions

export function situation(g: GameState): Situation {
  return { down: g.down, dist: g.dist, ballOn: g.ballOn, quarter: g.quarter, clock: g.clock, scoreDiff: g.score[g.poss] - g.score[other(g.poss)] };
}

export const fgDistance = (ballOn: number) => Math.round(100 - ballOn + 17);

export function nextDecision(g: GameState): Decision {
  if (g.phase === "final") return { kind: "final" };
  if (g.review) return { kind: "challenge", team: g.review.team, text: g.review.callText };
  if (g.phase === "kickoff") return { kind: "kickoff", team: g.poss };
  if (g.phase === "pat") return { kind: "pat", team: g.poss };
  if (g.down === 4) return { kind: "fourth", team: g.poss, fgDist: fgDistance(g.ballOn) };
  return { kind: "play", team: g.poss };
}

function aiFourth(g: GameState): "go" | "punt" | "fg" {
  const t = teamOf(g, g.poss);
  const k = slotPlayers(g, g.poss, "K", 1)[0];
  const dist = fgDistance(g.ballOn);
  const range = 50 + ((k?.attrs.kpw ?? 70) - 70) / 4 - (g.weather === "Wind" ? 4 : g.weather === "Snow" ? 3 : 0);
  const diff = g.score[g.poss] - g.score[other(g.poss)];
  const secsLeft = g.quarter >= 4 ? g.clock : 900 * (4 - g.quarter) + g.clock;
  const agg = t.plan.aggression / 100;
  if (g.quarter >= 4 && diff < 0 && secsLeft < 300) {
    if (diff >= -3 && dist <= range) return g.dist > 3 || secsLeft < 15 ? "fg" : "go";
    return "go";
  }
  if (g.quarter >= 4 && diff > 0 && dist <= range) return "fg";
  if (g.dist <= 1 && g.ballOn >= 40 && rand(g) < 0.35 + agg * 0.5) return "go";
  if (g.dist <= 3 && g.ballOn >= 55 && g.ballOn < 66 && rand(g) < agg * 0.6) return "go";
  if (dist <= range) return "fg";
  if (g.ballOn >= 62 && g.dist <= 4 && rand(g) < 0.3 + agg * 0.4) return "go";
  return "punt";
}

function aiPat(g: GameState): "kick" | "two" {
  const t = teamOf(g, g.poss);
  if (t.plan.twoPoint === "Always") return "two";
  if (t.plan.twoPoint === "Never") return "kick";
  const diff = g.score[g.poss] - g.score[other(g.poss)]; // after the TD
  if (g.quarter >= 4 && g.clock < 600) {
    if ([-2, -5, -10, 1, 5, -13].includes(diff)) return "two";
  }
  return "kick";
}

// ---------------------------------------------------------------------------
// Main step

export function step(g: GameState, input: StepInput = {}): PlayRecord | null {
  if (g.phase === "final") return null;
  if (g.review) return resolveReview(g, input.challenge ?? aiChallenge(g));
  if (g.clock <= 0 && g.phase !== "pat") {
    endOfPeriod(g);
    if ((g.phase as string) === "final") return null;
  }
  if (g.phase === "kickoff") return kickoff(g, input.onside ?? aiOnside(g));
  if (g.phase === "pat") return pat(g, input.pat ?? aiPat(g));

  // Clock runs between snaps unless someone calls a timeout.
  const userTimeout = input.timeout;
  const aiTimeout = aiTimeoutCall(g);
  const timeoutTeam = userTimeout ?? aiTimeout;
  if (g.running) {
    if (timeoutTeam !== undefined && timeoutTeam !== null && g.timeouts[timeoutTeam] > 0) {
      g.timeouts[timeoutTeam]--;
      g.log.push(`Timeout, ${teamOf(g, timeoutTeam).name}.`);
    } else if (!runClock(g, g.runoff)) {
      return null; // the period ended while the clock ran
    }
  }
  g.running = false;

  if (g.down === 4) {
    const choice = input.fourth ?? aiFourth(g);
    if (choice === "punt") return punt(g);
    if (choice === "fg") return fieldGoal(g);
  }
  if (shouldKneel(g) || input.off?.type === "kneel") return kneel(g);
  if (shouldSpike(g) || input.off?.type === "spike") return spike(g);
  const sit = situation(g);
  const offTeam = teamOf(g, g.poss);
  const defTeam = teamOf(g, other(g.poss));
  const off = input.off ?? aiOffCall(() => rand(g), sit, offTeam.plan, offTeam.offScheme);
  const def = input.def ?? aiDefCall(() => rand(g), sit, defTeam.plan, defTeam.coverage);
  return scrimmage(g, off, def);
}

// ---------------------------------------------------------------------------
// Play-definition hook (built-in and custom plays run through the exact same engine path as step())

/** Anything that resolves to an offensive call: a built-in OFF_PLAYS card, or a custom play's engine call. */
export interface PlayDefinition {
  id?: string; // stored on the PlaySpec as playId so stats/replays can name the play
  name?: string;
  call: OffCall;
}

const PERSONNEL = ["10", "11", "12", "21", "22"];
const PLAY_TYPES = ["run", "short", "medium", "deep", "screen", "playaction"];

/** Clamps a hand-built call into something the engine can resolve (unknown personnel/type fall back, runs get a gap and side). */
export function normalizeOffCall(call: OffCall): OffCall {
  const type = PLAY_TYPES.includes(call.type) || call.type === "kneel" || call.type === "spike" ? call.type : "short";
  const out: OffCall = { ...call, type, personnel: PERSONNEL.includes(call.personnel) ? call.personnel : "11", concept: call.concept || "Custom" };
  if (type === "run") {
    out.gap = call.gap && "ABCD".includes(call.gap) ? call.gap : "A";
    out.side = call.side === -1 ? -1 : 1;
  } else out.side = call.side === -1 ? -1 : 1;
  return out;
}

/**
 * Executes one snap for the team with the ball using a play definition. Same path as step({ off }): same RNG, penalties,
 * downs, clock, review and stat handling. Defaults 4th down to "go" (the caller chose a scrimmage play), and returns the
 * record (tagged with playId / playName) or null if the engine consumed the step without a snap (e.g. a challenge
 * resolution or the end of a period). If the game is not waiting on a scrimmage snap, the engine does what step() would.
 */
export function runPlay(g: GameState, play: PlayDefinition | OffCall, opts: Omit<StepInput, "off"> = {}): PlayRecord | null {
  const def: PlayDefinition = "call" in play ? play : { call: play };
  const call = normalizeOffCall(def.call);
  const wasPlay = g.phase === "play" && !g.review;
  const rec = step(g, { ...opts, off: call, fourth: opts.fourth ?? (g.down === 4 ? "go" : undefined) });
  if (rec && wasPlay && rec.spec.off === call) {
    if (def.id) rec.spec.playId = def.id;
    if (def.name) rec.spec.playName = def.name;
  }
  return rec;
}

/** Runs the clock between snaps. Returns false if the quarter ended. */
function runClock(g: GameState, secs: number): boolean {
  const before = g.clock;
  g.clock = Math.max(0, g.clock - secs);
  if ((g.quarter === 2 || g.quarter === 4) && !g.warned && before > 120 && g.clock <= 120) {
    g.clock = 120;
    g.warned = true;
    g.log.push("Two-minute warning.");
  }
  g.team[g.poss].top += before - g.clock;
  if (g.clock <= 0) {
    endOfPeriod(g);
    return false;
  }
  return true;
}

function aiTimeoutCall(g: GameState): 0 | 1 | null {
  if (!g.running) return null;
  const late = (g.quarter === 4 || g.quarter === 2) && g.clock <= 150;
  if (!late) return null;
  const off = g.poss;
  const def = other(off);
  const diffOff = g.score[off] - g.score[def];
  // Defense trailing or tied: stop the clock to get the ball back.
  if (g.quarter === 4 && diffOff >= 0 && diffOff <= 16 && g.timeouts[def] > 0 && g.userTeam !== def) return def;
  // Offense trailing in a hurry.
  if (diffOff <= 0 && g.clock <= 60 && g.timeouts[off] > 0 && g.userTeam !== off) return off;
  if (g.quarter === 2 && g.ballOn >= 50 && g.clock <= 40 && g.timeouts[off] > 0 && g.userTeam !== off) return off;
  return null;
}

function shouldKneel(g: GameState): boolean {
  const lead = g.score[g.poss] - g.score[other(g.poss)];
  if (g.quarter < 4 || g.ot) return false;
  if (lead <= 0 || g.down >= 4) return false; // never kneel away a 4th down the coach chose to go for
  const downsLeft = 4 - g.down;
  const oppTo = g.timeouts[other(g.poss)];
  return g.clock <= (downsLeft + 1) * 40 - oppTo * 40 + 2 && g.clock < 125;
}

function shouldSpike(g: GameState): boolean {
  const diff = g.score[g.poss] - g.score[other(g.poss)];
  return g.quarter >= 4 && !g.ot && diff < 0 && diff >= -3 && g.clock < 18 && g.clock > 4 && g.timeouts[g.poss] === 0 && g.ballOn >= 60 && g.down < 4 && g.plays.length > 0 && g.plays[g.plays.length - 1].spec.outcome.kind !== "spike";
}

function aiOnside(g: GameState): boolean {
  const diff = g.score[g.poss] - g.score[other(g.poss)];
  return g.quarter >= 4 && diff < 0 && diff >= -16 && g.clock < 150 && !g.safetyKick;
}

function aiChallenge(g: GameState): boolean {
  if (!g.review) return false;
  const t = g.review.team;
  return g.challenges[t] > 0 && g.timeouts[t] > 0 && rand(g) < 0.7;
}

// ---------------------------------------------------------------------------
// Scrimmage plays

function baseSpec(g: GameState, ctx: Ctx, outcome: PlayOutcome, text: string, los = g.ballOn): PlaySpec {
  const offSide = g.poss;
  const dir = attackDir(g, offSide);
  const pl = (id: number) => {
    const p = g.players[id];
    return { id, num: p?.num ?? 0, pos: p?.pos ?? "", name: p ? shortName(p) : "", spd: p?.attrs.spd ?? 60 };
  };
  return {
    id: `${g.seed}-${g.plays.length}`,
    seed: hashSeed(g.seed, g.plays.length, g.rs),
    dir,
    los,
    firstDownAt: clamp(los + g.dist, 0, 100),
    off: ctx.off,
    def: ctx.def,
    special: ctx.special,
    outcome,
    offTeam: teamOf(g, offSide).id,
    defTeam: teamOf(g, other(offSide)).id,
    offPlayers: ctx.offIds.map(pl),
    defPlayers: ctx.defIds.map(pl),
    text,
  };
}

/** Home attacks to the right in quarters 1 and 3 (and odd OT periods). */
export function attackDir(g: Pick<GameState, "quarter">, side: 0 | 1): 1 | -1 {
  const odd = g.quarter % 2 === 1;
  return (odd ? side === 0 : side === 1) ? 1 : -1;
}

function scrimmage(g: GameState, off: OffCall, def: DefCallFull): PlayRecord {
  const o = g.poss;
  const d = other(o);
  const offU = offenseUnit(g, o, off);
  const defU = defenseUnit(g, d, def);
  const ctx: Ctx = { special: null, off, def, offIds: offU.players.map((p) => p.id), defIds: defU.players.map((p) => p.id) };
  const snap = { down: g.down, dist: g.dist, ballOn: g.ballOn, clock: g.clock, quarter: g.quarter };
  const offName = teamOf(g, o).abbr;

  // Pre-snap penalties.
  const pen = rand(g);
  const awayNoise = !g.neutral && o === 1 ? 0.006 : 0;
  if (pen < 0.017 + awayNoise) return penaltyPlay(g, ctx, { name: "False start", on: "off", yards: -5 });
  if (pen < 0.028 + awayNoise) return penaltyPlay(g, ctx, { name: "Offside", on: "def", yards: 5 });

  const isPass = off.type !== "run";
  const ol = offU.players.slice(1, 6);
  const front = defU.players.slice(0, 4);
  const qb = offU.players[0];
  let out: PlayOutcome;
  let text = "";
  let clockStops = false;
  let duration = 5;

  if (!isPass) {
    // Run play.
    const carrierIdx = off.concept === "Sneak" ? 0 : 6;
    const carrier = offU.players[carrierIdx];
    const blk = avg(ol.map((p) => rate(g, p, "rbk", o)));
    const stop = avg(front.map((p) => (rate(g, p, "str", d) + rate(g, p, "tak", d)) / 2));
    const lb = avg(defU.players.slice(4, 7).map((p) => rate(g, p, "tak", d)));
    const runner = (rate(g, carrier, "bcv", o) + rate(g, carrier, "agi", o) + rate(g, carrier, "spd", o) + rate(g, carrier, "str", o)) / 4;
    let mean = 2.9 + (blk - stop) / 11 + (runner - lb) / 14;
    let sd = 3.1;
    if (def.call === "Run D") mean -= 1.1;
    if (def.call === "Blitz") { sd += 1.2; mean += 0.2; }
    if (def.pkg === "Nickel") mean += 0.5;
    if (def.pkg === "Dime") mean += 1.2;
    if (off.concept === "Draw" && def.call === "Blitz") mean += 2;
    if (off.concept === "Sneak") { mean = 1.6 + (blk - stop) / 20; sd = 1.4; }
    if (g.weather === "Snow") mean -= 0.3;
    let yards = Math.round(gauss(g, mean, sd));
    if (rand(g) < 0.075) yards = -Math.round(1 + rand(g) * 3);
    const breakaway = 0.035 + (rate(g, carrier, "spd", o) - 80) / 900 + (def.call === "Blitz" ? 0.02 : 0);
    if (rand(g) < breakaway) yards += Math.round(8 + expo(g, 15));
    yards = clamp(yards, -g.ballOn + 1 - 1, 100 - g.ballOn);
    const tacklerIdx = pickTackler(g, defU.roles, false, yards);
    out = { kind: "run", yards, carrierIdx, tacklerIdx };
    // Fumble.
    if (rand(g) < 0.0085 * (1 + (60 - rate(g, carrier, "str", o)) / 120)) {
      const lost = rand(g) < 0.5;
      out = { ...out, kind: "fumble", recoveredByDefense: lost, defenderIdx: tacklerIdx };
    }
    clockStops = rand(g) < (off.gap === "D" ? 0.25 : 0.05); // out of bounds
    duration = 4 + Math.min(6, Math.abs(yards) / 6);
    text = `${shortName(carrier)} ${off.concept === "Sneak" ? "sneaks" : "runs"} ${dirWord(off)} for ${yardText(yards)}`;
  } else {
    const blitz = def.call === "Blitz";
    const pb = avg(ol.map((p) => rate(g, p, "pbk", o)));
    const prs = avg(front.map((p) => rate(g, p, "prs", d)));
    let pressure = 0.27 + (prs - pb) / 110 + (blitz ? 0.11 : 0) - (off.type === "short" || off.type === "screen" ? 0.09 : 0) + (off.type === "deep" ? 0.07 : 0);
    if (off.type === "playaction") pressure += def.call === "Run D" ? -0.06 : 0.04;
    pressure = clamp(pressure, 0.05, 0.7);
    const pressured = rand(g) < pressure;
    const sackChance = 0.25 - (rate(g, qb, "awr", o) - 70) / 400 - (rate(g, qb, "agi", o) - 60) / 600;
    if (off.type !== "screen" && pressured && rand(g) < sackChance) {
      const sackerIdx = weightedIdx(g, defU.roles, (r, i) => (r === "DL" || r === "EDGE" ? 3 : r === "LB" ? 1.2 : 0.4) * (defU.players[i] ? rate(g, defU.players[i], "prs", d) : 1));
      const yards = -clamp(Math.round(gauss(g, 7, 2.5)), 1, Math.min(15, g.ballOn));
      out = { kind: "sack", yards, defenderIdx: sackerIdx, carrierIdx: 0, tacklerIdx: sackerIdx };
      if (rand(g) < 0.09) out = { ...out, kind: "fumble", recoveredByDefense: rand(g) < 0.55 };
      text = `${shortName(qb)} sacked by ${shortName(defU.players[sackerIdx])} for ${yardText(yards)}`;
      duration = 4;
    } else if (pressured && rand(g) < 0.1 + (rate(g, qb, "spd", o) - 60) / 250 && off.type !== "screen") {
      let yards = Math.round(gauss(g, 4.5 + (rate(g, qb, "spd", o) - 70) / 8, 4));
      if (rand(g) < 0.04) yards += Math.round(expo(g, 12));
      yards = clamp(yards, -2, 100 - g.ballOn);
      const tacklerIdx = pickTackler(g, defU.roles, false, yards);
      out = { kind: "scramble", yards, carrierIdx: 0, tacklerIdx };
      text = `${shortName(qb)} scrambles for ${yardText(yards)}`;
      clockStops = rand(g) < 0.3;
      duration = 6;
    } else {
      // Pick a target.
      const skill = offU.roles.map((r, i) => ({ r, i })).filter((x) => x.r === "WR" || x.r === "TE" || x.r === "RB" || x.r === "FB");
      const tgt = weighted(g, skill, (x) => {
        const p = offU.players[x.i];
        if (!p) return 0.1;
        const base = x.r === "WR" ? 1.4 : x.r === "TE" ? 0.95 : 0.5;
        const fit = off.type === "screen" ? (x.r === "RB" && off.concept === "RB Screen" ? 6 : x.r === "WR" && off.concept === "Bubble" ? 2 : 0.1) : off.type === "deep" ? (x.r === "WR" ? 1.5 : 0.4) : 1;
        return base * fit * Math.pow(ovr(p) / 70, 3);
      });
      const target = offU.players[tgt.i];
      const deep = off.type === "deep" || (off.type === "playaction" && rand(g) < 0.45);
      const depth = off.type === "screen" ? "screen" : deep ? "deep" : off.type === "medium" || off.type === "playaction" ? "medium" : "short";
      const coverIdx = coverDefender(g, defU.roles, tgt.r, depth, def);
      const cover = defU.players[coverIdx];
      const manCov = def.call === "Man" || def.shell === "Cover 1" || def.shell === "Man Blitz";
      const sep = ((rate(g, target, "rte", o) + rate(g, target, "spd", o)) / 2 - ((manCov ? rate(g, cover, "mcv", d) : rate(g, cover, "zcv", d)) * 0.6 + rate(g, cover, "spd", d) * 0.4)) / 100;
      const acc = depth === "deep" ? rate(g, qb, "tad", o) : depth === "medium" ? rate(g, qb, "tam", o) : rate(g, qb, "tas", o);
      let pc = { screen: 0.81, short: 0.69, medium: 0.54, deep: 0.34 }[depth];
      pc += (acc - 72) / 160 + sep * 0.55 + (rate(g, target, "cat", o) - 72) / 300;
      if (pressured) pc -= 0.13;
      if (g.weather === "Rain") pc -= 0.04;
      if (g.weather === "Snow") pc -= 0.05;
      if (g.weather === "Wind" && depth === "deep") pc -= 0.08;
      if (def.call === "Run D") pc += 0.06;
      if (def.call === "Blitz" && depth === "screen") pc += 0.06;
      if (def.call === "Zone" && depth === "deep" && def.shell === "Cover 2") pc -= 0.05;
      if (def.pkg === "Dime") pc += depth === "short" ? 0.05 : -0.05;
      if (g.quarter >= 4 && Math.abs(g.score[0] - g.score[1]) <= 8) pc += (qb.clutch - 50) / 800;
      pc = clamp(pc, 0.08, 0.95);
      const air = depth === "screen" ? Math.round(-2 + rand(g) * 3) : depth === "short" ? Math.round(1 + rand(g) * 6) : depth === "medium" ? Math.round(7 + rand(g) * 8) : Math.round(16 + rand(g) * 18);
      const airYards = clamp(air, -g.ballOn + 1, 100 - g.ballOn);
      let intChance = 0.026 * ({ screen: 0.2, short: 0.6, medium: 1.15, deep: 1.9 }[depth]) * (pressured ? 1.6 : 1) * (1 + (70 - rate(g, qb, "awr", o)) / 60) * (1 + (rate(g, cover, "cat", d) - 50) / 120);
      if (g.quarter >= 4 && g.score[o] < g.score[d] && g.clock < 120) intChance *= 1.6;
      const roll = rand(g);
      duration = depth === "deep" ? 6 : 5;
      if (roll < intChance) {
        const ret = Math.round(clamp(expo(g, 9) - 2, 0, 100));
        const spot = g.ballOn + airYards;
        const pickSix = spot - ret <= 0 || rand(g) < 0.06;
        const retYds = pickSix ? spot : Math.min(ret, spot - 1);
        out = { kind: "interception", yards: 0, airYards, targetIdx: tgt.i, defenderIdx: coverIdx, returnYards: retYds, defTouchdown: pickSix };
        text = `${shortName(qb)} pass ${depthWord(depth)} intended for ${shortName(target)} INTERCEPTED by ${shortName(cover)}${pickSix ? ", returned for a TOUCHDOWN" : `, returned ${retYds} yards`}`;
        duration = 8;
      } else if (roll < intChance + pc) {
        let yac: number;
        if (depth === "screen") yac = gauss(g, 5 + (def.call === "Blitz" ? 2.5 : 0), 3.5);
        else if (depth === "short") yac = expo(g, 2.9);
        else if (depth === "medium") yac = expo(g, 2.5);
        else yac = expo(g, 2.6);
        const breakChance = 0.012 + (rate(g, target, "spd", o) - rate(g, cover, "spd", d)) / 300 + (rate(g, target, "agi", o) - 75) / 600;
        if (rand(g) < Math.min(0.06, breakChance)) yac += 8 + expo(g, 14);
        const yards = clamp(Math.round(airYards + Math.max(depth === "screen" ? -3 : 0, yac)), -g.ballOn + 1, 100 - g.ballOn);
        const tacklerIdx = pickTackler(g, defU.roles, true, yards, coverIdx);
        out = { kind: "complete", yards, airYards, targetIdx: tgt.i, tacklerIdx, defenderIdx: coverIdx };
        if (rand(g) < 0.005) out = { ...out, kind: "fumble", recoveredByDefense: rand(g) < 0.5, carrierIdx: tgt.i };
        text = `${shortName(qb)} pass ${depthWord(depth)} to ${shortName(target)} for ${yardText(yards)}`;
        clockStops = rand(g) < (depth === "deep" || depth === "medium" ? 0.32 : 0.2);
        duration = 5 + Math.min(4, yards / 10);
      } else {
        // Incomplete, or pass interference.
        if (depth !== "screen" && rand(g) < (depth === "deep" ? 0.07 : 0.025)) {
          return penaltyPlay(g, ctx, { name: "Defensive pass interference", on: "def", yards: Math.max(5, Math.min(airYards, 99 - g.ballOn)), autoFirst: true });
        }
        const dropped = rand(g) < 0.13;
        const pd = !dropped && rand(g) < 0.45;
        out = { kind: "incomplete", yards: 0, airYards, targetIdx: tgt.i, defenderIdx: coverIdx, deflected: pd, dropped };
        text = `${shortName(qb)} pass ${depthWord(depth)} to ${shortName(target)} incomplete${dropped ? ", dropped" : pd ? `, broken up by ${shortName(cover)}` : ""}`;
        clockStops = true;
      }
      if (out.kind !== "interception" && rand(g) < 0.012) {
        // Roughing the passer on top of the play.
        if (out.kind === "incomplete") return penaltyPlay(g, ctx, { name: "Roughing the passer", on: "def", yards: 15, autoFirst: true });
      }
    }
  }

  // Holding on the play (offense) wipes out a gain.
  if ((out.kind === "run" || out.kind === "complete" || out.kind === "scramble") && out.yards > 3 && rand(g) < 0.035) {
    return penaltyPlay(g, ctx, { name: "Offensive holding", on: "off", yards: -10 });
  }

  // Close calls can be reviewed.
  const close = (out.kind === "complete" && rand(g) < 0.03) || (out.kind === "incomplete" && rand(g) < 0.02);
  if (close) {
    const alt: PlayOutcome = out.kind === "complete" ? { ...out, kind: "incomplete", yards: 0 } : { ...out, kind: "complete", yards: clamp((out.airYards ?? 5) + 2, -g.ballOn + 1, 100 - g.ballOn), tacklerIdx: out.defenderIdx };
    const altText = text.replace(/ for .*$| incomplete.*$/, "") + (alt.kind === "complete" ? ` for ${yardText(alt.yards)} (call reversed)` : " incomplete (call reversed)");
    const challenger = out.kind === "complete" ? d : o;
    const snapshot = JSON.stringify(snapshotOf(g));
    const rec = applyScrimmage(g, ctx, out, text, clockStops, duration, snap, offName, def, off);
    if (g.phase !== "final" && g.challenges[challenger] > 0 && g.timeouts[challenger] > 0 && !(g.quarter >= 4 && g.clock < 120) && !(g.quarter === 2 && g.clock < 120)) {
      g.review = { team: challenger, snapshot, alt, altText, callText: `Ruled ${out.kind === "complete" ? "a catch" : "incomplete"}. Close call.`, ctx };
    }
    return rec;
  }
  return applyScrimmage(g, ctx, out, text, clockStops, duration, snap, offName, def, off);
}

function snapshotOf(g: GameState) {
  const { home: _h, away: _a, players: _p, plays: _pl, review: _r, ...rest } = g;
  return { ...rest, playsLen: g.plays.length };
}

function resolveReview(g: GameState, challenge: boolean): PlayRecord | null {
  const rv = g.review!;
  g.review = null;
  if (!challenge) return null;
  g.challenges[rv.team]--;
  const overturn = rand(g) < 0.45;
  if (!overturn) {
    g.timeouts[rv.team] = Math.max(0, g.timeouts[rv.team] - 1);
    g.log.push(`Challenge by ${teamOf(g, rv.team).name}: the call stands. Timeout charged.`);
    const last = g.plays[g.plays.length - 1];
    if (last) last.text += " — Challenged: the ruling stands.";
    return null;
  }
  const snap = JSON.parse(rv.snapshot) as ReturnType<typeof snapshotOf>;
  const keepRs = g.rs;
  const { playsLen, ...rest } = snap;
  Object.assign(g, rest);
  g.rs = keepRs;
  g.plays.length = playsLen;
  g.log.push(`Challenge by ${teamOf(g, rv.team).name}: the call is reversed.`);
  const before = { down: g.down, dist: g.dist, ballOn: g.ballOn, clock: g.clock, quarter: g.quarter };
  return applyScrimmage(g, rv.ctx, rv.alt, rv.altText, rv.alt.kind === "incomplete", 5, before, teamOf(g, g.poss).abbr, rv.ctx.def!, rv.ctx.off!);
}

function dirWord(off: OffCall): string {
  if (off.gap === "A") return "up the middle";
  if (off.gap === "B") return off.side === -1 ? "left guard" : "right guard";
  if (off.gap === "C") return off.side === -1 ? "left tackle" : "right tackle";
  return off.side === -1 ? "around left end" : "around right end";
}
const depthWord = (d: string) => (d === "deep" ? "deep" : d === "medium" ? "over the middle" : d === "screen" ? "behind the line" : "short");
const yardText = (y: number) => (y === 0 ? "no gain" : y < 0 ? `a loss of ${-y}` : `${y} yard${y === 1 ? "" : "s"}`);

function weightedIdx(g: GameState, roles: string[], w: (role: string, i: number) => number): number {
  const idx = roles.map((_, i) => i);
  return weighted(g, idx, (i) => w(roles[i], i));
}

function pickTackler(g: GameState, roles: string[], pass: boolean, yards: number, cover?: number): number {
  if (pass && cover !== undefined && rand(g) < 0.45) return cover;
  return weightedIdx(g, roles, (r) => {
    if (yards > 15) return r === "FS" || r === "SS" ? 3 : r === "CB" || r === "NB" ? 2 : 0.5;
    if (pass) return r === "CB" || r === "NB" ? 2 : r === "LB" ? 2 : r === "FS" || r === "SS" ? 1.5 : 0.6;
    return r === "LB" ? 3 : r === "DL" || r === "EDGE" ? 2 : r === "SS" ? 1.4 : 0.6;
  });
}

function coverDefender(g: GameState, roles: string[], targetRole: string, depth: string, def: DefCallFull): number {
  const find = (want: string[]) => roles.map((r, i) => ({ r, i })).filter((x) => want.includes(x.r));
  let pool: Array<{ r: string; i: number }>;
  if (targetRole === "WR") pool = depth === "deep" && def.call === "Zone" ? find(["CB", "FS", "SS"]) : find(["CB", "NB"]);
  else if (targetRole === "TE") pool = find(["LB", "SS"]);
  else pool = find(["LB"]);
  if (!pool.length) pool = find(["CB", "LB", "FS", "SS", "NB"]);
  return choose(g, pool).i;
}

function penaltyPlay(g: GameState, ctx: Ctx, pen: { name: string; on: "off" | "def"; yards: number; autoFirst?: boolean }): PlayRecord {
  const side = pen.on === "off" ? g.poss : other(g.poss);
  const snap = { down: g.down, dist: g.dist, ballOn: g.ballOn, clock: g.clock, quarter: g.quarter };
  let yards = pen.yards;
  // Half the distance to the goal.
  if (yards < 0 && g.ballOn + yards < 1) yards = -Math.floor(g.ballOn / 2);
  if (yards > 0 && g.ballOn + yards > 99) yards = Math.floor((100 - g.ballOn) / 2);
  yards = clamp(g.ballOn + yards, 1, 99) - g.ballOn; // never mark the ball off outside the field
  g.team[side].penalties++;
  g.team[side].penYds += Math.abs(yards);
  const out: PlayOutcome = { kind: "penalty", yards, penalty: { ...pen, yards } };
  const text = `PENALTY on ${teamOf(g, side).abbr}: ${pen.name}, ${Math.abs(yards)} yards`;
  const spec = baseSpec(g, ctx, out, text);
  g.ballOn = clamp(g.ballOn + yards, 1, 99);
  if (pen.on === "def" && (pen.autoFirst || yards >= g.dist)) {
    g.down = 1;
    g.dist = Math.min(10, 100 - g.ballOn);
    g.team[g.poss].firstDowns++;
    out.firstDown = true;
  } else {
    // Distance follows the penalty yardage (not the nullified play) and stays consistent with the line to gain.
    g.dist = clamp(g.dist - yards, 1, 100 - g.ballOn);
  }
  if (pen.name !== "False start" && pen.name !== "Offside") g.clock = Math.max(0, g.clock - 4);
  return record(g, spec, text, snap, false);
}

function applyScrimmage(
  g: GameState, ctx: Ctx, out: PlayOutcome, text: string, clockStops: boolean, duration: number,
  snap: { down: number; dist: number; ballOn: number; clock: number; quarter: number }, _offName: string, _def: DefCallFull, off: OffCall,
): PlayRecord {
  const o = g.poss;
  const d = other(o);
  const spec = baseSpec(g, ctx, out, text, snap.ballOn);
  const offIds = ctx.offIds;
  const defIds = ctx.defIds;
  const ts = g.team[o];
  g.clock = Math.max(0, g.clock - Math.round(duration));
  ts.top += Math.round(duration);
  for (const id of offIds) g.fatigue[id] = (g.fatigue[id] ?? 0) + 1;
  for (const id of defIds) g.fatigue[id] = (g.fatigue[id] ?? 0) + 1;
  if (snap.down === 3) ts.thirdAtt++;

  // A fumble that already crossed a goal line is not a defensive recovery: the offense keeps the TD / concedes the safety.
  if (out.kind === "fumble" && out.recoveredByDefense && (snap.ballOn + out.yards >= 100 || snap.ballOn + out.yards <= 0)) out.recoveredByDefense = false;

  const qbId = offIds[0];
  let scored = false;
  let fullText = text;

  switch (out.kind) {
    case "run":
    case "scramble": {
      const cid = offIds[out.carrierIdx ?? 6];
      const s = stat(g, cid);
      s.rAtt++;
      s.rYds += out.yards;
      ts.rushYds += out.yards;
      ts.totalYds += out.yards;
      if (out.tacklerIdx !== undefined) stat(g, defIds[out.tacklerIdx]).tkl++;
      break;
    }
    case "complete": {
      const tid = offIds[out.targetIdx!];
      const q = stat(g, qbId);
      q.pAtt++; q.pCmp++; q.pYds += out.yards;
      const t = stat(g, tid);
      t.tgt++; t.rec++; t.recYds += out.yards;
      ts.passYds += out.yards;
      ts.totalYds += out.yards;
      if (out.tacklerIdx !== undefined) stat(g, defIds[out.tacklerIdx]).tkl++;
      break;
    }
    case "incomplete": {
      stat(g, qbId).pAtt++;
      stat(g, offIds[out.targetIdx!]).tgt++;
      if (out.deflected && out.defenderIdx !== undefined) stat(g, defIds[out.defenderIdx]).pd++;
      break;
    }
    case "interception": {
      const q = stat(g, qbId);
      q.pAtt++; q.pInt++;
      stat(g, offIds[out.targetIdx!]).tgt++;
      const dp = stat(g, defIds[out.defenderIdx!]);
      dp.dInt++;
      ts.turnovers++;
      break;
    }
    case "sack": {
      stat(g, qbId).sacked++;
      stat(g, defIds[out.defenderIdx!]).sck++;
      stat(g, defIds[out.defenderIdx!]).tkl++;
      g.team[d].sacks++;
      ts.totalYds += out.yards;
      ts.passYds += out.yards;
      break;
    }
    case "fumble": {
      const cid = offIds[out.carrierIdx ?? out.targetIdx ?? 6];
      stat(g, cid).fum++;
      if (out.defenderIdx !== undefined) stat(g, defIds[out.defenderIdx]).ff++;
      if (snapIsPass(off) && out.targetIdx !== undefined) {
        const q = stat(g, qbId);
        q.pAtt++; q.pCmp++; q.pYds += out.yards;
        const t = stat(g, cid);
        t.tgt++; t.rec++; t.recYds += out.yards;
        ts.passYds += out.yards;
      } else if (snapIsPass(off) && out.carrierIdx === 0 && out.defenderIdx !== undefined && out.yards < 0) {
        stat(g, qbId).sacked++;
        stat(g, defIds[out.defenderIdx]).sck++;
        g.team[d].sacks++;
        ts.passYds += out.yards;
      } else {
        const s = stat(g, cid);
        s.rAtt++; s.rYds += out.yards;
        ts.rushYds += out.yards;
      }
      ts.totalYds += out.yards;
      fullText = `${text}, FUMBLE${out.recoveredByDefense ? `, recovered by ${teamOf(g, d).abbr}` : ", recovered by the offense"}`;
      if (out.recoveredByDefense) {
        ts.turnovers++;
      }
      break;
    }
  }

  // Injuries.
  maybeInjure(g, [...offIds.slice(0, 7), out.targetIdx !== undefined ? offIds[out.targetIdx] : -1, out.tacklerIdx !== undefined ? defIds[out.tacklerIdx] : -1].filter((x) => x >= 0));

  const newSpot = snap.ballOn + out.yards;
  if (out.kind === "interception") {
    const spot = snap.ballOn + (out.airYards ?? 0);
    const defBall = 100 - spot + (out.returnYards ?? 0);
    const touchback = defBall < 1 && !out.defTouchdown;
    changePossession(g, touchback ? 20 : clamp(defBall, 1, 100));
    if (out.defTouchdown || defBall >= 100) {
      stat(g, defIds[out.defenderIdx!]).defTd++;
      fullText = `${text}`;
      touchdown(g);
      scored = true;
    } else if (touchback) {
      fullText = `${text}, touchback`;
    }
    return record(g, spec, fullText, snap, scored, true);
  }
  if (out.kind === "fumble" && out.recoveredByDefense) {
    changePossession(g, clamp(100 - newSpot, 1, 99));
    return record(g, spec, fullText, snap, false, true);
  }

  if (newSpot >= 100) {
    // Touchdown.
    g.ballOn = 100;
    const cid = out.kind === "complete" || (out.kind === "fumble" && out.targetIdx !== undefined) ? offIds[out.targetIdx!] : offIds[out.carrierIdx ?? 6];
    if (out.kind === "complete") { stat(g, qbId).pTd++; stat(g, cid).recTd++; }
    else stat(g, cid).rTd++;
    out.touchdown = true;
    spec.outcome = { ...out, touchdown: true };
    fullText = `${text}, TOUCHDOWN`;
    touchdown(g);
    return record(g, spec, fullText, snap, true);
  }
  if (newSpot <= 0) {
    // Safety.
    spec.outcome = { ...out, safety: true };
    fullText = `${text}, SAFETY`;
    closeDrive(g, "Safety");
    g.score[d] += 2;
    addQuarterScore(g, d, 2);
    g.safetyKick = true;
    g.phase = "kickoff";
    g.running = false;
    noteOtScore(g, d);
    return record(g, spec, fullText, snap, true);
  }

  g.ballOn = newSpot;
  if (out.kind === "incomplete" || out.kind === "spike") {
    clockStops = true;
  }
  if (out.yards >= g.dist && out.kind !== "incomplete" && out.kind !== "kneel" && out.kind !== "spike") {
    out.firstDown = true;
    g.down = 1;
    g.dist = Math.min(10, 100 - g.ballOn);
    ts.firstDowns++;
    if (snap.down === 3) ts.thirdConv++;
  } else {
    g.down++;
    g.dist = g.dist - (out.kind === "incomplete" ? 0 : out.yards);
    if (g.down > 4) {
      fullText = `${text}. Turnover on downs`;
      out.turnoverOnDowns = true;
      changePossession(g, 100 - g.ballOn);
      return record(g, spec, fullText, snap, false, true);
    }
  }
  // Clock between plays.
  const lateHalf = (g.quarter === 2 && g.clock <= 120) || (g.quarter >= 4 && g.clock <= 300);
  g.running = !(clockStops && (out.kind === "incomplete" || lateHalf));
  if (out.kind === "incomplete") g.running = false;
  g.runoff = tempoRunoff(g);
  if ((snap.quarter === 2 || snap.quarter === 4) && !g.warned && snap.clock > 120 && g.clock <= 120) {
    g.warned = true;
    g.running = false;
    g.log.push("Two-minute warning.");
  }
  return record(g, spec, fullText, snap, false);
}

const snapIsPass = (off: OffCall | null) => !!off && off.type !== "run";

function tempoRunoff(g: GameState): number {
  const t = teamOf(g, g.poss);
  const diff = g.score[g.poss] - g.score[other(g.poss)];
  const lateQ = g.quarter >= 4 || (g.quarter === 2 && g.clock < 120);
  if (lateQ && diff < 0) return 13;
  if (g.quarter === 2 && g.clock < 120) return 16;
  if (g.quarter >= 4 && diff > 0 && g.clock < 420) return 40;
  return Math.round(41 - (t.plan.tempo - 50) / 5);
}

function maybeInjure(g: GameState, ids: number[]) {
  for (const id of ids) {
    const p = g.players[id];
    if (!p || g.out.includes(id)) continue;
    const chance = 0.0014 * (0.5 + p.injProne / 60) * (1 + (g.fatigue[id] ?? 0) / 80);
    if (rand(g) < chance) {
      const roll = rand(g);
      const weeks = roll < 0.55 ? 1 : roll < 0.75 ? 2 : roll < 0.9 ? 2 + Math.floor(rand(g) * 5) : 6 + Math.floor(rand(g) * 12);
      const name = choose(g, weeks > 6 ? ["Torn ACL", "Broken leg", "Torn pectoral", "Lisfranc"] : weeks > 2 ? ["High ankle sprain", "Hamstring strain", "Broken hand", "MCL sprain"] : ["Ankle sprain", "Concussion", "Shoulder bruise", "Knee bruise", "Hip pointer"]);
      g.out.push(id);
      g.injuries.push({ playerId: id, name, weeks });
      g.log.push(`Injury: ${shortName(p)} (${name}) is out for the game.`);
    }
  }
}

function changePossession(g: GameState, newBallOn: number) {
  closeDrive(g, "Turnover");
  g.poss = other(g.poss);
  g.ballOn = clamp(newBallOn, 1, 99);
  g.down = 1;
  g.dist = Math.min(10, 100 - g.ballOn);
  g.running = false;
  startDrive(g);
  if (g.ot) {
    g.ot.possessions[g.poss]++;
    checkOtEnd(g);
  }
}

function startDrive(g: GameState) {
  g.drives.push({ team: g.poss, start: g.ballOn, plays: 0, yards: 0, result: "", quarter: g.quarter, startClock: g.clock });
}

function closeDrive(g: GameState, result: string) {
  const dr = g.drives[g.drives.length - 1];
  if (dr && !dr.result) {
    dr.result = result;
    dr.yards = g.ballOn - dr.start;
  }
}

function addQuarterScore(g: GameState, side: 0 | 1, pts: number) {
  const qi = Math.min(g.quarter, 5) - 1;
  while (g.qScores[side].length <= qi) g.qScores[side].push(0);
  g.qScores[side][qi] += pts;
}

function touchdown(g: GameState) {
  g.score[g.poss] += 6;
  addQuarterScore(g, g.poss, 6);
  closeDrive(g, "Touchdown");
  g.running = false;
  // In overtime a touchdown on the second possession or later ends it; an untimed PAT isn't needed if it's decisive.
  if (g.ot && otDecided(g) && g.score[g.poss] > g.score[other(g.poss)]) {
    g.phase = "final";
    return;
  }
  g.phase = "pat";
}

/** Overtime is over once both teams have had the ball and the score is not level. */
function otDecided(g: GameState): boolean {
  if (!g.ot) return false;
  const [a, b] = g.ot.possessions;
  return a >= 1 && b >= 1 && g.score[0] !== g.score[1];
}

function noteOtScore(g: GameState, _side: 0 | 1) {
  if (g.ot && otDecided(g)) g.phase = "final";
}

function checkOtEnd(g: GameState) {
  if (otDecided(g)) g.phase = "final";
}

function record(g: GameState, spec: PlaySpec, text: string, snap: { down: number; dist: number; ballOn: number; clock: number; quarter: number }, scoring: boolean, turnover = false): PlayRecord {
  spec.text = text;
  if ((g.quarter === 2 || g.quarter === 4) && g.quarter === snap.quarter && !g.warned && snap.clock > 120 && g.clock <= 120 && g.clock > 0) {
    g.warned = true;
    g.running = false;
    g.log.push("Two-minute warning.");
  }
  const dr = g.drives[g.drives.length - 1];
  if (dr && spec.special === null) dr.plays++;
  const secsLeft = g.quarter <= 4 ? (4 - g.quarter) * 900 + g.clock : g.clock;
  const wp = g.phase === "final" ? (g.score[0] > g.score[1] ? 1 : g.score[0] < g.score[1] ? 0 : 0.5) : winProb(g.score[0] - g.score[1], secsLeft, g.poss === 0, g.ballOn);
  const y = spec.outcome.yards;
  const big = scoring || turnover || spec.outcome.kind === "sack" || y >= 20 || spec.outcome.kind === "interception";
  const rec: PlayRecord = {
    n: g.plays.length,
    quarter: snap.quarter,
    clock: snap.clock,
    poss: spec.offTeam === g.home.id ? 0 : 1,
    down: snap.down,
    dist: snap.dist,
    ballOn: snap.ballOn,
    score: [g.score[0], g.score[1]],
    wp,
    text,
    spec,
    big: big && spec.special !== "pat" && (spec.special !== "kickoff" || scoring),
    scoring,
    drive: Math.max(0, g.drives.length - 1),
  };
  if (rec.big) spec.label = scoring ? "Score" : turnover ? "Turnover" : spec.outcome.kind === "sack" ? "Sack" : "Big play";
  g.plays.push(rec);
  if (g.clock <= 0 && g.phase === "play" && !g.review) endOfPeriod(g);
  rec.after = {
    down: g.down, dist: g.dist, ballOn: g.ballOn, poss: g.poss, phase: g.phase, quarter: g.quarter, clock: g.clock,
    score: [g.score[0], g.score[1]], firstDown: !!spec.outcome.firstDown, turnoverOnDowns: !!spec.outcome.turnoverOnDowns,
  };
  return rec;
}

// ---------------------------------------------------------------------------
// Special teams

function specialUnits(g: GameState, kicking: 0 | 1, kind: SpecialKind): Ctx {
  const recv = other(kicking);
  const kSlot: DepthSlot = kind === "punt" ? "P" : "K";
  const kicker = slotPlayers(g, kicking, kSlot, 1);
  const ls = kind === "punt" || kind === "fg" || kind === "pat" ? slotPlayers(g, kicking, "LS", 1, kicker.map((p) => p.id)) : [];
  const used = [...kicker, ...ls].map((p) => p.id);
  const cover = [...slotPlayers(g, kicking, "MLB", 2, used), ...slotPlayers(g, kicking, "LOLB", 2, used), ...slotPlayers(g, kicking, "SS", 2, used), ...slotPlayers(g, kicking, "TE", 2, used), ...slotPlayers(g, kicking, "CB", 3, used), ...slotPlayers(g, kicking, "LG", 2, used)];
  const offPlayers = [...kicker, ...ls];
  for (const p of cover) if (offPlayers.length < 11 && !offPlayers.includes(p)) offPlayers.push(p);
  const retSlot: DepthSlot = kind === "punt" ? "PR" : "KR";
  const ret = kind === "fg" || kind === "pat" ? slotPlayers(g, recv, "DT", 1) : slotPlayers(g, recv, retSlot, 1);
  const rused = ret.map((p) => p.id);
  const blockers = [...slotPlayers(g, recv, "MLB", 2, rused), ...slotPlayers(g, recv, "ROLB", 2, rused), ...slotPlayers(g, recv, "LE", 2, rused), ...slotPlayers(g, recv, "CB", 2, rused), ...slotPlayers(g, recv, "SS", 2, rused), ...slotPlayers(g, recv, "FS", 1, rused), ...slotPlayers(g, recv, "WR", 2, rused)];
  const defPlayers = [...ret];
  for (const p of blockers) if (defPlayers.length < 11 && !defPlayers.includes(p)) defPlayers.push(p);
  return { special: kind, off: null, def: null, offIds: offPlayers.map((p) => p.id), defIds: defPlayers.map((p) => p.id) };
}

function kickProb(g: GameState, dist: number, kicker: Player | undefined, side: 0 | 1): number {
  const kpw = rate(g, kicker, "kpw", side);
  const kac = rate(g, kicker, "kac", side);
  let mid = 56 + (kpw - 75) / 4 + (kac - 75) / 7;
  if (g.weather === "Wind") mid -= 4;
  if (g.weather === "Snow") mid -= 3;
  if (g.weather === "Rain") mid -= 1;
  return 1 / (1 + Math.exp((dist - mid) / 4.6));
}

function kickoff(g: GameState, onside: boolean): PlayRecord {
  // g.poss is the kicking team here.
  const k = g.poss;
  const r = other(k);
  const ctx = specialUnits(g, k, onside ? "onside" : "kickoff");
  const kicker = g.players[ctx.offIds[0]];
  const snap = { down: 0, dist: 0, ballOn: g.safetyKick ? 20 : 35, clock: g.clock, quarter: g.quarter };
  const from = snap.ballOn;
  let out: PlayOutcome;
  let text: string;
  let recvBall: number;
  let kickerKeeps = false;
  if (onside) {
    const success = rand(g) < 0.1;
    recvBall = 100 - (from + 11);
    out = { kind: "kickoff", yards: 11, kickDistance: 11, recoveredByDefense: !success, returnYards: 0 };
    text = `Onside kick by ${kicker ? shortName(kicker) : teamOf(g, k).abbr}${success ? ", RECOVERED by the kicking team!" : ", recovered by the receiving team"}`;
    kickerKeeps = success;
    g.clock = Math.max(0, g.clock - 3);
  } else {
    const kpw = rate(g, kicker, "kpw", k);
    const dist = Math.round(gauss(g, 63 + (kpw - 75) / 5 - (g.safetyKick ? 15 : 0), 4));
    const land = from + dist; // in kicking team's frame
    const tbChance = g.safetyKick ? 0 : land >= 100 ? 0.75 : 0.1;
    if (rand(g) < tbChance) {
      recvBall = 30;
      out = { kind: "kickoff", yards: dist, kickDistance: dist, touchback: true, returnYards: 0 };
      text = `${kicker ? shortName(kicker) : "Kickoff"} kicks ${dist} yards, touchback`;
    } else {
      const catchAt = Math.max(-8, 100 - land); // receiving team frame
      let ret = Math.round(gauss(g, 23, 6));
      const retP = g.players[ctx.defIds[0]];
      if (rand(g) < 0.004 + ((retP?.attrs.spd ?? 70) - 80) / 5000) ret = 100 - catchAt;
      recvBall = clamp(catchAt + ret, 1, 100);
      out = { kind: "kickoff", yards: dist, kickDistance: dist, returnYards: recvBall - catchAt, touchdown: recvBall >= 100 };
      text = `${kicker ? shortName(kicker) : "Kickoff"} kicks ${dist} yards, ${retP ? shortName(retP) : "returned"} returns ${recvBall - catchAt} yards${recvBall >= 100 ? " for a TOUCHDOWN" : ` to the ${yardLine(recvBall)}`}`;
      if (recvBall >= 100) stat(g, ctx.defIds[0]).defTd++;
      g.clock = Math.max(0, g.clock - 6);
    }
  }
  const spec = baseSpec(g, ctx, out, text, from);
  g.safetyKick = false;
  g.phase = "play";
  if (kickerKeeps) {
    g.ballOn = from + 11;
    g.down = 1;
    g.dist = 10;
    startDrive(g);
  } else {
    g.poss = r;
    g.ballOn = recvBall;
    g.down = 1;
    g.dist = 10;
    startDrive(g);
    if (g.ot) {
      g.ot.possessions[r]++;
      if (g.ot.first === null) g.ot.first = r;
    }
    if (recvBall >= 100) {
      g.ballOn = 100;
      touchdown(g);
      return record(g, spec, text, snap, true);
    }
  }
  g.running = false;
  return record(g, spec, text, snap, false);
}

function punt(g: GameState): PlayRecord {
  const k = g.poss;
  const ctx = specialUnits(g, k, "punt");
  const p = g.players[ctx.offIds[0]];
  const snap = { down: g.down, dist: g.dist, ballOn: g.ballOn, clock: g.clock, quarter: g.quarter };
  let dist = Math.round(gauss(g, 46 + (rate(g, p, "kpw", k) - 75) / 5 - (g.weather === "Wind" ? 4 : 0), 6));
  const land = g.ballOn + dist;
  let text: string;
  let out: PlayOutcome;
  let recvBall: number;
  if (land >= 100) {
    if (rand(g) < 0.25 && g.ballOn > 50) {
      // Downed inside the 10.
      dist = Math.max(1, 100 - g.ballOn - 1 - Math.floor(rand(g) * 8));
      recvBall = Math.max(1, 100 - (g.ballOn + dist));
      out = { kind: "punt", yards: dist, kickDistance: dist, returnYards: 0 };
      text = `${p ? shortName(p) : "Punt"} punts ${dist} yards, downed at the ${yardLine(recvBall)}`;
    } else {
      recvBall = 20;
      out = { kind: "punt", yards: dist, kickDistance: dist, touchback: true, returnYards: 0 };
      text = `${p ? shortName(p) : "Punt"} punts ${dist} yards, touchback`;
    }
  } else {
    const fair = rand(g) < 0.45;
    let ret = fair ? 0 : Math.max(0, Math.round(gauss(g, 9, 6)));
    const catchAt = 100 - land;
    const pr = g.players[ctx.defIds[0]];
    if (!fair && rand(g) < 0.006) ret = 100 - catchAt;
    recvBall = clamp(catchAt + ret, 1, 100);
    out = { kind: "punt", yards: dist, kickDistance: dist, returnYards: recvBall - catchAt, touchdown: recvBall >= 100 };
    text = `${p ? shortName(p) : "Punt"} punts ${dist} yards${fair ? `, fair catch by ${pr ? shortName(pr) : "the returner"}` : `, ${pr ? shortName(pr) : "returned"} returns ${recvBall - catchAt} yards${recvBall >= 100 ? " for a TOUCHDOWN" : ""}`}`;
    if (recvBall >= 100) stat(g, ctx.defIds[0]).defTd++;
  }
  if (p) {
    const s = stat(g, p.id);
    s.punts++;
    s.puntYds += dist;
  }
  const spec = baseSpec(g, ctx, out, text);
  g.clock = Math.max(0, g.clock - 8);
  closeDrive(g, "Punt");
  g.poss = other(k);
  g.ballOn = recvBall;
  g.down = 1;
  g.dist = Math.min(10, 100 - g.ballOn);
  g.running = false;
  startDrive(g);
  if (g.ot) {
    g.ot.possessions[g.poss]++;
    checkOtEnd(g);
  }
  if (recvBall >= 100) {
    g.ballOn = 100;
    touchdown(g);
    return record(g, spec, text, snap, true);
  }
  return record(g, spec, text, snap, false);
}

function fieldGoal(g: GameState): PlayRecord {
  const k = g.poss;
  const ctx = specialUnits(g, k, "fg");
  const kicker = g.players[ctx.offIds[0]];
  const dist = fgDistance(g.ballOn);
  const snap = { down: g.down, dist: g.dist, ballOn: g.ballOn, clock: g.clock, quarter: g.quarter };
  let prob = kickProb(g, dist, kicker, k);
  if (g.quarter >= 4 && Math.abs(g.score[0] - g.score[1]) <= 3 && kicker) prob += (kicker.clutch - 50) / 1000;
  const good = rand(g) < prob;
  const out: PlayOutcome = { kind: "fg", yards: 0, kickDistance: dist, good };
  const text = `${kicker ? shortName(kicker) : "The kicker"} ${dist}-yard field goal is ${good ? "GOOD" : rand(g) < 0.5 ? "no good, wide left" : "no good, wide right"}`;
  if (kicker) {
    const s = stat(g, kicker.id);
    s.fga++;
    if (good) { s.fgm++; s.longFg = Math.max(s.longFg, dist); }
  }
  const spec = baseSpec(g, ctx, out, text);
  g.clock = Math.max(0, g.clock - 5);
  if (good) {
    g.score[k] += 3;
    addQuarterScore(g, k, 3);
    closeDrive(g, "Field goal");
    g.phase = "kickoff";
    g.running = false;
    if (g.ot && otDecided(g)) g.phase = "final";
    return record(g, spec, text, snap, true);
  }
  closeDrive(g, "Missed FG");
  const spot = Math.max(20, 100 - (g.ballOn - 7));
  g.poss = other(k);
  g.ballOn = spot;
  g.down = 1;
  g.dist = 10;
  g.running = false;
  startDrive(g);
  if (g.ot) {
    g.ot.possessions[g.poss]++;
    checkOtEnd(g);
  }
  return record(g, spec, text, snap, false);
}

function pat(g: GameState, choice: "kick" | "two"): PlayRecord {
  const k = g.poss;
  const snap = { down: 0, dist: 0, ballOn: choice === "kick" ? 85 : 98, clock: g.clock, quarter: g.quarter };
  let out: PlayOutcome;
  let text: string;
  let ctx: Ctx;
  if (choice === "kick") {
    ctx = specialUnits(g, k, "pat");
    const kicker = g.players[ctx.offIds[0]];
    const good = rand(g) < Math.min(0.985, kickProb(g, 33, kicker, k) + 0.01);
    out = { kind: "pat", yards: 0, kickDistance: 33, good };
    text = `${kicker ? shortName(kicker) : "Extra point"} extra point is ${good ? "good" : "NO GOOD"}`;
    if (kicker) {
      const s = stat(g, kicker.id);
      s.xpa++;
      if (good) s.xpm++;
    }
    if (good) {
      g.score[k] += 1;
      addQuarterScore(g, k, 1);
    }
  } else {
    const isRun = rand(g) < 0.4;
    const call: OffCall = isRun ? { formation: "Goal Line", personnel: "22", type: "run", concept: "Power", gap: "B", side: 1 } : { formation: "Shotgun", personnel: "11", type: "short", concept: "Slant-Flat", side: 1 };
    const offU = offenseUnit(g, k, call);
    const defU = defenseUnit(g, other(k), { pkg: "Goal Line", call: "Run D", shell: "Cover 1" });
    ctx = { special: "twopoint", off: call, def: { pkg: "Goal Line", call: "Run D", shell: "Cover 1" }, offIds: offU.players.map((p) => p.id), defIds: defU.players.map((p) => p.id) };
    const offR = avg(offU.players.map((p) => ovr(p)));
    const defR = avg(defU.players.map((p) => ovr(p)));
    const good = rand(g) < 0.47 + (offR - defR) / 120;
    const tIdx = isRun ? 6 : 7;
    out = { kind: "twopoint", yards: good ? 2 : 0, good, carrierIdx: isRun ? 6 : undefined, targetIdx: isRun ? undefined : tIdx, tacklerIdx: 4 };
    text = `Two-point try: ${isRun ? `${shortName(offU.players[6])} runs` : `pass to ${shortName(offU.players[tIdx])}`}, ${good ? "GOOD" : "no good"}`;
    if (good) {
      g.score[k] += 2;
      addQuarterScore(g, k, 2);
    }
  }
  const spec = baseSpec(g, ctx, out, text, snap.ballOn);
  g.phase = "kickoff";
  g.running = false;
  if (g.ot && otDecided(g)) g.phase = "final";
  return record(g, spec, text, snap, !!out.good);
}

function kneel(g: GameState): PlayRecord {
  const off: OffCall = { formation: "Shotgun", personnel: "11", type: "kneel", concept: "Kneel" };
  const offU = offenseUnit(g, g.poss, off);
  const defU = defenseUnit(g, other(g.poss), { pkg: "Base", call: "Run D", shell: "Cover 3" });
  const ctx: Ctx = { special: null, off, def: { pkg: "Base", call: "Run D", shell: "Cover 3" }, offIds: offU.players.map((p) => p.id), defIds: defU.players.map((p) => p.id) };
  const out: PlayOutcome = { kind: "kneel", yards: -Math.min(1, Math.max(0, g.ballOn - 1)), carrierIdx: 0 };
  return applyScrimmage(g, ctx, out, `${shortName(offU.players[0])} kneels`, false, 2, { down: g.down, dist: g.dist, ballOn: g.ballOn, clock: g.clock, quarter: g.quarter }, "", ctx.def!, off);
}

function spike(g: GameState): PlayRecord {
  const off: OffCall = { formation: "Shotgun", personnel: "11", type: "spike", concept: "Spike" };
  const offU = offenseUnit(g, g.poss, off);
  const defU = defenseUnit(g, other(g.poss), { pkg: "Dime", call: "Zone", shell: "Cover 2" });
  const ctx: Ctx = { special: null, off, def: { pkg: "Dime", call: "Zone", shell: "Cover 2" }, offIds: offU.players.map((p) => p.id), defIds: defU.players.map((p) => p.id) };
  const out: PlayOutcome = { kind: "spike", yards: 0 };
  const snap = { down: g.down, dist: g.dist, ballOn: g.ballOn, clock: g.clock, quarter: g.quarter };
  const spec = baseSpec(g, ctx, out, `${shortName(offU.players[0])} spikes the ball`);
  stat(g, offU.players[0].id).pAtt++;
  g.clock = Math.max(0, g.clock - 2);
  g.down++;
  g.running = false;
  if (g.down > 4) {
    // Spiking away the final down is a turnover on downs.
    out.turnoverOnDowns = true;
    spec.text += ". Turnover on downs";
    changePossession(g, 100 - g.ballOn);
    return record(g, spec, spec.text, snap, false, true);
  }
  return record(g, spec, spec.text, snap, false);
}

// ---------------------------------------------------------------------------
// Periods

function endOfPeriod(g: GameState) {
  if (g.phase === "final") return;
  g.running = false;
  const q = g.quarter;
  if (q === 1 || q === 3) {
    g.quarter++;
    g.clock = 900;
    g.log.push(`End of quarter ${q}.`);
    return;
  }
  if (q === 2) {
    closeDrive(g, "End of half");
    g.quarter = 3;
    g.clock = 900;
    g.timeouts = [3, 3];
    g.warned = false;
    g.poss = other(g.openingKick);
    g.phase = "kickoff";
    g.log.push("Halftime.");
    return;
  }
  // End of regulation or an overtime period.
  closeDrive(g, q >= 4 ? "End of game" : "End of period");
  if (g.score[0] !== g.score[1]) {
    g.phase = "final";
    return;
  }
  if (q >= 5 && !g.playoff) {
    g.phase = "final"; // a tie
    return;
  }
  // Overtime.
  g.quarter = q + 1;
  g.clock = g.playoff ? 900 : 600;
  g.timeouts = [2, 2];
  g.warned = false;
  if (!g.ot) {
    const kicker = rand(g) < 0.5 ? 0 : 1;
    g.ot = { possessions: [0, 0], first: null };
    g.poss = kicker;
  } else {
    // Playoff: keep the same possession going into the next period.
    return;
  }
  g.phase = "kickoff";
  g.log.push(q === 4 ? "Overtime." : "Another overtime period.");
}

export function yardLine(ballOn: number): string {
  if (ballOn === 50) return "50";
  return ballOn < 50 ? `own ${ballOn}` : `opp ${100 - ballOn}`;
}

export function clockText(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const quarterText = (q: number) => (q <= 4 ? `Q${q}` : q === 5 ? "OT" : `${q - 4}OT`);

// ---------------------------------------------------------------------------
// Whole games

export function simulateGame(input: GameInput): { result: GameResult; state: GameState } {
  const g = createGame({ ...input, userTeam: null });
  let guard = 0;
  while (g.phase !== "final" && guard++ < 1200) step(g);
  return { result: finishGame(g), state: g };
}

export function finishGame(g: GameState): GameResult {
  for (const side of [0, 1] as const) {
    const t = teamOf(g, side);
    for (const id of new Set([...Object.keys(g.stats).map(Number)])) {
      const p = g.players[id];
      if (p && p.teamId === t.id) g.stats[id].gp = 1;
    }
  }
  // Player of the game.
  let mvp: number | null = null;
  let best = -1;
  const winSide = g.score[0] >= g.score[1] ? 0 : 1;
  for (const k in g.stats) {
    const s = g.stats[k];
    const p = g.players[Number(k)];
    if (!p || p.teamId !== teamOf(g, winSide).id) continue;
    const v = s.pYds / 25 + s.pTd * 4 - s.pInt * 3 + s.rYds / 10 + s.rTd * 6 + s.recYds / 10 + s.recTd * 6 + s.sck * 4 + s.dInt * 5 + s.tkl * 0.6 + s.ff * 3 + s.fgm * 2 + s.defTd * 6;
    if (v > best) {
      best = v;
      mvp = p.id;
    }
  }
  return {
    score: [g.score[0], g.score[1]],
    quarters: g.qScores,
    ot: g.quarter > 4,
    team: g.team,
    players: g.stats,
    highlights: g.plays.filter((p) => p.big).slice(-14).map((p) => p.spec),
    injuries: g.injuries,
    weather: g.weather,
    mvp,
    log: g.plays.filter((p) => p.scoring).map((p) => `${quarterText(p.quarter)} ${clockText(p.clock)} — ${p.text}`),
  };
}

export const playLabel = (spec: PlaySpec): string => (spec.off ? playName(spec.off) : spec.special ?? "") + (spec.def ? ` vs ${defName(spec.def)}` : "");
