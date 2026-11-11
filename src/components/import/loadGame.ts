import { LIMITS, formatBytes, type GameFile, type ValidationResult } from "../../game-files/schema/common";
import { validateGameFileText } from "../../game-files/schema/validateGameFile";

/** A game file that passed validation, with the exact text it came from. */
export interface LoadedGame<F extends GameFile = GameFile> {
  file: F;
  filename: string;
  text: string;
  warnings: string[];
}

export type LoadResult = { ok: true; game: LoadedGame } | { ok: false; errors: string[] };

/**
 * The one path every game file takes into Zuno: picked, dropped, pasted,
 * exported by the builder or remembered. Runs off the current frame so the
 * interface stays responsive while a large file is checked.
 */
export function loadGameText(text: string, filename: string, gameType: string): Promise<LoadResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const result: ValidationResult = validateGameFileText(text, gameType);
      resolve(result.ok ? { ok: true, game: { file: result.file, filename, text, warnings: result.warnings } } : { ok: false, errors: result.errors });
    }, 0);
  });
}

export async function loadGameFile(file: File, gameType: string): Promise<LoadResult> {
  if (file.size > LIMITS.maxFileBytes) {
    return {
      ok: false,
      errors: [
        `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS.maxFileBytes)}. If the game has an embedded cover image, use a smaller one, under ${formatBytes(LIMITS.maxImageBytes)}.`,
      ],
    };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, errors: ["Zuno could not read this file. Check that it still exists and try again."] };
  }
  return loadGameText(text, file.name, gameType);
}
