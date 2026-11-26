/**
 * The career: season calendar, weekly sims, injuries, cap and contracts, free agency, trades, the offseason,
 * development, awards and history. All state lives in one Career object that is saved as JSON.
 */
import { aiPick, assignOverall, currentPick, draftPlayer, generateDraftClass, makePicks, pickKey, SCOUT_POINTS_PER_SEASON } from "./gmDraft";
import { finishGame, simulateGame, type GameState } from "./gmEngine";
import {
  autoDepth, buildSchedule, computeStandings, DEFAULT_TEAMS, divisionOrder, generateLeague, makeCoach, pct, playoffSeeds, rankTeams, recordText, teamPlayers, teamRating, type TeamSeed,
} from "./gmLeague";
import { addStats, assignNumber, capHit, emptyStats, fullName, generatePlayer, makeContract, marketValue, ovr, passerRating, POS_GROUP, PS_TEMPLATE, ROSTER_TEMPLATE } from "./gmPlayers";
import { clamp, gauss, hashSeed, pick, randInt, rngFor } from "./gmRandom";
import type {
  AttrKey, Career, Coach, DraftPick, GameResult, InboxItem, Phase, Player, Pos, ScheduledGame, StaffRole, StatLine, Team, TradeOffer,
} from "./gmTypes";

export const START_YEAR = 2026;
export const ROSTER_MAX = 53;
export const PS_MAX = 16;
export const BASE_CAP = 255;
export const TRADE_DEADLINE_WEEK = 9;

export const PHASE_LABEL: Record<Phase, string> = {
  preseason: "Preseason", regular: "Regular season", playoffs: "Playoffs", resign: "Re-sign players", combine: "Scouting combine",
  fa: "Free agency", draft: "Draft", camp: "Training camp", cutdown: "Cutdown to 53",
};
export const OFFSEASON: Phase[] = ["resign", "combine", "fa", "draft", "camp", "cutdown"];

export function newCareer(o: { seed: number; teamId: number; coachName: string; slot: number; teams?: TeamSeed[] }): Career {
  const L = generateLeague(o.seed, o.teams ?? DEFAULT_TEAMS);
  const c: Career = {
    version: 1,
    seed: o.seed,
    slot: o.slot,
    coachName: o.coachName.trim() || "Coach",
    userTeam: o.teamId,
    year: START_YEAR,
    phase: "regular",
    week: 1,
    cap: BASE_CAP,
    teams: L.teams,
    players: L.players,
    nextId: L.nextId,
    schedule: buildSchedule(L.teams, START_YEAR, o.seed),
    seasonStats: {},
    picks: [],
    prospects: [],
    scoutPoints: SCOUT_POINTS_PER_SEASON,
    inbox: [],
    offers: [],
    coachPool: [],
    history: [],
    hallOfFame: [],
    records: {},
    trophies: [],
    jobSecurity: 60,
    goal: "",
    training: { focus: "Balanced", intensity: "Normal" },
    deadCap: {},
    pressPending: false,
    log: [],
    coachMode: true,
    updatedAt: Date.now(),
  };
  // Free-agent pool.
  const r = rngFor(o.seed, "fa0");
  for (let i = 0; i < 70; i++) {
    const pos = pick(r, ROSTER_TEMPLATE)[0];
    const p = generatePlayer(r, { pos, quality: gauss(r, 58, 6), id: c.nextId++, teamId: null, age: randInt(r, 25, 34) });
    p.contract = { years: [] };
    c.players[p.id] = p;
  }
  // Fit every team under the cap.
  for (const t of c.teams) fitUnderCap(c, t.id);
  makePicks(c, c.year + 1);
  makePicks(c, c.year + 2);
  generateDraftClass(c, c.year + 1);
  c.coachPool = coachPool(c);
  c.goal = seasonGoal(c);
  inbox(c, "owner", "The owner", `Welcome to ${teamName(c, c.userTeam)}`, `Your goal for ${c.year}: ${c.goal}. Keep the owner happy and the job is yours.`);
  return c;
}

export const userTeam = (c: Career): Team => c.teams[c.userTeam];
export const teamName = (c: Career, id: number) => `${c.teams[id].city} ${c.teams[id].name}`;
export const isProspect = (c: Career, id: number) => c.prospects.some((p) => p.playerId === id);

export function freeAgents(c: Career): Player[] {
  const prospects = new Set(c.prospects.map((p) => p.playerId));
  return Object.values(c.players).filter((p) => p.teamId === null && !p.retired && !prospects.has(p.id));
}

export function inbox(c: Career, kind: InboxItem["kind"], from: string, subject: string, body: string, tradeId?: number) {
  c.inbox.unshift({ id: c.nextId++, week: weekLabel(c), from, subject, body, read: false, kind, tradeId });
  if (c.inbox.length > 80) c.inbox.length = 80;
}

export function weekLabel(c: Career): string {
  if (c.phase === "regular") return `${c.year} Week ${c.week}`;
  if (c.phase === "playoffs") return `${c.year} ${["Wild Card", "Divisional", "Conference", "Zuno Bowl"][c.week - 19] ?? "Playoffs"}`;
  return `${c.year} ${PHASE_LABEL[c.phase]}`;
}

function coachPool(c: Career): Coach[] {
  const r = rngFor(c.seed, "coaches", c.year);
  const roles: StaffRole[] = ["OC", "DC", "ST", "QB", "RB", "WR", "OL", "DL", "LB", "DB"];
  return Array.from({ length: 18 }, (_, i) => makeCoach(r, 500000 + c.year * 100 + i, roles[i % roles.length], 64));
}

function seasonGoal(c: Career): string {
  const ratings = c.teams.map((t) => ({ id: t.id, r: teamRating(t, c.players).ovr })).sort((a, b) => b.r - a.r);
  const rank = ratings.findIndex((x) => x.id === c.userTeam);
  return rank < 6 ? "Win the Zuno Bowl" : rank < 14 ? "Make the playoffs" : rank < 24 ? "Finish .500 or better" : "Show progress: win 6 games";
}

// ---------------------------------------------------------------------------
// Cap

export function deadMoney(c: Career, teamId: number, offset = 0): number {
  return c.deadCap[teamId]?.[offset] ?? 0;
}

export function payroll(c: Career, teamId: number): number {
  let s = 0;
  for (const p of teamPlayers(teamId, c.players, true)) s += p.ps ? Math.min(capHit(p), 0.25) : capHit(p);
  return Math.round((s + deadMoney(c, teamId)) * 10) / 10;
}

export const capSpace = (c: Career, teamId: number) => Math.round((c.cap - payroll(c, teamId)) * 10) / 10;

function addDead(c: Career, teamId: number, offset: number, amount: number) {
  const arr = (c.deadCap[teamId] ??= [0, 0]);
  while (arr.length <= offset) arr.push(0);
  arr[offset] = Math.round((arr[offset] + amount) * 10) / 10;
}

