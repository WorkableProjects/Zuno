/** Shared data shapes for Gridiron GM: players, teams, schedule, games and the career save. */
import type { CustomPlay } from "./gmCustomPlays";
import type { CustomPlayRecord } from "../../game-files/schema/gridiron";

export const POSITIONS = ["QB", "RB", "FB", "WR", "TE", "OT", "OG", "C", "DE", "DT", "OLB", "MLB", "CB", "FS", "SS", "K", "P", "LS"] as const;
export type Pos = (typeof POSITIONS)[number];

export interface Attrs {
  spd: number; // Speed
  str: number; // Strength
  agi: number; // Agility
  awr: number; // Awareness
  cat: number; // Catching
  rte: number; // Route running
  thp: number; // Throw power
  tas: number; // Throw accuracy short
  tam: number; // medium
  tad: number; // deep
  rbk: number; // Run block
  pbk: number; // Pass block
  prs: number; // Pass rush
  tak: number; // Tackle
  mcv: number; // Man coverage
  zcv: number; // Zone coverage
  bcv: number; // Ball carrier vision
  kpw: number; // Kick power
  kac: number; // Kick accuracy
}
export type AttrKey = keyof Attrs;

export const ATTR_LABELS: Record<AttrKey, string> = {
  spd: "Speed", str: "Strength", agi: "Agility", awr: "Awareness", cat: "Catching", rte: "Route Running",
  thp: "Throw Power", tas: "Short Acc", tam: "Medium Acc", tad: "Deep Acc", rbk: "Run Block", pbk: "Pass Block",
  prs: "Pass Rush", tak: "Tackle", mcv: "Man Cover", zcv: "Zone Cover", bcv: "BC Vision", kpw: "Kick Power", kac: "Kick Acc",
};

export type DevTrait = "Normal" | "Star" | "Superstar";

/** One season of a contract. Index 0 of Contract.years is the current league year. */
export interface ContractYear {
  cap: number; // cap hit, $M
  guar: number; // guaranteed money still owed for this year, $M
}
export interface Contract {
  years: ContractYear[];
  tagged?: boolean;
  rookie?: boolean;
}

export interface Injury {
  name: string;
  weeks: number;
  ir: boolean;
}

export interface StatLine {
  gp: number;
  pAtt: number; pCmp: number; pYds: number; pTd: number; pInt: number; sacked: number;
  rAtt: number; rYds: number; rTd: number; fum: number;
  tgt: number; rec: number; recYds: number; recTd: number;
  tkl: number; sck: number; dInt: number; pd: number; ff: number; defTd: number;
  fgm: number; fga: number; xpm: number; xpa: number; punts: number; puntYds: number; longFg: number;
}

export interface Player {
  id: number;
  first: string;
  last: string;
  pos: Pos;
  archetype: string;
  age: number;
  yrs: number;
  num: number;
  college: string;
  attrs: Attrs;
  // Hidden
  pot: number;
  injProne: number;
  clutch: number;
  work: number;
  dev: DevTrait;
  contract: Contract;
  morale: number; // 0-100
  fatigue: number; // 0-100, 0 = fresh
  injury: Injury | null;
  teamId: number | null; // null = free agent / prospect
  ps: boolean; // practice squad
  draft: { year: number; round: number; pick: number; teamId: number } | null;
  career: Array<{ year: number; teamId: number; stats: StatLine }>;
  awards: string[];
  retired?: boolean;
}

export type OffScheme = "West Coast" | "Air Raid" | "Power Run" | "Spread" | "Pro-Style";
export type DefBase = "4-3" | "3-4";
export type Coverage = "Cover 1" | "Cover 2" | "Cover 3" | "Man Blitz";
export const OFF_SCHEMES: OffScheme[] = ["West Coast", "Air Raid", "Power Run", "Spread", "Pro-Style"];
export const DEF_BASES: DefBase[] = ["4-3", "3-4"];
export const COVERAGES: Coverage[] = ["Cover 1", "Cover 2", "Cover 3", "Man Blitz"];

export interface GamePlan {
  passRatio: number; // 0-100, % of plays called as passes on neutral downs
  aggression: number; // 0-100, 4th-down aggression
  blitz: number; // 0-100
  tempo: number; // 0-100, higher = faster pace
  twoPoint: "Never" | "Situational" | "Always";
}

/** Depth chart slots. Positions plus returners and snappers. */
export const DEPTH_SLOTS = ["QB", "RB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT", "LE", "DT", "RE", "LOLB", "MLB", "ROLB", "CB", "FS", "SS", "K", "P", "LS", "KR", "PR"] as const;
export type DepthSlot = (typeof DEPTH_SLOTS)[number];

