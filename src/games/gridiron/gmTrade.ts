/**
 * Trade engine for the front office. Pure functions over the existing Career data:
 * validation (ownership, duplicates, roster limits, cap), valuation breakdown, the AI's accept/reject
 * decision with reasons, before/after snapshots, and the one transaction entry point, proposeTrade.
 * The valuation is the engine's own (playerTradeValue / pickValue / evaluateTrade); nothing here invents numbers.
 */
import {
  capSpace, evaluateTrade, executeTrade, findPick, OFFSEASON, payroll, pickValue, playerTradeValue, respondToOffer, ROSTER_MAX, tradeWindowOpen, TRADE_DEADLINE_WEEK,
} from "./gmCareer";
import { pickKey, pickLabel, teamNeeds } from "./gmDraft";
import { teamPlayers } from "./gmLeague";
import { fullName, ovr } from "./gmPlayers";
import type { Career, DraftPick, Player } from "./gmTypes";

export interface TradeSide {
  players: number[];
  picks: string[];
}

export const emptySide = (): TradeSide => ({ players: [], picks: [] });
export const sideIsEmpty = (s: TradeSide) => s.players.length === 0 && s.picks.length === 0;

/** Fewest active players either club may have during the season after a trade. */
export const TRADE_ROSTER_MIN = 45;

/** The AI accepts when what it receives is worth at least this much times what it sends, plus a flat margin. Mirrors evaluateTrade. */
export const ACCEPT_MULT = 1.08;
export const ACCEPT_FLAT = 4;
export const acceptThreshold = (sendValue: number) => sendValue * ACCEPT_MULT + ACCEPT_FLAT;

export const rosterLimit = (c: Career) => ROSTER_MAX + (OFFSEASON.includes(c.phase) && c.phase !== "cutdown" ? 37 : 0);
export const activeCount = (c: Career, teamId: number) => teamPlayers(teamId, c.players).length;

// ---------------------------------------------------------------------------
// Availability

export interface PlayerAsset {
  player: Player;
  /** Why this player cannot be moved right now, or null when he can. */
  unavailable: string | null;
  value: number;
}
export interface PickAsset {
  pick: DraftPick;
  key: string;
  label: string;
  unavailable: string | null;
  value: number;
}

export function playerUnavailable(p: Player | undefined, ownerId: number): string | null {
  if (!p || p.retired) return "No longer in the league";
  if (p.teamId !== ownerId) return "Not on this roster";
  if (p.ps) return "Practice squad";
  if (p.injury?.ir) return "On injured reserve";
  return null;
}

/** Roster assets for a team: the active roster, best first. Players that cannot move are listed with the reason. */
export function rosterAssets(c: Career, teamId: number): PlayerAsset[] {
  return teamPlayers(teamId, c.players)
    .sort((a, b) => ovr(b) - ovr(a) || a.id - b.id)
    .map((player) => ({ player, unavailable: playerUnavailable(player, teamId), value: playerTradeValue(player) }));
}

/** Real, unused draft picks currently owned by the team. */
export function pickAssets(c: Career, teamId: number): PickAsset[] {
  return c.picks
    .filter((p) => p.owner === teamId && p.playerId === undefined)
    .sort((a, b) => a.year - b.year || a.round - b.round || (a.overall ?? 999) - (b.overall ?? 999) || a.orig - b.orig)
    .map((pick) => ({ pick, key: pickKey(pick), label: pickLabel(pick, c.teams), unavailable: null, value: pickValue(c, pick) }));
}

// ---------------------------------------------------------------------------
// Validation

export interface TradeIssue {
  code:
    | "closed" | "team" | "empty" | "duplicate" | "wrong-team" | "missing" | "unavailable"
    | "roster-max" | "roster-min" | "cap";
  teamId?: number;
  text: string;
}

const dupes = <T,>(list: T[]) => list.length !== new Set(list).size;