/** Releases a player. Guaranteed money becomes dead cap now, or split over two years with a post-June 1 designation. */
export function cutPlayer(c: Career, playerId: number, postJune1 = false): string {
  const p = c.players[playerId];
  if (p.teamId === null) return "";
  const guar = p.contract.years.reduce((s, y) => s + y.guar, 0);
  if (postJune1 && p.contract.years.length > 1) {
    addDead(c, p.teamId, 0, p.contract.years[0].guar);
    addDead(c, p.teamId, 1, guar - p.contract.years[0].guar);
  } else addDead(c, p.teamId, 0, guar);
  const team = p.teamId;
  p.teamId = null;
  p.ps = false;
  p.contract = { years: [] };
  removeFromDepth(c.teams[team], playerId);
  return `Released ${fullName(p)}. Dead money: $${guar.toFixed(1)}M.`;
}

function removeFromDepth(t: Team, playerId: number) {
  for (const k in t.depth) {
    const key = k as keyof Team["depth"];
    t.depth[key] = (t.depth[key] ?? []).filter((id) => id !== playerId);
  }
}

/** Converts half of this year's cap hit into a bonus spread over the remaining years. */
export function restructure(c: Career, playerId: number): string {
  const p = c.players[playerId];
  const yrs = p.contract.years;
  if (yrs.length < 2) return "Only multi-year contracts can be restructured.";
  const move = Math.round(Math.max(0, yrs[0].cap - 1.2) * 0.5 * 10) / 10;
  if (move < 0.5) return "There isn't enough salary to restructure.";
  const per = move / yrs.length;
  yrs[0].cap = Math.round((yrs[0].cap - move + per) * 10) / 10;
  for (let i = 1; i < yrs.length; i++) yrs[i].cap = Math.round((yrs[i].cap + per) * 10) / 10;
  for (const y of yrs) y.guar = Math.max(y.guar, Math.round(per * 10) / 10);
  return `Restructured ${fullName(p)}: $${(move - per).toFixed(1)}M of space this year.`;
}

export function tagValue(c: Career, pos: Pos): number {
  const hits = Object.values(c.players).filter((p) => p.pos === pos && p.teamId !== null).map(capHit).sort((a, b) => b - a).slice(0, 5);
  return Math.round(Math.max(3, hits.reduce((s, x) => s + x, 0) / Math.max(1, hits.length)) * 10) / 10;
}

export function franchiseTag(c: Career, playerId: number): string {
  const p = c.players[playerId];
  if (c.phase !== "resign") return "The franchise tag can only be used while re-signing players.";
  if (p.contract.years.length !== 1) return "Only players with an expiring contract can be tagged.";
  if (teamPlayers(p.teamId!, c.players).some((x) => x.contract.tagged)) return "You have already used the tag this year.";
  const v = tagValue(c, p.pos);
  p.contract = { years: [{ cap: p.contract.years[0].cap, guar: p.contract.years[0].guar }, { cap: v, guar: v }], tagged: true };
  return `${fullName(p)} is franchise-tagged for one year at $${v}M.`;
}

// ---------------------------------------------------------------------------
// Contract talks

export function askingSalary(c: Career, p: Player): number {
  const mood = p.teamId === c.userTeam ? (70 - p.morale) / 300 : 0;
  return Math.round(marketValue(p.pos, ovr(p), p.age) * (1 + mood) * 10) / 10;
}
export const askingYears = (p: Player) => (p.age >= 32 ? 1 : p.age >= 29 ? 2 : p.age >= 26 ? 4 : 5);

export interface Offer {
  years: number;
  salary: number;
  guarantee: number; // 0..1
  incentives: number; // $M per year of incentives (not counted against the cap here)
}

/** How a player feels about an offer, 0..1+. 1 or more means yes. */
export function offerInterest(c: Career, p: Player, teamId: number, o: Offer): number {
  const ask = askingSalary(c, p);
  const money = (o.salary + o.incentives * 0.4) / Math.max(0.5, ask);
  const st = computeStandings(c.teams, c.schedule);
  const s = st[teamId];
  const lastYear = c.history[c.history.length - 1]?.standings.find((x) => x.teamId === teamId);
  const contender = s && s.w + s.l > 3 ? pct(s.w, s.l, s.t) : lastYear ? pct(lastYear.w, lastYear.l, lastYear.t) : teamRating(c.teams[teamId], c.players).ovr / 100;
  const sameGroup = teamPlayers(teamId, c.players).filter((x) => x.pos === p.pos && x.id !== p.id);
  const role = sameGroup.filter((x) => ovr(x) > ovr(p)).length < 1 ? 1 : 0.4;
  const yearFit = 1 - Math.abs(o.years - askingYears(p)) * 0.04;
  const loyalty = p.teamId === teamId ? (p.morale - 50) / 400 : 0;
  return money * 0.72 + contender * 0.12 + role * 0.1 + o.guarantee * 0.12 + loyalty - 0.06 + (yearFit - 1);
}

export function signPlayer(c: Career, playerId: number, teamId: number, o: Offer, force = false): { ok: boolean; message: string } {
  const p = c.players[playerId];
  const interest = offerInterest(c, p, teamId, o);
  if (!force && interest < 1) {
    const ask = askingSalary(c, p);
    return { ok: false, message: `${fullName(p)} turns it down. Agent: "We're looking for about $${ask}M a year over ${askingYears(p)} years."` };
  }
  const prevCap = p.teamId === teamId ? capHit(p) : 0;
  if (o.salary - prevCap > capSpace(c, teamId) + 0.01) return { ok: false, message: "Not enough cap space." };
  const resigning = p.teamId === teamId;
  if (!resigning && teamPlayers(teamId, c.players).length >= ROSTER_MAX + (OFFSEASON.includes(c.phase) && c.phase !== "cutdown" ? 37 : 0)) return { ok: false, message: "Your roster is full. Release someone first." };
  const contract = makeContract(o.salary, o.years, o.guarantee);
  if (resigning && p.contract.years.length) {
    // Extension: new years start after the current one.
    p.contract = { years: [p.contract.years[0], ...contract.years] };
  } else p.contract = contract;
  if (!resigning) {
    p.teamId = teamId;
    p.ps = false;
    const taken = new Set(teamPlayers(teamId, c.players, true).filter((x) => x.id !== p.id).map((x) => x.num));
    assignNumber(rngFor(c.seed, "num", p.id), p, taken);
    autoDepthIfAi(c, teamId);
  }
  p.morale = clamp(p.morale + 8, 0, 100);
  return { ok: true, message: `${fullName(p)} signs: ${o.years} yr, $${o.salary}M/yr.` };
}

function autoDepthIfAi(c: Career, teamId: number) {
  if (teamId !== c.userTeam) autoDepth(c.teams[teamId], c.players);
  else {
    // Put new arrivals at the bottom of their slots so the chart stays valid.
    const t = c.teams[teamId];
    const all = teamPlayers(teamId, c.players);
    const listed = new Set(Object.values(t.depth).flat());
    if (all.some((p) => !listed.has(p.id))) {
      const keep = JSON.stringify(t.depth);
      autoDepth(t, c.players);
      const old = JSON.parse(keep) as Team["depth"];
      for (const k in old) {
        const slot = k as keyof Team["depth"];
        const fresh = t.depth[slot] ?? [];
        const kept = (old[slot] ?? []).filter((id) => c.players[id]?.teamId === teamId);
        t.depth[slot] = [...kept, ...fresh.filter((id) => !kept.includes(id))];
      }
    }
  }
}

