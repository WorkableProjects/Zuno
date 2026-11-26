import { assignNumber, generatePlayer, ovr, PS_TEMPLATE, ROSTER_TEMPLATE, schemeFit } from "./gmPlayers";
import { clamp, gauss, hashSeed, pick, randInt, rngFor, shuffle, type Rng } from "./gmRandom";
import {
  COVERAGES, DEF_BASES, OFF_SCHEMES, type Coach, type DepthSlot, type Player, type Pos, type ScheduledGame, type Staff, type StaffRole, type Standing, type Team,
} from "./gmTypes";

export interface TeamSeed {
  city: string;
  name: string;
  abbr: string;
  colors: [string, string];
}

/** 32 fictional franchises. No real league's names, marks or colour pairs are copied. */
export const DEFAULT_TEAMS: TeamSeed[] = [
  { city: "Portland", name: "Timberwolves", abbr: "POR", colors: ["#1f6f43", "#e8c547"] },
  { city: "Austin", name: "Comets", abbr: "AUS", colors: ["#d9622b", "#1d2b53"] },
  { city: "San Antonio", name: "Marshals", abbr: "SAT", colors: ["#3b3f46", "#c9a227"] },
  { city: "Salt Lake", name: "Summit", abbr: "SLC", colors: ["#2b6cb0", "#e2e8f0"] },
  { city: "Oklahoma City", name: "Twisters", abbr: "OKC", colors: ["#7b2cbf", "#ffb703"] },
  { city: "Omaha", name: "Stampede", abbr: "OMA", colors: ["#8c1c13", "#f2e8cf"] },
  { city: "Birmingham", name: "Forge", abbr: "BIR", colors: ["#e85d04", "#212529"] },
  { city: "Memphis", name: "Blues", abbr: "MEM", colors: ["#1e40af", "#93c5fd"] },
  { city: "Louisville", name: "Thoroughbreds", abbr: "LOU", colors: ["#065f46", "#fde68a"] },
  { city: "Columbus", name: "Navigators", abbr: "CBS", colors: ["#0f172a", "#ef4444"] },
  { city: "Sacramento", name: "Gold Rush", abbr: "SAC", colors: ["#b8860b", "#14213d"] },
  { city: "San Diego", name: "Tidebreakers", abbr: "SDT", colors: ["#0891b2", "#f8fafc"] },
  { city: "St. Louis", name: "Archers", abbr: "STL", colors: ["#9d174d", "#f9a8d4"] },
  { city: "Albuquerque", name: "Roadrunners", abbr: "ABQ", colors: ["#c2410c", "#fef3c7"] },
  { city: "Boise", name: "Peaks", abbr: "BOI", colors: ["#334155", "#38bdf8"] },
  { city: "Honolulu", name: "Breakers", abbr: "HNL", colors: ["#0d9488", "#fcd34d"] },
  { city: "Anchorage", name: "Glaciers", abbr: "ANC", colors: ["#1e3a8a", "#bae6fd"] },
  { city: "Raleigh", name: "Oaks", abbr: "RAL", colors: ["#3f6212", "#fef9c3"] },
  { city: "Richmond", name: "Ironclads", abbr: "RIC", colors: ["#44403c", "#f97316"] },
  { city: "Hartford", name: "Whalers", abbr: "HFD", colors: ["#155e75", "#a3e635"] },
  { city: "Providence", name: "Anchors", abbr: "PRV", colors: ["#172554", "#fbbf24"] },
  { city: "Toronto", name: "Northmen", abbr: "TOR", colors: ["#991b1b", "#e5e7eb"] },
  { city: "Montreal", name: "Voyageurs", abbr: "MTL", colors: ["#1d4ed8", "#dc2626"] },
  { city: "Vancouver", name: "Orcas", abbr: "VAN", colors: ["#111827", "#22d3ee"] },
  { city: "Mexico City", name: "Aztecas", abbr: "MEX", colors: ["#15803d", "#b91c1c"] },
  { city: "Orlando", name: "Thunder", abbr: "ORL", colors: ["#6d28d9", "#22c55e"] },
  { city: "Tulsa", name: "Roughnecks", abbr: "TUL", colors: ["#78350f", "#facc15"] },
  { city: "Milwaukee", name: "Brewmasters", abbr: "MIL", colors: ["#1e3a5f", "#f59e0b"] },
  { city: "Des Moines", name: "Cyclones", abbr: "DSM", colors: ["#be123c", "#fde047"] },
  { city: "Spokane", name: "Falcons", abbr: "SPK", colors: ["#4c1d95", "#d1d5db"] },
  { city: "El Paso", name: "Sun Devils", abbr: "ELP", colors: ["#ea580c", "#0c4a6e"] },
  { city: "Norfolk", name: "Admirals", abbr: "NOR", colors: ["#0c4a6e", "#e0f2fe"] },
];

