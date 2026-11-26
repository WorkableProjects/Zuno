import { useEffect, useRef } from "react";
import { track } from "./achievements";

/**
 * Counts a game for a player who joined from their own device. Achievements are stored on the
 * signed-in account (profile.ts syncs them), so progress earned on a phone unlocks the same
 * cosmetics everywhere. Fires once each time the room's game starts; a new round counts again.
 */
export function useJoinedGameTracking(gameType: string, active: boolean) {
  const counted = useRef(false);
  useEffect(() => {
    if (active && !counted.current) {
      counted.current = true;
      track({ type: "gameStarted", gameType, online: true });
    } else if (!active) counted.current = false;
  }, [active, gameType]);
}
