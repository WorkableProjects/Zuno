/**
 * Draw It: one player draws a secret word, everyone else races to guess it.
 * Pure rules run on the host. Strokes never pass through here: the drawer's
 * device writes them straight to the room so they stream with no delay.
 */
import { nextRandom, shuffle, str, num, type PartyAction } from "../party/types";
import { WORDS } from "./words";

export interface DrawSettings {
  /** Times around the table. Everyone draws once per round. */
  rounds: number;
  drawSeconds: number;
  /** Extra words, comma or line separated. */
  customWords: string;
  onlyCustom: boolean;
  hints: boolean;
}

export const DRAW_LIMITS = { rounds: [1, 10], drawSeconds: [30, 240] } as const;
export const DEFAULT_DRAW_SETTINGS: DrawSettings = { rounds: 3, drawSeconds: 80, customWords: "", onlyCustom: false, hints: true };
export const PICK_SECONDS = 15;
export const REVEAL_SECONDS = 6;
export const CHOICES = 3;

export interface DrawPlayer {
  id: string;
  name: string;
  score: number;
  removed?: boolean;
}

export interface ChatLine {
  id: number;
  by: string | null;
  text: string;
  kind: "guess" | "correct" | "system";
}

export type DrawPhase = "pick" | "draw" | "reveal" | "over";

export interface DrawState {
  phase: DrawPhase;
  settings: DrawSettings;
  players: DrawPlayer[];
  round: number;
  /** Index into players of the drawer. */
  drawerIndex: number;
  choices: string[];
  word: string | null;
  /** Indices of letters shown to guessers. */
  hinted: number[];
  timeLeft: number;
  /** Points earned this turn, by player. Guessers who are in here have found the word. */
  turnPoints: Record<string, number>;
  /** Changes every turn, so each turn draws on a fresh canvas. */
  turnKey: number;
  chat: ChatLine[];
  chatSeq: number;
  /** A guess one letter off, shown only to who typed it. */
  close: Record<string, string>;
  pool: string[];
  seed: number;
  endedEarly: boolean;
  lastWord: string | null;
}

export function parseWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const w = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    const k = w.toLowerCase();
    if (w.length >= 2 && !seen.has(k)) {
      seen.add(k);
      out.push(w);
    }
  }
  return out;
}

export function wordPool(settings: DrawSettings): string[] {
  const custom = parseWords(settings.customWords);
  return settings.onlyCustom && custom.length >= CHOICES ? custom : [...custom, ...WORDS];
}

/** Lower case, letters and digits only. */
export const normalize = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const active = (p: DrawPlayer) => !p.removed;

function drawPick(s: DrawState): DrawState {
  let pool = s.pool;
  let seed = s.seed;
  if (pool.length < CHOICES) [pool, seed] = shuffle(wordPool(s.settings), seed);
  return { ...s, phase: "pick", choices: pool.slice(0, CHOICES), pool: pool.slice(CHOICES), seed, word: null, hinted: [], turnPoints: {}, close: {}, timeLeft: PICK_SECONDS, turnKey: s.turnKey + 1 };
}

export function createDraw(players: Array<{ id: string; name: string }>, settings: DrawSettings, seed: number): DrawState {
  const [pool, next] = shuffle(wordPool(settings), seed);
  const base: DrawState = {
    phase: "pick",
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name, score: 0 })),
    round: 1,
    drawerIndex: 0,
    choices: [],
    word: null,
    hinted: [],
    timeLeft: PICK_SECONDS,
    turnPoints: {},
    turnKey: 0,
    chat: [],
    chatSeq: 0,
    close: {},
    pool,
    seed: next,
    endedEarly: false,
    lastWord: null,
  };
  return drawPick(say(base, null, `Round 1 of ${settings.rounds}.`, "system"));
}

function say(s: DrawState, by: string | null, text: string, kind: ChatLine["kind"]): DrawState {
  const line: ChatLine = { id: s.chatSeq + 1, by, text, kind };
  return { ...s, chatSeq: s.chatSeq + 1, chat: [...s.chat, line].slice(-40) };
}

