import { clamp, gauss, pick, randInt, type Rng } from "./gmRandom";
import type { AttrKey, Attrs, Contract, DevTrait, Player, Pos, StatLine } from "./gmTypes";

const FIRST = [
  "Aaron", "Andre", "Austin", "Bennett", "Blake", "Brandon", "Brock", "Caleb", "Cam", "Carter", "Chase", "Cole", "Colin", "Cooper", "Dante", "Darius",
  "Davis", "Deacon", "Derek", "Devin", "Dillon", "Dominic", "Drew", "Eli", "Elijah", "Emmett", "Ethan", "Evan", "Felix", "Gabe", "Garrett", "Grant",
  "Hayden", "Hunter", "Isaiah", "Jace", "Jalen", "Jamal", "Jarrett", "Javon", "Jaylen", "Jordan", "Josiah", "Julian", "Kade", "Kai", "Keenan", "Kendall",
  "Keon", "Kobe", "Lamar", "Landon", "Levi", "Logan", "Lucas", "Malik", "Marcus", "Mason", "Micah", "Miles", "Nate", "Nico", "Noah", "Omar",
  "Owen", "Parker", "Quentin", "Reggie", "Rhett", "Rico", "Roman", "Ryder", "Sam", "Santiago", "Shane", "Silas", "Terrell", "Theo", "Trey", "Tristan",
  "Ty", "Tyrese", "Victor", "Wade", "Wes", "Xavier", "Zach", "Zion", "Amari", "Bryce", "Corey", "Darnell", "Emeka", "Jabari", "Kwame", "Luka", "Mateo", "Rashad", "Tavon", "Yusuf",
];
const LAST = [
  "Abbott", "Adeyemi", "Alvarez", "Banks", "Barrett", "Beckett", "Bishop", "Boone", "Bradshaw", "Brooks", "Calloway", "Carver", "Castillo", "Chambers", "Coleman", "Crane",
  "Dalton", "Delgado", "Dixon", "Donovan", "Drummond", "Ellis", "Everett", "Faulkner", "Fletcher", "Ford", "Fowler", "Gaines", "Garrison", "Gentry", "Graves", "Greer",
  "Hale", "Hargrove", "Hayes", "Holloway", "Hudson", "Ingram", "Jefferson", "Kendrick", "Kingsley", "Lambert", "Lawson", "Lockhart", "Maddox", "Malone", "Mercer", "Monroe",
  "Nash", "Nwosu", "Okafor", "Oliver", "Osei", "Pace", "Palmer", "Pruitt", "Quarles", "Ramsey", "Reyes", "Rhodes", "Rivers", "Rollins", "Sampson", "Sawyer",
  "Shepherd", "Simmons", "Slater", "Sterling", "Stone", "Sutton", "Tate", "Thornton", "Tillman", "Upshaw", "Vance", "Vaughn", "Wallace", "Ward", "Whitfield", "Wilder",
  "Winslow", "Woodson", "Yates", "Young", "Zeller", "Archer", "Benton", "Cortez", "Duvall", "Fontenot", "Hollins", "Kearse", "Mbeki", "Prescott", "Sanford", "Tolliver",
];
const COLLEGES = [
  "Riverside State", "Northern Plains", "Coastal Tech", "Mesa A&M", "Lakeshore", "Grand Valley", "Pinecrest", "Southern Union", "Iron Range", "Bayou State",
  "High Desert", "Cascade", "Prairie View Tech", "Atlantic", "Redwood", "Summit", "Delta State", "Bluegrass", "Gulf Coast", "Capital City",
];