export const CONF_NAMES = ["Atlantic Conference", "Pacific Conference"] as const;
export const CONF_SHORT = ["ATL", "PAC"] as const;
export const DIV_NAMES = ["North", "South", "East", "West"] as const;
const SHAPES = ["shield", "circle", "diamond", "hex", "star", "bolt"] as const;
const COACH_FIRST = ["Bill", "Andy", "Sean", "Kyle", "Mike", "Dan", "Ron", "Pete", "Gus", "Hal", "Lou", "Vic", "Ray", "Joe", "Ed", "Frank", "Tom", "Wes"];
const COACH_LAST = ["Holcomb", "Price", "Bergstrom", "Kincaid", "Mancuso", "Okonkwo", "Reilly", "Strand", "Tolbert", "Vasquez", "Whitaker", "Yoder", "Lindqvist", "Ferris"];

export function makeCoach(r: Rng, id: number, role: StaffRole, quality = 60): Coach {
  const rating = Math.round(clamp(gauss(r, quality, 10), 40, 97));
  return {
    id,
    name: `${pick(r, COACH_FIRST)} ${pick(r, COACH_LAST)}`,
    role,
    rating,
    dev: Math.round(clamp((rating - 50) / 10, 0, 5)),
    scheme: role === "OC" ? pick(r, OFF_SCHEMES) : role === "DC" ? pick(r, DEF_BASES) : undefined,
    salary: Math.round((role === "OC" || role === "DC" ? 1.5 : 0.6) * (rating / 60) * 10) / 10,
    age: randInt(r, 34, 68),
  };
}

export interface LeagueBuild {
  teams: Team[];
  players: Record<number, Player>;
  nextId: number;
}

