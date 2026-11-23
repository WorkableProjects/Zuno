/**
 * Online Blackjack against the house. Pure rules: the host's device runs this
 * reducer and publishes everything except the dealer's hole card and the shoe.
 */
import { num, shuffle, type PartyAction } from "../party/types";

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = `${Rank}${Suit}`;
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["S", "H", "D", "C"];
export const DECKS = 6;

export interface BjSettings {
  startingChips: number;
  minBet: number;
  betSeconds: number;
  turnSeconds: number;
  /** Rounds to play. 0 plays until one player is left with chips or the host ends it. */
  rounds: number;
}

export const BJ_LIMITS = {
  chips: [100, 1_000_000],
  minBet: [1, 100_000],
  betSeconds: [5, 60],
  turnSeconds: [5, 60],
  rounds: [0, 100],
} as const;

export const DEFAULT_BJ_SETTINGS: BjSettings = { startingChips: 1000, minBet: 10, betSeconds: 20, turnSeconds: 20, rounds: 10 };
export const DEALER_STEP_SECONDS = 1;
export const RESULTS_SECONDS = 6;

export interface BjPlayer {
  id: string;
  name: string;
  chips: number;
  removed?: boolean;
}

export type HandResult = "blackjack" | "win" | "push" | "lose" | "bust";

export interface Hand {
  cards: Card[];
  bet: number;
  done: boolean;
  doubled: boolean;
  /** Came from a split. A split 21 is not a blackjack. */
  split: boolean;
  result: HandResult | null;
  /** Coins returned at settlement, stake included. */
  payout: number;
}

export type BjPhase = "betting" | "playing" | "dealer" | "results" | "over";

export interface BjState {
  phase: BjPhase;
  settings: BjSettings;
  players: BjPlayer[];
  timeLeft: number;
  round: number;
  shoe: Card[];
  seed: number;
  bets: Record<string, number>;
  hands: Record<string, Hand[]>;
  dealer: Card[];
  holeShown: boolean;
  /** Who is acting, and which of their hands. */
  turn: { id: string; hand: number } | null;
  log: string[];
  endedEarly: boolean;
  /** Bumps when the shoe is reshuffled, for a banner. */
  shuffles: number;
}

export function cardValue(c: Card): number {
  const r = c.slice(0, -1) as Rank;
  if (r === "A") return 11;
  if (r === "J" || r === "Q" || r === "K") return 10;
  return Number(r);
}

export const rankOf = (c: Card) => c.slice(0, -1) as Rank;
export const suitOf = (c: Card) => c.slice(-1) as Suit;

/** Best total of a hand and whether an ace still counts as 11. */
export function handTotal(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (rankOf(c) === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (h: { cards: readonly Card[]; split?: boolean }) => h.cards.length === 2 && !h.split && handTotal(h.cards).total === 21;

function freshShoe(seed: number): [Card[], number] {
  const cards: Card[] = [];
  for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) cards.push(`${r}${s}`);
  return shuffle(cards, seed);
}

export function createBlackjack(players: Array<{ id: string; name: string }>, settings: BjSettings, seed: number): BjState {
  const [shoe, next] = freshShoe(seed);
  return {
    phase: "betting",
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name, chips: settings.startingChips })),
    timeLeft: settings.betSeconds,
    round: 1,
    shoe,
    seed: next,
    bets: {},
    hands: {},
    dealer: [],
    holeShown: false,
    turn: null,
    log: ["Place your bets!"],
    endedEarly: false,
    shuffles: 0,
  };
}

const log = (s: BjState, line: string) => [line, ...s.log].slice(0, 40);
const nameOf = (s: BjState, id: string) => s.players.find((p) => p.id === id)?.name ?? "Someone";
export const canBet = (s: BjState, p: BjPlayer) => !p.removed && p.chips >= s.settings.minBet;

function draw(s: BjState): [Card, BjState] {
  let { shoe, seed, shuffles } = s;
  if (shoe.length === 0) {
    [shoe, seed] = freshShoe(seed);
    shuffles++;
  }
  return [shoe[0], { ...s, shoe: shoe.slice(1), seed, shuffles }];
}

/** Seats with a bet this round, in table order. */
const seatsInPlay = (s: BjState) => s.players.filter((p) => !p.removed && (s.hands[p.id]?.length ?? 0) > 0);