/** Overall-rating weights per position. */
export const OVR_WEIGHTS: Record<Pos, Partial<Record<AttrKey, number>>> = {
  QB: { thp: 2, tas: 2.5, tam: 2.5, tad: 1.8, awr: 2.5, spd: 0.5, agi: 0.4 },
  RB: { spd: 2.2, agi: 2, bcv: 2.2, str: 1, cat: 0.8, awr: 0.8 },
  FB: { rbk: 2, str: 2, cat: 0.8, bcv: 0.8, awr: 1, spd: 0.6 },
  WR: { spd: 2.2, rte: 2.4, cat: 2.4, agi: 1.2, awr: 1 },
  TE: { cat: 2, rte: 1.4, rbk: 1.4, str: 1.2, spd: 1, pbk: 0.6, awr: 0.8 },
  OT: { pbk: 2.6, rbk: 2, str: 1.8, awr: 1.2, agi: 0.6 },
  OG: { rbk: 2.6, pbk: 2, str: 2, awr: 1.2 },
  C: { rbk: 2.3, pbk: 2.3, str: 1.6, awr: 1.8 },
  DE: { prs: 2.8, str: 1.4, spd: 1.4, tak: 1.4, awr: 0.8 },
  DT: { prs: 2, str: 2.4, tak: 1.8, awr: 1 },
  OLB: { prs: 1.6, tak: 2, spd: 1.4, zcv: 1, mcv: 0.6, awr: 1.2 },
  MLB: { tak: 2.6, awr: 2.2, zcv: 1.4, spd: 1, str: 1 },
  CB: { mcv: 2.6, zcv: 2, spd: 2.2, agi: 1.2, awr: 1, cat: 0.5 },
  FS: { zcv: 2.4, mcv: 1.2, spd: 1.8, awr: 1.8, tak: 1 },
  SS: { tak: 2, zcv: 2, mcv: 1, spd: 1.4, awr: 1.6, str: 0.8 },
  K: { kpw: 2.4, kac: 2.8 },
  P: { kpw: 2.8, kac: 2 },
  LS: { awr: 2, str: 1, kac: 1 },
};

/** Attributes each position is good at: mean offsets on top of a 40 baseline. */
const POS_PROFILE: Record<Pos, Partial<Record<AttrKey, number>>> = {
  QB: { thp: 38, tas: 38, tam: 34, tad: 30, awr: 30, spd: 12, agi: 15, str: 10 },
  RB: { spd: 40, agi: 38, bcv: 35, str: 22, cat: 18, awr: 18, tak: 0, pbk: 8 },
  FB: { rbk: 30, str: 34, cat: 18, bcv: 18, awr: 20, spd: 16 },
  WR: { spd: 44, rte: 38, cat: 38, agi: 34, awr: 20 },
  TE: { cat: 30, rte: 22, rbk: 26, str: 26, spd: 22, pbk: 18, awr: 18 },
  OT: { pbk: 38, rbk: 34, str: 38, awr: 22, agi: 10 },
  OG: { rbk: 38, pbk: 34, str: 40, awr: 20 },
  C: { rbk: 34, pbk: 34, str: 34, awr: 28 },
  DE: { prs: 38, str: 32, spd: 28, tak: 28, awr: 18, agi: 20 },
  DT: { prs: 28, str: 44, tak: 30, awr: 18 },
  OLB: { prs: 26, tak: 32, spd: 30, zcv: 20, mcv: 14, awr: 22, str: 22 },
  MLB: { tak: 38, awr: 32, zcv: 24, spd: 24, str: 26 },
  CB: { mcv: 38, zcv: 34, spd: 46, agi: 38, awr: 18, cat: 16, tak: 10 },
  FS: { zcv: 36, mcv: 22, spd: 38, awr: 28, tak: 22, cat: 12, agi: 26 },
  SS: { tak: 32, zcv: 32, mcv: 18, spd: 32, awr: 26, str: 18, agi: 20 },
  K: { kpw: 44, kac: 44 },
  P: { kpw: 44, kac: 38 },
  LS: { awr: 30, str: 20, kac: 20 },
};

