/**
 * Rock Paper Gamble rules as pure functions. React only renders this state.
 *
 * One reducer, driven by a once-a-second `tick` plus player actions. Every
 * action names who sent it (`by`); the host fills that from the database key
 * the message arrived under, never from anything the phone wrote itself.
 */
import { DEFAULT_ITEM_COSTS, DEFAULT_RPG_SETTINGS, ITEM_IDS, ITEM_RULES, ITEM_NAMES, formatCoins, type ItemId, type RpgSettings } from "../../game-files/schema/rpg";

export type { ItemId };

export type Choice = "rock" | "paper" | "scissors";
export const CHOICES: readonly Choice[] = ["rock", "paper", "scissors"];

export type Phase = "countdown" | "select" | "betting" | "duel" | "results" | "over" | "bomb" | "nukeVote" | "nukeDuel";

/** Seconds the target has to cut a wire. */
export const BOMB_SECONDS = ITEM_RULES.bombSeconds;
export const NUKE_VOTE_SECONDS = ITEM_RULES.nukeVoteSeconds;
export const NUKE_ROUND_SECONDS = ITEM_RULES.nukeRoundSeconds;
/** Tied nuke rounds in a row before the nuke backfires. */
export const NUKE_MAX_TIES = ITEM_RULES.nukeMaxTies;
export const MINE_PAYOUT = ITEM_RULES.minePayout;
export const INTERCEPT_MIN = ITEM_RULES.interceptMin;
export const INTERCEPT_PENALTY = ITEM_RULES.interceptPenalty;
export const WIRES = 3;

/** Round wins needed to take a duel. */
export const WINS_NEEDED = 3;
/** Seconds the round result stays on screen before the next round. */
export const OVERLAY_SECONDS = 3;
/** Rounds in a row where both duelists missed before the duel is void. */
export const MAX_DOUBLE_MISSES = 3;
export const MAX_LOG = 50;

export interface RpgPlayer {
  id: string;
  name: string;
  coins: number;
  /** Left the room or was removed by the host. Cannot play, is not counted. */
  removed?: boolean;
}

/** Money in the pool. `wager` is a duelist's own equal stake, `bet` a bet on a duelist. */
export interface Stake {
  by: string;
  /** The duelist the money is on. Wagers are always on oneself. */
  target: string;
  amount: number;
  kind: "wager" | "bet";
}

export interface RoundOutcome {
  /** Winner of the round, or null for a tie. */
  winner: string | null;
  /** What each duelist showed. Null means they did not pick in time. */
  picks: Record<string, Choice | null>;
  /** Why the round went this way. */
  reason: "beat" | "same" | "miss" | "bothMiss";
}

export interface Duel {
  challenger: string;
  challengee: string;
  /** Equal stake both duelists put in. 0 for none. */
  wager: number;
  stakes: Stake[];
  score: Record<string, number>;
  /** 1-based number of the round being played. Ties count as rounds. */
  round: number;
  /** Locked picks of the round in play. Never published before the reveal. */
  picks: Record<string, Choice>;
  /** The round that just finished, shown for OVERLAY_SECONDS. */
  last: RoundOutcome | null;
  /** Seconds left of the result overlay. 0 when none is showing. */
  overlay: number;
  doubleMisses: number;
  /** Hidden traps from spectators. Never published before they trigger. */
  mines: Mine[];
  /** Hidden predictions from spectators. Settled at the results. */
  intercepts: Intercept[];
  /** Coins moved by items during this duel, per player. */
  itemDelta: Record<string, number>;
}

export interface Mine {
  by: string;
  symbol: Choice;
  cost: number;
  hit: boolean;
}

export interface Intercept {
  by: string;
  winner: string;
  cost: number;
}

export interface Bomb {
  by: string;
  target: string;
  /** The wire that defuses it. Host only. */
  wire: number;
}

export type NukeVote = "allow" | "block";

export interface Nuke {
  by: string;
  votes: Record<string, NukeVote>;
  stage: "vote" | "duel";
  /** The richest other player, chosen once the vote passes. */
  target: string | null;
  picks: Record<string, Choice>;
  ties: number;
  last: RoundOutcome | null;
}

/** A big moment for the table banner and sounds. `id` changes with every new one. */
export interface GameEvent {
  id: number;
  kind: "bomb" | "nuke" | "mine" | "intercept";
  tone: "good" | "bad";
  title: string;
  text: string;
}

export interface Settlement {
  /** The duel's winner. Null when the duel was void. */
  winner: string | null;
  loser: string | null;
  void: boolean;
  pool: number;
  /** Net change in coins per player for this duel, stakes included. */
  delta: Record<string, number>;
  /** Backers of the winner who were paid double. */
  backers: string[];
}

export interface RpgState {
  phase: Phase;
  settings: RpgSettings;
  /** Turn order is the array order. */
  players: RpgPlayer[];
  /** Seconds left in the current phase. In the countdown, 0 shows GO. */
  timeLeft: number;
  /** Index of the challenger in `players`. */
  active: number;
  match: number;
  duel: Duel | null;
  result: Settlement | null;
  log: string[];
  /** Set when the host ended the game, or the game ended by itself. */
  endedEarly: boolean;
  /** Items each player holds. Others only see how many. */
  inventory: Record<string, ItemId[]>;
  bomb: Bomb | null;
  nuke: Nuke | null;
  event: GameEvent | null;
  revision: number;
}

