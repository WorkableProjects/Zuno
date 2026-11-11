import {
  BACKGROUND_PRESETS,
  CURRENT_SCHEMA_VERSION,
  LIMITS,
  checkCoverImage,
  checkImage,
  isHexColor,
  isRecord,
  type BackgroundPreset,
  type GameFile,
  type ValidationResult,
} from "./common";
import { fallbackAppearance } from "../../lib/color";

export const JEOPARDY_TYPE = "jeopardy";

export const JEOPARDY_LIMITS = {
  maxCategories: 8,
  maxQuestionsPerCategory: 8,
  maxValue: 1_000_000,
  minTeams: 1,
  maxTeams: 6,
  maxMembersPerTeam: 8,
  /** Seconds. 0 means no timer. */
  maxTimeLimit: 600,
};

export interface JeopardyQuestion {
  id: string;
  value: number;
  clue: string;
  answer: string;
  explanation?: string;
  /** The board hides this; opening it asks one team for a wager. */
  dailyDouble?: boolean;
  /** https URL or embedded data URL, shown with the clue. */
  clueImage?: string;
  /** https URL or embedded data URL, shown with the answer. */
  answerImage?: string;
  /** Seconds; overrides settings.timeLimitSeconds for this clue. 0 = no timer. */
  timeLimit?: number;
}

export interface JeopardyCategory {
  id: string;
  title: string;
  questions: JeopardyQuestion[];
}

/**
 * "always": the final question is played by every team at the end, with wagers.
 * "tiebreaker": it is only offered when teams are tied for first; only the tied
 * teams play, no wagers, a right answer adds 1 point.
 */
export const FINAL_MODES = ["always", "tiebreaker"] as const;
export type FinalMode = (typeof FINAL_MODES)[number];

/** The One Final Question (OFQ). JSON key stays finalJeopardy for compatibility. */
export interface FinalJeopardy {
  enabled: boolean;
  mode: FinalMode;
  category: string;
  clue: string;
  answer: string;
  clueImage?: string;
  answerImage?: string;
}

export interface JeopardyContent {
  categories: JeopardyCategory[];
  finalJeopardy: FinalJeopardy;
}

export interface JeopardySettings {
  allowNegativeScores: boolean;
  showExplanations: boolean;
  /** Default seconds per clue. 0 = no timer. */
  timeLimitSeconds: number;
  /** Seconds for the final question. 0 = no timer. */
  finalTimeLimitSeconds: number;
}

export type JeopardyFile = GameFile<JeopardyContent, JeopardySettings>;

const SCRIPT_PATTERN = /<\s*script\b/i;

function isTimeLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= JEOPARDY_LIMITS.maxTimeLimit;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Validates the Jeopardy-specific parts of a parsed game file and returns a
 * clean copy. Nothing from the input is trusted or executed; every string is
 * kept as plain text.
 */
