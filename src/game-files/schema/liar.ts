import { BACKGROUND_PRESETS, CURRENT_SCHEMA_VERSION, LIMITS, isRecord, type GameFile, type ValidationResult } from "./common";
import { checkPlainText, parseCommon, textOrNull } from "./shared";

export const LIAR_TYPE = "liar";

export const LIAR_LIMITS = {
  minPlayers: 3,
  maxPlayers: 10,
  minRounds: 1,
  maxRounds: 5,
  maxPrompts: 200,
  maxPromptLength: 200,
};

export interface LiarQuestionPrompt {
  id: string;
  text: string;
}

export interface LiarContent {
  questionPrompts: LiarQuestionPrompt[];
}

export interface LiarSettings {
  minPlayers: number;
  maxPlayers: number;
  defaultRounds: number;
  scoringEnabled: boolean;
  allowAbstain: boolean;
}

export type LiarFile = GameFile<LiarContent, LiarSettings>;

export const DEFAULT_LIAR_SETTINGS: LiarSettings = {
  minPlayers: LIAR_LIMITS.minPlayers,
  maxPlayers: LIAR_LIMITS.maxPlayers,
  defaultRounds: 1,
  scoringEnabled: true,
  allowAbstain: false,
};

/** An empty LIAR file: the default flow needs no prepared content. */
export function blankLiarFile(): LiarFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType: LIAR_TYPE,
    metadata: { title: "LIAR", description: "Two truths and a lie.", author: "", coverImage: null },
    appearance: { accentColor: "#E85D75", backgroundPreset: BACKGROUND_PRESETS[0] },
    content: { questionPrompts: [] },
    settings: { ...DEFAULT_LIAR_SETTINGS },
  };
}

/** Validates the LIAR parts of a parsed game file and returns a clean copy. All strings stay plain text. */
export function validateLiar(raw: Record<string, unknown>): ValidationResult<LiarFile> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { metadata, appearance } = parseCommon(raw, LIAR_TYPE, errors, warnings);

  const prompts: LiarQuestionPrompt[] = [];
  if (!isRecord(raw.content)) {
    errors.push("The file is missing its content section.");
  } else if (!Array.isArray(raw.content.questionPrompts)) {
    errors.push("The file is missing its list of question prompts. It may be empty.");
  } else {
    const list = raw.content.questionPrompts;
    if (list.length > LIAR_LIMITS.maxPrompts) errors.push(`The game has ${list.length} question prompts. The limit is ${LIAR_LIMITS.maxPrompts}.`);
    const used = new Set<string>();
    list.forEach((item, n) => {
      const name = `Prompt ${n + 1}`;
      if (!isRecord(item)) {
        errors.push(`${name} is not a valid prompt object.`);
        return;
      }
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (id === "") errors.push(`${name} is missing its id.`);
      else if (used.has(id)) errors.push(`${name} reuses the id "${id}". Prompt ids must be unique.`);
      else used.add(id);
      const text = textOrNull(item.text);
      if (text === null || text.trim() === "") {
        errors.push(`${name} is missing its text.`);
        return;
      }
      const clean = text.trim();
      if (clean.length > LIAR_LIMITS.maxPromptLength) errors.push(`${name} is longer than ${LIAR_LIMITS.maxPromptLength} characters.`);
      checkPlainText(clean, name, errors);
      if (id !== "") prompts.push({ id, text: clean });
    });
  }

  const settings: LiarSettings = { ...DEFAULT_LIAR_SETTINGS };
  if (raw.settings !== undefined && raw.settings !== null) {
    if (!isRecord(raw.settings)) {
      errors.push("The settings section must be an object.");
    } else {
      const s = raw.settings;
      const int = (key: "minPlayers" | "maxPlayers" | "defaultRounds", lo: number, hi: number) => {
        const v = s[key];
        if (v === undefined || v === null) return;
        if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) errors.push(`The ${key} setting must be a whole number from ${lo} to ${hi}.`);
        else settings[key] = v;
      };
      int("minPlayers", LIAR_LIMITS.minPlayers, LIAR_LIMITS.maxPlayers);
      int("maxPlayers", LIAR_LIMITS.minPlayers, LIAR_LIMITS.maxPlayers);
      int("defaultRounds", LIAR_LIMITS.minRounds, LIAR_LIMITS.maxRounds);
      for (const key of ["scoringEnabled", "allowAbstain"] as const) {
        const v = s[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== "boolean") errors.push(`The ${key} setting must be true or false.`);
        else settings[key] = v;
      }
      if (settings.minPlayers > settings.maxPlayers) errors.push("The minPlayers setting cannot be larger than maxPlayers.");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    file: { schemaVersion: CURRENT_SCHEMA_VERSION, gameType: LIAR_TYPE, metadata, appearance, content: { questionPrompts: prompts }, settings },
  };
}

export const LIAR_TEXT_LIMIT = LIMITS.maxTextLength;