export type RpgAction =
  | { type: "tick" }
  | { type: "challenge"; by: string; target: string; wager?: number }
  | { type: "bet"; by: string; target: string; amount: number }
  | { type: "pick"; by: string; choice: Choice }
  | { type: "gift"; by: string; target: string; amount: number }
  | { type: "buy"; by: string; item: ItemId }
  /** `wire` is the host's hidden roll (0 to 2). */
  | { type: "useBomb"; by: string; target: string; wire?: number }
  | { type: "useNuke"; by: string }
  | { type: "useMine"; by: string; symbol: Choice }
  | { type: "useIntercept"; by: string; winner: string }
  | { type: "cutWire"; by: string; wire: number }
  | { type: "vote"; by: string; vote: NukeVote }
  | { type: "removePlayer"; id: string }
  | { type: "endGame" };

/** A whole number above zero that fits in `max`. Everything money-shaped goes through this. */
export function isMoney(n: unknown, max = Infinity): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 1 && n <= max;
}

export function isChoice(c: unknown): c is Choice {
  return c === "rock" || c === "paper" || c === "scissors";
}

const BEATS: Record<Choice, Choice> = { rock: "scissors", paper: "rock", scissors: "paper" };

/** 1 when a beats b, -1 when b beats a, 0 for a tie. */
export function compareChoices(a: Choice, b: Choice): 1 | -1 | 0 {
  if (a === b) return 0;
  return BEATS[a] === b ? 1 : -1;
}

export const STARTING_PLAYERS_MIN = 2;

export function createSession(players: Array<{ id: string; name: string }>, settings: Partial<RpgSettings> = {}): RpgState {
  const merged: RpgSettings = { ...DEFAULT_RPG_SETTINGS, ...settings, itemCosts: { ...DEFAULT_ITEM_COSTS, ...settings.itemCosts } };
  return {
    phase: "countdown",
    settings: merged,
    players: players.map((p) => ({ id: p.id, name: p.name, coins: merged.startingMoney })),
    timeLeft: 3,
    active: 0,
    match: 0,
    duel: null,
    result: null,
    log: ["Match starting!"],
    endedEarly: false,
    inventory: {},
    bomb: null,
    nuke: null,
    event: null,
    revision: 0,
  };
}

export const playerById = (s: RpgState, id: string): RpgPlayer | undefined => s.players.find((p) => p.id === id);
const nameOf = (s: RpgState, id: string) => playerById(s, id)?.name ?? "Someone";

/** Players who can still play: here and holding money. */
export function eligible(p: RpgPlayer): boolean {
  return !p.removed && p.coins > 0;
}

export function activePlayer(s: RpgState): RpgPlayer | undefined {
  return s.players[s.active];
}

function log(s: RpgState, line: string): string[] {
  return [line, ...s.log].slice(0, MAX_LOG);
}

/** The next index after `from` (exclusive) holding a player who can play. -1 when nobody can. */
export function nextEligible(players: RpgPlayer[], from: number): number {
  const n = players.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (eligible(players[i])) return i;
  }
  return -1;
}

/** True once at most one player still has money. */
export function gameIsDecided(players: RpgPlayer[]): boolean {
  return players.filter(eligible).length <= 1;
}

/** Final standings: richest first. Ties keep turn order. Removed players rank by what they left with. */
export function standings(s: RpgState): RpgPlayer[] {
  return s.players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.coins - a.p.coins || a.i - b.i)
    .map((x) => x.p);
}

export function poolOf(duel: Duel): number {
  return duel.stakes.reduce((sum, x) => sum + x.amount, 0);
}

/** What a player has put into the current duel. */
export function stakedBy(duel: Duel, id: string): number {
  return duel.stakes.filter((x) => x.by === id).reduce((sum, x) => sum + x.amount, 0);
}

/** A player's one spectator bet this duel, if they placed it. */
export function betOf(duel: Duel, id: string): Stake | undefined {
  return duel.stakes.find((x) => x.by === id && x.kind === "bet");
}

function credit(players: RpgPlayer[], id: string, amount: number): RpgPlayer[] {
  return players.map((p) => (p.id === id ? { ...p, coins: p.coins + amount } : p));
}

/**
 * Pays out a finished duel.
 * The winner takes the whole pool: both wagers, every bet. Spectators who
 * backed the winner are also paid twice their stake. Everyone else loses what
 * they put in. Bets placed by the two duelists themselves only feed the pool.
 */