export const drawerOf = (s: DrawState) => s.players[s.drawerIndex];

function startDrawing(s: DrawState, word: string): DrawState {
  return say({ ...s, phase: "draw", word, choices: [], timeLeft: s.settings.drawSeconds }, null, `${drawerOf(s).name} is drawing.`, "system");
}

function guessers(s: DrawState): DrawPlayer[] {
  const d = drawerOf(s);
  return s.players.filter((p) => active(p) && p.id !== d.id);
}

function endTurn(s: DrawState, why: string): DrawState {
  const word = s.word ?? s.choices[0] ?? "";
  // The drawer earns from every correct guess.
  const found = Object.keys(s.turnPoints).filter((id) => id !== drawerOf(s).id).length;
  const drawerGain = found === 0 ? 0 : Math.min(400, 50 + found * 75);
  const d = drawerOf(s);
  const turnPoints = drawerGain > 0 ? { ...s.turnPoints, [d.id]: drawerGain } : s.turnPoints;
  const players = s.players.map((p) => (p.id === d.id ? { ...p, score: p.score + drawerGain } : p));
  return say({ ...s, players, turnPoints, phase: "reveal", timeLeft: REVEAL_SECONDS, lastWord: word, word }, null, `${why} The word was "${word}".`, "system");
}

function advance(s: DrawState): DrawState {
  const n = s.players.length;
  let i = s.drawerIndex;
  let round = s.round;
  for (let step = 0; step < n; step++) {
    i++;
    if (i >= n) {
      i = 0;
      round++;
    }
    if (active(s.players[i])) break;
  }
  if (round > s.settings.rounds || s.players.filter(active).length < 2) return { ...s, phase: "over", timeLeft: 0, word: s.word };
  let next: DrawState = { ...s, drawerIndex: i, round };
  if (round !== s.round) next = say(next, null, `Round ${round} of ${s.settings.rounds}.`, "system");
  return drawPick(next);
}

function revealHint(s: DrawState): DrawState {
  if (!s.word || !s.settings.hints) return s;
  const hidden = [...s.word].map((ch, i) => (/[a-z0-9]/i.test(ch) && !s.hinted.includes(i) ? i : -1)).filter((i) => i >= 0);
  // Always leave at least half the letters hidden.
  if (hidden.length <= Math.ceil([...s.word].filter((c) => /[a-z0-9]/i.test(c)).length / 2)) return s;
  const [r, seed] = nextRandom(s.seed);
  return { ...s, seed, hinted: [...s.hinted, hidden[Math.floor(r * hidden.length)]] };
}

function guess(s: DrawState, by: string, text: string): DrawState {
  const me = s.players.find((p) => p.id === by);
  const clean = text.trim().slice(0, 60);
  if (!me || me.removed || !clean) return s;
  const isDrawer = drawerOf(s).id === by;
  if (s.phase !== "draw" || !s.word || isDrawer || by in s.turnPoints) {
    // Chat is open between turns, but the drawer and solvers can't leak the word.
    if (s.phase === "draw" && s.word && normalize(clean).includes(normalize(s.word))) return s;
    return say(s, by, clean, "guess");
  }
  if (normalize(clean) === normalize(s.word)) {
    const order = Object.keys(s.turnPoints).length;
    const pts = Math.max(50, Math.round((400 * s.timeLeft) / s.settings.drawSeconds) + 100 - order * 20);
    let next: DrawState = {
      ...s,
      players: s.players.map((p) => (p.id === by ? { ...p, score: p.score + pts } : p)),
      turnPoints: { ...s.turnPoints, [by]: pts },
    };
    next = say(next, by, `${me.name} guessed the word!`, "correct");
    if (guessers(next).every((p) => p.id in next.turnPoints)) return endTurn(next, "Everyone got it!");
    // Once someone finds it, the clock speeds up for the rest.
    if (order === 0 && next.timeLeft > 30) next = { ...next, timeLeft: Math.max(30, Math.floor(next.timeLeft * 0.6)) };
    return next;
  }
  const a = normalize(clean);
  const b = normalize(s.word);
  const close = b.length >= 4 && editDistance(a, b) === 1;
  return { ...say(s, by, clean, "guess"), close: close ? { ...s.close, [by]: clean } : s.close };
}

