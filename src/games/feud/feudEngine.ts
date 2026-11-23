/**
 * Feud, player-led: everyone writes a survey (a prompt plus answers with point
 * values). Each survey becomes a round hosted by its author while everyone else
 * takes turns guessing the answers. The round's host judges any guess the
 * game can't match on its own.
 */
import { num, str, type PartyAction } from "../party/types";
import { editDistance, normalize } from "../drawit/drawEngine";

export interface FeudSettings {
  maxAnswers: number;
  writeSeconds: number;
  guessSeconds: number;
  strikes: number;
}

export const FEUD_LIMITS = { maxAnswers: [3, 8], writeSeconds: [60, 600], guessSeconds: [10, 60], strikes: [1, 5] } as const;
export const DEFAULT_FEUD_SETTINGS: FeudSettings = { maxAnswers: 6, writeSeconds: 240, guessSeconds: 25, strikes: 3 };
export const MIN_ANSWERS = 3;
export const JUDGE_SECONDS = 20;
export const SHOW_SECONDS = 3;
export const ROUND_END_SECONDS = 8;

export interface FeudAnswer {
  text: string;
  points: number;
}

export interface Survey {
  by: string;
  prompt: string;
  answers: FeudAnswer[];
}

export interface FeudPlayer {
  id: string;
  name: string;
  score: number;
  removed?: boolean;
}

export type FeudPhase = "write" | "guess" | "judge" | "show" | "roundEnd" | "over";

export interface FeudState {
  phase: FeudPhase;
  settings: FeudSettings;
  players: FeudPlayer[];
  timeLeft: number;
  surveys: Record<string, Survey>;
  /** Survey authors in play order. */
  queue: string[];
  roundIndex: number;
  revealed: boolean[];
  /** Who found each answer. */
  foundBy: Array<string | null>;
  strikes: number;
  /** Rotates through the guessers. */
  guesserCursor: number;
  guesser: string | null;
  pending: { by: string; text: string } | null;
  /** The last guess and how it went, shown briefly. */
  last: { by: string; text: string; answer: number | null } | null;
  log: string[];
  endedEarly: boolean;
}

const log = (s: FeudState, line: string) => [line, ...s.log].slice(0, 40);
const nameOf = (s: FeudState, id: string) => s.players.find((p) => p.id === id)?.name ?? "Someone";
const active = (p: FeudPlayer) => !p.removed;

export function createFeud(players: Array<{ id: string; name: string }>, settings: FeudSettings): FeudState {
  return {
    phase: "write",
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name, score: 0 })),
    timeLeft: settings.writeSeconds,
    surveys: {},
    queue: [],
    roundIndex: -1,
    revealed: [],
    foundBy: [],
    strikes: 0,
    guesserCursor: 0,
    guesser: null,
    pending: null,
    last: null,
    log: ["Everyone write a survey!"],
    endedEarly: false,
  };
}

/** Cleans a submitted survey, or returns null when it is not playable. */
export function cleanSurvey(by: string, raw: Record<string, unknown>, maxAnswers: number): Survey | null {
  const prompt = str(raw.prompt, 140).trim();
  if (prompt.length < 3 || !Array.isArray(raw.answers)) return null;
  const seen = new Set<string>();
  const answers: FeudAnswer[] = [];
  for (const a of raw.answers.slice(0, maxAnswers)) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const text = str(r.text, 60).trim();
    const points = Math.round(num(r.points));
    if (!text || !Number.isFinite(points) || points < 1 || points > 100 || seen.has(normalize(text))) continue;
    seen.add(normalize(text));
    answers.push({ text, points });
  }
  if (answers.length < MIN_ANSWERS) return null;
  answers.sort((a, b) => b.points - a.points);
  return { by, prompt, answers };
}

export const roundHost = (s: FeudState): string | null => s.queue[s.roundIndex] ?? null;
export const currentSurvey = (s: FeudState): Survey | null => {
  const h = roundHost(s);
  return h ? (s.surveys[h] ?? null) : null;
};

function guessersOf(s: FeudState): FeudPlayer[] {
  const h = roundHost(s);
  return s.players.filter((p) => active(p) && p.id !== h);
}

function nextGuesser(s: FeudState): FeudState {
  const gs = guessersOf(s);
  if (gs.length === 0) return endRound(s, "Nobody is left to guess.");
  const i = s.guesserCursor % gs.length;
  return { ...s, phase: "guess", guesser: gs[i].id, guesserCursor: i + 1, pending: null, timeLeft: s.settings.guessSeconds };
}

