import { useSoundOnChange } from "../../lib/useGameSounds";
import type { RpgOnline } from "./rpgLobby";

/** A one-line fingerprint of what the table shows, so sounds can follow its changes. */
function fingerprint(g: RpgOnline, me: string): string {
  const d = g.duel;
  const winner = g.result?.winner ?? "-";
  return [
    g.phase,
    g.phase === "countdown" ? g.timeLeft : "-",
    g.phase !== "countdown" && g.phase !== "results" && g.phase !== "over" && g.timeLeft > 0 && g.timeLeft <= 3 ? "t" + g.timeLeft : "-",
    g.activeId ?? "-",
    d?.stakes.length ?? 0,
    d?.picked.length ?? 0,
    d?.overlay ? d.last?.winner ?? "tie" : "-",
    winner,
    g.result?.void ? "void" : "-",
    me,
    g.event ? `${g.event.id}:${g.event.kind}:${g.event.tone}` : "-",
  ].join("|");
}

/** Sounds for a Rock Paper Gamble table: countdown, turns, bets, reveals and payouts. */
export function useRpgSounds(game: RpgOnline, me: string): void {
  useSoundOnChange(fingerprint(game, me), (prev, next) => {
    const [p0, c0, t0, a0, b0, k0, o0, w0, , , e0] = prev.split("|");
    const [p1, c1, t1, a1, b1, k1, o1, w1, v1, , e1] = next.split("|");
    // Item moments first: they often change the phase too.
    if (e1 !== e0 && e1 !== "-") {
      const [, kind, tone] = e1.split(":");
      if (kind === "bomb") return tone === "good" ? "correct" : "airhorn";
      if (kind === "nuke") return tone === "good" ? "wrong" : "airhorn";
      if (kind === "mine") return "boing";
      return tone === "good" ? "rimshot" : "sadTrombone";
    }
    if (p1 !== p0) {
      if (p1 === "bomb") return "drumroll";
      if (p1 === "nukeVote") return "open";
      if (p1 === "nukeDuel") return "turn";
      if (p1 === "betting") return "open";
      if (p1 === "duel") return "turn";
      if (p1 === "over") return "win";
      if (p1 === "results") return v1 === "void" ? "skip" : w1 === me ? "win" : "reveal";
      if (p1 === "select") return "turn";
      return null;
    }
    if (p1 === "countdown" && c1 !== c0) return c1 === "0" ? "select" : "tick";
    if (o1 !== o0 && o1 !== "-") return o1 === "tie" ? "reveal" : o1 === me ? "correct" : "wrong";
    if (w1 !== w0 && w1 !== "-") return "win";
    if (a1 !== a0 && a1 !== "-") return "turn";
    if (Number(b1) > Number(b0)) return "vote";
    if (Number(k1) > Number(k0)) return "select";
    if (t1 !== t0 && t1 !== "-") return "tick";
    return null;
  });
}
