import { CURRENT_SCHEMA_VERSION, checkImage, isRecord, type GameFile, type ValidationResult } from "./common";
import { checkPlainText, parseCommon, textOrNull } from "./shared";

export const GAUNTLET_TYPE = "gauntlet";

export const GAUNTLET_LIMITS = {
  minTeams: 1,
  maxTeams: 16,
  minPlayersPerTeam: 1,
  maxPlayersPerTeam: 8,
  minLaneItems: 4,
  minClimb: 5,
  maxItemsPerDeck: 200,
  maxPromptLength: 400,
  maxAnswerLength: 200,
  minRoundSeconds: 5,
  maxRoundSeconds: 300,
};

export const WILD_EFFECTS = ["double", "shift", "silence", "bounty", "swap", "sabotage", "mirror", "suddenLight"] as const;
export type WildEffect = (typeof WILD_EFFECTS)[number];

export interface GauntletQuestion {
  id: string;
  prompt: string;
  answer: string;
  /** Optional multiple choice options. When given, the answer must be one of them. */
  choices?: string[];
  image?: string;
}

export interface PuzzleCard extends GauntletQuestion {
  /** Up to two hints, revealed in order. Each hint lowers the reward. */
  hints: string[];
}

export interface WildCard extends GauntletQuestion {
  effect: WildEffect;
}

export interface ChoiceChallenge {
  id: string;
  safe: GauntletQuestion;
  bold: GauntletQuestion;
  unknown: GauntletQuestion;
}

export interface CrossroadsCard extends GauntletQuestion {
  category: string;
}

export interface LockChallenge {
  id: string;
  prompt: string;
  /** Exactly four statements; one is false. */
  statements: string[];
  falseIndex: number;
}

export interface GauntletContent {
  warmup: GauntletQuestion[];
  lanes: { quickfire: GauntletQuestion[]; puzzle: PuzzleCard[]; wild: WildCard[] };
  choice: ChoiceChallenge[];
  chaos: GauntletQuestion[];
  final: { climb: GauntletQuestion[]; crossroads: CrossroadsCard[]; lock: LockChallenge[]; summit: GauntletQuestion[] };
}

export interface GauntletSettings {
  minTeams: number;
  maxTeams: number;
  playersPerTeam: [number, number];
  defaultRoundSeconds: number;
  allowNegativeScores: boolean;
  elimination: boolean;
}

export type GauntletFile = GameFile<GauntletContent, GauntletSettings>;

export const DEFAULT_GAUNTLET_SETTINGS: GauntletSettings = {
  minTeams: 2,
  maxTeams: 8,
  playersPerTeam: [1, 8],
  defaultRoundSeconds: 15,
  allowNegativeScores: true,
  elimination: false,
};

export function countGauntletItems(file: GauntletFile): number {
  const c = file.content;
  return c.warmup.length + c.lanes.quickfire.length + c.lanes.puzzle.length + c.lanes.wild.length + c.choice.length + c.chaos.length + c.final.climb.length + c.final.crossroads.length + c.final.lock.length + c.final.summit.length;
}

type Ctx = { errors: string[]; ids: Set<string> };

function str(v: unknown, where: string, max: number, ctx: Ctx, required = true): string {
  const t = textOrNull(v);
  if (t === null || t.trim() === "") {
    if (required) ctx.errors.push(`${where} is missing.`);
    return "";
  }
  const clean = t.trim();
  if (clean.length > max) ctx.errors.push(`${where} is longer than ${max} characters.`);
  checkPlainText(clean, where, ctx.errors);
  return clean;
}

function id(v: unknown, where: string, ctx: Ctx): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s === "") ctx.errors.push(`${where} is missing its id.`);
  else if (ctx.ids.has(s)) ctx.errors.push(`${where} reuses the id "${s}". Ids must be unique within a round.`);
  else ctx.ids.add(s);
  return s;
}