export function generateLeague(seed: number, seeds: TeamSeed[] = DEFAULT_TEAMS): LeagueBuild {
  const r = rngFor(seed, "league");
  const players: Record<number, Player> = {};
  let nextId = 1;
  const teams: Team[] = seeds.slice(0, 32).map((s, i) => {
    const conf = (i < 16 ? 0 : 1) as 0 | 1;
    const div = (Math.floor(i / 4) % 4) as 0 | 1 | 2 | 3;
    const staff: Staff = {};
    for (const role of ["OC", "DC", "ST", "QB", "RB", "WR", "OL", "DL", "LB", "DB"] as StaffRole[]) staff[role] = makeCoach(r, 100000 + i * 20 + Object.keys(staff).length, role);
    const off = staff.OC?.scheme as Team["offScheme"];
    const def = staff.DC?.scheme as Team["defBase"];
    const words = s.name.split(" ");
    return {
      id: i,
      city: s.city,
      name: s.name,
      abbr: s.abbr,
      colors: s.colors,
      logo: { shape: pick(r, SHAPES), glyph: (words.length > 1 ? words.map((w) => w[0]).join("") : s.name[0]).slice(0, 2).toUpperCase() },
      conf,
      div,
      stadium: `${s.name} Field`,
      dome: r() < 0.28,
      ownerPatience: randInt(r, 25, 90),
      market: pick(r, ["Small", "Medium", "Medium", "Large"] as const),
      offScheme: off ?? pick(r, OFF_SCHEMES),
      defBase: def ?? pick(r, DEF_BASES),
      coverage: pick(r, COVERAGES),
      plan: { passRatio: randInt(r, 50, 64), aggression: randInt(r, 25, 65), blitz: randInt(r, 20, 50), tempo: randInt(r, 35, 65), twoPoint: "Situational" },
      depth: {},
      staff,
    };
  });

  for (const t of teams) {
    const strength = gauss(r, 0, 3.2);
    const taken = new Set<number>();
    const add = (pos: Pos, slot: number, ps: boolean) => {
      // Starters better than backups.
      const q = ps ? randInt(r, 46, 58) : slot === 0 ? gauss(r, 76 + strength, 6) : slot === 1 ? gauss(r, 68 + strength, 5) : gauss(r, 61 + strength * 0.5, 5);
      const p = generatePlayer(r, { pos, quality: clamp(q, 42, 94), id: nextId++, teamId: t.id, age: ps ? randInt(r, 22, 25) : undefined });
      p.ps = ps;
      assignNumber(r, p, taken);
      players[p.id] = p;
    };
    for (const [pos, n] of ROSTER_TEMPLATE) for (let k = 0; k < n; k++) add(pos, k, false);
    for (const [pos, n] of PS_TEMPLATE) for (let k = 0; k < n; k++) add(pos, 3, true);
    autoDepth(t, players);
  }
  return { teams, players, nextId };
}

export function teamPlayers(teamId: number, players: Record<number, Player>, includePs = false): Player[] {
  const out: Player[] = [];
  for (const k in players) {
    const p = players[k];
    if (p.teamId === teamId && !p.retired && (includePs || !p.ps)) out.push(p);
  }
  return out;
}

/** Which positions may fill each depth slot, in order of preference. */
export const SLOT_POS: Record<DepthSlot, Pos[]> = {
  QB: ["QB"], RB: ["RB"], FB: ["FB", "RB", "TE"], WR: ["WR"], TE: ["TE"],
  LT: ["OT", "OG"], LG: ["OG", "OT", "C"], C: ["C", "OG"], RG: ["OG", "OT", "C"], RT: ["OT", "OG"],
  LE: ["DE", "OLB"], DT: ["DT", "DE"], RE: ["DE", "OLB"], LOLB: ["OLB", "MLB"], MLB: ["MLB", "OLB"], ROLB: ["OLB", "MLB"],
  CB: ["CB", "FS"], FS: ["FS", "SS", "CB"], SS: ["SS", "FS"], K: ["K", "P"], P: ["P", "K"], LS: ["LS", "C", "OG"],
  KR: ["WR", "RB", "CB"], PR: ["WR", "CB", "RB"],
};

/** How many starters each slot needs on the field. */
export const SLOT_STARTERS: Record<DepthSlot, number> = {
  QB: 1, RB: 1, FB: 1, WR: 3, TE: 2, LT: 1, LG: 1, C: 1, RG: 1, RT: 1, LE: 1, DT: 2, RE: 1, LOLB: 1, MLB: 1, ROLB: 1, CB: 3, FS: 1, SS: 1, K: 1, P: 1, LS: 1, KR: 1, PR: 1,
};