export function settle(players: RpgPlayer[], duel: Duel, winner: string): { players: RpgPlayer[]; settlement: Settlement } {
  const loser = winner === duel.challenger ? duel.challengee : duel.challenger;
  const pool = poolOf(duel);
  const delta: Record<string, number> = {};
  const add = (id: string, n: number) => (delta[id] = (delta[id] ?? 0) + n);
  let next = players;

  // Everyone's stakes were taken when placed, so start from "lost it all".
  for (const x of duel.stakes) add(x.by, -x.amount);
  next = credit(next, winner, pool);
  add(winner, pool);

  const backers: string[] = [];
  for (const x of duel.stakes) {
    if (x.kind !== "bet" || x.by === duel.challenger || x.by === duel.challengee) continue;
    if (x.target !== winner) continue;
    next = credit(next, x.by, x.amount * 2);
    add(x.by, x.amount * 2);
    backers.push(x.by);
  }
  return { players: next, settlement: { winner, loser, void: false, pool, delta, backers } };
}

const money = (n: number) => formatCoins(n);
/** Whole-coin share of an amount. */
const pct = (n: number, p: number) => Math.floor((n * p) / 100);

export function itemsOf(s: RpgState, id: string): ItemId[] {
  return s.inventory[id] ?? [];
}

function setItems(s: RpgState, id: string, items: ItemId[]): RpgState {
  return { ...s, inventory: { ...s.inventory, [id]: items } };
}

function event(s: RpgState, kind: GameEvent["kind"], tone: GameEvent["tone"], title: string, text: string): GameEvent {
  // The reducer bumps the revision by one after this step, so the id is unique.
  return { id: s.revision + 1, kind, tone, title, text };
}

/** Moves up to `amount` from one player to another and returns the amount that moved. */
function transfer(players: RpgPlayer[], from: string, to: string, amount: number): { players: RpgPlayer[]; moved: number } {
  const have = players.find((p) => p.id === from)?.coins ?? 0;
  const moved = Math.max(0, Math.min(amount, have));
  if (moved === 0) return { players, moved: 0 };
  return { players: players.map((p) => (p.id === from ? { ...p, coins: p.coins - moved } : p.id === to ? { ...p, coins: p.coins + moved } : p)), moved };
}

function addDelta(d: Record<string, number>, id: string, n: number): Record<string, number> {
  return { ...d, [id]: (d[id] ?? 0) + n };
}

/** Gives back what Landmines and Interceptors cost. Used when a duel is void or ends early. */
export function refundItems(players: RpgPlayer[], duel: Duel): RpgPlayer[] {
  let next = players;
  for (const m of duel.mines) next = credit(next, m.by, m.cost);
  for (const i of duel.intercepts) next = credit(next, i.by, i.cost);
  return next;
}

/** Gives every stake back. Used when a duel is void or the game ends mid-duel. */
export function refundAll(players: RpgPlayer[], duel: Duel): RpgPlayer[] {
  let next = players;
  for (const x of duel.stakes) next = credit(next, x.by, x.amount);
  return next;
}

function toOver(s: RpgState, line: string, early: boolean): RpgState {
  return { ...s, phase: "over", timeLeft: 0, duel: null, endedEarly: early, log: log(s, line) };
}

/** Starts the next challenge turn from `from`, or ends the game when nobody can play. */
function beginSelect(s: RpgState, from: number, match: number): RpgState {
  if (gameIsDecided(s.players)) {
    const left = s.players.filter(eligible);
    return toOver({ ...s, match }, left.length === 1 ? `${left[0].name} has all the money.` : "Nobody has any money left.", false);
  }
  const i = nextEligible(s.players, from);
  return {
    ...s,
    phase: "select",
    timeLeft: s.settings.selectSeconds,
    active: i,
    match,
    duel: null,
    result: null,
  };
}

function startRound(duel: Duel): Duel {
  return { ...duel, round: duel.round + 1, picks: {}, overlay: 0, last: duel.last };
}

/** Closes the round in play and works out who won it. */
function resolveRound(s: RpgState, duel: Duel): RpgState {
  const a = duel.challenger;
  const b = duel.challengee;
  const pa = duel.picks[a] ?? null;
  const pb = duel.picks[b] ?? null;
  let outcome: RoundOutcome;
  if (pa && pb) {
    const c = compareChoices(pa, pb);
    outcome = { winner: c === 0 ? null : c === 1 ? a : b, picks: { [a]: pa, [b]: pb }, reason: c === 0 ? "same" : "beat" };
  } else if (pa || pb) {
    // Whoever did not pick in time loses the round.
    outcome = { winner: pa ? a : b, picks: { [a]: pa, [b]: pb }, reason: "miss" };
  } else {
    outcome = { winner: null, picks: { [a]: null, [b]: null }, reason: "bothMiss" };
  }

  // A Landmine goes off the first round both duelists throw its symbol.
  if (pa && pa === pb) {
    const hit = triggerMines(s, duel, pa);
    s = hit.s;
    duel = hit.duel;
  }

  const score = { ...duel.score };
  if (outcome.winner) score[outcome.winner] = (score[outcome.winner] ?? 0) + 1;
  const doubleMisses = outcome.reason === "bothMiss" ? duel.doubleMisses + 1 : 0;
  const next: Duel = { ...duel, score, last: outcome, picks: {}, overlay: OVERLAY_SECONDS, doubleMisses };

  if (doubleMisses >= MAX_DOUBLE_MISSES) return voidDuel(s, next);
  return { ...s, duel: next, timeLeft: 0, log: log(s, roundLine(s, outcome)) };
}