const ARCHETYPES: Record<Pos, Array<[string, Partial<Record<AttrKey, number>>]>> = {
  QB: [["Pocket Passer", { tam: 6, tad: 4, spd: -6 }], ["Scrambler", { spd: 14, agi: 10, tad: -4 }], ["Field General", { awr: 8, tas: 4 }], ["Gunslinger", { thp: 8, tad: 6, tas: -4 }]],
  RB: [["Power Back", { str: 12, bcv: 4, spd: -4 }], ["Elusive Back", { agi: 8, spd: 4, str: -6 }], ["Receiving Back", { cat: 14, rte: 10 }]],
  FB: [["Blocking FB", { rbk: 8 }], ["Utility FB", { cat: 8 }]],
  WR: [["Deep Threat", { spd: 8, rte: -4 }], ["Possession WR", { cat: 8, rte: 6, spd: -6 }], ["Slot", { agi: 8, rte: 4 }]],
  TE: [["Vertical TE", { spd: 8, cat: 6, rbk: -8 }], ["Blocking TE", { rbk: 10, pbk: 6, cat: -8 }], ["Possession TE", { cat: 6, rte: 4 }]],
  OT: [["Pass Protector", { pbk: 6, rbk: -4 }], ["Road Grader", { rbk: 6, str: 4, pbk: -4 }]],
  OG: [["Road Grader", { rbk: 6, str: 4 }], ["Pass Protector", { pbk: 6 }]],
  C: [["Anchor", { str: 6 }], ["Technician", { awr: 6, agi: 4 }]],
  DE: [["Edge Rusher", { prs: 8, spd: 6, str: -4 }], ["Run Stopper", { str: 8, tak: 6, prs: -6 }]],
  DT: [["Nose Tackle", { str: 8, prs: -6 }], ["Interior Rusher", { prs: 8, spd: 4 }]],
  OLB: [["Edge Rusher", { prs: 10, zcv: -6 }], ["Coverage LB", { zcv: 8, mcv: 6, prs: -8 }]],
  MLB: [["Field General", { awr: 8 }], ["Thumper", { tak: 6, str: 6, zcv: -4 }]],
  CB: [["Shutdown CB", { mcv: 8, zcv: 2 }], ["Zone CB", { zcv: 8, mcv: -2 }], ["Slot CB", { agi: 8 }]],
  FS: [["Center Fielder", { zcv: 8, spd: 4 }], ["Ballhawk", { cat: 14, awr: 4 }]],
  SS: [["Box Safety", { tak: 8, str: 6 }], ["Hybrid", { mcv: 8 }]],
  K: [["Accurate", { kac: 6 }], ["Power", { kpw: 6 }]],
  P: [["Power", { kpw: 6 }], ["Accurate", { kac: 6 }]],
  LS: [["Snapper", {}]],
};

const ALL_KEYS: AttrKey[] = ["spd", "str", "agi", "awr", "cat", "rte", "thp", "tas", "tam", "tad", "rbk", "pbk", "prs", "tak", "mcv", "zcv", "bcv", "kpw", "kac"];

export function overall(pos: Pos, a: Attrs): number {
  const w = OVR_WEIGHTS[pos];
  let sum = 0;
  let tw = 0;
  for (const k in w) {
    const weight = w[k as AttrKey]!;
    sum += a[k as AttrKey] * weight;
    tw += weight;
  }
  return Math.round(clamp(sum / tw, 1, 99));
}

export const ovr = (p: Player): number => overall(p.pos, p.attrs);

/** Scheme fit (+3 to -3) on top of overall. */
export function schemeFit(p: Player, offScheme: string, defBase: string): number {
  const a = p.attrs;
  switch (p.pos) {
    case "QB":
      if (offScheme === "Air Raid") return a.tad > 75 ? 3 : a.tad < 60 ? -2 : 0;
      if (offScheme === "West Coast") return a.tas > 78 ? 3 : 0;
      if (offScheme === "Spread") return a.spd > 75 ? 3 : -1;
      return 1;
    case "RB":
    case "FB":
      if (offScheme === "Power Run") return a.str > 70 ? 3 : -1;
      if (offScheme === "Spread" || offScheme === "Air Raid") return a.cat > 65 ? 2 : -2;
      return 0;
    case "WR":
      if (offScheme === "Air Raid") return a.spd > 85 ? 3 : 0;
      if (offScheme === "Power Run") return -1;
      return a.rte > 78 ? 2 : 0;
    case "OT":
    case "OG":
    case "C":
      if (offScheme === "Power Run") return a.rbk > 72 ? 3 : -1;
      if (offScheme === "Air Raid" || offScheme === "West Coast") return a.pbk > 72 ? 2 : -1;
      return 0;
    case "DE":
      return defBase === "4-3" ? (a.prs > 72 ? 3 : 0) : a.str > 75 ? 2 : -2;
    case "DT":
      return defBase === "3-4" ? (a.str > 78 ? 3 : -2) : 1;
    case "OLB":
      return defBase === "3-4" ? (a.prs > 68 ? 3 : -2) : a.zcv > 60 ? 2 : -1;
    default:
      return 0;
  }
}

