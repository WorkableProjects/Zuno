import { Avatar } from "../../components/avatar/AvatarView";
import { StyledUsername } from "../../components/cosmetics/Cosmetics";
import type { AvatarSpec } from "../../components/avatar/avatarData";
import { useSoundOnChange } from "../../lib/useGameSounds";
import { Coins } from "../rpg/motion";
import "./party.css";

export function PartyTimer({ seconds, label = "Time left" }: { seconds: number; label?: string }) {
  const low = seconds <= 5 && seconds > 0;
  useSoundOnChange(seconds, (a, b) => (b < a && b <= 5 && b > 0 ? "tick" : null));
  return (
    <span className={`rpg-timer ru-pill${low ? " is-low ru-urgent" : ""}`} role="timer" aria-label={`${label}: ${seconds} seconds`}>
      <span key={low ? seconds : "n"} className="rpg-timer-n ru-tick">
        {seconds}s
      </span>
    </span>
  );
}

/** Keys that survive new lines arriving: the text plus how many identical lines sit below it. */
function feedKeys(log: string[]): string[] {
  const seen = new Map<string, number>();
  const keys: string[] = new Array(log.length);
  for (let i = log.length - 1; i >= 0; i--) {
    const n = seen.get(log[i]) ?? 0;
    seen.set(log[i], n + 1);
    keys[i] = `${n}:${log[i]}`;
  }
  return keys;
}

export function FeedList({ lines, limit = 12 }: { lines: string[]; limit?: number }) {
  if (lines.length === 0) return <p className="meta">Waiting for events…</p>;
  return (
    <ol className="rpg-feed">
      {feedKeys(lines)
        .slice(0, limit)
        .map((key, i) => (
          <li key={key}>{lines[i]}</li>
        ))}
    </ol>
  );
}

export interface StandingRow {
  id: string;
  name: string;
  score: number;
  removed?: boolean;
  tag?: string;
}

/** Players ranked by score (or kept in seat order), with animated numbers. */
export function Standings({ players, me, avatarOf, money = false, keepOrder = false, final = false }: { players: StandingRow[]; me: string; avatarOf: (id: string) => AvatarSpec | null | undefined; money?: boolean; keepOrder?: boolean; final?: boolean }) {
  const rows = keepOrder ? players : players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score || a.i - b.i).map((x) => x.p);
  return (
    <ol className="rpg-players party-standings">
      {rows.map((p, i) => (
        <li key={p.id} className={`${p.removed ? "is-gone" : ""}${p.id === me ? " is-me" : ""}${p.tag ? " is-turn" : ""}${final ? (i === 0 && p.score > 0 ? " ru-win" : " ru-reveal") : ""}`} style={{ "--i": i } as React.CSSProperties}>
          {!keepOrder && <span className="rpg-rank">{i + 1}</span>}
          <Avatar name={p.name} avatar={avatarOf(p.id) ?? null} size={30} />
          <span className="rpg-grow">
            <StyledUsername name={p.name} styleId={(avatarOf(p.id))?.style} />
            {p.id === me && <span className="meta"> · you</span>}
            {(p.tag || p.removed) && <span key={p.removed ? "left" : p.tag} className="meta rpg-status ru-reveal">{p.removed ? "Left" : p.tag}</span>}
          </span>
          <strong className="rpg-money">{money ? <Coins value={p.score} /> : <PointsValue value={p.score} />}</strong>
        </li>
      ))}
    </ol>
  );
}

function PointsValue({ value }: { value: number }) {
  return <Coins value={value} plain />;
}
