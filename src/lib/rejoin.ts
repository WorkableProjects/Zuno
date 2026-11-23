/** Remembers which online room this phone was in, so a refresh or lock screen rejoins it. */
export interface SavedSeat {
  code: string;
  name: string;
  savedAt: number;
  /** Game-specific extra, such as a team id. */
  extra?: string;
}

const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const key = (game: string) => `zuno.rejoin.${game}`;

export function saveSeat(game: string, seat: Omit<SavedSeat, "savedAt">): void {
  try {
    localStorage.setItem(key(game), JSON.stringify({ ...seat, savedAt: Date.now() }));
  } catch {
    /* optional */
  }
}

export function loadSeat(game: string, now = Date.now()): SavedSeat | null {
  try {
    const s = JSON.parse(localStorage.getItem(key(game)) ?? "null") as SavedSeat | null;
    if (!s || typeof s.code !== "string" || typeof s.name !== "string" || now - Number(s.savedAt) > MAX_AGE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSeat(game: string): void {
  try {
    localStorage.removeItem(key(game));
  } catch {
    /* optional */
  }
}

/** Restores the saved player id into this tab so the lobby sees the same player. */
export function adoptSeatId(seat: SavedSeat | null, idKey = "zuno.hb.playerId"): void {
  if (!seat) return;
  const id = seat.extra?.startsWith("id:") ? seat.extra.slice(3).split("|")[0] : null;
  if (!id) return;
  try {
    if (!sessionStorage.getItem(idKey)) sessionStorage.setItem(idKey, id);
  } catch {
    /* optional */
  }
}