/** Cuts the cheapest-value veterans until a team is under the cap. */
function fitUnderCap(c: Career, teamId: number) {
  let guard = 0;
  while (capSpace(c, teamId) < 2 && guard++ < 30) {
    const roster = teamPlayers(teamId, c.players).filter((p) => p.contract.years.length);
    const worst = roster.sort((a, b) => ovr(a) / Math.max(1, capHit(a)) - ovr(b) / Math.max(1, capHit(b)))[0];
    if (!worst) break;
    // Trim the contract instead of cutting at league start.
    worst.contract.years = worst.contract.years.map((y) => ({ cap: Math.round(y.cap * 0.6 * 10) / 10, guar: Math.round(y.guar * 0.6 * 10) / 10 }));
  }
}

// ---------------------------------------------------------------------------
// Trades

export function playerTradeValue(p: Player): number {
  const r = ovr(p);
  const ageF = p.age <= 25 ? 1.15 : p.age <= 28 ? 1 : p.age <= 30 ? 0.8 : p.age <= 32 ? 0.55 : 0.3;
  const posF = p.pos === "QB" ? 1.6 : ["K", "P", "LS"].includes(p.pos) ? 0.25 : ["DE", "OT", "WR", "CB"].includes(p.pos) ? 1.15 : 1;
  const base = Math.pow(Math.max(0, r - 50), 2.2) * 0.9;
  const surplus = (marketValue(p.pos, r, p.age) - capHit(p)) * 6;
  return Math.max(1, base * ageF * posF + surplus);
}

/** Classic value chart, roughly. */
export function pickValue(c: Career, p: DraftPick): number {
  const overall = p.overall ?? (p.round - 1) * 32 + 16;
  const v = 3000 * Math.exp(-0.072 * (overall - 1)) + 20;
  const future = p.year > c.year + (OFFSEASON.includes(c.phase) && c.phase !== "resign" && c.phase !== "combine" && c.phase !== "fa" && c.phase !== "draft" ? 1 : 0) ? 0.85 : 1;
  return (v / 6) * future;
}

export const findPick = (c: Career, key: string) => c.picks.find((p) => pickKey(p) === key && p.playerId === undefined);

export function tradeWindowOpen(c: Career): boolean {
  if (c.phase === "regular") return c.week <= TRADE_DEADLINE_WEEK;
  if (c.phase === "playoffs") return false;
  return true;
}

export interface TradeEval {
  ok: boolean;
  giveValue: number;
  getValue: number;
  message: string;
}

/** The AI team's view: what it receives (user's give) against what it sends (user's get). */
export function evaluateTrade(c: Career, otherTeam: number, give: { players: number[]; picks: string[] }, get: { players: number[]; picks: string[] }): TradeEval {
  const value = (side: { players: number[]; picks: string[] }) =>
    side.players.reduce((s, id) => s + playerTradeValue(c.players[id]), 0) + side.picks.reduce((s, k) => s + (findPick(c, k) ? pickValue(c, findPick(c, k)!) : 0), 0);
  const giveValue = value(give);
  const getValue = value(get);
  if (!tradeWindowOpen(c)) return { ok: false, giveValue, getValue, message: "The trade deadline has passed." };
  if (!give.players.length && !give.picks.length) return { ok: false, giveValue, getValue, message: "Add something to give." };
  const inCap = give.players.reduce((s, id) => s + capHit(c.players[id]), 0);
  const outCap = get.players.reduce((s, id) => s + capHit(c.players[id]), 0);
  if (capSpace(c, otherTeam) - inCap + outCap < 0) return { ok: false, giveValue, getValue, message: `${c.teams[otherTeam].name} can't fit that under the cap.` };
  if (capSpace(c, c.userTeam) - outCap + inCap < 0) return { ok: false, giveValue, getValue, message: "You can't fit that under the cap." };
  const ok = giveValue >= getValue * 1.08 + 4;
  return { ok, giveValue, getValue, message: ok ? "They'll take it." : giveValue >= getValue * 0.9 ? "Close. They want a little more." : "Not interested." };
}

export function executeTrade(c: Career, otherTeam: number, give: { players: number[]; picks: string[] }, get: { players: number[]; picks: string[] }) {
  for (const id of give.players) { removeFromDepth(c.teams[c.userTeam], id); c.players[id].teamId = otherTeam; c.players[id].ps = false; }
  for (const id of get.players) { removeFromDepth(c.teams[otherTeam], id); c.players[id].teamId = c.userTeam; c.players[id].ps = false; }
  for (const k of give.picks) { const p = findPick(c, k); if (p) p.owner = otherTeam; }
  for (const k of get.picks) { const p = findPick(c, k); if (p) p.owner = c.userTeam; }
  autoDepth(c.teams[otherTeam], c.players);
  autoDepthIfAi(c, c.userTeam);
  const names = (ids: number[]) => ids.map((id) => fullName(c.players[id]));
  inbox(c, "news", "League office", "Trade completed", `${userTeam(c).abbr} send ${[...names(give.players), ...give.picks].join(", ") || "nothing"} to ${c.teams[otherTeam].abbr} for ${[...names(get.players), ...get.picks].join(", ") || "nothing"}.`);
}

function maybeTradeOffer(c: Career) {
  if (!tradeWindowOpen(c) || c.offers.length >= 3) return;
  const r = rngFor(c.seed, "offer", c.year, c.week, c.phase);
  if (r() > 0.22) return;
  const mine = teamPlayers(c.userTeam, c.players).filter((p) => ovr(p) >= 70 && p.pos !== "QB");
  if (!mine.length) return;
  const target = pick(r, mine);
  const others = c.teams.filter((t) => t.id !== c.userTeam);
  const from = pick(r, others);
  const want = playerTradeValue(target);
  const theirPicks = c.picks.filter((p) => p.owner === from.id && p.playerId === undefined).sort((a, b) => pickValue(c, b) - pickValue(c, a));
  const theirPlayers = teamPlayers(from.id, c.players).filter((p) => p.pos !== target.pos && ovr(p) >= 62).sort(() => r() - 0.5);
  const get: TradeOffer["get"] = { players: [], picks: [] };
  let v = 0;
  for (const p of theirPlayers) {
    if (v >= want * 0.95) break;
    const pv = playerTradeValue(p);
    if (pv < want * 0.8) { get.players.push(p.id); v += pv; break; }
  }
  for (const pk of theirPicks.reverse()) {
    if (v >= want * 0.95) break;
    get.picks.push(pickKey(pk));
    v += pickValue(c, pk);
  }
  if (v < want * 0.85) return;
  const offer: TradeOffer = { id: c.nextId++, fromTeam: from.id, give: { players: [target.id], picks: [] }, get };
  c.offers.push(offer);
  inbox(c, "trade", `${from.city} GM`, `Trade offer for ${fullName(target)}`, `${from.city} want ${fullName(target)} (${target.pos}, ${ovr(target)}). Open Trades to see the full offer.`, offer.id);
}