function triggerMines(s: RpgState, duel: Duel, symbol: Choice): { s: RpgState; duel: Duel } {
  if (!duel.mines.some((m) => !m.hit && m.symbol === symbol)) return { s, duel };
  let players = s.players;
  let delta = duel.itemDelta;
  let lines = s.log;
  let ev = s.event;
  const mines = duel.mines.map((m) => {
    if (m.hit || m.symbol !== symbol) return m;
    let total = 0;
    for (const d of [duel.challenger, duel.challengee]) {
      const r = transfer(players, d, m.by, MINE_PAYOUT);
      players = r.players;
      total += r.moved;
      delta = addDelta(addDelta(delta, d, -r.moved), m.by, r.moved);
    }
    const line = `Landmine! ${nameOf(s, m.by)} collected ${money(total)} from the duelists.`;
    lines = [line, ...lines].slice(0, MAX_LOG);
    ev = event(s, "mine", "bad", "LANDMINE!", line);
    return { ...m, hit: true };
  });
  return { s: { ...s, players, log: lines, event: ev }, duel: { ...duel, mines, itemDelta: delta } };
}

function roundLine(s: RpgState, o: RoundOutcome): string {
  if (o.reason === "bothMiss") return "Neither duelist picked. Round is a tie.";
  if (!o.winner) return "Tie. The round is replayed.";
  return o.reason === "miss" ? `${nameOf(s, o.winner)} takes the round. Their rival did not pick.` : `${nameOf(s, o.winner)} wins the round.`;
}

function voidDuel(s: RpgState, duel: Duel): RpgState {
  // Coins a Landmine already took stay with its owner; what the items cost comes back.
  const players = refundItems(refundAll(s.players, duel), duel);
  const delta: Record<string, number> = {};
  const settlement: Settlement = { winner: null, loser: null, void: true, pool: poolOf(duel), delta, backers: [] };
  return {
    ...s,
    players,
    phase: "results",
    timeLeft: s.settings.resultsSeconds,
    duel: { ...duel, overlay: 0 },
    result: settlement,
    log: log(s, "Both duelists kept missing. The duel is void and every stake and item is refunded."),
  };
}

function finishDuel(s: RpgState, duel: Duel, winner: string): RpgState {
  const settled = settle(s.players, duel, winner);
  let players = settled.players;
  const settlement = settled.settlement;
  const loser = settlement.loser as string;
  const delta = { ...settlement.delta };
  for (const [id, n] of Object.entries(duel.itemDelta)) delta[id] = (delta[id] ?? 0) + n;
  const lines = [`${nameOf(s, winner)} won the duel and $${settlement.pool.toLocaleString("en-US")}.`];
  let ev = s.event;
  // Interceptors settle once the winner is known.
  for (const ic of duel.intercepts) {
    if (ic.winner === winner) {
      const r = transfer(players, loser, ic.by, Math.max(INTERCEPT_MIN, ITEM_RULES.interceptMultiplier * duel.wager));
      players = r.players;
      delta[loser] = (delta[loser] ?? 0) - r.moved;
      delta[ic.by] = (delta[ic.by] ?? 0) + r.moved;
      const line = `INTERCEPTED! ${nameOf(s, ic.by)} called it and stole ${money(r.moved)} from ${nameOf(s, loser)}.`;
      lines.unshift(line);
      ev = { id: s.revision + 1, kind: "intercept", tone: "good", title: "INTERCEPTED", text: line };
    } else {
      const r = transfer(players, ic.by, winner, INTERCEPT_PENALTY);
      players = r.players;
      delta[ic.by] = (delta[ic.by] ?? 0) - r.moved;
      delta[winner] = (delta[winner] ?? 0) + r.moved;
      const line = `${nameOf(s, ic.by)} guessed wrong and paid ${money(r.moved)} to ${nameOf(s, winner)}.`;
      lines.unshift(line);
      ev = { id: s.revision + 1, kind: "intercept", tone: "bad", title: "WRONG CALL", text: line };
    }
  }
  return {
    ...s,
    players,
    phase: "results",
    timeLeft: s.settings.resultsSeconds,
    duel: { ...duel, overlay: 0 },
    result: { ...settlement, delta },
    event: ev,
    log: [...lines, ...s.log].slice(0, MAX_LOG),
  };
}

/** The duel's winner once someone has enough round wins. */
function duelWinner(duel: Duel): string | null {
  for (const id of [duel.challenger, duel.challengee]) if ((duel.score[id] ?? 0) >= WINS_NEEDED) return id;
  return null;
}