function deal(s: BjState): BjState {
  // Reshuffle between rounds once a quarter of the shoe is left.
  if (s.shoe.length < (52 * DECKS) / 4) {
    const [shoe, seed] = freshShoe(s.seed);
    s = { ...s, shoe, seed, shuffles: s.shuffles + 1, log: log(s, "The dealer reshuffled the shoe.") };
  }
  const hands: Record<string, Hand[]> = {};
  const ids = s.players.filter((p) => (s.bets[p.id] ?? 0) > 0 && !p.removed).map((p) => p.id);
  for (const id of ids) hands[id] = [{ cards: [], bet: s.bets[id], done: false, doubled: false, split: false, result: null, payout: 0 }];
  let dealer: Card[] = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const id of ids) {
      let c: Card;
      [c, s] = draw(s);
      hands[id][0] = { ...hands[id][0], cards: [...hands[id][0].cards, c] };
    }
    let c: Card;
    [c, s] = draw(s);
    dealer = [...dealer, c];
  }
  for (const id of ids) if (isBlackjack(hands[id][0])) hands[id][0] = { ...hands[id][0], done: true };
  s = { ...s, hands, dealer, holeShown: false, bets: {} };
  // The dealer peeks: a dealer blackjack ends the round at once.
  if (isBlackjack({ cards: dealer })) return settle({ ...s, holeShown: true, log: log(s, "Dealer has Blackjack!") });
  return nextTurn({ ...s, phase: "playing", turn: null });
}

/** Moves to the next unfinished hand, or to the dealer. */
function nextTurn(s: BjState): BjState {
  for (const p of seatsInPlay(s)) {
    const hs = s.hands[p.id];
    const i = hs.findIndex((h) => !h.done);
    if (i >= 0) return { ...s, phase: "playing", turn: { id: p.id, hand: i }, timeLeft: s.settings.turnSeconds };
  }
  const anyLive = seatsInPlay(s).some((p) => s.hands[p.id].some((h) => handTotal(h.cards).total <= 21 && !isBlackjack(h)));
  if (!anyLive) return settle({ ...s, holeShown: true, turn: null });
  return { ...s, phase: "dealer", turn: null, holeShown: true, timeLeft: DEALER_STEP_SECONDS };
}

function settle(s: BjState): BjState {
  const dealer = handTotal(s.dealer).total;
  const dealerBJ = isBlackjack({ cards: s.dealer });
  let players = s.players;
  const hands: Record<string, Hand[]> = {};
  const lines: string[] = [];
  for (const [id, hs] of Object.entries(s.hands)) {
    let gained = 0;
    let staked = 0;
    hands[id] = hs.map((h) => {
      const t = handTotal(h.cards).total;
      let result: HandResult;
      let payout = 0;
      if (t > 21) result = "bust";
      else if (isBlackjack(h) && !dealerBJ) {
        result = "blackjack";
        payout = h.bet + Math.floor(h.bet * 1.5);
      } else if (dealerBJ) result = isBlackjack(h) ? "push" : "lose";
      else if (dealer > 21 || t > dealer) result = "win";
      else if (t === dealer) result = "push";
      else result = "lose";
      if (result === "win") payout = h.bet * 2;
      if (result === "push") payout = h.bet;
      gained += payout;
      staked += h.bet;
      return { ...h, done: true, result, payout };
    });
    players = players.map((p) => (p.id === id ? { ...p, chips: p.chips + gained } : p));
    const net = gained - staked;
    lines.push(`${nameOf(s, id)} ${net > 0 ? `won ${net}` : net < 0 ? `lost ${-net}` : "pushed"}.`);
  }
  return { ...s, players, hands, phase: "results", turn: null, holeShown: true, timeLeft: RESULTS_SECONDS, log: [...lines.reverse(), ...s.log].slice(0, 40) };
}

function nextRound(s: BjState): BjState {
  const live = s.players.filter((p) => canBet(s, p));
  const roundsDone = s.settings.rounds > 0 && s.round >= s.settings.rounds;
  if (roundsDone || live.length === 0 || (s.players.filter((p) => !p.removed).length > 1 && live.length <= 1 && s.settings.rounds === 0)) {
    return { ...s, phase: "over", timeLeft: 0, turn: null, log: log(s, roundsDone ? "That was the last round." : "The table is closed.") };
  }
  return { ...s, phase: "betting", timeLeft: s.settings.betSeconds, round: s.round + 1, hands: {}, dealer: [], holeShown: false, bets: {}, turn: null };
}

