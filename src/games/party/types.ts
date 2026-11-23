import type { FC, ReactNode } from "react";
import type { PartyKind, PartyLobbyState } from "./partyRoom";

export type PartyAction =
  | { type: "tick" }
  | { type: "remove"; id: string }
  | { type: "end" }
  /** A player's move. `by` is the inbox it arrived in, never anything the phone wrote. */
  | { type: "move"; by: string; move: Record<string, unknown> };

export type Published<O> = O & { rev: number };

export interface PlayProps<O, P> {
  code: string;
  me: string;
  lobby: PartyLobbyState<Published<O>>;
  game: Published<O>;
  priv: P | null;
  send: (move: Record<string, unknown>) => Promise<void>;
  /** True only while a move is slow to send, so quick moves don't flash every button. */
  busy: boolean;
  /** Host-only controls, shown in the side panel. */
  host?: ReactNode;
  avatarOf: (id: string) => PartyLobbyState["players"][string]["avatar"] | undefined;
}

export interface PartyGameDef<S, O, P, Settings> {
  kind: PartyKind;
  gameType: string;
  title: string;
  tagline: string;
  howto: string[];
  accent: string;
  minPlayers: number;
  maxPlayers: number;
  defaultSettings: Settings;
  SettingsEditor: FC<{ value: Settings; onChange: (s: Settings) => void }>;
  settingsValid: (s: Settings) => boolean;
  /** One line about the room's settings for phones in the lobby. */
  note: (s: Settings) => string;
  create: (players: Array<{ id: string; name: string }>, settings: Settings, seed: number) => S;
  reduce: (s: S, a: PartyAction) => S;
  toOnline: (s: S) => O;
  privateOf: (s: S, id: string) => P | null;
  isOver: (s: S) => boolean;
  Play: FC<PlayProps<O, P>>;
  /** What "End game" says will happen. */
  endText: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPartyDef = PartyGameDef<any, any, any, any>;

/** Small deterministic random source kept in game state, so reducers stay pure. */
export function nextRandom(seed: number): [number, number] {
  const t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

/** Shuffles a copy with the state's random source and returns the next seed. */
export function shuffle<T>(items: readonly T[], seed: number): [T[], number] {
  const a = items.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    const [r, n] = nextRandom(s);
    s = n;
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a, s];
}

export const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");
export const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
