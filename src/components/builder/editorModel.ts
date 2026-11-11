import { CURRENT_SCHEMA_VERSION, isRecord } from "../../game-files/schema/common";
import { FINAL_MODES, JEOPARDY_TYPE, type JeopardyCategory, type JeopardyFile, type JeopardyQuestion } from "../../game-files/schema/jeopardy";

/** The editor works on the file shape directly, with throwaway IDs until export. */
export type Draft = JeopardyFile;

let counter = 0;
const tempId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const DEFAULT_VALUES = [100, 200, 300, 400, 500];

export function newQuestion(value: number): JeopardyQuestion {
  return { id: tempId("q"), value, clue: "", answer: "", explanation: "" };
}

export function newCategory(): JeopardyCategory {
  return { id: tempId("c"), title: "", questions: DEFAULT_VALUES.map(newQuestion) };
}

export function newDraft(): Draft {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType: JEOPARDY_TYPE,
    metadata: { title: "", description: "", author: "", coverImage: null },
    appearance: { accentColor: "#79B8FF", backgroundPreset: "aurora" },
    content: {
      categories: Array.from({ length: 5 }, newCategory),
      finalJeopardy: { enabled: false, mode: "always", category: "", clue: "", answer: "" },
    },
    settings: { allowNegativeScores: false, showExplanations: true, timeLimitSeconds: 0, finalTimeLimitSeconds: 0 },
  };
}

/** Accepts a saved draft only if it still has the expected outline. */
export function reviveDraft(saved: unknown): Draft | null {
  if (!isRecord(saved) || !isRecord(saved.metadata) || !isRecord(saved.appearance) || !isRecord(saved.settings)) return null;
  if (!isRecord(saved.content) || !Array.isArray(saved.content.categories) || !isRecord(saved.content.finalJeopardy)) return null;
  const ok = saved.content.categories.every((c) => isRecord(c) && typeof c.id === "string" && Array.isArray(c.questions) && c.questions.every((q) => isRecord(q) && typeof q.id === "string"));
  if (!ok) return null;
  const draft = saved as unknown as Draft;
  const f = draft.content.finalJeopardy as Partial<Draft["content"]["finalJeopardy"]>;
  const s = draft.settings as Partial<Draft["settings"]>;
  const seconds = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    ...draft,
    content: {
      ...draft.content,
      finalJeopardy: { ...draft.content.finalJeopardy, mode: (FINAL_MODES as readonly unknown[]).includes(f.mode) ? f.mode! : "always" },
    },
    settings: { ...draft.settings, timeLimitSeconds: seconds(s.timeLimitSeconds), finalTimeLimitSeconds: seconds(s.finalTimeLimitSeconds) },
  };
}

/** Turns a validated file into an editable draft. */
export function draftFromFile(file: JeopardyFile): Draft {
  return {
    ...file,
    content: {
      ...file.content,
      categories: file.content.categories.map((c) => ({ ...c, questions: c.questions.map((q) => ({ ...q, explanation: q.explanation ?? "" })) })),
    },
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function finalOut(f: Draft["content"]["finalJeopardy"]): Draft["content"]["finalJeopardy"] {
  const out: Draft["content"]["finalJeopardy"] = {
    enabled: f.enabled,
    mode: f.mode === "tiebreaker" ? "tiebreaker" : "always",
    category: f.category.trim(),
    clue: f.clue.trim(),
    answer: f.answer.trim(),
  };
  if (f.clueImage?.trim()) out.clueImage = f.clueImage.trim();
  if (f.answerImage?.trim()) out.answerImage = f.answerImage.trim();
  return out;
}

/** Converts the editor state into the shared Zuno JSON shape with clean, unique IDs. */
export function draftToFile(draft: Draft): JeopardyFile {
  const used = new Set<string>();
  const unique = (base: string) => {
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType: JEOPARDY_TYPE,
    metadata: {
      title: draft.metadata.title.trim(),
      description: draft.metadata.description.trim(),
      author: draft.metadata.author.trim(),
      coverImage: draft.metadata.coverImage,
    },
    appearance: { ...draft.appearance },
    content: {
      categories: draft.content.categories.map((c, ci) => {
        const catId = unique(slugify(c.title) || `category-${ci + 1}`);
        return {
          id: catId,
          title: c.title.trim(),
          questions: c.questions.map((q) => {
            const out: JeopardyQuestion = {
              id: unique(`${catId}-${Number.isFinite(q.value) ? q.value : "x"}`),
              value: q.value,
              clue: q.clue.trim(),
              answer: q.answer.trim(),
            };
            if (q.explanation?.trim()) out.explanation = q.explanation.trim();
            if (q.dailyDouble === true) out.dailyDouble = true;
            if (q.clueImage?.trim()) out.clueImage = q.clueImage.trim();
            if (q.answerImage?.trim()) out.answerImage = q.answerImage.trim();
            if (typeof q.timeLimit === "number" && Number.isInteger(q.timeLimit)) out.timeLimit = q.timeLimit;
            return out;
          }),
        };
      }),
      finalJeopardy: finalOut(draft.content.finalJeopardy),
    },
    settings: { ...draft.settings },
  };
}

export function isQuestionComplete(q: JeopardyQuestion): boolean {
  return q.clue.trim() !== "" && q.answer.trim() !== "" && Number.isInteger(q.value) && q.value > 0;
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