export interface LogoSpec {
  shape: "shield" | "circle" | "diamond" | "hex" | "star" | "bolt";
  glyph: string; // 1-2 letters
}

export interface Team {
  id: number;
  city: string;
  name: string;
  abbr: string;
  colors: [string, string];
  logo: LogoSpec;
  conf: 0 | 1;
  div: 0 | 1 | 2 | 3;
  stadium: string;
  dome: boolean;
  ownerPatience: number; // 0-100
  market: "Small" | "Medium" | "Large";
  offScheme: OffScheme;
  defBase: DefBase;
  coverage: Coverage;
  plan: GamePlan;
  depth: Partial<Record<DepthSlot, number[]>>;
  staff: Staff;
}

export type StaffRole = "OC" | "DC" | "ST" | "QB" | "RB" | "WR" | "OL" | "DL" | "LB" | "DB";
export const STAFF_ROLES: StaffRole[] = ["OC", "DC", "ST", "QB", "RB", "WR", "OL", "DL", "LB", "DB"];
export interface Coach {
  id: number;
  name: string;
  role: StaffRole;
  rating: number; // 40-99
  dev: number; // development bonus 0-5
  scheme?: OffScheme | DefBase;
  salary: number;
  age: number;
}
export type Staff = Partial<Record<StaffRole, Coach>>;

export interface TeamGameStats {
  firstDowns: number;
  totalYds: number;
  passYds: number;
  rushYds: number;
  turnovers: number;
  penalties: number;
  penYds: number;
  top: number; // seconds
  sacks: number;
  thirdAtt: number;
  thirdConv: number;
}

export interface GameResult {
  score: [number, number]; // [home, away]
  quarters: [number[], number[]];
  ot: boolean;
  team: [TeamGameStats, TeamGameStats];
  players: Record<number, StatLine>;
  highlights: PlaySpec[];
  injuries: Array<{ playerId: number; name: string; weeks: number }>;
  weather: Weather;
  mvp: number | null;
  log: string[];
}

export interface ScheduledGame {
  id: number;
  week: number; // 1-18 regular season, 19+ playoffs
  home: number;
  away: number;
  round?: "WC" | "DIV" | "CONF" | "BOWL";
  neutral?: boolean;
  result?: GameResult;
}

export type Weather = "Clear" | "Rain" | "Snow" | "Wind" | "Dome";

// ---------------------------------------------------------------------------
// Plays

export type PlayType = "run" | "short" | "medium" | "deep" | "screen" | "playaction" | "kneel" | "spike";
export type DefCall = "Run D" | "Blitz" | "Man" | "Zone";
export type Formation = "Shotgun" | "Singleback" | "I-Form" | "Pistol" | "Empty" | "Goal Line";
export type Personnel = "11" | "12" | "21" | "10" | "22";
export type DefPackage = "Base" | "Nickel" | "Dime" | "Goal Line";

export interface OffCall {
  formation: Formation;
  personnel: Personnel;
  type: PlayType;
  concept: string;
  gap?: "A" | "B" | "C" | "D";
  side?: -1 | 1;
}

export interface DefCallFull {
  pkg: DefPackage;
  call: DefCall;
  shell: Coverage;
}

export type SpecialKind = "kickoff" | "onside" | "punt" | "fg" | "pat" | "twopoint";

/** Everything needed to regenerate a play's animation. Stored for highlights. */
export interface PlaySpec {
  id: string;
  seed: number;
  dir: 1 | -1; // offense drives toward +x (1) or -x (-1) in field coordinates
  los: number; // line of scrimmage, yards from offense's goal line (0-100)
  firstDownAt: number; // yards from offense goal line
  off: OffCall | null;
  def: DefCallFull | null;
  special: SpecialKind | null;
  outcome: PlayOutcome;
  offTeam: number;
  defTeam: number;
  offPlayers: Array<{ id: number; num: number; pos: string; name: string; spd: number }>;
  defPlayers: Array<{ id: number; num: number; pos: string; name: string; spd: number }>;
  text: string;
  label?: string;
  /** Set when the snap was run through a play definition (built-in or custom) via runPlay(). */
  playId?: string;
  playName?: string;
}

