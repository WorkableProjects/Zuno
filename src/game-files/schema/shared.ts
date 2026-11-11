import { fallbackAppearance } from "../../lib/color";
import { BACKGROUND_PRESETS, LIMITS, checkCoverImage, isHexColor, isRecord, type BackgroundPreset, type GameAppearance, type GameMetadata } from "./common";

const SCRIPT_PATTERN = /<\s*script\b/i;

export function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Length and code checks shared by every plain-text field in a game file. */
export function checkPlainText(value: string, where: string, errors: string[]) {
  if (value.length > LIMITS.maxTextLength) errors.push(`${where} is longer than ${LIMITS.maxTextLength} characters.`);
  if (SCRIPT_PATTERN.test(value)) errors.push(`${where} contains a script tag. Game files cannot include code.`);
}

/** Reads metadata and appearance the same way for every game type. */
export function parseCommon(raw: Record<string, unknown>, gameType: string, errors: string[], warnings: string[]): { metadata: GameMetadata; appearance: GameAppearance } {
  let title = "";
  let description = "";
  let author = "";
  let coverImage: string | null = null;
  if (!isRecord(raw.metadata)) {
    errors.push("The file is missing its metadata section.");
  } else {
    const m = raw.metadata;
    const t = textOrNull(m.title);
    if (t === null || t.trim() === "") errors.push("The game is missing a title.");
    else {
      title = t.trim();
      if (title.length > LIMITS.maxTitleLength) errors.push(`The game title is longer than ${LIMITS.maxTitleLength} characters.`);
      checkPlainText(title, "The game title", errors);
    }
    if (m.description !== undefined && m.description !== null) {
      const d = textOrNull(m.description);
      if (d === null) errors.push("The game description must be text.");
      else {
        description = d.trim();
        checkPlainText(description, "The game description", errors);
      }
    }
    if (m.author !== undefined && m.author !== null) {
      const a = textOrNull(m.author);
      if (a === null) errors.push("The author must be text.");
      else {
        author = a.trim();
        checkPlainText(author, "The author", errors);
      }
    }
    const coverError = checkCoverImage(m.coverImage);
    if (coverError) errors.push(coverError);
    else if (typeof m.coverImage === "string" && m.coverImage !== "") coverImage = m.coverImage;
  }

  const fallback = fallbackAppearance(gameType, title);
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
        if ((BACKGROUND_PRESETS as readonly unknown[]).includes(a.backgroundPreset)) backgroundPreset = a.backgroundPreset as BackgroundPreset;
        else warnings.push(`The background preset was not recognized, so Zuno picked one. Supported presets: ${BACKGROUND_PRESETS.join(", ")}.`);
      }
    }
  }
  return { metadata: { title, description, author, coverImage }, appearance: { accentColor, backgroundPreset } };
}