function startRound(s: FeudState, index: number): FeudState {
  // Skip surveys whose author has left.
  while (index < s.queue.length && s.players.find((p) => p.id === s.queue[index])?.removed) index++;
  if (index >= s.queue.length) return { ...s, phase: "over", timeLeft: 0, guesser: null, pending: null, roundIndex: index, log: log(s, "That was the last survey.") };
  const sv = s.surveys[s.queue[index]];
  const next: FeudState = {
    ...s,
    roundIndex: index,
    revealed: sv.answers.map(() => false),
    foundBy: sv.answers.map(() => null),
    strikes: 0,
    last: null,
    log: log(s, `Round ${index + 1}: ${nameOf(s, sv.by)} asks "${sv.prompt}"`),
  };
  return nextGuesser(next);
}

function closeWriting(s: FeudState): FeudState {
  const queue = s.players.filter((p) => active(p) && s.surveys[p.id]).map((p) => p.id);
  if (queue.length === 0) return { ...s, phase: "over", timeLeft: 0, log: log(s, "Nobody wrote a survey.") };
  return startRound({ ...s, queue, guesserCursor: 0 }, 0);
}

/** Answer text may hold alternatives split by "/", such as "car / automobile". */
export function matchAnswer(guess: string, answers: readonly FeudAnswer[], revealed: readonly boolean[]): number | null {
  const g = normalize(guess);
  if (!g) return null;
  let best: number | null = null;
  answers.forEach((a, i) => {
    if (revealed[i] || best !== null) return;
    for (const alt of a.text.split("/")) {
      const t = normalize(alt);
      if (!t) continue;
      const plural = g === `${t}s` || t === `${g}s` || g === `${t}es` || t === `${g}es`;
      if (g === t || plural || (t.length >= 5 && editDistance(g, t) <= 1)) {
        best = i;
        return;
      }
    }
  });
  return best;
}

function award(s: FeudState, by: string, text: string, index: number): FeudState {
  const sv = currentSurvey(s)!;
  const a = sv.answers[index];
  const revealed = s.revealed.map((r, i) => r || i === index);
  const foundBy = s.foundBy.map((f, i) => (i === index ? by : f));
  const players = s.players.map((p) => (p.id === by ? { ...p, score: p.score + a.points } : p));
  return { ...s, players, revealed, foundBy, phase: "show", timeLeft: SHOW_SECONDS, pending: null, last: { by, text, answer: index }, log: log(s, `${nameOf(s, by)} found "${a.text}" for ${a.points}.`) };
}

function strike(s: FeudState, by: string, text: string): FeudState {
  return { ...s, strikes: s.strikes + 1, phase: "show", timeLeft: SHOW_SECONDS, pending: null, last: { by, text, answer: null }, log: log(s, text ? `Strike! "${text}" is not on the board.` : `Strike! ${nameOf(s, by)} ran out of time.`) };
}

function afterShow(s: FeudState): FeudState {
  if (s.revealed.every(Boolean)) return endRound(s, "Board cleared!");
  if (s.strikes >= s.settings.strikes) return endRound(s, `${s.strikes} strike${s.strikes === 1 ? "" : "s"}. Round over.`);
  return nextGuesser(s);
}

function endRound(s: FeudState, why: string): FeudState {
  return { ...s, phase: "roundEnd", timeLeft: ROUND_END_SECONDS, guesser: null, pending: null, revealed: s.revealed.map(() => true), log: log(s, why) };
}

function act(s: FeudState, by: string, m: Record<string, unknown>): FeudState {
  const me = s.players.find((p) => p.id === by);
  if (!me || me.removed) return s;
  if (m.type === "survey") {
    if (s.phase !== "write") return s;
    const sv = cleanSurvey(by, m, s.settings.maxAnswers);
    if (!sv) return s;
    const first = !s.surveys[by];
    const next = { ...s, surveys: { ...s.surveys, [by]: sv }, log: first ? log(s, `${me.name} finished a survey.`) : s.log };
    if (s.players.filter(active).every((p) => next.surveys[p.id])) return closeWriting(next);
    return next;
  }
  if (m.type === "guess") {
    if (s.phase !== "guess" || s.guesser !== by) return s;
    const text = str(m.text, 60).trim();
    if (!text) return s;
    const sv = currentSurvey(s)!;
    const hit = matchAnswer(text, sv.answers, s.revealed);
    if (hit !== null) return award(s, by, text, hit);
    return { ...s, phase: "judge", pending: { by, text }, timeLeft: JUDGE_SECONDS };
  }
  if (m.type === "judge") {
    if (s.phase !== "judge" || roundHost(s) !== by || !s.pending) return s;
    const i = num(m.index);
    const sv = currentSurvey(s)!;
    if (i === -1) return strike(s, s.pending.by, s.pending.text);
    if (!Number.isInteger(i) || i < 0 || i >= sv.answers.length || s.revealed[i]) return s;
    return award(s, s.pending.by, s.pending.text, i);
  }
  return s;
}