function tick(s: RpgState): RpgState {
  switch (s.phase) {
    case "countdown": {
      // 3, 2, 1, then GO at 0, then the first turn.
      if (s.timeLeft > 0) return { ...s, timeLeft: s.timeLeft - 1 };
      return beginSelect(s, -1, 1);
    }
    case "select": {
      if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
      // Out of time: the turn passes to the next player who can play.
      const who = activePlayer(s);
      const next = beginSelect({ ...s, log: log(s, `${who?.name ?? "Someone"} ran out of time. Turn skipped.`) }, s.active, s.match);
      return next;
    }
    case "betting": {
      if (!s.duel) return s;
      if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
      return { ...s, phase: "duel", timeLeft: s.settings.roundSeconds, duel: { ...s.duel, round: 1, picks: {}, overlay: 0, last: null } };
    }
    case "duel": {
      const duel = s.duel;
      if (!duel) return s;
      if (duel.overlay > 0) {
        if (duel.overlay > 1) return { ...s, duel: { ...duel, overlay: duel.overlay - 1 } };
        const winner = duelWinner(duel);
        if (winner) return finishDuel(s, duel, winner);
        return { ...s, timeLeft: s.settings.roundSeconds, duel: startRound(duel) };
      }
      if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
      return resolveRound(s, duel);
    }
    case "results": {
      if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
      return beginSelect(s, s.active, s.match + 1);
    }
    case "bomb": {
      if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
      return detonate(s, true);
    }
    case "nukeVote": {
      if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
      return resolveVote(s);
    }
    case "nukeDuel": {
      if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
      return resolveNukeRound(s);
    }
    case "over":
      return s;
  }
}

function challenge(s: RpgState, a: Extract<RpgAction, { type: "challenge" }>): RpgState {
  if (s.phase !== "select") return s;
  const me = activePlayer(s);
  if (!me || me.id !== a.by || !eligible(me)) return s;
  const target = playerById(s, a.target);
  if (!target || target.id === me.id || !eligible(target)) return s;
  const wager = a.wager ?? 0;
  if (wager !== 0 && (!isMoney(wager, Math.min(me.coins, target.coins)))) return s;

  const stakes: Stake[] = [];
  let players = s.players;
  if (wager > 0) {
    players = players.map((p) => (p.id === me.id || p.id === target.id ? { ...p, coins: p.coins - wager } : p));
    stakes.push({ by: me.id, target: me.id, amount: wager, kind: "wager" }, { by: target.id, target: target.id, amount: wager, kind: "wager" });
  }
  const duel: Duel = {
    challenger: me.id,
    challengee: target.id,
    wager,
    stakes,
    score: { [me.id]: 0, [target.id]: 0 },
    round: 0,
    picks: {},
    last: null,
    overlay: 0,
    doubleMisses: 0,
    mines: [],
    intercepts: [],
    itemDelta: {},
  };
  return {
    ...s,
    players,
    phase: "betting",
    timeLeft: s.settings.bettingSeconds,
    duel,
    log: log(s, wager > 0 ? `${me.name} challenged ${target.name} for $${wager.toLocaleString("en-US")} each.` : `${me.name} challenged ${target.name}.`),
  };
}

function bet(s: RpgState, a: Extract<RpgAction, { type: "bet" }>): RpgState {
  const duel = s.duel;
  if (s.phase !== "betting" || !duel) return s;
  const me = playerById(s, a.by);
  if (!me || me.removed) return s;
  if (a.target !== duel.challenger && a.target !== duel.challengee) return s;
  if (!isMoney(a.amount, me.coins)) return s;
  if (betOf(duel, me.id)) return s;
  return {
    ...s,
    players: s.players.map((p) => (p.id === me.id ? { ...p, coins: p.coins - a.amount } : p)),
    duel: { ...duel, stakes: [...duel.stakes, { by: me.id, target: a.target, amount: a.amount, kind: "bet" }] },
    log: log(s, `${me.name} bet $${a.amount.toLocaleString("en-US")} on ${nameOf(s, a.target)}.`),
  };
}

function pick(s: RpgState, a: Extract<RpgAction, { type: "pick" }>): RpgState {
  if (s.phase === "nukeDuel") return nukePick(s, a);
  const duel = s.duel;
  if (s.phase !== "duel" || !duel || duel.overlay > 0) return s;
  if (a.by !== duel.challenger && a.by !== duel.challengee) return s;
  if (!isChoice(a.choice) || duel.picks[a.by]) return s;
  const picks = { ...duel.picks, [a.by]: a.choice };
  const withPick: Duel = { ...duel, picks };
  // Both are in: reveal now instead of waiting for the clock.
  if (picks[duel.challenger] && picks[duel.challengee]) return resolveRound({ ...s, duel: withPick }, withPick);
  return { ...s, duel: withPick };
}

function gift(s: RpgState, a: Extract<RpgAction, { type: "gift" }>): RpgState {
  if (s.phase !== "select") return s;
  const from = playerById(s, a.by);
  const to = playerById(s, a.target);
  if (!from || !to || from.removed || to.removed || from.id === to.id) return s;
  if (!isMoney(a.amount, from.coins)) return s;
  return {
    ...s,
    players: s.players.map((p) => (p.id === from.id ? { ...p, coins: p.coins - a.amount } : p.id === to.id ? { ...p, coins: p.coins + a.amount } : p)),
    log: log(s, `${from.name} gifted $${a.amount.toLocaleString("en-US")} to ${to.name}.`),
  };
}

