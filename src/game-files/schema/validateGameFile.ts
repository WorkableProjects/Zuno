import { getEngine, gameTypeName } from "../../games/registry";
import { LIMITS, SUPPORTED_SCHEMA_VERSIONS, formatBytes, isRecord, type GameFile, type ValidationResult } from "./common";

/** AI assistants often wrap JSON in a Markdown fence. Unwrap it, nothing else. */
function unwrap(text: string): string {
  let t = text.replace(/^﻿/, "").trim();
  const fence = /^```[a-z]*\s*\n([\s\S]*?)\n?```$/i.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}

/**
 * The single entry point for every game file, whether it was picked from disk,
 * pasted, exported by the builder or remembered from an earlier visit.
 * The text is parsed as data only. Nothing in it is ever executed.
 */
export function validateGameFileText(text: string, expectedGameType?: string): ValidationResult<GameFile> {
  const bytes = new Blob([text]).size;
  if (bytes > LIMITS.maxFileBytes) {
    const hasImage = /"coverImage"\s*:\s*"data:/.test(text);
    return {
      ok: false,
      errors: [
        `This file is ${formatBytes(bytes)}. The limit is ${formatBytes(LIMITS.maxFileBytes)}. ${
          hasImage
            ? `Most of that is the embedded cover image. Use a smaller image, under ${formatBytes(LIMITS.maxImageBytes)}.`
            : "The game data itself is too large. Remove some content and try again."
        }`,
      ],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(unwrap(text));
  } catch (e) {
    const detail = e instanceof Error ? e.message.replace(/^JSON\.parse:\s*/i, "") : "";
    return {
      ok: false,
      errors: [`This is not valid JSON.${detail ? ` ${detail}.`.replace(/\.\.$/, ".") : ""}`],
    };
  }
  return validateGameFile(raw, expectedGameType);
}

export function validateGameFile(raw: unknown, expectedGameType?: string): ValidationResult<GameFile> {
  if (!isRecord(raw)) {
    return { ok: false, errors: ["This file is not a Zuno game file. It should be one JSON object."] };
  }

  const version = raw.schemaVersion;
  if (version === undefined || version === null) {
    return { ok: false, errors: ["The file is missing its schema version."] };
  }
  if (typeof version !== "number" || !(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(version)) {
    const newest = Math.max(...SUPPORTED_SCHEMA_VERSIONS);
    return {
      ok: false,
      errors: [
        typeof version === "number" && version > newest
          ? "This game file was created with a newer format that this version of Zuno does not support."
          : "This file uses an unsupported schema version.",
      ],
    };
  }

  const gameType = raw.gameType;
  if (typeof gameType !== "string" || gameType.trim() === "") {
    return { ok: false, errors: ["The file is missing its game type."] };
  }
  if (expectedGameType && gameType !== expectedGameType) {
    return {
      ok: false,
      errors: [
        `This file is for ${gameTypeName(gameType)}, but you selected ${gameTypeName(expectedGameType)}. Open the matching game engine to load it.`,
      ],
    };
  }
  const engine = getEngine(gameType);
  if (!engine) {
    return { ok: false, errors: [`This file is for ${gameTypeName(gameType)}, which this version of Zuno cannot run.`] };
  }
  if (!engine.schemaVersions.includes(version)) {
    return { ok: false, errors: ["This file uses an unsupported schema version."] };
  }

  for (const key of ["metadata", "content"] as const) {
    if (raw[key] === undefined) return { ok: false, errors: [`The file is missing its ${key} section.`] };
  }
  return engine.validate(raw);
}
