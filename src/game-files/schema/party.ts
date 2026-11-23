import { BACKGROUND_PRESETS, CURRENT_SCHEMA_VERSION, isRecord, type GameFile, type ValidationResult } from "./common";
import { parseCommon } from "./shared";
import { BJ_LIMITS, DEFAULT_BJ_SETTINGS, type BjSettings } from "../../games/blackjack/bjEngine";
import { DEFAULT_DRAW_SETTINGS, DRAW_LIMITS, type DrawSettings } from "../../games/drawit/drawEngine";
import { DEFAULT_FEUD_SETTINGS, FEUD_LIMITS, type FeudSettings } from "../../games/feud/feudEngine";

/**
 * Files for the online-only party games. They hold nothing but default
 * settings; everything else is chosen in the lobby.
 */
export const BLACKJACK_TYPE = "blackjack";
export const DRAWIT_TYPE = "drawit";
export const FEUD_TYPE = "feud";

type Spec<S> = { [K in keyof S]: S[K] extends number ? readonly [number, number] : S[K] extends boolean ? "bool" : number };

function makeValidator<S extends object>(gameType: string, defaults: S, spec: Partial<Spec<S>>) {
  return (raw: Record<string, unknown>): ValidationResult<GameFile<Record<string, never>, S>> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { metadata, appearance } = parseCommon(raw, gameType, errors, warnings);
    if (!isRecord(raw.content)) errors.push("The file is missing its content section. It may be an empty object.");
    const settings = { ...defaults } as Record<string, unknown>;
    if (raw.settings !== undefined && raw.settings !== null) {
      if (!isRecord(raw.settings)) errors.push("The settings section must be an object.");
      else
        for (const [key, rule] of Object.entries(spec) as Array<[string, unknown]>) {
          const v = raw.settings[key];
          if (v === undefined || v === null) continue;
          if (rule === "bool") {
            if (typeof v !== "boolean") errors.push(`The ${key} setting must be true or false.`);
            else settings[key] = v;
          } else if (typeof rule === "number") {
            if (typeof v !== "string" || v.length > rule) errors.push(`The ${key} setting must be text of at most ${rule} characters.`);
            else settings[key] = v;
          } else {
            const [lo, hi] = rule as [number, number];
            if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) errors.push(`The ${key} setting must be a whole number from ${lo} to ${hi}.`);
            else settings[key] = v;
          }
        }
    }
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, warnings, file: { schemaVersion: CURRENT_SCHEMA_VERSION, gameType, metadata, appearance, content: {}, settings: settings as S } };
  };
}

export const validateBlackjack = makeValidator<BjSettings>(BLACKJACK_TYPE, DEFAULT_BJ_SETTINGS, {
  startingChips: BJ_LIMITS.chips,
  minBet: BJ_LIMITS.minBet,
  betSeconds: BJ_LIMITS.betSeconds,
  turnSeconds: BJ_LIMITS.turnSeconds,
  rounds: BJ_LIMITS.rounds,
});

export const validateDrawIt = makeValidator<DrawSettings>(DRAWIT_TYPE, DEFAULT_DRAW_SETTINGS, {
  rounds: DRAW_LIMITS.rounds,
  drawSeconds: DRAW_LIMITS.drawSeconds,
  customWords: 4000,
  onlyCustom: "bool",
  hints: "bool",
});

export const validateFeud = makeValidator<FeudSettings>(FEUD_TYPE, DEFAULT_FEUD_SETTINGS, {
  maxAnswers: FEUD_LIMITS.maxAnswers,
  writeSeconds: FEUD_LIMITS.writeSeconds,
  guessSeconds: FEUD_LIMITS.guessSeconds,
  strikes: FEUD_LIMITS.strikes,
});

export function blankPartyFile(gameType: string, title: string, accentColor: string, settings: object): GameFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType,
    metadata: { title, description: "", author: "", coverImage: null },
    appearance: { accentColor, backgroundPreset: BACKGROUND_PRESETS[0] },
    content: {},
    settings,
  };
}