function removePlayer(s: RpgState, id: string): RpgState {
  const p = playerById(s, id);
  if (!p || p.removed || s.phase === "over") return s;
  const players = s.players.map((x) => (x.id === id ? { ...x, removed: true } : x));
  const left = { ...s, players, log: log(s, `${p.name} left the game.`) };
  // An item in flight with nobody left to run it fizzles and play carries on.
  if (s.phase === "bomb" && s.bomb && (s.bomb.by === id || s.bomb.target === id)) return resumeSelect({ ...left, log: log(left, "The bomb fizzled out.") });
  if ((s.phase === "nukeVote" || s.phase === "nukeDuel") && s.nuke?.by === id) return resumeSelect({ ...left, log: log(left, "The nuke was called off.") });
  return left;
}

function endGame(s: RpgState): RpgState {
  if (s.phase === "over") return s;
  // Stakes still in an unfinished duel go back before the standings are drawn.
  const players = s.duel && s.phase !== "results" ? refundItems(refundAll(s.players, s.duel), s.duel) : s.players;
  return toOver({ ...s, players }, "The host ended the game.", true);
}

function step(s: RpgState, action: RpgAction): RpgState {
  switch (action.type) {
    case "tick":
      return tick(s);
    case "challenge":
      return challenge(s, action);
    case "bet":
      return bet(s, action);
    case "pick":
      return pick(s, action);
    case "gift":
      return gift(s, action);
    case "buy":
      return buy(s, action);
    case "useBomb":
      return useBomb(s, action);
    case "useNuke":
      return useNuke(s, action);
    case "useMine":
      return useMine(s, action);
    case "useIntercept":
      return useIntercept(s, action);
    case "cutWire":
      return cutWire(s, action);
    case "vote":
      return vote(s, action);
    case "removePlayer":
      return removePlayer(s, action.id);
    case "endGame":
      return endGame(s);
  }
}

export function rpgReducer(s: RpgState, action: RpgAction): RpgState {
  const next = step(s, action);
  return next === s ? s : { ...next, revision: s.revision + 1 };
}

// ---------- Items ----------

export function itemCost(s: RpgState, item: ItemId): number {
  return s.settings.itemCosts[item];
}

/** Back to choosing an opponent with a fresh clock. The turn does not move on. */
function resumeSelect(s: RpgState): RpgState {
  const cleared: RpgState = { ...s, bomb: null, nuke: null };
  const act = cleared.players[cleared.active];
  if (gameIsDecided(cleared.players) || !act || !eligible(act)) return beginSelect(cleared, cleared.active, cleared.match);
  return { ...cleared, phase: "select", timeLeft: cleared.settings.selectSeconds };
}

/** A player who can act on an item: here and holding money. */
function actor(s: RpgState, id: string): RpgPlayer | undefined {
  const p = playerById(s, id);
  return p && eligible(p) ? p : undefined;
}

function buy(s: RpgState, a: Extract<RpgAction, { type: "buy" }>): RpgState {
  if (s.phase !== "select" || !s.settings.items) return s;
  const me = actor(s, a.by);
  if (!me || !ITEM_IDS.includes(a.item)) return s;
  if (itemsOf(s, me.id).includes(a.item)) return s;
  const cost = itemCost(s, a.item);
  if (!isMoney(cost) || cost > me.coins) return s;
  const next = setItems(s, me.id, [...itemsOf(s, me.id), a.item]);
  return {
    ...next,
    players: next.players.map((p) => (p.id === me.id ? { ...p, coins: p.coins - cost } : p)),
    log: log(s, `${me.name} bought an item from the shop.`),
  };
}

/** Takes the item out of the player's inventory, or null when they do not hold it. */
function spend(s: RpgState, id: string, item: ItemId): RpgState | null {
  const held = itemsOf(s, id);
  if (!held.includes(item)) return null;
  return setItems(s, id, held.filter((x) => x !== item));
}

function useBomb(s: RpgState, a: Extract<RpgAction, { type: "useBomb" }>): RpgState {
  if (s.phase !== "select" || !s.settings.items) return s;
  const me = actor(s, a.by);
  const target = actor(s, a.target);
  if (!me || !target || me.id === target.id) return s;
  const spent = spend(s, me.id, "bomb");
  if (!spent) return s;
  const wire = Number.isInteger(a.wire) && (a.wire as number) >= 0 && (a.wire as number) < WIRES ? (a.wire as number) : 0;
  const line = `${me.name} planted an Atomic Bomb on ${target.name}!`;
  return {
    ...spent,
    phase: "bomb",
    timeLeft: BOMB_SECONDS,
    bomb: { by: me.id, target: target.id, wire },
    event: event(s, "bomb", "bad", "ATOMIC BOMB", line),
    log: log(s, line),
  };
}

function cutWire(s: RpgState, a: Extract<RpgAction, { type: "cutWire" }>): RpgState {
  const bomb = s.bomb;
  if (s.phase !== "bomb" || !bomb || a.by !== bomb.target) return s;
  if (!Number.isInteger(a.wire) || a.wire < 0 || a.wire >= WIRES) return s;
  if (a.wire === bomb.wire) {
    const line = `${nameOf(s, bomb.target)} cut the right wire. Defused!`;
    return resumeSelect({ ...s, event: event(s, "bomb", "good", "DEFUSED", line), log: log(s, line) });
  }
  return detonate(s, false);
}