function question(raw: unknown, where: string, ctx: Ctx): GauntletQuestion | null {
  if (!isRecord(raw)) {
    ctx.errors.push(`${where} is not a valid question object.`);
    return null;
  }
  const q: GauntletQuestion = {
    id: id(raw.id, where, ctx),
    prompt: str(raw.prompt, `${where} prompt`, GAUNTLET_LIMITS.maxPromptLength, ctx),
    answer: str(raw.answer, `${where} answer`, GAUNTLET_LIMITS.maxAnswerLength, ctx),
  };
  if (raw.choices !== undefined && raw.choices !== null) {
    if (!Array.isArray(raw.choices) || raw.choices.length < 2 || raw.choices.length > 6) ctx.errors.push(`${where} choices must be a list of 2 to 6 options.`);
    else {
      q.choices = raw.choices.map((c, i) => str(c, `${where} choice ${i + 1}`, GAUNTLET_LIMITS.maxAnswerLength, ctx));
      if (q.answer && !q.choices.includes(q.answer)) ctx.errors.push(`${where} answer must be one of its choices.`);
    }
  }
  if (raw.image !== undefined && raw.image !== null && raw.image !== "") {
    const err = checkImage(raw.image, `The ${where} image`);
    if (err) ctx.errors.push(err);
    else q.image = raw.image as string;
  }
  return q;
}

function list<T>(raw: unknown, where: string, min: number, errors: string[], each: (item: unknown, name: string, ctx: Ctx) => T | null): T[] {
  const ctx: Ctx = { errors, ids: new Set() };
  if (!Array.isArray(raw)) {
    errors.push(`The ${where} list is missing.`);
    return [];
  }
  if (raw.length < min) errors.push(`The ${where} list needs at least ${min} ${min === 1 ? "item" : "items"}.`);
  if (raw.length > GAUNTLET_LIMITS.maxItemsPerDeck) errors.push(`The ${where} list has more than ${GAUNTLET_LIMITS.maxItemsPerDeck} items.`);
  const out: T[] = [];
  raw.forEach((item, n) => {
    const v = each(item, `${where} item ${n + 1}`, ctx);
    if (v) out.push(v);
  });
  return out;
}

