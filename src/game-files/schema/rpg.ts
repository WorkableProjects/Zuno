import { BACKGROUND_PRESETS, CURRENT_SCHEMA_VERSION, isRecord, type GameFile, type ValidationResult } from "./common";
import { parseCommon } from "./shared";

export const RPG_TYPE = "rpg";

export const RPG_LIMITS = {
  minPlayers: 2,
  maxPlayers: 12,
  minMoney: 100,
  maxMoney: 1_000_000,
  minSeconds: 5,
  maxSeconds: 120,
};

/** Rock Paper Gamble has no prepared content. Everything lives in the settings. */
export type RpgContent = Record<string, never>;

export interface RpgSettings {
  /** What every player starts with. */
  startingMoney: number;
  maxPlayers: number;
  /** The challenger's time to pick an opponent. */
  selectSeconds: number;
  /** Time for spectators to place bets. */
  bettingSeconds: number;
  /** Time for each rock-paper-scissors round. */
  roundSeconds: number;
  /** How long the payout screen stays up. */
  resultsSeconds: number;
}

export type RpgFile = GameFile<RpgContent, RpgSettings>;

export const DEFAULT_RPG_SETTINGS: RpgSettings = {
  startingMoney: 10000,
  maxPlayers: RPG_LIMITS.maxPlayers,
  selectSeconds: 15,
  bettingSeconds: 20,
  roundSeconds: 15,
  resultsSeconds: 8,
};

/** A default Rock Paper Gamble file: online only, no prepared content. */
export function blankRpgFile(): RpgFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType: RPG_TYPE,
    metadata: { title: "Rock Paper Gamble", description: "Rock paper scissors duels with money on the line.", author: "", coverImage: null },
    appearance: { accentColor: "#7C3AED", backgroundPreset: BACKGROUND_PRESETS[0] },
    content: {},
    settings: { ...DEFAULT_RPG_SETTINGS },
  };
}

/** Validates the Rock Paper Gamble parts of a parsed game file and returns a clean copy. */
export function validateRpg(raw: Record<string, unknown>): ValidationResult<RpgFile> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { metadata, appearance } = parseCommon(raw, RPG_TYPE, errors, warnings);

  if (!isRecord(raw.content)) errors.push("The file is missing its content section. It may be an empty object.");

  const settings: RpgSettings = { ...DEFAULT_RPG_SETTINGS };
  if (raw.settings !== undefined && raw.settings !== null) {
    if (!isRecord(raw.settings)) {
      errors.push("The settings section must be an object.");
    } else {
      const s = raw.settings;
      const int = (key: keyof RpgSettings, lo: number, hi: number) => {
        const v = s[key];
        if (v === undefined || v === null) return;
        if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) errors.push(`The ${key} setting must be a whole number from ${lo.toLocaleString("en-US")} to ${hi.toLocaleString("en-US")}.`);
        else settings[key] = v;
      };
      int("startingMoney", RPG_LIMITS.minMoney, RPG_LIMITS.maxMoney);
      int("maxPlayers", RPG_LIMITS.minPlayers, RPG_LIMITS.maxPlayers);
      int("selectSeconds", RPG_LIMITS.minSeconds, RPG_LIMITS.maxSeconds);
      int("bettingSeconds", RPG_LIMITS.minSeconds, RPG_LIMITS.maxSeconds);
      int("roundSeconds", RPG_LIMITS.minSeconds, RPG_LIMITS.maxSeconds);
      int("resultsSeconds", RPG_LIMITS.minSeconds, RPG_LIMITS.maxSeconds);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    file: { schemaVersion: CURRENT_SCHEMA_VERSION, gameType: RPG_TYPE, metadata, appearance, content: {}, settings },
  };
}

export function formatCoins(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