/** The bomb goes off: the attacker takes 90% of the target, 30% of the next in turn, 10% of everyone else. */
function detonate(s: RpgState, timedOut: boolean): RpgState {
  const bomb = s.bomb;
  if (!bomb) return s;
  const n = s.players.length;
  const ti = s.players.findIndex((p) => p.id === bomb.target);
  let nextId: string | null = null;
  for (let step = 1; step <= n; step++) {
    const p = s.players[(ti + step) % n];
    if (p.id !== bomb.by && p.id !== bomb.target && eligible(p)) {
      nextId = p.id;
      break;
    }
  }
  const rates = new Map<string, number>();
  for (const p of s.players) {
    if (p.id === bomb.by || !eligible(p)) continue;
    rates.set(p.id, p.id === bomb.target ? ITEM_RULES.bombTarget : p.id === nextId ? ITEM_RULES.bombNext : ITEM_RULES.bombOthers);
  }
  let players = s.players;
  let total = 0;
  for (const [id, rate] of rates) {
    const r = transfer(players, id, bomb.by, pct(playerById(s, id)?.coins ?? 0, rate));
    players = r.players;
    total += r.moved;
  }
  const line = `${timedOut ? `${nameOf(s, bomb.target)} ran out of time. ` : `${nameOf(s, bomb.target)} cut the wrong wire. `}DETONATED! ${nameOf(s, bomb.by)} took ${money(total)}.`;
  return resumeSelect({ ...s, players, event: event(s, "bomb", "bad", "DETONATED", line), log: log(s, line) });
}

function useNuke(s: RpgState, a: Extract<RpgAction, { type: "useNuke" }>): RpgState {
  if (s.phase !== "select" || !s.settings.items) return s;
  const me = actor(s, a.by);
  if (!me) return s;
  if (!s.players.some((p) => p.id !== me.id && eligible(p))) return s;
  const spent = spend(s, me.id, "nuke");
  if (!spent) return s;
  const line = `${me.name} launched a Nuke! Everyone votes: allow or block.`;
  return {
    ...spent,
    phase: "nukeVote",
    timeLeft: NUKE_VOTE_SECONDS,
    nuke: { by: me.id, votes: {}, stage: "vote", target: null, picks: {}, ties: 0, last: null },
    event: event(s, "nuke", "bad", "NUKE LAUNCHED", line),
    log: log(s, line),
  };
}

function voters(s: RpgState, nuke: Nuke): RpgPlayer[] {
  return s.players.filter((p) => p.id !== nuke.by && eligible(p));
}

function vote(s: RpgState, a: Extract<RpgAction, { type: "vote" }>): RpgState {
  const nuke = s.nuke;
  if (s.phase !== "nukeVote" || !nuke || nuke.stage !== "vote") return s;
  if (a.vote !== "allow" && a.vote !== "block") return s;
  if (!voters(s, nuke).some((p) => p.id === a.by) || nuke.votes[a.by]) return s;
  const next: RpgState = { ...s, nuke: { ...nuke, votes: { ...nuke.votes, [a.by]: a.vote } } };
  // Everyone has spoken: no need to wait out the clock.
  if (voters(next, next.nuke as Nuke).every((p) => (next.nuke as Nuke).votes[p.id])) return resolveVote(next);
  return next;
}

/** Strictly more Block than Allow stops the nuke. Silence counts as Allow. */
function resolveVote(s: RpgState): RpgState {
  const nuke = s.nuke;
  if (!nuke) return s;
  const vs = voters(s, nuke);
  const block = vs.filter((p) => nuke.votes[p.id] === "block").length;
  const allow = vs.length - block;
  const others = s.players.filter((p) => p.id !== nuke.by && eligible(p));
  const richest = others.reduce<RpgPlayer | null>((best, p) => (!best || p.coins > best.coins ? p : best), null);
  if (block > allow || !richest) {
    const refund = pct(itemCost(s, "nuke"), ITEM_RULES.nukeRefund);
    const line = block > allow ? `The vote blocked the nuke (${block} to ${allow}). ${nameOf(s, nuke.by)} gets ${money(refund)} back.` : `The nuke had no target. ${nameOf(s, nuke.by)} gets ${money(refund)} back.`;
    return resumeSelect({ ...s, players: credit(s.players, nuke.by, refund), event: event(s, "nuke", "good", "NUKE FIZZLED", line), log: log(s, line) });
  }
  const line = `The nuke goes ahead. ${nameOf(s, nuke.by)} must beat ${richest.name} in a duel.`;
  return { ...s, phase: "nukeDuel", timeLeft: NUKE_ROUND_SECONDS, nuke: { ...nuke, stage: "duel", target: richest.id, picks: {}, ties: 0, last: null }, log: log(s, line) };
}

