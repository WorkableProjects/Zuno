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