function tick(s: FeudState): FeudState {
  if (s.phase === "over") return s;
  if (s.timeLeft > 1) return { ...s, timeLeft: s.timeLeft - 1 };
  switch (s.phase) {
    case "write":
      return closeWriting(s);
    case "guess":
      return strike(s, s.guesser ?? "", "");
    case "judge":
      return s.pending ? strike(s, s.pending.by, s.pending.text) : nextGuesser(s);
    case "show":
      return afterShow(s);
    case "roundEnd":
      return startRound(s, s.roundIndex + 1);
  }
}

function remove(s: FeudState, id: string): FeudState {
  const p = s.players.find((x) => x.id === id);
  if (!p || p.removed || s.phase === "over") return s;
  let next: FeudState = { ...s, players: s.players.map((x) => (x.id === id ? { ...x, removed: true } : x)), log: log(s, `${p.name} left.`) };
  if (next.players.filter(active).length < 2) return { ...next, phase: "over", timeLeft: 0 };
  if (s.phase === "write") {
    if (next.players.filter(active).every((x) => next.surveys[x.id])) return closeWriting(next);
    return next;
  }
  if (roundHost(s) === id && s.phase !== "roundEnd") return endRound(next, "The round's host left.");
  if (s.guesser === id && s.phase === "guess") next = nextGuesser(next);
  if (s.pending?.by === id && s.phase === "judge") next = nextGuesser(next);
  return next;
}

export function feudReducer(s: FeudState, a: PartyAction): FeudState {
  switch (a.type) {
    case "tick":
      return tick(s);
    case "move":
      return act(s, a.by, a.move);
    case "remove":
      return remove(s, a.id);
    case "end":
      return s.phase === "over" ? s : { ...s, phase: "over", timeLeft: 0, guesser: null, pending: null, endedEarly: true };
  }
}

export interface FeudOnline {
  phase: FeudPhase;
  timeLeft: number;
  players: FeudPlayer[];
  /** Who has finished their survey. */
  written: string[];
  maxAnswers: number;
  round: number;
  rounds: number;
  host: string | null;
  prompt: string | null;
  /** Hidden answers are null. */
  board: Array<{ text: string; points: number; by: string | null } | null>;
  strikes: number;
  maxStrikes: number;
  guesser: string | null;
  pending: { by: string; text: string } | null;
  last: FeudState["last"];
  log: string[];
  endedEarly: boolean;
}

export function toFeudOnline(s: FeudState): FeudOnline {
  const sv = currentSurvey(s);
  return {
    phase: s.phase,
    timeLeft: s.timeLeft,
    players: s.players,
    written: Object.keys(s.surveys),
    maxAnswers: s.settings.maxAnswers,
    round: s.roundIndex + 1,
    rounds: s.queue.length,
    host: roundHost(s),
    prompt: sv?.prompt ?? null,
    board: sv ? sv.answers.map((a, i) => (s.revealed[i] ? { ...a, by: s.foundBy[i] } : null)) : [],
    strikes: s.strikes,
    maxStrikes: s.settings.strikes,
    guesser: s.guesser,
    pending: s.pending,
    last: s.last,
    log: s.log,
    endedEarly: s.endedEarly,
  };
}

export interface FeudPrivate {
  /** Your own survey while writing. */
  mine: Survey | null;
  /** The full board, for the round's host only. */
  answers: FeudAnswer[] | null;
}

export function feudPrivate(s: FeudState, id: string): FeudPrivate {
  const sv = currentSurvey(s);
  return { mine: s.phase === "write" ? (s.surveys[id] ?? null) : null, answers: sv && sv.by === id && s.phase !== "over" ? sv.answers : null };
}