function nukePick(s: RpgState, a: Extract<RpgAction, { type: "pick" }>): RpgState {
  const nuke = s.nuke;
  if (!nuke || nuke.stage !== "duel" || !nuke.target) return s;
  if (a.by !== nuke.by && a.by !== nuke.target) return s;
  if (!isChoice(a.choice) || nuke.picks[a.by]) return s;
  const next: RpgState = { ...s, nuke: { ...nuke, picks: { ...nuke.picks, [a.by]: a.choice } } };
  const n = next.nuke as Nuke;
  if (n.picks[n.by] && n.picks[n.target as string]) return resolveNukeRound(next);
  return next;
}

function resolveNukeRound(s: RpgState): RpgState {
  const nuke = s.nuke;
  if (!nuke || !nuke.target) return s;
  const u = nuke.by;
  const t = nuke.target;
  const pu = nuke.picks[u] ?? null;
  const pt = nuke.picks[t] ?? null;
  let winner: string | null = null;
  let reason: RoundOutcome["reason"];
  if (pu && pt) {
    const c = compareChoices(pu, pt);
    winner = c === 0 ? null : c === 1 ? u : t;
    reason = c === 0 ? "same" : "beat";
  } else if (pu || pt) {
    winner = pu ? u : t;
    reason = "miss";
  } else reason = "bothMiss";
  const last: RoundOutcome = { winner, picks: { [u]: pu, [t]: pt }, reason };
  if (winner === u) return nukeImpact({ ...s, nuke: { ...nuke, last } });
  if (winner === t) return nukeBackfire({ ...s, nuke: { ...nuke, last } }, false);
  const ties = nuke.ties + 1;
  if (ties >= NUKE_MAX_TIES) return nukeBackfire({ ...s, nuke: { ...nuke, last, ties } }, true);
  return { ...s, timeLeft: NUKE_ROUND_SECONDS, nuke: { ...nuke, picks: {}, ties, last }, log: log(s, `Nuke duel tied (${ties} of ${NUKE_MAX_TIES}). Throw again.`) };
}

/** The user wins the duel and takes 25% from every other player. */
function nukeImpact(s: RpgState): RpgState {
  const nuke = s.nuke as Nuke;
  let players = s.players;
  let total = 0;
  for (const p of s.players) {
    if (p.id === nuke.by || !eligible(p)) continue;
    const r = transfer(players, p.id, nuke.by, pct(p.coins, ITEM_RULES.nukeImpact));
    players = r.players;
    total += r.moved;
  }
  const line = `IMPACT! ${nameOf(s, nuke.by)} won the nuke duel and took ${money(total)} from everyone.`;
  return resumeSelect({ ...s, players, event: event(s, "nuke", "bad", "IMPACT", line), log: log(s, line) });
}

/** The user loses 75% of their own coins, split evenly among the other active players. */
function nukeBackfire(s: RpgState, tied: boolean): RpgState {
  const nuke = s.nuke as Nuke;
  const me = playerById(s, nuke.by);
  const others = s.players.filter((p) => p.id !== nuke.by && eligible(p));
  const share = others.length ? Math.floor(pct(me?.coins ?? 0, ITEM_RULES.nukeBackfire) / others.length) : 0;
  let players = s.players;
  for (const p of others) players = transfer(players, nuke.by, p.id, share).players;
  const lost = share * others.length;
  const line = `BACKFIRE! ${nameOf(s, nuke.by)} ${tied ? "tied three times and " : "lost the nuke duel and "}gave away ${money(lost)}, split among the others.`;
  return resumeSelect({ ...s, players, event: event(s, "nuke", "good", "BACKFIRE", line), log: log(s, line) });
}

function useMine(s: RpgState, a: Extract<RpgAction, { type: "useMine" }>): RpgState {
  const duel = s.duel;
  if (s.phase !== "betting" || !duel || !s.settings.items) return s;
  const me = actor(s, a.by);
  if (!me || me.id === duel.challenger || me.id === duel.challengee) return s;
  if (!isChoice(a.symbol) || duel.mines.some((m) => m.by === me.id)) return s;
  const spent = spend(s, me.id, "landmine");
  if (!spent) return s;
  const mine: Mine = { by: me.id, symbol: a.symbol, cost: itemCost(s, "landmine"), hit: false };
  return { ...spent, duel: { ...duel, mines: [...duel.mines, mine] }, log: log(s, "A Landmine was buried somewhere in the duel.") };
}

function useIntercept(s: RpgState, a: Extract<RpgAction, { type: "useIntercept" }>): RpgState {
  const duel = s.duel;
  if (s.phase !== "betting" || !duel || !s.settings.items) return s;
  const me = actor(s, a.by);
  if (!me || me.id === duel.challenger || me.id === duel.challengee) return s;
  if (a.winner !== duel.challenger && a.winner !== duel.challengee) return s;
  if (duel.intercepts.some((i) => i.by === me.id)) return s;
  const spent = spend(s, me.id, "interceptor");
  if (!spent) return s;
  const ic: Intercept = { by: me.id, winner: a.winner, cost: itemCost(s, "interceptor") };
  return { ...spent, duel: { ...duel, intercepts: [...duel.intercepts, ic] }, log: log(s, "An Interceptor locked onto the duel.") };
}

export { ITEM_NAMES, ITEM_IDS };