export function respondToOffer(c: Career, offerId: number, accept: boolean): string {
  const o = c.offers.find((x) => x.id === offerId);
  if (!o) return "";
  c.offers = c.offers.filter((x) => x.id !== offerId);
  if (!accept) return "Offer declined.";
  const stillValid = o.give.players.every((id) => c.players[id].teamId === c.userTeam) && o.get.players.every((id) => c.players[id].teamId === o.fromTeam);
  if (!stillValid || !tradeWindowOpen(c)) return "That offer is no longer valid.";
  executeTrade(c, o.fromTeam, o.give, o.get);
  return "Trade accepted.";
}

// ---------------------------------------------------------------------------
// Weekly flow

export function gamesThisWeek(c: Career): ScheduledGame[] {
  return c.schedule.filter((g) => g.week === c.week);
}

export function userGame(c: Career): ScheduledGame | null {
  return gamesThisWeek(c).find((g) => g.home === c.userTeam || g.away === c.userTeam) ?? null;
}

export const gameSeed = (c: Career, g: ScheduledGame) => hashSeed(c.seed, c.year, g.id);

/** Applies a finished game: stats, injuries, fatigue, morale. */
export function recordResult(c: Career, g: ScheduledGame, result: GameResult) {
  const userInvolved = g.home === c.userTeam || g.away === c.userTeam;
  // Keep saves small: full highlights only for your games.
  g.result = userInvolved ? result : { ...result, highlights: result.highlights.slice(-3), players: {}, log: result.log.slice(-12) };
  for (const k in result.players) {
    const id = Number(k);
    const s = (c.seasonStats[id] ??= emptyStats());
    addStats(s, result.players[id]);
  }
  for (const inj of result.injuries) {
    const p = c.players[inj.playerId];
    if (!p) continue;
    p.injury = { name: inj.name, weeks: inj.weeks, ir: false };
    if (p.teamId === c.userTeam) inbox(c, "injury", "Team doctor", `${fullName(p)} injured`, `${fullName(p)} (${p.pos}) has a ${inj.name.toLowerCase()} and is expected to miss ${inj.weeks} week${inj.weeks === 1 ? "" : "s"}.${inj.weeks >= 4 ? " Consider placing him on injured reserve." : ""}`);
    if (p.teamId !== null && p.teamId !== c.userTeam) autoDepth(c.teams[p.teamId], c.players);
  }
  if (userInvolved && !g.round) {
    const homeWon = result.score[0] > result.score[1];
    const tie = result.score[0] === result.score[1];
    const won = !tie && (g.home === c.userTeam ? homeWon : !homeWon);
    const t = userTeam(c);
    const swing = (100 - t.ownerPatience) / 50 + 0.6;
    c.jobSecurity = clamp(c.jobSecurity + (tie ? 0 : won ? 1.2 * swing : -1.3 * swing), 0, 100);
    for (const p of teamPlayers(c.userTeam, c.players)) p.morale = clamp(p.morale + (won ? 2 : tie ? 0 : -2), 0, 100);
    c.pressPending = true;
  }
}

/** Simulates every unplayed game this week except, optionally, the user's. */
export function simWeek(c: Career, skipUser = false) {
  for (const g of gamesThisWeek(c)) {
    if (g.result) continue;
    if (skipUser && (g.home === c.userTeam || g.away === c.userTeam)) continue;
    const { result } = simulateGame({ home: c.teams[g.home], away: c.teams[g.away], players: c.players, seed: gameSeed(c, g), playoff: !!g.round, neutral: g.neutral, week: g.week });
    recordResult(c, g, result);
  }
}

export function finishLiveGame(c: Career, g: ScheduledGame, state: GameState) {
  recordResult(c, g, finishGame(state));
}

/** Moves the career forward one step: the next week, the next playoff round, or the next offseason stage. */
export function advance(c: Career): string {
  c.pressPending = false;
  if (c.phase === "regular") {
    simWeek(c);
    endOfWeek(c);
    if (c.week >= 18) {
      startPlayoffs(c);
      return "The regular season is over. Playoffs are set.";
    }
    c.week++;
    if (c.week === TRADE_DEADLINE_WEEK + 1) inbox(c, "news", "League office", "Trade deadline passed", "Trades are closed until the offseason.");
    return `Week ${c.week}`;
  }
  if (c.phase === "playoffs") {
    simWeek(c);
    endOfWeek(c);
    return nextPlayoffRound(c);
  }
  const i = OFFSEASON.indexOf(c.phase);
  const next = OFFSEASON[i + 1];
  if (c.phase === "resign") expireContracts(c);
  if (c.phase === "combine") revealCombine(c);
  if (c.phase === "fa") aiFreeAgency(c, 3);
  if (c.phase === "draft") {
    while (currentPick(c)) {
      const pk = currentPick(c)!;
      const id = aiPick(c, pk.owner);
      if (id === null) break;
      draftPlayer(c, id);
    }
    undrafted(c);
  }
  if (c.phase === "camp") campProgress(c);
  if (c.phase === "cutdown") {
    for (const t of c.teams) cutdown(c, t.id);
    newSeason(c);
    return `The ${c.year} season begins.`;
  }
  c.phase = next;
  if (next === "fa") aiFreeAgency(c, 1);
  if (next === "draft") assignOverall(c, c.year);
  return PHASE_LABEL[next];
}

function endOfWeek(c: Career) {
  const r = rngFor(c.seed, "week", c.year, c.week);
  for (const p of Object.values(c.players)) {
    if (p.teamId === null) continue;
    if (p.injury) {
      p.injury.weeks--;
      if (p.injury.weeks <= 0) {
        if (p.teamId === c.userTeam) inbox(c, "injury", "Team doctor", `${fullName(p)} cleared`, `${fullName(p)} is healthy again.${p.injury.ir ? " He's been activated from injured reserve." : ""}`);
        p.injury = null;
        if (p.teamId !== c.userTeam) autoDepth(c.teams[p.teamId], c.players);
      }
    }
    p.fatigue = Math.max(0, p.fatigue - 10);
  }
  // Training for your team.
  const tr = c.training;
  const focusGroups: Record<string, string[]> = { Offense: ["QB", "RB", "WR", "OL"], Defense: ["DL", "LB", "DB"], Balanced: ["QB", "RB", "WR", "OL", "DL", "LB", "DB", "ST"], Rookies: [], Conditioning: [] };
  const mult = tr.intensity === "Hard" ? 1.6 : tr.intensity === "Light" ? 0.5 : 1;
  for (const p of teamPlayers(c.userTeam, c.players, true)) {
    if (p.injury) continue;
    const inFocus = tr.focus === "Rookies" ? p.yrs <= 1 : tr.focus === "Conditioning" ? false : focusGroups[tr.focus].includes(POS_GROUP[p.pos]);
    if (inFocus && r() < 0.12 * mult * (0.5 + p.work / 100) * (tr.focus === "Balanced" ? 0.6 : 1) && ovr(p) < p.pot) bumpAttrs(p, 1, r);
    if (tr.focus === "Conditioning") p.fatigue = 0;
    if (tr.intensity === "Hard" && r() < 0.004 * (0.5 + p.injProne / 60)) {
      p.injury = { name: "Practice injury", weeks: 1 + Math.floor(r() * 3), ir: false };
      inbox(c, "injury", "Team doctor", `${fullName(p)} hurt in practice`, `${fullName(p)} will miss ${p.injury.weeks} week(s). Hard practices carry more risk.`);
    }
  }
  // AI rosters: fill holes from free agency.
  for (const t of c.teams) if (t.id !== c.userTeam) fillRoster(c, t.id, false);
  maybeTradeOffer(c);
  if (c.phase === "regular" && c.week % 4 === 0) {
    const st = computeStandings(c.teams, c.schedule);
    const top = rankTeams(c.teams.map((t) => t.id), c.teams, st, c.schedule, c.seed)[0];
    inbox(c, "media", "Zuno Sports Network", `Power rankings, week ${c.week}`, `${teamName(c, top)} sit on top at ${recordText(st[top])}. Your ${userTeam(c).name} are ${recordText(st[c.userTeam])}.`);
  }
}

