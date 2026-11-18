import { useSoundOnChange } from "../../lib/useGameSounds";

/** Sounds for a LIAR game: phase changes, votes coming in, pauses. */
export function useLiarSounds(phase: string, votes: number, paused: boolean, storyteller: string | null): void {
  useSoundOnChange(`${phase}|${votes}|${paused}|${storyteller}`, (prev, next) => {
    const [p0, v0, z0, s0] = prev.split("|");
    const [p1, v1, z1, s1] = next.split("|");
    if (z0 !== z1) return "pause";
    if (p1 !== p0) return p1 === "discuss" ? "reveal" : p1 === "vote" ? "select" : p1 === "reveal" ? "reveal" : p1 === "done" ? "win" : p1 === "prep" ? "turn" : null;
    if (s1 !== s0) return "turn";
    if (Number(v1) > Number(v0)) return "vote";
    return null;
  });
}
