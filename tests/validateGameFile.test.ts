import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { draftToFile, newDraft } from "../src/components/builder/editorModel";
import { LIMITS } from "../src/game-files/schema/common";
import { buildJeopardyGuide, type JeopardyFile } from "../src/game-files/schema/jeopardy";
import { validateGameFile, validateGameFileText } from "../src/game-files/schema/validateGameFile";

const sampleText = readFileSync(new URL("../public/samples/science-review.zuno.json", import.meta.url), "utf8");
const sample = () => JSON.parse(sampleText);
const errorsOf = (raw: unknown, type = "jeopardy") => {
  const r = validateGameFile(raw, type);
  return r.ok ? [] : r.errors;
};

describe("game file validation", () => {
  it("accepts a valid Jeopardy file", () => {
    const r = validateGameFileText(sampleText, "jeopardy");
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.file as JeopardyFile).content.categories).toHaveLength(5);
  });

  it("rejects invalid JSON with a plain message", () => {
    const r = validateGameFileText("{ not json", "jeopardy");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^This is not valid JSON\./);
  });

  it("unwraps a Markdown fence around the JSON", () => {
    expect(validateGameFileText("```json\n" + sampleText + "\n```", "jeopardy").ok).toBe(true);
  });

  it("rejects the wrong game type", () => {
    expect(errorsOf({ ...sample(), gameType: "trivia" })[0]).toBe("This file is for Trivia, but you selected Jeopardy. Open the matching game engine to load it.");
  });

  it("rejects unsupported schema versions", () => {
    expect(errorsOf({ ...sample(), schemaVersion: 2 })[0]).toMatch(/newer format/);
    expect(errorsOf({ ...sample(), schemaVersion: 0 })[0]).toBe("This file uses an unsupported schema version.");
    expect(errorsOf({ ...sample(), schemaVersion: undefined })[0]).toMatch(/missing its schema version/);
  });

  it("names the location of missing content", () => {
    const f = sample();
    f.content.categories[2].title = " ";
    delete f.content.categories[0].questions[1].answer;
    f.content.categories[1].questions[0].clue = "";
    delete f.content.categories[3].questions[4].value;
    f.content.categories[4].questions = [];
    expect(errorsOf(f)).toEqual([
      "Category 1, question 2 is missing an answer.",
      "Category 2, question 1 is missing a clue.",
      "Category 3 is missing a title.",
      "Category 4, question 5 is missing a point value.",
      "Category 5 has no questions. Each category needs at least one.",
    ]);
  });

  it("requires at least one category and a title", () => {
    const f = sample();
    f.content.categories = [];
    f.metadata.title = "";
    expect(errorsOf(f)).toEqual(["The game is missing a title.", "The game needs at least one category."]);
  });

  it("rejects values that are not usable numbers", () => {
    const f = sample();
    f.content.categories[0].questions[0].value = "100";
    f.content.categories[0].questions[1].value = -5;
    const errors = errorsOf(f);
    expect(errors[0]).toMatch(/not a number/);
    expect(errors[1]).toMatch(/whole number from 1/);
  });

  it("renames duplicate IDs and says so", () => {
    const f = sample();
    f.content.categories[1].id = f.content.categories[0].id;
    f.content.categories[0].questions[1].id = f.content.categories[0].questions[0].id;
    const r = validateGameFile(f, "jeopardy");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const file = r.file as JeopardyFile;
    const ids = file.content.categories.flatMap((c) => [c.id, ...c.questions.map((q) => q.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.warnings[0]).toMatch(/2 duplicate IDs were renamed/);
  });

  it("keeps markup as plain text and rejects script tags", () => {
    const f = sample();
    f.content.categories[0].questions[0].clue = "<b>bold</b> & <img src=x onerror=alert(1)>";
    const ok = validateGameFile(f, "jeopardy");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((ok.file as JeopardyFile).content.categories[0].questions[0].clue).toContain("<b>bold</b>");
    f.content.categories[0].questions[0].clue = "<script>alert(1)</script>";
    expect(errorsOf(f)[0]).toMatch(/script tag/);
  });

  it("rejects unsafe or unsupported cover images", () => {
    const withCover = (coverImage: unknown) => {
      const f = sample();
      f.metadata.coverImage = coverImage;
      return errorsOf(f);
    };
    expect(withCover("javascript:alert(1)")[0]).toMatch(/https/);
    expect(withCover("http://example.com/a.png")[0]).toMatch(/https/);
    expect(withCover("data:text/html;base64,PGI+")[0]).toMatch(/unsupported format/);
    expect(withCover("data:image/svg+xml;base64,PHN2Zz4=")[0]).toMatch(/unsupported format/);
    expect(withCover("https://example.com/a.png")).toEqual([]);
    expect(withCover("data:image/png;base64,iVBORw0KGgo=")).toEqual([]);
    expect(withCover("data:image/png;base64," + "A".repeat(Math.ceil((LIMITS.maxImageBytes * 4) / 3) + 8))[0]).toMatch(/too large/);
  });

  it("explains which part of an oversized file is too big", () => {
    const f = sample();
    f.metadata.coverImage = "data:image/png;base64," + "A".repeat(LIMITS.maxFileBytes);
    const r = validateGameFileText(JSON.stringify(f), "jeopardy");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/embedded cover image/);
  });

  it("gives files without appearance a stable generated one", () => {
    const f = sample();
    delete f.appearance;
    const a = validateGameFile(f, "jeopardy");
    const b = validateGameFile(f, "jeopardy");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.file.appearance).toEqual(b.file.appearance);
      expect(a.file.appearance.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("checks Final Jeopardy only when it is on", () => {
    const f = sample();
    f.content.finalJeopardy = { enabled: true, category: "", clue: "", answer: "" };
    expect(errorsOf(f)).toHaveLength(3);
    f.content.finalJeopardy.enabled = false;
    expect(errorsOf(f)).toEqual([]);
  });
});

describe("builder output", () => {
  it("an empty draft fails validation, a filled one passes the same validator", () => {
    const draft = newDraft();
    expect(validateGameFile(draftToFile(draft), "jeopardy").ok).toBe(false);
    draft.metadata.title = "Capitals";
    draft.content.categories.forEach((c, ci) => {
      c.title = ci < 2 ? "Europe" : `Region ${ci}`;
      c.questions.forEach((q, qi) => {
        q.clue = `Clue ${qi}`;
        q.answer = `Answer ${qi}`;
      });
    });
    const text = JSON.stringify(draftToFile(draft));
    const r = validateGameFileText(text, "jeopardy");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });

  it("the AI guide carries the schema and the output rules", () => {
    const guide = buildJeopardyGuide();
    expect(guide).toContain('"schemaVersion": 1');
    expect(guide).toContain('"gameType": "jeopardy"');
    expect(guide).toContain("Output JSON only");
    expect(guide).toContain('"spotlight"');
  });
});

describe("jeopardy expansion fields", () => {
  const ok = (raw: unknown) => {
    const r = validateGameFile(raw, "jeopardy");
    if (!r.ok) throw new Error(r.errors.join("; "));
    return { file: r.file as JeopardyFile, warnings: r.warnings };
  };

  it("accepts the new fields and keeps them", () => {
    const f = sample();
    f.content.categories[0].questions[0].clueImage = "https://example.com/a.png";
    f.content.categories[0].questions[0].answerImage = "https://example.com/b.png";
    f.content.categories[0].questions[0].timeLimit = 45;
    f.content.finalJeopardy.clueImage = "https://example.com/c.png";
    const { file } = ok(f);
    const q = file.content.categories[0].questions[0];
    expect(q.clueImage).toBe("https://example.com/a.png");
    expect(q.answerImage).toBe("https://example.com/b.png");
    expect(q.timeLimit).toBe(45);
    expect(file.content.finalJeopardy.clueImage).toBe("https://example.com/c.png");
    expect(file.content.finalJeopardy.mode).toBe("always");
    expect(file.settings.timeLimitSeconds).toBe(30);
    expect(file.settings.finalTimeLimitSeconds).toBe(60);
    const dd = file.content.categories.flatMap((c) => c.questions).filter((x) => x.dailyDouble);
    expect(dd).toHaveLength(1);
  });

  it("only sets optional question keys when present", () => {
    const f = sample();
    f.content.categories[0].questions[0].clueImage = "";
    f.content.categories[0].questions[0].timeLimit = null;
    f.content.categories[0].questions[0].dailyDouble = false;
    const q = ok(f).file.content.categories[0].questions[0];
    expect(Object.keys(q).sort()).toEqual(["answer", "clue", "explanation", "id", "value"]);
  });

  it("rejects a bad dailyDouble, time limit or image", () => {
    const bad = (mutate: (f: ReturnType<typeof sample>) => void) => {
      const f = sample();
      mutate(f);
      return errorsOf(f);
    };
    const q = (f: ReturnType<typeof sample>) => f.content.categories[0].questions[1];
    expect(bad((f) => (q(f).dailyDouble = "yes"))[0]).toMatch(/^Category 1, question 2 has a dailyDouble/);
    expect(bad((f) => (q(f).timeLimit = 12.5))[0]).toMatch(/^Category 1, question 2 has a time limit/);
    expect(bad((f) => (q(f).timeLimit = -1))[0]).toMatch(/time limit/);
    expect(bad((f) => (q(f).timeLimit = 601))[0]).toMatch(/time limit/);
    expect(bad((f) => (q(f).timeLimit = "30"))[0]).toMatch(/time limit/);
    expect(bad((f) => (q(f).clueImage = "http://example.com/a.png"))[0]).toBe("Category 1, question 2's clue image link must start with https://. Other link types are not allowed.");
    expect(bad((f) => (q(f).answerImage = "not a url"))[0]).toBe("Category 1, question 2's answer image link is not a valid address.");
    expect(bad((f) => (q(f).answerImage = 5))[0]).toBe("Category 1, question 2's answer image must be an image link or left empty.");
    expect(bad((f) => (f.content.finalJeopardy.answerImage = "ftp://x.com/a.png"))[0]).toMatch(/^The Final Jeopardy answer image link/);
    expect(bad((f) => (f.settings.timeLimitSeconds = 601))[0]).toMatch(/timeLimitSeconds/);
    expect(bad((f) => (f.settings.finalTimeLimitSeconds = 1.5))[0]).toMatch(/finalTimeLimitSeconds/);
  });

  it("defaults a missing final mode to always, and settings timers to 0", () => {
    const f = sample();
    delete f.content.finalJeopardy.mode;
    delete f.settings.timeLimitSeconds;
    delete f.settings.finalTimeLimitSeconds;
    const { file, warnings } = ok(f);
    expect(file.content.finalJeopardy.mode).toBe("always");
    expect(file.settings.timeLimitSeconds).toBe(0);
    expect(file.settings.finalTimeLimitSeconds).toBe(0);
    expect(warnings).toEqual([]);
    delete f.content.finalJeopardy;
    expect(ok(f).file.content.finalJeopardy.mode).toBe("always");
  });

  it("accepts tiebreaker mode and warns on an unknown mode", () => {
    const f = sample();
    f.content.finalJeopardy.mode = "tiebreaker";
    expect(ok(f).file.content.finalJeopardy.mode).toBe("tiebreaker");
    f.content.finalJeopardy.mode = "sometimes";
    const { file, warnings } = ok(f);
    expect(file.content.finalJeopardy.mode).toBe("always");
    expect(warnings.some((w) => /mode was not recognized/.test(w))).toBe(true);
  });

  it("warns when every question is a daily double", () => {
    const f = sample();
    for (const c of f.content.categories) for (const q of c.questions) q.dailyDouble = true;
    expect(ok(f).warnings.some((w) => /Every question is a Daily Double/.test(w))).toBe(true);
  });

  it("describes the new fields in the AI guide", () => {
    const g = buildJeopardyGuide();
    for (const word of ["dailyDouble", "clueImage", "answerImage", "timeLimit", "timeLimitSeconds", "finalTimeLimitSeconds", '"mode"', "LaTeX"]) expect(g).toContain(word);
  });
});

