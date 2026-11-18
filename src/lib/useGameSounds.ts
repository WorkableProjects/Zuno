import { useEffect, useRef } from "react";
import { playSfx, type Sfx } from "./sfx";

/**
 * Plays a sound when a watched value changes. `pick` gets the previous and
 * next snapshot and returns the sound, if any. The first render is silent.
 */
export function useSoundOnChange<T>(value: T, pick: (prev: T, next: T) => Sfx | null | undefined): void {
  const prev = useRef<T>(value);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      prev.current = value;
      return;
    }
    const sound = pick(prev.current, value);
    prev.current = value;
    if (sound) playSfx(sound);
    // pick is expected to be pure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

/** Someone joined a lobby. */
export function useJoinSound(count: number): void {
  useSoundOnChange(count, (a, b) => (b > a ? "join" : null));
}
