/** Draft classes, scouting, combine numbers, draft order and AI picks. */
import { computeStandings, pct, teamPlayers } from "./gmLeague";
import { generatePlayer, makeContract, ovr, POS_GROUP } from "./gmPlayers";
import { clamp, gauss, randInt, rngFor } from "./gmRandom";
import type { Career, DraftPick, Player, Pos, Prospect } from "./gmTypes";

const CLASS_MIX: Array<[Pos, number]> = [
  ["QB", 12], ["RB", 18], ["FB", 3], ["WR", 32], ["TE", 14], ["OT", 20], ["OG", 18], ["C", 8],
  ["DE", 22], ["DT", 18], ["OLB", 18], ["MLB", 12], ["CB", 28], ["FS", 10], ["SS", 10], ["K", 3], ["P", 3], ["LS", 2],
];

export const SCOUT_COST = 10;
export const SCOUT_POINTS_PER_SEASON = 160;

/** Builds a class of prospects for the given draft year and adds them to the career. */
export function generateDraftClass(c: Career, draftYear: number) {
  const r = rngFor(c.seed, "class", draftYear);
  const list: Prospect[] = [];
  const pool: Player[] = [];
  for (const [pos, n] of CLASS_MIX) {
    for (let i = 0; i < n; i++) {
      const tier = r();
      const quality = tier < 0.04 ? gauss(r, 74, 3) : tier < 0.2 ? gauss(r, 67, 3) : tier < 0.55 ? gauss(r, 60, 4) : gauss(r, 52, 5);
      const p = generatePlayer(r, { pos, quality: clamp(quality, 38, 82), age: randInt(r, 21, 23), id: c.nextId++, teamId: null });
      p.yrs = 0;
      p.pot = Math.round(clamp(ovr(p) + Math.abs(gauss(r, 10, 7)), ovr(p) + 1, 97));
      p.contract = { years: [] };
      pool.push(p);
      c.players[p.id] = p;
    }
  }
  const value = (p: Player) => ovr(p) * 0.55 + p.pot * 0.45 + (p.pos === "QB" ? 3 : p.pos === "K" || p.pos === "P" || p.pos === "LS" ? -12 : 0);
  const noisy = pool.map((p) => ({ p, v: value(p) + gauss(r, 0, 3.5) })).sort((a, b) => b.v - a.v);
  noisy.forEach(({ p }, i) => {
    const a = p.attrs;
    list.push({
      playerId: p.id,
      rank: i + 1,
      scouted: 0,
      combine: {
        forty: Math.round((4.22 + (99 - a.spd) * 0.0125 + gauss(r, 0, 0.04)) * 100) / 100,
        bench: Math.max(4, Math.round(a.str / 3.6 + gauss(r, 0, 2))),
        vertical: Math.round((24 + a.agi / 7 + gauss(r, 0, 1.5)) * 2) / 2,
        cone: Math.round((6.55 + (99 - a.agi) * 0.012 + gauss(r, 0, 0.05)) * 100) / 100,
      },
      proDay: r() < 0.3,
    });
  });
  c.prospects = list;
}

/** The overall-rating range a scout can see for a prospect. */
export function scoutedRange(c: Career, pr: Prospect): [number, number] {
  const p = c.players[pr.playerId];
  const true_ = ovr(p);
  const width = [14, 9, 5, 0][pr.scouted] ?? 0;
  const off = ((pr.playerId * 7919) % 11) - 5; // fixed offset so the window isn't centred on the truth
  const centre = true_ + Math.round((off * width) / 12);
  return [Math.max(30, centre - width), Math.min(99, centre + width)];
}

export function potentialGrade(c: Career, pr: Prospect): string {
  if (pr.scouted < 3) return "?";
  const pot = c.players[pr.playerId].pot;
  return pot >= 85 ? "A" : pot >= 77 ? "B" : pot >= 69 ? "C" : pot >= 61 ? "D" : "F";
}

export function scout(c: Career, playerId: number): boolean {
  const pr = c.prospects.find((x) => x.playerId === playerId);
  if (!pr || pr.scouted >= 3 || c.scoutPoints < SCOUT_COST) return false;
  pr.scouted++;
  c.scoutPoints -= SCOUT_COST;
  return true;
}

export function makePicks(c: Career, year: number) {
  for (let round = 1; round <= 7; round++) for (const t of c.teams) {
    if (!c.picks.some((p) => p.year === year && p.round === round && p.orig === t.id)) c.picks.push({ year, round, orig: t.id, owner: t.id });
  }
}

/** Order of original teams for this year's draft: worst record first, champion last. */
export function draftOrder(c: Career): number[] {
  const st = computeStandings(c.teams, c.schedule);
  const playoffGames = c.schedule.filter((g) => g.round);
  const exitRound = (id: number) => {
    const rounds: Record<string, number> = { WC: 1, DIV: 2, CONF: 3, BOWL: 4 };
    let best = 0;
    for (const g of playoffGames) if (g.home === id || g.away === id) best = Math.max(best, rounds[g.round!]);
    const bowl = playoffGames.find((g) => g.round === "BOWL" && g.result);
    if (bowl) {
      const winner = bowl.result!.score[0] > bowl.result!.score[1] ? bowl.home : bowl.away;
      if (winner === id) best = 5;
    }
    return best;
  };
  return c.teams
    .map((t) => t.id)
    .sort((a, b) => exitRound(a) - exitRound(b) || pct(st[a].w, st[a].l, st[a].t) - pct(st[b].w, st[b].l, st[b].t) || (st[a].pf - st[a].pa) - (st[b].pf - st[b].pa) || a - b);
}