/** Rebuild a team's depth chart from overall ratings (healthy players first). */
export function autoDepth(t: Team, players: Record<number, Player>) {
  const roster = teamPlayers(t.id, players);
  const used = new Map<DepthSlot, number[]>();
  const score = (p: Player, slot: DepthSlot) => {
    const prefs = SLOT_POS[slot];
    const posIdx = prefs.indexOf(p.pos);
    if (posIdx < 0) return -1;
    const healthy = p.injury ? -50 : 0;
    if (slot === "KR" || slot === "PR") return p.attrs.spd * 0.6 + p.attrs.agi * 0.3 + p.attrs.bcv * 0.2 + healthy - (["QB"].includes(p.pos) ? 99 : 0);
    if (slot === "LS") return (p.pos === "LS" ? 100 : 0) + p.attrs.awr * 0.2 + healthy;
    return ovr(p) + schemeFit(p, t.offScheme, t.defBase) - posIdx * 12 + healthy;
  };
  // Assign unique OL / DL / LB slots so one player doesn't start at two spots.
  const startersTaken = new Set<number>();
  const uniqueGroups: DepthSlot[][] = [["LT", "RT", "LG", "RG", "C"], ["LE", "RE", "DT"], ["MLB", "LOLB", "ROLB"], ["CB", "FS", "SS"]];
  for (const group of uniqueGroups) {
    for (const slot of group) {
      const need = SLOT_STARTERS[slot];
      const cands = roster.filter((p) => score(p, slot) >= 0 && !startersTaken.has(p.id)).sort((a, b) => score(b, slot) - score(a, slot));
      const starters = cands.slice(0, need);
      starters.forEach((p) => startersTaken.add(p.id));
      const rest = roster.filter((p) => score(p, slot) >= 0 && !starters.includes(p)).sort((a, b) => score(b, slot) - score(a, slot));
      used.set(slot, [...starters, ...rest].slice(0, need + 3).map((p) => p.id));
    }
  }
  for (const slot of Object.keys(SLOT_POS) as DepthSlot[]) {
    if (used.has(slot)) continue;
    const list = roster.filter((p) => score(p, slot) >= 0).sort((a, b) => score(b, slot) - score(a, slot));
    used.set(slot, list.slice(0, SLOT_STARTERS[slot] + 3).map((p) => p.id));
  }
  t.depth = Object.fromEntries(used);
}

/** Starters at a slot, skipping injured players; falls back to anyone on the roster. */
export function starters(t: Team, slot: DepthSlot, players: Record<number, Player>, count = SLOT_STARTERS[slot]): Player[] {
  const ids = t.depth[slot] ?? [];
  const out: Player[] = [];
  for (const id of ids) {
    const p = players[id];
    if (p && p.teamId === t.id && !p.injury && !p.retired && !p.ps) out.push(p);
    if (out.length >= count) break;
  }
  if (out.length < count) {
    const extra = teamPlayers(t.id, players)
      .filter((p) => !p.injury && SLOT_POS[slot].includes(p.pos) && !out.includes(p))
      .sort((a, b) => ovr(b) - ovr(a));
    out.push(...extra.slice(0, count - out.length));
  }
  if (out.length < count) {
    const any = teamPlayers(t.id, players).filter((p) => !p.injury && !out.includes(p));
    out.push(...any.slice(0, count - out.length));
  }
  return out;
}

/** Team strength 1-99 as the average of starters. */
export function teamRating(t: Team, players: Record<number, Player>): { off: number; def: number; st: number; ovr: number } {
  const avg = (ps: Player[]) => (ps.length ? ps.reduce((s, p) => s + ovr(p), 0) / ps.length : 50);
  const qb = avg(starters(t, "QB", players));
  const off = qb * 0.35 + avg([...starters(t, "RB", players), ...starters(t, "WR", players), ...starters(t, "TE", players, 1)]) * 0.35 + avg(["LT", "LG", "C", "RG", "RT"].flatMap((s) => starters(t, s as DepthSlot, players))) * 0.3;
  const def = avg(["LE", "DT", "RE", "LOLB", "MLB", "ROLB", "CB", "FS", "SS"].flatMap((s) => starters(t, s as DepthSlot, players)));
  const st = avg([...starters(t, "K", players), ...starters(t, "P", players)]);
  return { off: Math.round(off), def: Math.round(def), st: Math.round(st), ovr: Math.round(off * 0.48 + def * 0.44 + st * 0.08) };
}

// ---------------------------------------------------------------------------
// Schedule

const divTeams = (teams: Team[], conf: number, div: number) => teams.filter((t) => t.conf === conf && t.div === div).sort((a, b) => a.id - b.id);