function tick(s: DrawState): DrawState {
  if (s.phase === "over") return s;
  if (s.phase === "draw") {
    const total = s.settings.drawSeconds;
    const t = s.timeLeft - 1;
    let next: DrawState = { ...s, timeLeft: t };
    if (t === Math.floor(total * 0.5) || t === Math.floor(total * 0.25)) next = revealHint(next);
    if (t <= 0) return endTurn(next, "Time's up!");
    return next;
  }
  if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
  if (s.phase === "pick") return startDrawing(s, s.choices[0]);
  return advance(s);
}

function remove(s: DrawState, id: string): DrawState {
  const p = s.players.find((x) => x.id === id);
  if (!p || p.removed || s.phase === "over") return s;
  let next = say({ ...s, players: s.players.map((x) => (x.id === id ? { ...x, removed: true } : x)) }, null, `${p.name} left.`, "system");
  if (next.players.filter(active).length < 2) return { ...next, phase: "over", timeLeft: 0 };
  if (drawerOf(s).id === id) {
    if (s.phase === "pick" || s.phase === "draw") return endTurn(next, "The drawer left.");
  } else if (s.phase === "draw" && guessers(next).length > 0 && guessers(next).every((g) => g.id in next.turnPoints)) next = endTurn(next, "Everyone got it!");
  return next;
}

export function drawReducer(s: DrawState, a: PartyAction): DrawState {
  switch (a.type) {
    case "tick":
      return tick(s);
    case "remove":
      return remove(s, a.id);
    case "end":
      return s.phase === "over" ? s : { ...s, phase: "over", timeLeft: 0, endedEarly: true };
    case "move": {
      const m = a.move;
      if (m.type === "pick") {
        const i = num(m.index);
        if (s.phase !== "pick" || drawerOf(s).id !== a.by || !Number.isInteger(i) || i < 0 || i >= s.choices.length) return s;
        return startDrawing(s, s.choices[i]);
      }
      if (m.type === "guess") return guess(s, a.by, str(m.text, 60));
      return s;
    }
  }
}

export interface DrawOnline {
  phase: DrawPhase;
  round: number;
  rounds: number;
  drawer: string;
  timeLeft: number;
  drawSeconds: number;
  /** One entry per character: the letter if shown, "_" if hidden, or a space or dash as is. */
  mask: string[];
  /** The word, published only once the turn is over. */
  reveal: string | null;
  turnPoints: Record<string, number>;
  turnKey: number;
  players: DrawPlayer[];
  chat: ChatLine[];
  endedEarly: boolean;
}

export function toDrawOnline(s: DrawState): DrawOnline {
  const word = s.word ?? "";
  const shown = s.phase === "reveal" || s.phase === "over";
  return {
    phase: s.phase,
    round: s.round,
    rounds: s.settings.rounds,
    drawer: drawerOf(s)?.id ?? "",
    timeLeft: s.timeLeft,
    drawSeconds: s.settings.drawSeconds,
    mask: [...word].map((ch, i) => (shown || !/[a-z0-9]/i.test(ch) || s.hinted.includes(i) ? ch : "_")),
    reveal: shown ? s.lastWord : null,
    turnPoints: s.turnPoints,
    turnKey: s.turnKey,
    players: s.players,
    chat: s.chat,
    endedEarly: s.endedEarly,
  };
}

export interface DrawPrivate {
  choices: string[];
  word: string | null;
  close: string | null;
}

export function drawPrivate(s: DrawState, id: string): DrawPrivate {
  const isDrawer = drawerOf(s)?.id === id;
  return {
    choices: isDrawer && s.phase === "pick" ? s.choices : [],
    word: (isDrawer || id in s.turnPoints) && s.phase === "draw" ? s.word : null,
    close: s.phase === "draw" ? (s.close[id] ?? null) : null,
  };
}