export const emptyStats = (): StatLine => ({
  gp: 0, pAtt: 0, pCmp: 0, pYds: 0, pTd: 0, pInt: 0, sacked: 0, rAtt: 0, rYds: 0, rTd: 0, fum: 0,
  tgt: 0, rec: 0, recYds: 0, recTd: 0, tkl: 0, sck: 0, dInt: 0, pd: 0, ff: 0, defTd: 0,
  fgm: 0, fga: 0, xpm: 0, xpa: 0, punts: 0, puntYds: 0, longFg: 0,
});

export function addStats(into: StatLine, from: StatLine) {
  for (const k in from) {
    const key = k as keyof StatLine;
    if (key === "longFg") into.longFg = Math.max(into.longFg, from.longFg);
    else into[key] += from[key];
  }
}

export function passerRating(s: StatLine): number {
  if (s.pAtt === 0) return 0;
  const a = clamp((s.pCmp / s.pAtt - 0.3) * 5, 0, 2.375);
  const b = clamp((s.pYds / s.pAtt - 3) * 0.25, 0, 2.375);
  const c = clamp((s.pTd / s.pAtt) * 20, 0, 2.375);
  const d = clamp(2.375 - (s.pInt / s.pAtt) * 25, 0, 2.375);
  return Math.round(((a + b + c + d) / 6) * 1000) / 10;
}

/** Market salary, $M per year, for a player at this overall and age. */
export function marketValue(pos: Pos, rating: number, age: number): number {
  const posMult: Partial<Record<Pos, number>> = { QB: 2.6, DE: 1.35, OT: 1.25, WR: 1.25, CB: 1.15, DT: 1.1, OLB: 1.05, K: 0.3, P: 0.25, LS: 0.15, FB: 0.35 };
  const m = posMult[pos] ?? 0.9;
  const base = Math.max(0, rating - 55);
  let v = 0.9 + Math.pow(base, 2.1) * 0.0105 * m;
  if (age >= 31) v *= 1 - (age - 30) * 0.08;
  return Math.round(clamp(v, 0.8, 58) * 10) / 10;
}

export function makeContract(salary: number, years: number, guarPct: number): Contract {
  const out = [];
  for (let i = 0; i < years; i++) {
    const cap = Math.round(salary * (1 + i * 0.04) * 10) / 10;
    out.push({ cap, guar: Math.round(cap * (i === 0 ? Math.min(1, guarPct * 1.4) : guarPct * Math.max(0, 1 - i * 0.3)) * 10) / 10 });
  }
  return { years: out };
}

export function capHit(p: Player): number {
  return p.contract.years[0]?.cap ?? 0;
}

interface GenOpts {
  pos: Pos;
  quality: number; // target overall-ish 40..90
  age?: number;
  id: number;
  teamId: number | null;
}