function bumpAttrs(p: Player, amount: number, r: () => number) {
  const keys = (Object.keys(p.attrs) as AttrKey[]).sort(() => r() - 0.5).slice(0, 3);
  for (const k of keys) p.attrs[k] = clamp(p.attrs[k] + amount, 1, 99);
}

// ---------------------------------------------------------------------------
// Playoffs

function startPlayoffs(c: Career) {
  c.phase = "playoffs";
  c.week = 19;
  const st = computeStandings(c.teams, c.schedule);
  for (const conf of [0, 1]) {
    const seeds = playoffSeeds(conf, c.teams, st, c.schedule, c.seed);
    const pairs: Array<[number, number]> = [[1, 6], [2, 5], [3, 4]];
    for (const [a, b] of pairs) c.schedule.push({ id: c.year * 1000 + 900 + conf * 10 + a, week: 19, home: seeds[a], away: seeds[b], round: "WC" });
    if (seeds.includes(c.userTeam)) inbox(c, "news", "League office", "Playoff berth!", `${userTeam(c).name} are the ${["AT", "PA"][conf]}C #${seeds.indexOf(c.userTeam) + 1} seed.`);
  }
  c.log.push(`${c.year} playoffs set.`);
}

export function playoffSeedMap(c: Career): Record<number, number> {
  const st = computeStandings(c.teams, c.schedule);
  const out: Record<number, number> = {};
  for (const conf of [0, 1]) playoffSeeds(conf, c.teams, st, c.schedule, c.seed).forEach((id, i) => (out[id] = i + 1));
  return out;
}

const winnerOf = (g: ScheduledGame) => (g.result!.score[0] > g.result!.score[1] ? g.home : g.away);

function nextPlayoffRound(c: Career): string {
  const seeds = playoffSeedMap(c);
  const round = c.week;
  const games = c.schedule.filter((g) => g.week === round);
  if (round === 22) {
    const bowl = games[0];
    const champ = winnerOf(bowl);
    endSeason(c, champ, champ === bowl.home ? bowl.away : bowl.home);
    return `${teamName(c, champ)} win the Zuno Bowl!`;
  }
  c.week++;
  if (round === 19) {
    for (const conf of [0, 1]) {
      const alive = [c.teams.find((t) => t.conf === conf && seeds[t.id] === 1)!.id, ...games.filter((g) => c.teams[g.home].conf === conf).map(winnerOf)].sort((a, b) => seeds[a] - seeds[b]);
      c.schedule.push({ id: c.year * 1000 + 950 + conf * 10, week: 20, home: alive[0], away: alive[3], round: "DIV" });
      c.schedule.push({ id: c.year * 1000 + 951 + conf * 10, week: 20, home: alive[1], away: alive[2], round: "DIV" });
    }
    return "Divisional round";
  }
  if (round === 20) {
    for (const conf of [0, 1]) {
      const alive = games.filter((g) => c.teams[g.home].conf === conf).map(winnerOf).sort((a, b) => seeds[a] - seeds[b]);
      c.schedule.push({ id: c.year * 1000 + 980 + conf, week: 21, home: alive[0], away: alive[1], round: "CONF" });
    }
    return "Conference championships";
  }
  const champs = games.map(winnerOf);
  c.schedule.push({ id: c.year * 1000 + 999, week: 22, home: champs[0], away: champs[1], round: "BOWL", neutral: true });
  return "The Zuno Bowl";
}

// ---------------------------------------------------------------------------
// Season end, awards, history

function statScore(p: Player, s: StatLine): number {
  return s.pYds / 25 + s.pTd * 4 - s.pInt * 2 + s.rYds / 10 + s.rTd * 6 + s.recYds / 10 + s.recTd * 6 + s.sck * 5 + s.dInt * 6 + s.tkl * 0.8 + s.ff * 3 + s.pd * 1.5 + s.defTd * 6 + s.fgm * 1.5 + ovr(p) * 0.6;
}