/** Validates the Gauntlet parts of a parsed game file and returns a clean copy. All strings stay plain text. */
export function validateGauntlet(raw: Record<string, unknown>): ValidationResult<GauntletFile> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { metadata, appearance } = parseCommon(raw, GAUNTLET_TYPE, errors, warnings);
  const c = isRecord(raw.content) ? raw.content : null;
  if (!c) errors.push("The file is missing its content section.");
  const lanes = c && isRecord(c.lanes) ? c.lanes : {};
  const fin = c && isRecord(c.final) ? c.final : {};
  if (c && !isRecord(c.lanes)) errors.push("The file is missing its lanes section.");
  if (c && !isRecord(c.final)) errors.push("The file is missing its final section.");

  const content: GauntletContent = {
    warmup: c ? list(c.warmup, "warm-up", 1, errors, question) : [],
    lanes: {
      quickfire: c ? list(lanes.quickfire, "Quickfire lane", GAUNTLET_LIMITS.minLaneItems, errors, question) : [],
      puzzle: c
        ? list(lanes.puzzle, "Puzzle lane", GAUNTLET_LIMITS.minLaneItems, errors, (item, name, ctx) => {
            const q = question(item, name, ctx);
            if (!q || !isRecord(item)) return null;
            const hints = item.hints ?? [];
            if (!Array.isArray(hints) || hints.length > 2) {
              errors.push(`${name} hints must be a list of up to 2 hints.`);
              return null;
            }
            return { ...q, hints: hints.map((h, i) => str(h, `${name} hint ${i + 1}`, GAUNTLET_LIMITS.maxPromptLength, ctx)) };
          })
        : [],
      wild: c
        ? list(lanes.wild, "Wild lane", GAUNTLET_LIMITS.minLaneItems, errors, (item, name, ctx) => {
            const q = question(item, name, ctx);
            if (!q || !isRecord(item)) return null;
            if (!(WILD_EFFECTS as readonly unknown[]).includes(item.effect)) {
              errors.push(`${name} has an unknown wild effect. Use one of: ${WILD_EFFECTS.join(", ")}.`);
              return null;
            }
            return { ...q, effect: item.effect as WildEffect };
          })
        : [],
    },
    choice: c
      ? list(c.choice, "choice round", 1, errors, (item, name, ctx) => {
          if (!isRecord(item)) {
            errors.push(`${name} is not a valid choice challenge.`);
            return null;
          }
          const cid = id(item.id, name, ctx);
          const inner: Ctx = { errors, ids: new Set() };
          const safe = question(item.safe, `${name} safe option`, inner);
          const bold = question(item.bold, `${name} bold option`, inner);
          const unknown = question(item.unknown, `${name} unknown option`, inner);
          return safe && bold && unknown ? { id: cid, safe, bold, unknown } : null;
        })
      : [],
    chaos: c ? list(c.chaos, "chaos round", 1, errors, question) : [],
    final: {
      climb: c ? list(fin.climb, "Final climb", GAUNTLET_LIMITS.minClimb, errors, question) : [],
      crossroads: c
        ? list(fin.crossroads, "Final crossroads", 1, errors, (item, name, ctx) => {
            const q = question(item, name, ctx);
            if (!q || !isRecord(item)) return null;
            return { ...q, category: str(item.category, `${name} category`, 80, ctx) };
          })
        : [],
      lock: c
        ? list(fin.lock, "Final lock", 1, errors, (item, name, ctx) => {
            if (!isRecord(item)) {
              errors.push(`${name} is not a valid lock challenge.`);
              return null;
            }
            const lid = id(item.id, name, ctx);
            const prompt = str(item.prompt, `${name} prompt`, GAUNTLET_LIMITS.maxPromptLength, ctx);
            if (!Array.isArray(item.statements) || item.statements.length !== 4) {
              errors.push(`${name} needs exactly 4 statements.`);
              return null;
            }
            const statements = item.statements.map((s, i) => str(s, `${name} statement ${i + 1}`, GAUNTLET_LIMITS.maxPromptLength, ctx));
            const fi = item.falseIndex;
            if (typeof fi !== "number" || !Number.isInteger(fi) || fi < 0 || fi > 3) {
              errors.push(`${name} falseIndex must be 0 to 3.`);
              return null;
            }
            return { id: lid, prompt, statements, falseIndex: fi };
          })
        : [],
      summit: c ? list(fin.summit, "Final summit", 1, errors, question) : [],
    },
  };

  const settings: GauntletSettings = { ...DEFAULT_GAUNTLET_SETTINGS, playersPerTeam: [...DEFAULT_GAUNTLET_SETTINGS.playersPerTeam] };
  if (raw.settings !== undefined && raw.settings !== null) {
    if (!isRecord(raw.settings)) errors.push("The settings section must be an object.");
    else {
      const s = raw.settings;
      const int = (v: unknown, key: string, lo: number, hi: number): number | null => {
        if (v === undefined || v === null) return null;
        if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) {
          errors.push(`The ${key} setting must be a whole number from ${lo} to ${hi}.`);
          return null;
        }
        return v;
      };
      settings.minTeams = int(s.minTeams, "minTeams", GAUNTLET_LIMITS.minTeams, GAUNTLET_LIMITS.maxTeams) ?? settings.minTeams;
      settings.maxTeams = int(s.maxTeams, "maxTeams", GAUNTLET_LIMITS.minTeams, GAUNTLET_LIMITS.maxTeams) ?? settings.maxTeams;
      settings.defaultRoundSeconds = int(s.defaultRoundSeconds, "defaultRoundSeconds", GAUNTLET_LIMITS.minRoundSeconds, GAUNTLET_LIMITS.maxRoundSeconds) ?? settings.defaultRoundSeconds;
      if (s.playersPerTeam !== undefined && s.playersPerTeam !== null) {
        if (!Array.isArray(s.playersPerTeam) || s.playersPerTeam.length !== 2) errors.push("The playersPerTeam setting must be [min, max].");
        else {
          const lo = int(s.playersPerTeam[0], "playersPerTeam minimum", GAUNTLET_LIMITS.minPlayersPerTeam, GAUNTLET_LIMITS.maxPlayersPerTeam);
          const hi = int(s.playersPerTeam[1], "playersPerTeam maximum", GAUNTLET_LIMITS.minPlayersPerTeam, GAUNTLET_LIMITS.maxPlayersPerTeam);
          if (lo !== null && hi !== null) {
            if (lo > hi) errors.push("The playersPerTeam minimum cannot be larger than the maximum.");
            settings.playersPerTeam = [lo, hi];
          }
        }
      }
      for (const key of ["allowNegativeScores", "elimination"] as const) {
        const v = s[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== "boolean") errors.push(`The ${key} setting must be true or false.`);
        else settings[key] = v;
      }
      if (settings.minTeams > settings.maxTeams) errors.push("The minTeams setting cannot be larger than maxTeams.");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, warnings, file: { schemaVersion: CURRENT_SCHEMA_VERSION, gameType: GAUNTLET_TYPE, metadata, appearance, content, settings } };
}