/**
 * 17-game schedule from the divisional formula, then laid into 18 weeks with byes in weeks 5-12.
 * `year` rotates the opposing divisions; `lastPlace` maps teamId -> division finish (0-3) for the place-based games.
 */
export function buildSchedule(teams: Team[], year: number, seed: number, place?: Record<number, number>): ScheduledGame[] {
  const finish = (t: Team) => place?.[t.id] ?? divTeams(teams, t.conf, t.div).indexOf(t);
  const pairs: Array<[number, number]> = [];
  const add = (a: number, b: number) => pairs.push([a, b]);
  const y = year % 12;
  for (const conf of [0, 1]) {
    for (let d = 0; d < 4; d++) {
      const dt = divTeams(teams, conf, d);
      // Division: home and away vs each rival.
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j) add(dt[i].id, dt[j].id);
    }
  }
  // Intra-conference rotation (3-year cycle): div d plays div ROT[k][d].
  const intra = [[1, 0, 3, 2], [2, 3, 0, 1], [3, 2, 1, 0]][y % 3];
  // Inter-conference rotation (4-year cycle).
  const inter = (d: number) => (d + y) % 4;
  for (const conf of [0, 1]) {
    for (let d = 0; d < 4; d++) {
      const od = intra[d];
      if (od < d) continue;
      const a = divTeams(teams, conf, d);
      const b = divTeams(teams, conf, od);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ((i + j) % 2 === 0 ? add(a[i].id, b[j].id) : add(b[j].id, a[i].id));
    }
  }
  for (let d = 0; d < 4; d++) {
    const a = divTeams(teams, 0, d);
    const b = divTeams(teams, 1, inter(d));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ((i + j + y) % 2 === 0 ? add(a[i].id, b[j].id) : add(b[j].id, a[i].id));
  }
  // Same-place games vs the two remaining in-conference divisions.
  for (const conf of [0, 1]) {
    for (let d = 0; d < 4; d++) {
      const others = [0, 1, 2, 3].filter((x) => x !== d && x !== intra[d]);
      for (const od of others) {
        if (od < d) continue;
        for (const t of divTeams(teams, conf, d)) {
          const opp = divTeams(teams, conf, od).find((o) => finish(o) === finish(t))!;
          ((t.id + y) % 2 === 0 ? add(t.id, opp.id) : add(opp.id, t.id));
        }
      }
    }
  }
  // 17th game: same place vs the inter-conference division played two cycles away.
  for (let d = 0; d < 4; d++) {
    const od = (inter(d) + 2) % 4;
    for (const t of divTeams(teams, 0, d)) {
      const opp = divTeams(teams, 1, od).find((o) => finish(o) === finish(t))!;
      (y % 2 === 0 ? add(t.id, opp.id) : add(opp.id, t.id));
    }
  }

  // Lay out into weeks.
  for (let attempt = 0; attempt < 400; attempt++) {
    const r = rngFor(seed, "sched", year, attempt);
    const weeks = layWeeks(r, pairs, teams.length);
    if (weeks) {
      const out: ScheduledGame[] = [];
      let id = year * 1000;
      weeks.forEach((games, w) => games.forEach(([h, a]) => out.push({ id: id++, week: w + 1, home: h, away: a })));
      return out;
    }
  }
  throw new Error("Could not build a schedule");
}

function layWeeks(r: Rng, pairs: Array<[number, number]>, n: number): Array<Array<[number, number]>> | null {
  const remaining = shuffle(r, pairs.slice());
  const byeWeeks = shuffle(r, Array.from({ length: n }, (_, i) => i));
  const byeOf = new Map<number, number>(); // team -> week index (4..11)
  byeWeeks.forEach((t, i) => byeOf.set(t, 4 + Math.floor(i / 4)));
  const weeks: Array<Array<[number, number]>> = [];
  for (let w = 0; w < 18; w++) {
    const playing = Array.from({ length: n }, (_, i) => i).filter((t) => byeOf.get(t) !== w);
    const matching = findMatching(r, playing, remaining, w);
    if (!matching) return null;
    for (const g of matching) remaining.splice(remaining.indexOf(g), 1);
    weeks.push(matching);
  }
  return remaining.length === 0 ? weeks : null;
}