function endSeason(c: Career, champ: number, runnerUp: number) {
  const st = computeStandings(c.teams, c.schedule);
  const players = Object.values(c.players).filter((p) => p.teamId !== null && c.seasonStats[p.id]);
  const best = (filter: (p: Player) => boolean, score: (p: Player, s: StatLine) => number = statScore) => {
    let top: Player | null = null;
    let v = -1e9;
    for (const p of players) {
      if (!filter(p)) continue;
      const winBonus = pct(st[p.teamId!].w, st[p.teamId!].l, st[p.teamId!].t) * 30;
      const x = score(p, c.seasonStats[p.id]) + winBonus;
      if (x > v) { v = x; top = p; }
    }
    return top;
  };
  const offense = (p: Player) => ["QB", "RB", "WR", "TE"].includes(p.pos);
  const defense = (p: Player) => ["DE", "DT", "OLB", "MLB", "CB", "FS", "SS"].includes(p.pos);
  const mvp = best((p) => p.pos === "QB" || p.pos === "RB", (p, s) => statScore(p, s) + (p.pos === "QB" ? passerRating(s) * 0.6 : 0));
  const opoy = best((p) => offense(p) && p !== mvp);
  const dpoy = best(defense);
  const roty = best((p) => p.yrs === 0);
  const improvement = (id: number) => {
    const prev = c.history[c.history.length - 1]?.standings.find((x) => x.teamId === id);
    return st[id].w - (prev ? prev.w : 8);
  };
  const coy = c.teams.map((t) => t.id).sort((a, b) => improvement(b) + st[b].w * 0.5 - (improvement(a) + st[a].w * 0.5))[0];
  const award = (label: string, p: Player | null) => {
    if (p) p.awards.push(`${c.year} ${label}`);
    return { playerId: p?.id ?? null, teamId: p?.teamId ?? null, name: p ? fullName(p) : "—" };
  };
  const allPro: number[] = [];
  const slots: Array<[Pos, number]> = [["QB", 1], ["RB", 1], ["WR", 3], ["TE", 1], ["OT", 2], ["OG", 2], ["C", 1], ["DE", 2], ["DT", 2], ["OLB", 2], ["MLB", 1], ["CB", 2], ["FS", 1], ["SS", 1], ["K", 1], ["P", 1]];
  for (const [pos, n] of slots) {
    players.filter((p) => p.pos === pos).sort((a, b) => statScore(b, c.seasonStats[b.id]) - statScore(a, c.seasonStats[a.id])).slice(0, n).forEach((p) => {
      allPro.push(p.id);
      p.awards.push(`${c.year} All-Pro`);
    });
  }
  const userSt = st[c.userTeam];
  const seeds = playoffSeedMap(c);
  const userPlayoff = c.schedule.filter((g) => g.round && (g.home === c.userTeam || g.away === c.userTeam));
  const lastRound = userPlayoff[userPlayoff.length - 1];
  const finish = champ === c.userTeam ? "Won the Zuno Bowl" : lastRound ? `Lost in the ${{ WC: "Wild Card round", DIV: "Divisional round", CONF: "Conference championship", BOWL: "Zuno Bowl" }[lastRound.round!]}` : seeds[c.userTeam] ? "Playoffs" : "Missed the playoffs";
  c.history.push({
    year: c.year,
    champion: champ,
    runnerUp,
    awards: {
      MVP: award("MVP", mvp),
      OPOY: award("Offensive Player of the Year", opoy),
      DPOY: award("Defensive Player of the Year", dpoy),
      ROTY: award("Rookie of the Year", roty),
      COY: { playerId: null, teamId: coy, name: coy === c.userTeam ? c.coachName : `${c.teams[coy].name} head coach` },
    },
    allPro,
    userRecord: [userSt.w, userSt.l, userSt.t],
    userFinish: finish,
    standings: c.teams.map((t) => ({ teamId: t.id, w: st[t.id].w, l: st[t.id].l, t: st[t.id].t })),
  });
  if (champ === c.userTeam) c.trophies.push({ year: c.year, title: "Zuno Bowl champions" });
  const divWinner = divisionOrder(userTeam(c).conf, userTeam(c).div, c.teams, st, c.schedule, c.seed)[0] === c.userTeam;
  if (divWinner) c.trophies.push({ year: c.year, title: "Division champions" });
  // Franchise records.
  for (const p of teamPlayers(c.userTeam, c.players, true)) {
    const s = c.seasonStats[p.id];
    if (!s) continue;
    const check = (key: string, value: number) => {
      const rec = c.records[key];
      if (value > 0 && (!rec || value > rec.value)) c.records[key] = { value, playerId: p.id, year: c.year, name: fullName(p) };
    };
    check("Passing yards (season)", s.pYds);
    check("Passing TDs (season)", s.pTd);
    check("Rushing yards (season)", s.rYds);
    check("Receiving yards (season)", s.recYds);
    check("Sacks (season)", s.sck);
    check("Interceptions (season)", s.dInt);
  }
  // Owner verdict.
  const goalMet = goalAchieved(c, c.goal, userSt.w, finish, champ === c.userTeam, !!seeds[c.userTeam]);
  c.jobSecurity = clamp(c.jobSecurity + (goalMet ? 15 : -18), 0, 100);
  inbox(c, "owner", "The owner", goalMet ? "A season to build on" : "We expected more", goalMet ? `You met the goal (${c.goal}). Your job is safe.` : `The goal was: ${c.goal}. Job security is now ${Math.round(c.jobSecurity)}.`);
  // Stats into careers.
  for (const id in c.seasonStats) {
    const p = c.players[Number(id)];
    if (p) p.career.push({ year: c.year, teamId: p.teamId ?? -1, stats: packStats(c.seasonStats[Number(id)]) });
  }
  c.phase = "resign";
  c.week = 0;
  offseasonDevelopment(c);
  c.scoutPoints = SCOUT_POINTS_PER_SEASON;
}

function goalAchieved(_c: Career, goal: string, wins: number, _finish: string, champ: boolean, playoffs: boolean): boolean {
  if (goal.startsWith("Win the Zuno")) return champ;
  if (goal.startsWith("Make the playoffs")) return playoffs;
  if (goal.startsWith("Finish .500")) return wins >= 9;
  return wins >= 6;
}

export const isFired = (c: Career) => c.jobSecurity <= 5 && c.phase === "resign";

function offseasonDevelopment(c: Career) {
  const r = rngFor(c.seed, "dev", c.year);
  for (const p of Object.values(c.players)) {
    if (p.retired) continue;
    if (isProspect(c, p.id)) continue;
    const team = p.teamId !== null ? c.teams[p.teamId] : null;
    const coachDev = team ? (team.staff[POS_GROUP[p.pos] as StaffRole]?.dev ?? 1) : 0;
    const devMult = p.dev === "Superstar" ? 1.6 : p.dev === "Star" ? 1.3 : 1;
    let delta: number;
    if (p.age < 24) delta = gauss(r, 3.2, 2) * devMult;
    else if (p.age < 28) delta = gauss(r, 1.2, 1.6) * devMult;
    else if (p.age < 31) delta = gauss(r, -0.6, 1.5);
    else delta = gauss(r, -2.6, 1.8);
    delta += (p.work - 50) / 40 + coachDev * 0.25;
    const room = p.pot - ovr(p);
    if (delta > 0) delta = Math.min(delta, Math.max(0.5, room));
    const keys = Object.keys(p.attrs) as AttrKey[];
    for (const k of keys) {
      const w = k === "spd" && delta > 0 ? 0.4 : 1;
      p.attrs[k] = clamp(Math.round(p.attrs[k] + delta * w + gauss(r, 0, 0.8)), 1, 99);
    }
    if (p.age >= 30) p.attrs.spd = clamp(p.attrs.spd - randInt(r, 0, 2), 1, 99);
    p.age++;
    if (p.teamId !== null) p.yrs++;
    p.injury = p.injury && p.injury.weeks > 8 ? { ...p.injury, weeks: p.injury.weeks - 8 } : null;
    p.morale = clamp(p.morale + (70 - p.morale) * 0.4, 0, 100);
    // Retirement.
    const rating = ovr(p);
    const retireChance = p.age >= 37 ? 0.85 : p.age >= 34 ? 0.35 + (70 - rating) / 100 : p.age >= 31 && rating < 60 ? 0.3 : p.teamId === null && p.age >= 30 ? 0.4 : 0;
    if (r() < retireChance) retire(c, p);
  }
  for (const t of c.teams) autoDepth(t, c.players);
}

function retire(c: Career, p: Player) {
  const wasUser = p.teamId === c.userTeam;
  if (p.teamId !== null) removeFromDepth(c.teams[p.teamId], p.id);
  p.retired = true;
  p.teamId = null;
  p.contract = { years: [] };
  const total = p.career.reduce((s, x) => s + statScore(p, fullStats(x.stats)) - ovr(p) * 0.6, 0);
  const allPros = p.awards.filter((a) => a.includes("All-Pro")).length;
  const big = p.awards.filter((a) => /MVP|Player of the Year/.test(a)).length;
  if (allPros >= 4 || big >= 1 && allPros >= 2 || total > 2600) {
    c.hallOfFame.push({ playerId: p.id, year: c.year + 5, name: fullName(p), pos: p.pos });
    inbox(c, "news", "Hall of Fame", `${fullName(p)} headed to the Hall`, `${fullName(p)} retires and will be enshrined in ${c.year + 5}.`);
  } else if (wasUser) inbox(c, "news", "Front office", `${fullName(p)} retires`, `${fullName(p)} (${p.pos}, age ${p.age}) has retired.`);
}