export interface PlayOutcome {
  kind:
    | "run" | "complete" | "incomplete" | "interception" | "sack" | "scramble" | "fumble"
    | "kneel" | "spike" | "punt" | "fg" | "kickoff" | "pat" | "twopoint" | "penalty" | "safety";
  yards: number; // net yards gained by the offense (from LOS)
  airYards?: number;
  targetIdx?: number; // index into offPlayers of the target / ball carrier
  carrierIdx?: number;
  tacklerIdx?: number; // index into defPlayers
  defenderIdx?: number; // interceptor / sacker / recoverer
  returnYards?: number; // for INT, punt and kick returns, measured toward the defense's goal
  touchdown?: boolean;
  defTouchdown?: boolean;
  good?: boolean; // FG/PAT/2pt success
  touchback?: boolean;
  recoveredByDefense?: boolean;
  penalty?: { name: string; on: "off" | "def"; yards: number; autoFirst?: boolean };
  kickDistance?: number;
  /** Additive v3 flags, set by the engine so replays and the UI never have to infer them. */
  firstDown?: boolean; // the play earned a new set of downs
  turnoverOnDowns?: boolean; // failed on 4th down, possession changed
  safety?: boolean; // the offense was tackled (or fumbled) into its own end zone
  deflected?: boolean; // incomplete: broken up by a defender
  dropped?: boolean; // incomplete: the target dropped it
}

/** One frame per 0.1 s: [x, y] for 22 players (0-10 offense, 11-21 defense), then the ball. Field coords in yards: x 0..120 (end zones 0-10, 110-120), y 0..53.3. */
export interface PlayScript {
  dt: number;
  frames: Float32Array[];
  ballHeight: number[]; // 0 = carried, >0 in air
  carrier: number[]; // index of the ball carrier per frame, -1 = in air / loose
  events: Array<{ t: number; kind: "snap" | "handoff" | "throw" | "catch" | "tackle" | "whistle" | "sack" | "kick" | "interception" | "touchdown" | "pancake" | "incomplete"; text: string; at?: [number, number] }>;
  reads: number[]; // offense indexes the QB looks at
  routes: Array<{ idx: number; points: Array<[number, number]> }>;
  blocks: Array<[number, number]>; // [offIdx, defIdx]
  zones: Array<{ idx: number; at: [number, number] }>;
  labels: string[]; // 22 jersey labels
  names: string[];
  positions: string[];
  finalX: number; // ball spot at whistle, field coords
}

// ---------------------------------------------------------------------------
// Career

export type Phase = "preseason" | "regular" | "playoffs" | "resign" | "combine" | "fa" | "draft" | "camp" | "cutdown";

export interface DraftPick {
  year: number;
  round: number;
  orig: number; // original team
  owner: number;
  overall?: number;
  playerId?: number;
}

export interface Prospect {
  playerId: number;
  rank: number; // consensus rank
  scouted: number; // 0-3 scouting levels
  combine: { forty: number; bench: number; vertical: number; cone: number };
  proDay: boolean;
  starred?: boolean;
}

export interface InboxItem {
  id: number;
  week: string;
  from: string;
  subject: string;
  body: string;
  read: boolean;
  kind: "news" | "agent" | "trade" | "owner" | "media" | "injury";
  tradeId?: number;
}

export interface TradeOffer {
  id: number;
  fromTeam: number;
  give: { players: number[]; picks: string[] }; // what the user gives
  get: { players: number[]; picks: string[] }; // what the user gets
}

export interface SeasonRecord {
  year: number;
  champion: number | null;
  runnerUp: number | null;
  awards: Record<string, { playerId: number | null; teamId: number | null; name: string }>;
  allPro: number[];
  userRecord: [number, number, number];
  userFinish: string;
  standings: Array<{ teamId: number; w: number; l: number; t: number }>;
}

export interface Standing {
  teamId: number;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
  divW: number; divL: number; divT: number;
  confW: number; confL: number; confT: number;
  streak: number;
}

export interface Career {
  version: 1;
  seed: number;
  slot: number;
  coachName: string;
  userTeam: number;
  year: number;
  phase: Phase;
  week: number; // current regular-season week (1-18) or playoff week (19-22)
  cap: number; // current cap, $M
  teams: Team[];
  players: Record<number, Player>;
  nextId: number;
  schedule: ScheduledGame[];
  seasonStats: Record<number, StatLine>;
  picks: DraftPick[];
  prospects: Prospect[];
  scoutPoints: number;
  inbox: InboxItem[];
  offers: TradeOffer[];
  coachPool: Coach[];
  history: SeasonRecord[];
  hallOfFame: Array<{ playerId: number; year: number; name: string; pos: Pos }>;
  records: Record<string, { value: number; playerId: number; year: number; name: string }>;
  trophies: Array<{ year: number; title: string }>;
  jobSecurity: number;
  goal: string;
  training: { focus: "Balanced" | "Offense" | "Defense" | "Rookies" | "Conditioning"; intensity: "Light" | "Normal" | "Hard" };
  deadCap: Record<number, number[]>; // teamId -> dead money by league year offset
  pressPending: boolean;
  log: string[];
  coachMode: boolean;
  /** The user's own play designs (see gmCustomPlays). Absent on older saves. */
  customPlays?: CustomPlay[] | CustomPlayRecord[];
  updatedAt: number;
}