function findMatching(r: Rng, teams: number[], pool: Array<[number, number]>, _w: number): Array<[number, number]> | null {
  const left = new Set(teams);
  const out: Array<[number, number]> = [];
  const games = (t: number) => pool.filter((g) => (g[0] === t || g[1] === t) && left.has(g[0]) && left.has(g[1]) && !out.includes(g));
  let steps = 0;
  const solve = (): boolean => {
    if (left.size === 0) return true;
    if (++steps > 4000) return false;
    // Most constrained team first.
    let best = -1;
    let bestOpts: Array<[number, number]> = [];
    for (const t of left) {
      const o = games(t);
      if (best < 0 || o.length < bestOpts.length) {
        best = t;
        bestOpts = o;
      }
      if (o.length === 0) return false;
    }
    shuffle(r, bestOpts);
    for (const g of bestOpts) {
      left.delete(g[0]);
      left.delete(g[1]);
      out.push(g);
      if (solve()) return true;
      out.pop();
      left.add(g[0]);
      left.add(g[1]);
    }
    return false;
  };
  return solve() ? out : null;
}

// ---------------------------------------------------------------------------
// Standings and tiebreakers

export function computeStandings(teams: Team[], schedule: ScheduledGame[]): Record<number, Standing> {
  const s: Record<number, Standing> = {};
  for (const t of teams) s[t.id] = { teamId: t.id, w: 0, l: 0, t: 0, pf: 0, pa: 0, divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0, streak: 0 };
  const games = schedule.filter((g) => g.result && !g.round).sort((a, b) => a.week - b.week);
  for (const g of games) {
    const [hs, as] = g.result!.score;
    const h = s[g.home];
    const a = s[g.away];
    const th = teams[g.home];
    const ta = teams[g.away];
    h.pf += hs; h.pa += as; a.pf += as; a.pa += hs;
    const sameDiv = th.conf === ta.conf && th.div === ta.div;
    const sameConf = th.conf === ta.conf;
    const rec = (st: Standing, res: "w" | "l" | "t") => {
      st[res]++;
      if (sameDiv) st[res === "w" ? "divW" : res === "l" ? "divL" : "divT"]++;
      if (sameConf) st[res === "w" ? "confW" : res === "l" ? "confL" : "confT"]++;
      st.streak = res === "w" ? (st.streak > 0 ? st.streak + 1 : 1) : res === "l" ? (st.streak < 0 ? st.streak - 1 : -1) : 0;
    };
    if (hs > as) { rec(h, "w"); rec(a, "l"); }
    else if (as > hs) { rec(h, "l"); rec(a, "w"); }
    else { rec(h, "t"); rec(a, "t"); }
  }
  return s;
}

export const pct = (w: number, l: number, t: number): number => (w + l + t === 0 ? 0 : (w + t / 2) / (w + l + t));
export const recordText = (st: { w: number; l: number; t: number }): string => `${st.w}-${st.l}${st.t ? `-${st.t}` : ""}`;

function subRecord(ids: number[], target: number, schedule: ScheduledGame[], filter: (opp: number) => boolean): number {
  let w = 0, l = 0, t = 0;
  for (const g of schedule) {
    if (!g.result || g.round) continue;
    const isHome = g.home === target;
    if (!isHome && g.away !== target) continue;
    const opp = isHome ? g.away : g.home;
    if (!filter(opp) || (ids.length && !ids.includes(opp))) continue;
    const [hs, as] = g.result.score;
    const mine = isHome ? hs : as;
    const theirs = isHome ? as : hs;
    if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
  }
  return w + l + t === 0 ? -1 : pct(w, l, t);
}