export function validateJeopardy(raw: Record<string, unknown>): ValidationResult<JeopardyFile> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const checkText = (value: string, where: string) => {
    if (value.length > LIMITS.maxTextLength) errors.push(`${where} is longer than ${LIMITS.maxTextLength} characters.`);
    if (SCRIPT_PATTERN.test(value)) errors.push(`${where} contains a script tag. Game files cannot include code.`);
  };

  // Metadata
  let title = "";
  let description = "";
  let author = "";
  let coverImage: string | null = null;
  if (!isRecord(raw.metadata)) {
    errors.push("The file is missing its metadata section.");
  } else {
    const m = raw.metadata;
    const t = text(m.title);
    if (t === null || t.trim() === "") errors.push("The game is missing a title.");
    else {
      title = t.trim();
      if (title.length > LIMITS.maxTitleLength) errors.push(`The game title is longer than ${LIMITS.maxTitleLength} characters.`);
      checkText(title, "The game title");
    }
    if (m.description !== undefined && m.description !== null) {
      const d = text(m.description);
      if (d === null) errors.push("The game description must be text.");
      else {
        description = d.trim();
        checkText(description, "The game description");
      }
    }
    if (m.author !== undefined && m.author !== null) {
      const a = text(m.author);
      if (a === null) errors.push("The author must be text.");
      else {
        author = a.trim();
        checkText(author, "The author");
      }
    }
    const coverError = checkCoverImage(m.coverImage);
    if (coverError) errors.push(coverError);
    else if (typeof m.coverImage === "string" && m.coverImage !== "") coverImage = m.coverImage;
  }

  // Appearance is optional. Missing values get a stable fallback.
  const fallback = fallbackAppearance(JEOPARDY_TYPE, title);
  let accentColor = fallback.accentColor;
  let backgroundPreset: BackgroundPreset = fallback.backgroundPreset;
  if (raw.appearance !== undefined && raw.appearance !== null) {
    if (!isRecord(raw.appearance)) {
      errors.push("The appearance section must be an object.");
    } else {
      const a = raw.appearance;
      if (a.accentColor !== undefined && a.accentColor !== null) {
        if (isHexColor(a.accentColor)) accentColor = a.accentColor;
        else warnings.push("The accent color was not a six-digit hex color, so Zuno picked one for this game.");
      }
      if (a.backgroundPreset !== undefined && a.backgroundPreset !== null) {
        if ((BACKGROUND_PRESETS as readonly unknown[]).includes(a.backgroundPreset)) {
          backgroundPreset = a.backgroundPreset as BackgroundPreset;
        } else {
          warnings.push(`The background preset was not recognized, so Zuno picked one. Supported presets: ${BACKGROUND_PRESETS.join(", ")}.`);
        }
      }
    }
  }

  // Content
  const categories: JeopardyCategory[] = [];
  let finalJeopardy: FinalJeopardy = { enabled: false, mode: "always", category: "", clue: "", answer: "" };
  if (!isRecord(raw.content)) {
    errors.push("The file is missing its content section.");
  } else {
    const c = raw.content;
    if (!Array.isArray(c.categories)) {
      errors.push("The file is missing its list of categories.");
    } else if (c.categories.length === 0) {
      errors.push("The game needs at least one category.");
    } else {
      if (c.categories.length > JEOPARDY_LIMITS.maxCategories) {
        errors.push(`The game has ${c.categories.length} categories. The limit is ${JEOPARDY_LIMITS.maxCategories}.`);
      }
      const usedIds = new Set<string>();
      let renamed = 0;
      const uniqueId = (wanted: unknown, base: string) => {
        let id = typeof wanted === "string" && wanted.trim() !== "" ? wanted.trim() : base;
        if (usedIds.has(id)) {
          renamed++;
          let n = 2;
          while (usedIds.has(`${id}-${n}`)) n++;
          id = `${id}-${n}`;
        }
        usedIds.add(id);
        return id;
      };

      c.categories.forEach((rawCat, ci) => {
        const catName = `Category ${ci + 1}`;
        if (!isRecord(rawCat)) {
          errors.push(`${catName} is not a valid category object.`);
          return;
        }
        const catTitle = text(rawCat.title);
        if (catTitle === null || catTitle.trim() === "") errors.push(`${catName} is missing a title.`);
        else checkText(catTitle, `${catName}'s title`);
        const cat: JeopardyCategory = {
          id: uniqueId(rawCat.id, `category-${ci + 1}`),
          title: (catTitle ?? "").trim(),
          questions: [],
        };
        if (!Array.isArray(rawCat.questions)) {
          errors.push(`${catName} is missing its list of questions.`);
        } else if (rawCat.questions.length === 0) {
          errors.push(`${catName} has no questions. Each category needs at least one.`);
        } else {
          if (rawCat.questions.length > JEOPARDY_LIMITS.maxQuestionsPerCategory) {
            errors.push(`${catName} has ${rawCat.questions.length} questions. The limit is ${JEOPARDY_LIMITS.maxQuestionsPerCategory}.`);
          }
          rawCat.questions.forEach((rawQ, qi) => {
            const qName = `${catName}, question ${qi + 1}`;
            if (!isRecord(rawQ)) {
              errors.push(`${qName} is not a valid question object.`);
              return;
            }
            const clue = text(rawQ.clue);
            const answer = text(rawQ.answer);
            if (clue === null || clue.trim() === "") errors.push(`${qName} is missing a clue.`);
            else checkText(clue, `${qName}'s clue`);
            if (answer === null || answer.trim() === "") errors.push(`${qName} is missing an answer.`);
            else checkText(answer, `${qName}'s answer`);
            const value = rawQ.value;
            if (value === undefined || value === null || value === "") {
              errors.push(`${qName} is missing a point value.`);
            } else if (typeof value !== "number" || !Number.isFinite(value)) {
              errors.push(`${qName} has a point value that is not a number.`);
            } else if (value <= 0 || value > JEOPARDY_LIMITS.maxValue || !Number.isInteger(value)) {
              errors.push(`${qName} has a point value of ${value}. Use a whole number from 1 to ${JEOPARDY_LIMITS.maxValue.toLocaleString("en-US")}.`);
            }
            const question: JeopardyQuestion = {
              id: uniqueId(rawQ.id, `${cat.id}-${qi + 1}`),
              value: typeof value === "number" ? value : 0,
              clue: (clue ?? "").trim(),
              answer: (answer ?? "").trim(),
            };
            if (rawQ.explanation !== undefined && rawQ.explanation !== null) {
              const ex = text(rawQ.explanation);
              if (ex === null) errors.push(`${qName} has an explanation that is not text.`);
              else if (ex.trim() !== "") {
                checkText(ex, `${qName}'s explanation`);
                question.explanation = ex.trim();
              }
            }
            if (rawQ.dailyDouble !== undefined && rawQ.dailyDouble !== null) {
              if (typeof rawQ.dailyDouble !== "boolean") errors.push(`${qName} has a dailyDouble setting that must be true or false.`);
              else if (rawQ.dailyDouble) question.dailyDouble = true;
            }
            const clueImageError = checkImage(rawQ.clueImage, `${qName}'s clue image`);
            if (clueImageError) errors.push(clueImageError);
            else if (typeof rawQ.clueImage === "string" && rawQ.clueImage !== "") question.clueImage = rawQ.clueImage;
            const answerImageError = checkImage(rawQ.answerImage, `${qName}'s answer image`);
            if (answerImageError) errors.push(answerImageError);
            else if (typeof rawQ.answerImage === "string" && rawQ.answerImage !== "") question.answerImage = rawQ.answerImage;
            if (rawQ.timeLimit !== undefined && rawQ.timeLimit !== null) {
              if (!isTimeLimit(rawQ.timeLimit)) errors.push(`${qName} has a time limit that must be a whole number of seconds from 0 to ${JEOPARDY_LIMITS.maxTimeLimit}.`);
              else question.timeLimit = rawQ.timeLimit;
            }
            cat.questions.push(question);
          });
        }
        categories.push(cat);
      });
      if (renamed > 0) {
        warnings.push(`${renamed} duplicate ${renamed === 1 ? "ID was" : "IDs were"} renamed so every category and question is unique.`);
      }
    }

    if (c.finalJeopardy !== undefined && c.finalJeopardy !== null) {
      if (!isRecord(c.finalJeopardy)) {
        errors.push("The Final Jeopardy section must be an object.");
      } else {
        const f = c.finalJeopardy;
        if (f.enabled !== undefined && typeof f.enabled !== "boolean") {
          errors.push("Final Jeopardy's enabled setting must be true or false.");
        }
        let mode: FinalMode = "always";
        if (f.mode !== undefined && f.mode !== null) {
          if ((FINAL_MODES as readonly unknown[]).includes(f.mode)) mode = f.mode as FinalMode;
          else warnings.push(`The final question's mode was not recognized, so Zuno used "always". Supported modes: ${FINAL_MODES.join(", ")}.`);
        }
        finalJeopardy = {
          enabled: f.enabled === true,
          mode,
          category: (text(f.category) ?? "").trim(),
          clue: (text(f.clue) ?? "").trim(),
          answer: (text(f.answer) ?? "").trim(),
        };
        if (finalJeopardy.enabled) {
          if (!finalJeopardy.category) errors.push("Final Jeopardy is on but has no category.");
          if (!finalJeopardy.clue) errors.push("Final Jeopardy is on but has no clue.");
          if (!finalJeopardy.answer) errors.push("Final Jeopardy is on but has no answer.");
          checkText(finalJeopardy.category, "The Final Jeopardy category");
          checkText(finalJeopardy.clue, "The Final Jeopardy clue");
          checkText(finalJeopardy.answer, "The Final Jeopardy answer");
        }
        const finalClueError = checkImage(f.clueImage, "The Final Jeopardy clue image");
        if (finalClueError) errors.push(finalClueError);
        else if (typeof f.clueImage === "string" && f.clueImage !== "") finalJeopardy.clueImage = f.clueImage;
        const finalAnswerError = checkImage(f.answerImage, "The Final Jeopardy answer image");
        if (finalAnswerError) errors.push(finalAnswerError);
        else if (typeof f.answerImage === "string" && f.answerImage !== "") finalJeopardy.answerImage = f.answerImage;
      }
    }
  }

  // Settings are optional booleans.
  const settings: JeopardySettings = { allowNegativeScores: false, showExplanations: true, timeLimitSeconds: 0, finalTimeLimitSeconds: 0 };
  if (raw.settings !== undefined && raw.settings !== null) {
    if (!isRecord(raw.settings)) {
      errors.push("The settings section must be an object.");
    } else {
      for (const key of ["allowNegativeScores", "showExplanations"] as const) {
        const v = raw.settings[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== "boolean") errors.push(`The ${key} setting must be true or false.`);
        else settings[key] = v;
      }
      for (const key of ["timeLimitSeconds", "finalTimeLimitSeconds"] as const) {
        const v = raw.settings[key];
        if (v === undefined || v === null) continue;
        if (!isTimeLimit(v)) errors.push(`The ${key} setting must be a whole number of seconds from 0 to ${JEOPARDY_LIMITS.maxTimeLimit}.`);
        else settings[key] = v;
      }
    }
  }

  const allQuestions = categories.flatMap((c) => c.questions);
  if (allQuestions.length > 0 && allQuestions.every((q) => q.dailyDouble)) {
    warnings.push("Every question is a Daily Double. Most games use only one or two.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    file: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      gameType: JEOPARDY_TYPE,
      metadata: { title, description, author, coverImage },
      appearance: { accentColor, backgroundPreset },
      content: { categories, finalJeopardy },
      settings,
    },
  };
}