export function assignOverall(c: Career, year: number) {
  const order = draftOrder(c);
  for (const p of c.picks) if (p.year === year) p.overall = (p.round - 1) * 32 + order.indexOf(p.orig) + 1;
}

export const pickLabel = (p: DraftPick, teams: Career["teams"]) => `${p.year} R${p.round}${p.overall ? ` #${p.overall}` : ""} (${teams[p.orig].abbr})`;
export const pickKey = (p: DraftPick) => `${p.year}-${p.round}-${p.orig}`;

export function currentPick(c: Career): DraftPick | null {
  const list = c.picks.filter((p) => p.year === c.year && p.playerId === undefined && p.overall).sort((a, b) => a.overall! - b.overall!);
  return list[0] ?? null;
}

/** Rookie scale salary by overall pick. */
export function rookieSalary(overall: number): number {
  if (overall <= 32) return Math.round((10.5 - (overall - 1) * 0.27) * 10) / 10;
  if (overall <= 64) return 1.6;
  if (overall <= 100) return 1.2;
  return 0.9;
}

export function draftPlayer(c: Career, playerId: number) {
  const pk = currentPick(c);
  if (!pk) return;
  const p = c.players[playerId];
  pk.playerId = playerId;
  p.teamId = pk.owner;
  p.ps = false;
  p.draft = { year: c.year, round: pk.round, pick: pk.overall!, teamId: pk.owner };
  const sal = rookieSalary(pk.overall!);
  p.contract = { ...makeContract(sal, 4, pk.round === 1 ? 1 : 0.5), rookie: true };
  const taken = new Set(teamPlayers(pk.owner, c.players, true).map((x) => x.num));
  p.num = 0;
  for (let n = 1; n < 100 && !p.num; n++) if (!taken.has((n * 37) % 99 + 1)) p.num = (n * 37) % 99 + 1;
  c.prospects = c.prospects.filter((x) => x.playerId !== playerId);
  const t = c.teams[pk.owner];
  c.log.push(`${c.year} draft: ${t.abbr} select ${p.first} ${p.last}, ${p.pos} (#${pk.overall}).`);
}

/** AI pick: best available on the consensus board, nudged toward needs. */
export function aiPick(c: Career, teamId: number): number | null {
  if (!c.prospects.length) return null;
  const roster = teamPlayers(teamId, c.players);
  const need = (pos: Pos) => {
    const group = roster.filter((p) => p.pos === pos);
    const best = Math.max(0, ...group.map(ovr));
    return group.length < 2 ? 8 : best < 68 ? 5 : 0;
  };
  const r = rngFor(c.seed, "aipick", c.year, teamId, c.prospects.length);
  const top = c.prospects.slice().sort((a, b) => a.rank - b.rank).slice(0, 12);
  let best = top[0];
  let bv = -1e9;
  for (const pr of top) {
    const p = c.players[pr.playerId];
    const v = -pr.rank + need(p.pos) + r() * 3 - (["K", "P", "LS"].includes(p.pos) && pr.rank > 5 ? 0 : 0);
    if (v > bv) {
      bv = v;
      best = pr;
    }
  }
  return best.playerId;
}

/** Need score by position group, for the trade and draft screens. */
export function teamNeeds(c: Career, teamId: number): string[] {
  const roster = teamPlayers(teamId, c.players);
  const groups: Record<string, number[]> = {};
  for (const p of roster) (groups[POS_GROUP[p.pos]] ??= []).push(ovr(p));
  const out: Array<[string, number]> = Object.entries(groups).map(([g, list]) => [g, list.sort((a, b) => b - a).slice(0, 2).reduce((s, x) => s + x, 0) / 2]);
  return out.sort((a, b) => a[1] - b[1]).slice(0, 3).map((x) => x[0]);
}


export interface DraftSlot {
  overall: number;
  round: number;
  owner: number;
  orig: number;
  traded: boolean;
}

/** The next picks on the clock in order, with owner and whether the pick was traded. */
export function upcomingPicks(c: Career, n = 8): DraftSlot[] {
  return c.picks
    .filter((p) => p.year === c.year && p.playerId === undefined && p.overall)
    .sort((a, b) => a.overall! - b.overall!)
    .slice(0, n)
    .map((p) => ({ overall: p.overall!, round: p.round, owner: p.owner, orig: p.orig, traded: p.owner !== p.orig }));
}

/** Picks made so far versus total in the current draft. */
export function draftProgress(c: Career): { made: number; total: number } {
  const all = c.picks.filter((p) => p.year === c.year && p.overall);
  return { made: all.filter((p) => p.playerId !== undefined).length, total: all.length };
}

/** Prospects at the positions this team is thinnest at, best-ranked first. Based on the same need rule the AI uses. */
export function needProspects(c: Career, teamId: number, n = 5): Prospect[] {
  const needs = new Set(teamNeeds(c, teamId));
  return c.prospects
    .filter((pr) => needs.has(POS_GROUP[c.players[pr.playerId].pos]))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, n);
}