export function generatePlayer(r: Rng, o: GenOpts): Player {
  const age = o.age ?? randInt(r, 22, 33);
  const [archetype, arch] = pick(r, ARCHETYPES[o.pos]);
  const prof = POS_PROFILE[o.pos];
  const attrs = {} as Attrs;
  const lift = o.quality - 70;
  for (const k of ALL_KEYS) {
    const base = 40 + (prof[k] ?? -8);
    const targetLift = prof[k] !== undefined ? lift : lift * 0.3;
    attrs[k] = Math.round(clamp(gauss(r, base + targetLift + (arch[k] ?? 0), 5), 15, 99));
  }
  // Age curve: young players a bit raw, veterans slower.
  if (age >= 30) attrs.spd = Math.max(20, attrs.spd - (age - 29) * 2);
  const dev: DevTrait = r() < 0.04 ? "Superstar" : r() < 0.16 ? "Star" : "Normal";
  const pot = Math.round(clamp(Math.max(o.quality, o.quality + gauss(r, age < 25 ? 8 : 0, 6)), 40, 99));
  const rating = overall(o.pos, attrs);
  const years = age > 31 ? randInt(r, 1, 2) : randInt(r, 1, 5);
  const salary = marketValue(o.pos, rating, age) * (0.7 + r() * 0.5);
  const yrs = Math.max(0, age - 22 + randInt(r, -1, 0));
  return {
    id: o.id,
    first: pick(r, FIRST),
    last: pick(r, LAST),
    pos: o.pos,
    archetype,
    age,
    yrs,
    num: 0,
    college: pick(r, COLLEGES),
    attrs,
    pot,
    injProne: Math.round(clamp(gauss(r, 40, 18), 1, 99)),
    clutch: Math.round(clamp(gauss(r, 50, 18), 1, 99)),
    work: Math.round(clamp(gauss(r, 55, 18), 1, 99)),
    dev,
    contract: makeContract(salary, years, 0.3 + r() * 0.4),
    morale: 70,
    fatigue: 0,
    injury: null,
    teamId: o.teamId,
    ps: false,
    draft: null,
    career: [],
    awards: [],
  };
}

const NUM_RANGES: Partial<Record<Pos, Array<[number, number]>>> = {
  QB: [[1, 19]], RB: [[20, 49], [1, 9]], FB: [[30, 49]], WR: [[10, 19], [80, 89], [1, 9]], TE: [[80, 89], [40, 49]],
  OT: [[60, 79]], OG: [[60, 79]], C: [[50, 79]], DE: [[90, 99], [50, 59]], DT: [[90, 99], [60, 79]], OLB: [[50, 59], [40, 49]],
  MLB: [[50, 59], [40, 49]], CB: [[20, 39], [1, 9]], FS: [[20, 49]], SS: [[20, 49]], K: [[1, 19]], P: [[1, 19]], LS: [[40, 69]],
};

/** Give a player a jersey number not yet taken on his team. */
export function assignNumber(r: Rng, p: Player, taken: Set<number>) {
  const ranges = NUM_RANGES[p.pos] ?? [[1, 99]];
  for (let tries = 0; tries < 60; tries++) {
    const [lo, hi] = pick(r, ranges);
    const n = randInt(r, lo, hi);
    if (!taken.has(n)) {
      p.num = n;
      taken.add(n);
      return;
    }
  }
  for (let n = 1; n < 100; n++)
    if (!taken.has(n)) {
      p.num = n;
      taken.add(n);
      return;
    }
}

export const fullName = (p: Player): string => `${p.first} ${p.last}`;
export const shortName = (p: Player): string => `${p.first[0]}. ${p.last}`;

/** Roster template: 53 players. */
export const ROSTER_TEMPLATE: Array<[Pos, number]> = [
  ["QB", 3], ["RB", 4], ["FB", 1], ["WR", 6], ["TE", 3], ["OT", 4], ["OG", 4], ["C", 2],
  ["DE", 4], ["DT", 4], ["OLB", 4], ["MLB", 3], ["CB", 5], ["FS", 2], ["SS", 2], ["K", 1], ["P", 1],
];
// 3+4+1+6+3+4+4+2+4+4+4+3+5+2+2+1+1 = 53 ... LS is carried by the long-snapper-capable C on most rosters; add one LS on the practice squad.
export const PS_TEMPLATE: Array<[Pos, number]> = [
  ["QB", 1], ["RB", 1], ["WR", 2], ["TE", 1], ["OT", 1], ["OG", 1], ["DE", 1], ["DT", 1], ["OLB", 1], ["MLB", 1], ["CB", 2], ["FS", 1], ["SS", 1], ["LS", 1],
];

export const POS_GROUP: Record<Pos, "QB" | "RB" | "WR" | "OL" | "DL" | "LB" | "DB" | "ST"> = {
  QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "WR", OT: "OL", OG: "OL", C: "OL",
  DE: "DL", DT: "DL", OLB: "LB", MLB: "LB", CB: "DB", FS: "DB", SS: "DB", K: "ST", P: "ST", LS: "ST",
};