function closeBetting(s: BjState): BjState {
  if (Object.keys(s.bets).length === 0) {
    if (!s.players.some((p) => canBet(s, p))) return { ...s, phase: "over", timeLeft: 0, log: log(s, "Nobody can cover the minimum bet.") };
    return { ...s, timeLeft: s.settings.betSeconds, log: log(s, "No bets. The dealer waits.") };
  }
  return deal(s);
}

function dealerStep(s: BjState): BjState {
  const { total, soft } = handTotal(s.dealer);
  // The dealer stands on every 17, soft or hard.
  void soft;
  if (total >= 17) return settle(s);
  let c: Card;
  [c, s] = draw(s);
  const dealer = [...s.dealer, c];
  if (handTotal(dealer).total >= 17) return { ...s, dealer, timeLeft: DEALER_STEP_SECONDS };
  return { ...s, dealer, timeLeft: DEALER_STEP_SECONDS };
}

function updateHand(s: BjState, id: string, i: number, h: Hand): BjState {
  return { ...s, hands: { ...s.hands, [id]: s.hands[id].map((x, j) => (j === i ? h : x)) } };
}

function act(s: BjState, by: string, move: Record<string, unknown>): BjState {
  const me = s.players.find((p) => p.id === by);
  if (!me || me.removed) return s;
  if (move.type === "bet") {
    if (s.phase !== "betting" || s.bets[by] || !canBet(s, me)) return s;
    const amount = num(move.amount);
    if (!Number.isSafeInteger(amount) || amount < s.settings.minBet || amount > me.chips) return s;
    const next: BjState = {
      ...s,
      players: s.players.map((p) => (p.id === by ? { ...p, chips: p.chips - amount } : p)),
      bets: { ...s.bets, [by]: amount },
      log: log(s, `${me.name} bet ${amount}.`),
    };
    // Everyone who can bet has: deal now.
    if (next.players.filter((p) => canBet(s, p)).every((p) => next.bets[p.id])) return deal(next);
    return next;
  }
  if (s.phase !== "playing" || !s.turn || s.turn.id !== by) return s;
  const i = s.turn.hand;
  const h = s.hands[by][i];
  if (move.type === "hit") {
    let c: Card;
    [c, s] = draw(s);
    const cards = [...h.cards, c];
    const t = handTotal(cards).total;
    s = updateHand(s, by, i, { ...h, cards, done: t >= 21 });
    if (t > 21) s = { ...s, log: log(s, `${me.name} busts with ${t}.`) };
    return t >= 21 ? nextTurn(s) : { ...s, timeLeft: s.settings.turnSeconds };
  }
  if (move.type === "stand") return nextTurn(updateHand(s, by, i, { ...h, done: true }));
  if (move.type === "double") {
    if (h.cards.length !== 2 || me.chips < h.bet) return s;
    let c: Card;
    [c, s] = draw(s);
    s = { ...s, players: s.players.map((p) => (p.id === by ? { ...p, chips: p.chips - h.bet } : p)), log: log(s, `${me.name} doubles down.`) };
    return nextTurn(updateHand(s, by, i, { ...h, cards: [...h.cards, c], bet: h.bet * 2, doubled: true, done: true }));
  }
  if (move.type === "split") {
    if (!canSplit(s, by)) return s;
    let a: Card;
    let b: Card;
    [a, s] = draw(s);
    [b, s] = draw(s);
    const first: Hand = { ...h, cards: [h.cards[0], a], split: true };
    const second: Hand = { ...h, cards: [h.cards[1], b], split: true };
    // Split aces get one card each.
    const aces = rankOf(h.cards[0]) === "A";
    const hands = s.hands[by].slice();
    hands.splice(i, 1, { ...first, done: aces || handTotal(first.cards).total === 21 }, { ...second, done: aces || handTotal(second.cards).total === 21 });
    s = {
      ...s,
      players: s.players.map((p) => (p.id === by ? { ...p, chips: p.chips - h.bet } : p)),
      hands: { ...s.hands, [by]: hands },
      log: log(s, `${me.name} splits.`),
    };
    return hands[i].done ? nextTurn(s) : { ...s, timeLeft: s.settings.turnSeconds };
  }
  return s;
}