/**
 * Sort teams by record with tiebreakers: head-to-head, division record (same division), common games (min 4),
 * conference record, point differential, then a seeded coin flip.
 */
export function rankTeams(ids: number[], teams: Team[], st: Record<number, Standing>, schedule: ScheduledGame[], seed = 1): number[] {
  const groups = new Map<number, number[]>();
  for (const id of ids) {
    const p = Math.round(pct(st[id].w, st[id].l, st[id].t) * 10000);
    groups.set(p, [...(groups.get(p) ?? []), id]);
  }
  const keys = [...groups.keys()].sort((a, b) => b - a);
  const out: number[] = [];
  for (const k of keys) out.push(...breakTie(groups.get(k)!, teams, st, schedule, seed));
  return out;
}

function breakTie(ids: number[], teams: Team[], st: Record<number, Standing>, schedule: ScheduledGame[], seed: number): number[] {
  if (ids.length <= 1) return ids;
  const sameDiv = ids.every((id) => teams[id].conf === teams[ids[0]].conf && teams[id].div === teams[ids[0]].div);
  const opponents = (id: number) => new Set(schedule.filter((g) => g.result && !g.round && (g.home === id || g.away === id)).map((g) => (g.home === id ? g.away : g.home)));
  const common = [...ids.map(opponents).reduce((a, b) => new Set([...a].filter((x) => b.has(x))))].filter((x) => !ids.includes(x));
  const steps: Array<(id: number) => number> = [
    (id) => subRecord(ids.filter((x) => x !== id), id, schedule, () => true),
    (id) => (sameDiv ? pct(st[id].divW, st[id].divL, st[id].divT) : 0),
    (id) => (common.length >= 4 ? subRecord(common, id, schedule, () => true) : 0),
    (id) => pct(st[id].confW, st[id].confL, st[id].confT),
    (id) => st[id].pf - st[id].pa,
    (id) => hashSeed(seed, id) / 4294967296,
  ];
  for (const step of steps) {
    const vals = ids.map((id) => ({ id, v: step(id) }));
    const top = Math.max(...vals.map((x) => x.v));
    const leaders = vals.filter((x) => x.v === top).map((x) => x.id);
    if (leaders.length < ids.length) {
      const first = leaders.length === 1 ? leaders : breakTie(leaders, teams, st, schedule, seed);
      return [...first, ...breakTie(ids.filter((x) => !leaders.includes(x)), teams, st, schedule, seed)];
    }
  }
  return ids;
}

export function divisionOrder(conf: number, div: number, teams: Team[], st: Record<number, Standing>, schedule: ScheduledGame[], seed: number): number[] {
  return rankTeams(teams.filter((t) => t.conf === conf && t.div === div).map((t) => t.id), teams, st, schedule, seed);
}

/** Seeds 1-7: four division winners by record, then three wild cards. */
export function playoffSeeds(conf: number, teams: Team[], st: Record<number, Standing>, schedule: ScheduledGame[], seed: number): number[] {
  const winners = [0, 1, 2, 3].map((d) => divisionOrder(conf, d, teams, st, schedule, seed)[0]);
  const seededWinners = rankTeams(winners, teams, st, schedule, seed);
  const rest = teams.filter((t) => t.conf === conf && !winners.includes(t.id)).map((t) => t.id);
  const wild = rankTeams(rest, teams, st, schedule, seed).slice(0, 3);
  return [...seededWinners, ...wild];
}

/** Rough win probability for the home side from score, time and field position. */
export function winProb(homeLead: number, secondsLeft: number, homeHasBall: boolean, ballOn: number): number {
  const tFrac = Math.max(0.02, secondsLeft / 3600);
  const fieldEdge = (homeHasBall ? 1 : -1) * ((ballOn - 30) / 70) * 3;
  const z = (homeLead + fieldEdge + 1.5 * tFrac) / (13.5 * Math.sqrt(tFrac));
  return 1 / (1 + Math.exp(-1.7 * z));
}