/** Full legality check. An empty issue list means the engine would execute the trade. */
export function validateTrade(c: Career, otherTeam: number, give: TradeSide, get: TradeSide): TradeIssue[] {
  const out: TradeIssue[] = [];
  const other = c.teams[otherTeam];
  if (!other || !Number.isInteger(otherTeam) || otherTeam === c.userTeam) {
    return [{ code: "team", text: "Choose another team to trade with." }];
  }
  if (!tradeWindowOpen(c)) {
    out.push({ code: "closed", text: c.phase === "playoffs" ? "Trades are closed during the playoffs." : `The trade deadline (week ${TRADE_DEADLINE_WEEK}) has passed.` });
  }
  if (sideIsEmpty(give) && sideIsEmpty(get)) out.push({ code: "empty", text: "Add at least one player or pick." });

  const all = [...give.players, ...get.players];
  if (dupes(all) || dupes([...give.picks, ...get.picks])) out.push({ code: "duplicate", text: "An asset appears in the deal more than once." });

  const checkPlayers = (ids: number[], owner: number) => {
    for (const id of ids) {
      const p = c.players[id];
      if (!p) { out.push({ code: "missing", text: `Player ${id} does not exist.` }); continue; }
      if (p.teamId !== owner && !p.retired) { out.push({ code: "wrong-team", teamId: owner, text: `${fullName(p)} is not on ${c.teams[owner].name}.` }); continue; }
      const why = playerUnavailable(p, owner);
      if (why) out.push({ code: "unavailable", teamId: owner, text: `${fullName(p)}: ${why.toLowerCase()}.` });
    }
  };
  const checkPicks = (keys: string[], owner: number) => {
    for (const k of keys) {
      const pk = findPick(c, k);
      if (!pk) { out.push({ code: "missing", text: `Pick ${k} is not available.` }); continue; }
      if (pk.owner !== owner) out.push({ code: "wrong-team", teamId: owner, text: `${pickLabel(pk, c.teams)} is not owned by ${c.teams[owner].name}.` });
    }
  };
  checkPlayers(give.players, c.userTeam);
  checkPlayers(get.players, otherTeam);
  checkPicks(give.picks, c.userTeam);
  checkPicks(get.picks, otherTeam);
  if (out.some((i) => i.code === "duplicate" || i.code === "missing" || i.code === "wrong-team" || i.code === "unavailable")) return out;

  // Roster size and cap, for each club, before versus after.
  for (const teamId of [c.userTeam, otherTeam]) {
    const snap = snapshotAfter(c, teamId, teamId === c.userTeam ? give : get, teamId === c.userTeam ? get : give);
    const subject = teamId === c.userTeam ? "You" : c.teams[teamId].name;
    if (snap.after.active > rosterLimit(c) && snap.after.active > snap.before.active) {
      out.push({ code: "roster-max", teamId, text: `${subject} would have ${snap.after.active} players; the limit is ${rosterLimit(c)}. Add players to the other side or cut first.` });
    }
    if ((c.phase === "regular") && snap.after.active < TRADE_ROSTER_MIN && snap.after.active < snap.before.active) {
      out.push({ code: "roster-min", teamId, text: `${subject} would drop to ${snap.after.active} active players; the in-season minimum is ${TRADE_ROSTER_MIN}.` });
    }
    if (snap.after.capSpace < 0 && snap.after.capSpace < snap.before.capSpace) {
      out.push({ code: "cap", teamId, text: teamId === c.userTeam ? `You can't fit that under the cap (${snap.after.capSpace.toFixed(1)}M).` : `${c.teams[teamId].name} can't fit that under the cap.` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snapshots

export interface TeamSnapshot {
  capSpace: number;
  payroll: number;
  active: number;
  needs: string[];
}
export interface TeamBeforeAfter {
  teamId: number;
  before: TeamSnapshot;
  after: TeamSnapshot;
}

/** A team's state now and as it would be after receiving `incoming` and sending `outgoing`. Does not mutate the career. */
export function snapshotAfter(c: Career, teamId: number, outgoing: TradeSide, incoming: TradeSide): TeamBeforeAfter {
  const snap = (cc: Career): TeamSnapshot => ({ capSpace: capSpace(cc, teamId), payroll: payroll(cc, teamId), active: activeCount(cc, teamId), needs: teamNeeds(cc, teamId) });
  const before = snap(c);
  const moved: Record<number, Player> = {};
  const valid = (id: number) => c.players[id];
  for (const id of outgoing.players) if (valid(id) && c.players[id].teamId === teamId) moved[id] = { ...c.players[id], teamId: null };
  for (const id of incoming.players) if (valid(id)) moved[id] = { ...c.players[id], teamId, ps: false };
  const hypo: Career = { ...c, players: { ...c.players, ...moved } };
  return { teamId, before, after: snap(hypo) };
}

// ---------------------------------------------------------------------------
// Valuation and the AI's decision

export interface ValueLine {
  kind: "player" | "pick";
  label: string;
  value: number;
}

export function sideValue(c: Career, s: TradeSide): { total: number; lines: ValueLine[] } {
  const lines: ValueLine[] = [];
  for (const id of s.players) {
    const p = c.players[id];
    if (p) lines.push({ kind: "player", label: `${p.pos} ${fullName(p)}`, value: playerTradeValue(p) });
  }
  for (const k of s.picks) {
    const pk = findPick(c, k);
    if (pk) lines.push({ kind: "pick", label: pickLabel(pk, c.teams), value: pickValue(c, pk) });
  }
  return { total: lines.reduce((a, l) => a + l.value, 0), lines };
}

export type Verdict = "accept" | "counter" | "reject" | "blocked" | "empty";
export type Fairness = "empty" | "one-sided-them" | "balanced" | "one-sided-you";

export interface TradeAnalysis {
  issues: TradeIssue[];
  legal: boolean;
  giveValue: number;
  getValue: number;
  giveLines: ValueLine[];
  getLines: ValueLine[];
  /** The value you must give for the partner to say yes. */
  required: number;
  shortfall: number;
  verdict: Verdict;
  /** Plain-language reasons behind the verdict. */
  reasons: string[];
  fairness: Fairness;
  /** 0..1 share of the total deal value that you give. 0.5 is an even swap. */
  giveShare: number;
  /** Where the partner's asking price sits on the same 0..1 scale. */
  thresholdShare: number;
  user: TeamBeforeAfter;
  partner: TeamBeforeAfter;
}

/** Everything the screen needs to render a deal. Never mutates the career. */
export function analyzeTrade(c: Career, otherTeam: number, give: TradeSide, get: TradeSide): TradeAnalysis {
  const issues = validateTrade(c, otherTeam, give, get);
  const g = sideValue(c, give);
  const r = sideValue(c, get);
  const required = acceptThreshold(r.total);
  const shortfall = Math.max(0, required - g.total);
  const hasTeam = !!c.teams[otherTeam] && otherTeam !== c.userTeam;
  const user = snapshotAfter(c, c.userTeam, give, get);
  const partner = hasTeam ? snapshotAfter(c, otherTeam, get, give) : user;
  const reasons: string[] = [];
  let verdict: Verdict;

  if (issues.length) {
    verdict = issues.every((i) => i.code === "empty") ? "empty" : "blocked";
    for (const i of issues) reasons.push(i.text);
  } else {
    // The engine's own decision is the source of truth.
    const ev = evaluateTrade(c, otherTeam, give, get);
    const name = c.teams[otherTeam].name;
    if (ev.ok) {
      verdict = "accept";
      reasons.push(`${name} value what they get (${Math.round(g.total)}) at least as much as their asking price (${Math.round(required)}).`);
    } else if (g.total >= r.total * 0.9) {
      verdict = "counter";
      reasons.push(`Close. ${name} want about ${Math.ceil(shortfall)} more trade value.`);
    } else {
      verdict = "reject";
      reasons.push(`Trade rejected: ${name} will not make this deal. They value what they send at ${Math.round(r.total)} and want ${Math.round(required)} back; you offer ${Math.round(g.total)}.`);
    }
    if (sideIsEmpty(give) && verdict !== "accept") reasons.push("You are not giving anything.");
    const needs = partner.before.needs;
    if (needs.length) reasons.push(`${name} roster needs: ${needs.join(", ")} (the AI values players by rating, age, position and contract, not by need).`);
  }

  const total = g.total + r.total;
  const giveShare = total > 0 ? g.total / total : 0.5;
  const thresholdShare = required + r.total > 0 && (g.total > 0 || r.total > 0) ? required / (required + r.total) : 0.5;
  let fairness: Fairness = "empty";
  if (total > 0) {
    const ratio = g.total / Math.max(1, r.total);
    fairness = ratio > 1.25 ? "one-sided-them" : ratio < 0.8 ? "one-sided-you" : "balanced";
  }
  return {
    issues, legal: issues.length === 0, giveValue: g.total, getValue: r.total, giveLines: g.lines, getLines: r.lines, required, shortfall,
    verdict, reasons: reasons.filter(Boolean), fairness, giveShare, thresholdShare, user, partner,
  };
}

/**
 * Assets from your side that would turn a deal the partner declines into one they accept, smallest sufficient value first.
 * Only legal additions are suggested. Used for the "ask what would work" hint.
 */
export function suggestSweeteners(c: Career, otherTeam: number, give: TradeSide, get: TradeSide, limit = 3): Array<{ kind: "player" | "pick"; id: number | string; label: string; value: number }> {
  const base = analyzeTrade(c, otherTeam, give, get);
  if (base.verdict !== "reject" && base.verdict !== "counter") return [];
  const cands: Array<{ kind: "player" | "pick"; id: number | string; label: string; value: number }> = [];
  for (const a of rosterAssets(c, c.userTeam)) {
    if (a.unavailable || give.players.includes(a.player.id)) continue;
    cands.push({ kind: "player", id: a.player.id, label: `${a.player.pos} ${fullName(a.player)} (${ovr(a.player)})`, value: a.value });
  }
  for (const a of pickAssets(c, c.userTeam)) {
    if (give.picks.includes(a.key)) continue;
    cands.push({ kind: "pick", id: a.key, label: a.label, value: a.value });
  }
  const works = cands.filter((cd) => {
    const next: TradeSide = cd.kind === "player" ? { ...give, players: [...give.players, cd.id as number] } : { ...give, picks: [...give.picks, cd.id as string] };
    return analyzeTrade(c, otherTeam, next, get).verdict === "accept";
  });
  return works.sort((a, b) => a.value - b.value).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Transactions

export interface TradeResult {
  ok: boolean;
  message: string;
  /** True only when the career was changed. */
  applied: boolean;
  issues: TradeIssue[];
  verdict: Verdict;
}

/**
 * The only way the UI changes rosters or picks with a trade. Revalidates against current career state, asks the AI,
 * and applies through executeTrade exactly once. Rejections and validation failures leave the career untouched.
 */
export function proposeTrade(c: Career, otherTeam: number, give: TradeSide, get: TradeSide): TradeResult {
  const a = analyzeTrade(c, otherTeam, give, get);
  if (!a.legal) return { ok: false, applied: false, issues: a.issues, verdict: a.verdict, message: a.issues[0]?.text ?? "That trade isn't allowed." };
  if (a.verdict !== "accept") {
    return {
      ok: false, applied: false, issues: [], verdict: a.verdict,
      message: a.verdict === "counter" ? `Trade rejected: ${c.teams[otherTeam].name} want a little more.` : "Trade rejected: this team will not make the deal.",
    };
  }
  executeTrade(c, otherTeam, give, get);
  return { ok: true, applied: true, issues: [], verdict: "accept", message: `Trade complete with ${c.teams[otherTeam].city}.` };
}

/** Answers an incoming offer through the same validation. An offer that is no longer legal is removed without changing rosters. */
export function answerOffer(c: Career, offerId: number, accept: boolean): string {
  const o = c.offers.find((x) => x.id === offerId);
  if (!o) return "That offer is no longer available.";
  if (!accept) return respondToOffer(c, offerId, false);
  const issues = validateTrade(c, o.fromTeam, o.give, o.get);
  if (issues.length) {
    c.offers = c.offers.filter((x) => x.id !== offerId);
    return `That offer is no longer valid: ${issues[0].text}`;
  }
  return respondToOffer(c, offerId, true);
}