/** A pair of equal rank, enough chips for a second bet, and at most four hands. */
export function canSplit(s: BjState, id: string): boolean {
  const t = s.turn;
  if (!t || t.id !== id) return false;
  const h = s.hands[id]?.[t.hand];
  const me = s.players.find((p) => p.id === id);
  return !!h && !!me && h.cards.length === 2 && cardValue(h.cards[0]) === cardValue(h.cards[1]) && me.chips >= h.bet && s.hands[id].length < 4;
}

function removePlayer(s: BjState, id: string): BjState {
  const p = s.players.find((x) => x.id === id);
  if (!p || p.removed || s.phase === "over") return s;
  let next: BjState = { ...s, players: s.players.map((x) => (x.id === id ? { ...x, removed: true } : x)), log: log(s, `${p.name} left the table.`) };
  if (next.bets[id]) {
    const { [id]: refund, ...rest } = next.bets;
    next = { ...next, bets: rest, players: next.players.map((x) => (x.id === id ? { ...x, chips: x.chips + refund } : x)) };
  }
  if (next.hands[id]) {
    const { [id]: gone, ...rest } = next.hands;
    void gone;
    next = { ...next, hands: rest };
  }
  if (s.turn?.id === id) next = nextTurn({ ...next, turn: null });
  if (next.phase === "betting" && next.players.filter((x) => canBet(next, x)).every((x) => next.bets[x.id]) && Object.keys(next.bets).length > 0) return deal(next);
  return next;
}

function tick(s: BjState): BjState {
  if (s.phase === "over") return s;
  if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
  switch (s.phase) {
    case "betting":
      return closeBetting(s);
    case "playing": {
      if (!s.turn) return nextTurn(s);
      const h = s.hands[s.turn.id][s.turn.hand];
      return nextTurn({ ...updateHand(s, s.turn.id, s.turn.hand, { ...h, done: true }), log: log(s, `${nameOf(s, s.turn.id)} ran out of time and stands.`) });
    }
    case "dealer":
      return dealerStep(s);
    case "results":
      return nextRound(s);
  }
}

export function bjReducer(s: BjState, a: PartyAction): BjState {
  switch (a.type) {
    case "tick":
      return tick(s);
    case "move":
      return act(s, a.by, a.move);
    case "remove":
      return removePlayer(s, a.id);
    case "end": {
      if (s.phase === "over") return s;
      // Bets still on the table go back before the standings.
      let players = s.players.map((p) => ({ ...p, chips: p.chips + (s.bets[p.id] ?? 0) }));
      if (s.phase === "playing" || s.phase === "dealer") players = players.map((p) => ({ ...p, chips: p.chips + (s.hands[p.id] ?? []).reduce((n, h) => n + h.bet, 0) }));
      return { ...s, players, bets: {}, phase: "over", timeLeft: 0, turn: null, endedEarly: true, log: log(s, "The host closed the table.") };
    }
  }
}

export interface BjOnline {
  phase: BjPhase;
  timeLeft: number;
  round: number;
  rounds: number;
  minBet: number;
  players: BjPlayer[];
  bets: Record<string, number>;
  hands: Record<string, Hand[]>;
  /** The hole card is "??" until it is turned over. */
  dealer: Array<Card | "??">;
  dealerTotal: number | null;
  turn: { id: string; hand: number } | null;
  canSplit: boolean;
  log: string[];
  endedEarly: boolean;
  shuffles: number;
}

export function toBjOnline(s: BjState): BjOnline {
  const hide = !s.holeShown && s.dealer.length >= 2;
  return {
    phase: s.phase,
    timeLeft: s.timeLeft,
    round: s.round,
    rounds: s.settings.rounds,
    minBet: s.settings.minBet,
    players: s.players,
    bets: s.bets,
    hands: s.hands,
    dealer: s.dealer.map((c, i) => (hide && i === 1 ? "??" : c)),
    dealerTotal: s.dealer.length === 0 ? null : hide ? handTotal([s.dealer[0]]).total : handTotal(s.dealer).total,
    turn: s.turn,
    canSplit: s.turn ? canSplit(s, s.turn.id) : false,
    log: s.log,
    endedEarly: s.endedEarly,
    shuffles: s.shuffles,
  };
}