/** Contracts tick over: expiring deals end and those players hit free agency. */
function expireContracts(c: Career) {
  const r = rngFor(c.seed, "resign", c.year);
  for (const p of Object.values(c.players)) {
    if (p.teamId === null || p.retired) continue;
    if (p.contract.years.length <= 1) {
      // AI teams re-sign their good players.
      if (p.teamId !== c.userTeam && ovr(p) >= 66 && p.age <= 31 && r() < 0.65) {
        const sal = askingSalary(c, p);
        p.contract = makeContract(sal, askingYears(p), 0.4);
        continue;
      }
      if (p.teamId === c.userTeam) inbox(c, "agent", "Agent", `${fullName(p)} hits free agency`, `${fullName(p)} (${p.pos}, ${ovr(p)}) is now a free agent. You can still bid for him.`);
      removeFromDepth(c.teams[p.teamId], p.id);
      p.teamId = null;
      p.ps = false;
      p.contract = { years: [] };
    } else {
      p.contract = { ...p.contract, years: p.contract.years.slice(1), tagged: false };
    }
  }
  // Dead money rolls forward.
  for (const k in c.deadCap) c.deadCap[k] = c.deadCap[k].slice(1).concat([0]);
  for (const t of c.teams) autoDepth(t, c.players);
}

function revealCombine(c: Career) {
  for (const pr of c.prospects) if (pr.scouted < 1) pr.scouted = 1;
  inbox(c, "news", "Scouting department", "Combine results are in", "40 times, bench, vertical and 3-cone for every prospect are on the draft board. Every prospect now has a first look.");
}

/** AI teams sign free agents by need, best first. */
function aiFreeAgency(c: Career, rounds: number) {
  const cap = c.cap;
  void cap;
  for (let round = 0; round < rounds; round++) {
    const pool = freeAgents(c).sort((a, b) => ovr(b) - ovr(a));
    const order = c.teams.filter((t) => t.id !== c.userTeam).sort((a, b) => hashSeed(c.seed, round, a.id) - hashSeed(c.seed, round, b.id));
    for (const t of order) {
      const roster = teamPlayers(t.id, c.players);
      if (roster.length >= ROSTER_MAX + 8) continue;
      const needs = ROSTER_TEMPLATE.filter(([pos, n]) => roster.filter((p) => p.pos === pos).length < n).map(([pos]) => pos);
      const target = pool.find((p) => p.teamId === null && (needs.includes(p.pos) || ovr(p) >= 72) && askingSalary(c, p) <= capSpace(c, t.id) - 3);
      if (!target) continue;
      signPlayer(c, target.id, t.id, { years: askingYears(target), salary: askingSalary(c, target), guarantee: 0.4, incentives: 0 }, true);
      if (ovr(target) >= 74) inbox(c, "news", "Zuno Sports Network", `${t.abbr} sign ${fullName(target)}`, `${teamName(c, t.id)} land ${target.pos} ${fullName(target)} (${ovr(target)}).`);
    }
  }
}

function undrafted(c: Career) {
  for (const pr of c.prospects) {
    const p = c.players[pr.playerId];
    p.contract = { years: [] };
  }
  c.prospects = [];
  // AI teams fill practice squads from undrafted rookies and veterans.
  for (const t of c.teams) if (t.id !== c.userTeam) fillRoster(c, t.id, true);
}

/** Keeps an AI roster at 53 + practice squad by signing cheap free agents at positions of need. */
function fillRoster(c: Career, teamId: number, offseason: boolean) {
  const roster = teamPlayers(teamId, c.players);
  const ps = teamPlayers(teamId, c.players, true).filter((p) => p.ps);
  const pool = freeAgents(c).sort((a, b) => ovr(b) - ovr(a));
  const healthy = (pos: Pos) => roster.filter((p) => p.pos === pos && !p.injury).length;
  for (const [pos, n] of ROSTER_TEMPLATE) {
    if (healthy(pos) >= Math.max(1, n - 1)) continue;
    if (roster.length >= ROSTER_MAX && !offseason) {
      // Put a long-term injured player on IR to open a spot.
      const hurt = roster.find((p) => p.injury && p.injury.weeks >= 4 && !p.injury.ir);
      if (!hurt) continue;
      hurt.injury!.ir = true;
    }
    const fa = pool.find((p) => p.pos === pos && p.teamId === null);
    if (!fa) continue;
    signPlayer(c, fa.id, teamId, { years: 1, salary: Math.min(1.2, askingSalary(c, fa)), guarantee: 0, incentives: 0 }, true);
    roster.push(fa);
  }
  if (offseason) {
    const left = PS_MAX - ps.length;
    const young = pool.filter((p) => p.teamId === null && p.age <= 25).slice(0, Math.max(0, left));
    for (const p of young) {
      p.teamId = teamId;
      p.ps = true;
      p.contract = makeContract(0.25, 1, 0);
    }
  }
}

function campProgress(c: Career) {
  const r = rngFor(c.seed, "camp", c.year);
  for (const p of Object.values(c.players)) if (p.teamId !== null && p.yrs <= 1 && ovr(p) < p.pot) bumpAttrs(p, 1 + Math.round(r() * 2), r);
  inbox(c, "news", "Coaching staff", "Training camp wrapped", "Young players took a step forward in camp. Set your 53 before the season starts.");
}

/** Trims a roster to 53 active and 16 practice squad, keeping the best by position. */
export function cutdown(c: Career, teamId: number) {
  const all = teamPlayers(teamId, c.players, true).filter((p) => !(p.injury?.ir));
  const keep = new Set<number>();
  const byPos = (pos: Pos) => all.filter((p) => p.pos === pos).sort((a, b) => ovr(b) + (b.contract.years[0]?.guar ?? 0) - ovr(a) - (a.contract.years[0]?.guar ?? 0));
  for (const [pos, n] of ROSTER_TEMPLATE) byPos(pos).slice(0, n).forEach((p) => keep.add(p.id));
  const rest = all.filter((p) => !keep.has(p.id)).sort((a, b) => ovr(b) - ovr(a));
  for (const p of rest) if (keep.size < ROSTER_MAX) keep.add(p.id);
  const ps = new Set<number>();
  for (const [pos, n] of PS_TEMPLATE) all.filter((p) => !keep.has(p.id) && p.pos === pos && p.yrs <= 3).slice(0, n).forEach((p) => ps.add(p.id));
  for (const p of all.filter((x) => !keep.has(x.id) && !ps.has(x.id) && x.yrs <= 3)) if (ps.size < PS_MAX) ps.add(p.id);
  for (const p of all) {
    if (keep.has(p.id)) p.ps = false;
    else if (ps.has(p.id)) {
      p.ps = true;
      p.contract = makeContract(0.25, 1, 0);
    } else cutPlayer(c, p.id);
  }
  autoDepth(c.teams[teamId], c.players);
}

export function rosterCounts(c: Career, teamId: number) {
  const all = teamPlayers(teamId, c.players, true);
  return { active: all.filter((p) => !p.ps && !p.injury?.ir).length, ir: all.filter((p) => p.injury?.ir).length, ps: all.filter((p) => p.ps).length };
}