export function countClues(file: JeopardyFile): number {
  return file.content.categories.reduce((n, c) => n + c.questions.length, 0);
}

/** The prompt copied by the AI Builder. Versioned with the schema: change both together. */
export function buildJeopardyGuide(): string {
  return `You are creating a game file for Zuno, a browser-based game platform.

Create a complete Jeopardy game as valid Zuno JSON (schema version ${CURRENT_SCHEMA_VERSION}).

Requirements:
- Output JSON only. Do not use Markdown code fences or add an explanation before or after the JSON.
- Use schemaVersion: ${CURRENT_SCHEMA_VERSION} and gameType: "${JEOPARDY_TYPE}".
- Include metadata with title, description, author, and coverImage. Set coverImage to null unless I give you an https image link.
- Include appearance with accentColor (a six-digit hex color such as "#79B8FF") and backgroundPreset (one of: ${BACKGROUND_PRESETS.map((p) => `"${p}"`).join(", ")}).
- Include content.categories as an array of category objects. Use 1 to ${JEOPARDY_LIMITS.maxCategories} categories.
- Each category must have a unique id, a title, and a questions array with 1 to ${JEOPARDY_LIMITS.maxQuestionsPerCategory} questions.
- Every question must have a unique id, a numeric value, a clue, and an answer.
- value must be a whole number greater than 0, written as a number, not a string.
- An optional explanation may be included for a question when it is useful.
- Include content.finalJeopardy with enabled, mode, category, clue, and answer fields. If enabled is true, category, clue and answer must be filled in. mode is "always" (every team plays the final question with wagers) or "tiebreaker" (only offered when teams tie for first, no wagers). Use "always" by default.
- Optional question fields: dailyDouble (true or false) marks a Daily Double, where one team wagers on the clue. By default, mark 1 or 2 questions per board as daily doubles, and prefer higher-value questions. Leave the field out on other questions.
- Optional clueImage and answerImage (on questions and on finalJeopardy) must be https image links. Only include them if I give you links; otherwise leave them out.
- Optional timeLimit on a question is a whole number of seconds from 0 to ${JEOPARDY_LIMITS.maxTimeLimit} (0 means no timer). Leave it out to use the default from settings.
- Include settings.allowNegativeScores and settings.showExplanations as booleans. Include settings.timeLimitSeconds (default seconds per clue) and settings.finalTimeLimitSeconds (seconds for the final question) as whole numbers from 0 to ${JEOPARDY_LIMITS.maxTimeLimit}; 0 means no timer.
- Math can be written as LaTeX between $...$ (inline) or $$...$$ (display) in clues, answers and explanations. Every backslash must be escaped in JSON, for example "What is $\\\\frac{1}{2} + \\\\frac{1}{4}$?".
- Use five categories and five questions per category by default, unless I request a different supported board size.
- Use sensible ascending point values by default: 100, 200, 300, 400, and 500.
- Ensure all IDs are unique and all JSON strings are correctly escaped.
- Do not include HTML, JavaScript, functions, or other executable content.
- Do not leave required fields blank.
- Keep every text field under ${LIMITS.maxTextLength} characters.

Use this structure:
{
  "schemaVersion": ${CURRENT_SCHEMA_VERSION},
  "gameType": "${JEOPARDY_TYPE}",
  "metadata": {
    "title": "Game Title",
    "description": "Game description",
    "author": "Author",
    "coverImage": null
  },
  "appearance": {
    "accentColor": "#79B8FF",
    "backgroundPreset": "aurora"
  },
  "content": {
    "categories": [
      {
        "id": "category-id",
        "title": "Category Name",
        "questions": [
          {
            "id": "question-id",
            "value": 100,
            "clue": "Clue text",
            "answer": "Correct answer",
            "explanation": "Optional explanation",
            "dailyDouble": false,
            "clueImage": "https://example.com/clue.png",
            "answerImage": "https://example.com/answer.png",
            "timeLimit": 30
          }
        ]
      }
    ],
    "finalJeopardy": {
      "enabled": false,
      "mode": "always",
      "category": "",
      "clue": "",
      "answer": ""
    }
  },
  "settings": {
    "allowNegativeScores": false,
    "showExplanations": true,
    "timeLimitSeconds": 30,
    "finalTimeLimitSeconds": 60
  }
}

After generating the JSON, do not wrap it in Markdown. Make sure the result is valid and complete so it can be saved as a .zuno.json file and imported into Zuno.

My game:
- Topic: [describe your topic here]
- Difficulty or audience: [for example, 7th grade science]
- Anything else: [optional requests]`;
}
