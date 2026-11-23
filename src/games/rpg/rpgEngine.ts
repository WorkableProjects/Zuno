/**
 * Rock Paper Gamble rules as pure functions. React only renders this state.
 *
 * One reducer, driven by a once-a-second `tick` plus player actions. Every
 * action names who sent it (`by`); the host fills that from the database key
 * the message arrived under, never from anything the phone wrote itself.
 */
import { DEFAULT_RPG_SETTINGS, type RpgSettings } from "../../game-files/schema/rpg";

export type Choice = "rock" | "paper" | "scissors";
export const CHOICES: readonly Choice[] = ["rock", "paper", "scissors"];

export type Phase = "countdown" | "select" | "betting" | "duel" | "results" | "over";

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
  revision: number;
}

export type RpgAction =
  | { type: "tick" }
  | { type: "challenge"; by: string; target: string; wager?: number }
  | { type: "bet"; by: string; target: string; amount: number }
  | { type: "pick"; by: string; choice: Choice }
  | { type: "gift"; by: string; target: string; amount: number }
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
  const merged: RpgSettings = { ...DEFAULT_RPG_SETTINGS, ...settings };
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

  const score = { ...duel.score };
  if (outcome.winner) score[outcome.winner] = (score[outcome.winner] ?? 0) + 1;
  const doubleMisses = outcome.reason === "bothMiss" ? duel.doubleMisses + 1 : 0;
  const next: Duel = { ...duel, score, last: outcome, picks: {}, overlay: OVERLAY_SECONDS, doubleMisses };

  if (doubleMisses >= MAX_DOUBLE_MISSES) return voidDuel(s, next);
  return { ...s, duel: next, timeLeft: 0, log: log(s, roundLine(s, outcome)) };
}

function roundLine(s: RpgState, o: RoundOutcome): string {
  if (o.reason === "bothMiss") return "Neither duelist picked. Round is a tie.";
  if (!o.winner) return "Tie. The round is replayed.";
  return o.reason === "miss" ? `${nameOf(s, o.winner)} takes the round. Their rival did not pick.` : `${nameOf(s, o.winner)} wins the round.`;
}

function voidDuel(s: RpgState, duel: Duel): RpgState {
  const players = refundAll(s.players, duel);
  const delta: Record<string, number> = {};
  const settlement: Settlement = { winner: null, loser: null, void: true, pool: poolOf(duel), delta, backers: [] };
  return {
    ...s,
    players,
    phase: "results",
    timeLeft: s.settings.resultsSeconds,
    duel: { ...duel, overlay: 0 },
    result: settlement,
    log: log(s, "Both duelists kept missing. The duel is void and every stake is refunded."),
  };
}

function finishDuel(s: RpgState, duel: Duel, winner: string): RpgState {
  const { players, settlement } = settle(s.players, duel, winner);
  return {
    ...s,
    players,
    phase: "results",
    timeLeft: s.settings.resultsSeconds,
    duel: { ...duel, overlay: 0 },
    result: settlement,
    log: log(s, `${nameOf(s, winner)} won the duel and $${settlement.pool.toLocaleString("en-US")}.`),
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
  return { ...s, players, log: log(s, `${p.name} left the game.`) };
}

function endGame(s: RpgState): RpgState {
  if (s.phase === "over") return s;
  // Stakes still in an unfinished duel go back before the standings are drawn.
  const players = s.duel && s.phase !== "results" ? refundAll(s.players, s.duel) : s.players;
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
