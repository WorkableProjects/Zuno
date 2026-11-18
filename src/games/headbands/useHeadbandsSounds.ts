import type { Sfx } from "../../lib/sfx";
import { useSoundOnChange } from "../../lib/useGameSounds";
import type { LogEntry } from "./headbandsEngine";

interface Watched {
  phase: string;
  current: string | null;
  log: LogEntry[];
}

function soundFor(e: LogEntry): Sfx | null {
  switch (e.kind) {
    case "ask":
      return "vote";
    case "guess":
      return e.correct ? "correct" : "wrong";
    case "solved":
      return "correct";
    case "skip":
      return "skip";
    case "pause":
    case "resume":
      return "pause";
    case "end":
      return "win";
    default:
      return null;
  }
}

/** Sounds for a Headbands game, on the host and on every phone. */
export function useHeadbandsSounds(game: Watched | null | undefined): void {
  const key = game ? `${game.phase}|${game.current}|${game.log.length}` : "";
  useSoundOnChange(key, (prev, next) => {
    if (!game || !prev) return null;
    const [p0, c0, n0] = prev.split("|");
    if (game.phase === "over" && p0 !== "over") return "win";
    if (game.log.length > Number(n0)) {
      const s = soundFor(game.log[game.log.length - 1]);
      if (s) return s;
    }
    if (game.current !== c0 && next) return "turn";
    return null;
  });
}