/** Career stat lines are stored without zero fields to keep saves small. */
export function packStats(s: StatLine): StatLine {
  const out: Partial<StatLine> = {};
  for (const k in s) if (s[k as keyof StatLine]) out[k as keyof StatLine] = s[k as keyof StatLine];
  return out as StatLine;
}
export const fullStats = (s: Partial<StatLine>): StatLine => ({ ...emptyStats(), ...s });

/** Drops retired players and long-unsigned free agents nobody refers to. */
function prunePlayers(c: Career) {
  const keep = new Set<number>();
  for (const h of c.history) {
    h.allPro.forEach((id) => keep.add(id));
    Object.values(h.awards).forEach((a) => a.playerId !== null && keep.add(a.playerId));
  }
  c.hallOfFame.forEach((h) => keep.add(h.playerId));
  Object.values(c.records).forEach((r) => keep.add(r.playerId));
  for (const k in c.players) {
    const p = c.players[k];
    if (keep.has(p.id) || p.teamId !== null) continue;
    if (p.retired || (p.age >= 27 && ovr(p) < 58) || p.age >= 35) delete c.players[k];
  }
}

function newSeason(c: Career) {
  prunePlayers(c);
  for (const t of c.teams) {
    if (t.id === c.userTeam) continue;
    let guard = 0;
    while (capSpace(c, t.id) < 0 && guard++ < 12) {
      const worst = teamPlayers(t.id, c.players).filter((p) => (p.contract.years[0]?.guar ?? 0) < capHit(p) * 0.5).sort((a, b) => ovr(a) / Math.max(0.5, capHit(a)) - ovr(b) / Math.max(0.5, capHit(b)))[0];
      if (!worst) break;
      cutPlayer(c, worst.id);
    }
    fillRoster(c, t.id, true);
  }
  const st = computeStandings(c.teams, c.schedule);
  const place: Record<number, number> = {};
  for (const conf of [0, 1]) for (let d = 0; d < 4; d++) divisionOrder(conf, d, c.teams, st, c.schedule, c.seed).forEach((id, i) => (place[id] = i));
  c.year++;
  c.phase = "regular";
  c.week = 1;
  c.cap = Math.round(c.cap * 1.045 * 10) / 10;
  c.schedule = buildSchedule(c.teams, c.year, c.seed, place);
  c.seasonStats = {};
  c.offers = [];
  for (const p of Object.values(c.players)) if (p.injury?.ir && p.injury.weeks <= 0) p.injury = null;
  c.picks = c.picks.filter((p) => p.year > c.year - 1);
  makePicks(c, c.year + 2);
  generateDraftClass(c, c.year + 1);
  c.coachPool = coachPool(c);
  c.goal = seasonGoal(c);
  inbox(c, "owner", "The owner", `${c.year} expectations`, `This year's goal: ${c.goal}.`);
}

// ---------------------------------------------------------------------------
// Staff, press, roster moves

export function hireCoach(c: Career, coachId: number): string {
  const coach = c.coachPool.find((x) => x.id === coachId);
  if (!coach) return "";
  const t = userTeam(c);
  const old = t.staff[coach.role];
  t.staff[coach.role] = coach;
  c.coachPool = c.coachPool.filter((x) => x.id !== coachId);
  if (old) c.coachPool.push(old);
  if (coach.role === "OC" && coach.scheme) t.offScheme = coach.scheme as Team["offScheme"];
  if (coach.role === "DC" && coach.scheme) t.defBase = coach.scheme as Team["defBase"];
  return `Hired ${coach.name} as ${coach.role}.`;
}

export const PRESS_CHOICES = [
  { id: "credit", label: "Credit the players", morale: 3, job: 0 },
  { id: "blame", label: "Take the blame", morale: 2, job: -1 },
  { id: "callout", label: "Call out effort", morale: -4, job: 2 },
  { id: "hype", label: "Talk up next week", morale: 1, job: 1 },
] as const;

export function pressConference(c: Career, choice: string): string {
  const ch = PRESS_CHOICES.find((x) => x.id === choice);
  c.pressPending = false;
  if (!ch) return "";
  for (const p of teamPlayers(c.userTeam, c.players)) p.morale = clamp(p.morale + ch.morale, 0, 100);
  c.jobSecurity = clamp(c.jobSecurity + ch.job, 0, 100);
  return `You ${ch.label.toLowerCase()}. Locker room morale ${ch.morale >= 0 ? "+" : ""}${ch.morale}.`;
}

export function toggleIR(c: Career, playerId: number): string {
  const p = c.players[playerId];
  if (!p.injury) return "Only injured players can go on injured reserve.";
  if (p.injury.ir) return "He's already on injured reserve.";
  if (p.injury.weeks < 4) return "Injured reserve requires an injury of 4 weeks or more.";
  p.injury.ir = true;
  removeFromDepth(userTeam(c), playerId);
  autoDepthIfAi(c, c.userTeam);
  return `${fullName(p)} placed on injured reserve. That opens a roster spot.`;
}

export function promotePs(c: Career, playerId: number): string {
  const p = c.players[playerId];
  if (!p.ps) return "";
  if (rosterCounts(c, c.userTeam).active >= ROSTER_MAX) return "The 53-man roster is full.";
  p.ps = false;
  p.contract = makeContract(Math.max(0.9, askingSalary(c, p) * 0.6), 1, 0);
  autoDepthIfAi(c, c.userTeam);
  return `${fullName(p)} promoted to the active roster.`;
}

export function signToPs(c: Career, playerId: number): string {
  const p = c.players[playerId];
  if (p.teamId !== null) return "";
  if (rosterCounts(c, c.userTeam).ps >= PS_MAX) return "The practice squad is full.";
  if (p.yrs > 3) return "Only players with 3 or fewer years can join the practice squad.";
  p.teamId = c.userTeam;
  p.ps = true;
  p.contract = makeContract(0.25, 1, 0);
  return `${fullName(p)} signed to the practice squad.`;
}

export const pressTopic = (c: Career): string => {
  const last = c.schedule.filter((g) => g.result && (g.home === c.userTeam || g.away === c.userTeam)).sort((a, b) => b.week - a.week)[0];
  if (!last) return "";
  const mine = last.home === c.userTeam ? last.result!.score[0] : last.result!.score[1];
  const theirs = last.home === c.userTeam ? last.result!.score[1] : last.result!.score[0];
  const opp = c.teams[last.home === c.userTeam ? last.away : last.home];
  return mine > theirs ? `Reporters want your take on the ${mine}-${theirs} win over ${opp.name}.` : mine < theirs ? `Tough questions after the ${mine}-${theirs} loss to ${opp.name}.` : `A ${mine}-${theirs} tie with ${opp.name}. How do you sell it?`;
};

export function leaders(c: Career, key: keyof StatLine, n = 10, teamId?: number): Array<{ p: Player; v: number }> {
  const out: Array<{ p: Player; v: number }> = [];
  for (const k in c.seasonStats) {
    const p = c.players[Number(k)];
    if (!p || (teamId !== undefined && p.teamId !== teamId)) continue;
    const v = c.seasonStats[Number(k)][key];
    if (v > 0) out.push({ p, v });
  }
  return out.sort((a, b) => b.v - a.v).slice(0, n);
}

export function touch(c: Career) {
  c.updatedAt = Date.now();
}

