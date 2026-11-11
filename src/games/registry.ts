import type { BackgroundPreset, GameFile, ValidationResult } from "../game-files/schema/common";
import { JEOPARDY_TYPE, validateJeopardy } from "../game-files/schema/jeopardy";

/**
 * Everything the shell needs to know about a game engine. The dashboard only
 * reads these common fields and never looks inside a game's content.
 * Screens for hosting and building are mapped per game type in app/App.tsx.
 */
export interface GameEngine {
  gameType: string;
  title: string;
  description: string;
  schemaVersions: readonly number[];
  hasBuilder: boolean;
  appearance: { accentColor: string; backgroundPreset: BackgroundPreset };
  validate: (raw: Record<string, unknown>) => ValidationResult<GameFile>;
}

const engines: GameEngine[] = [
  {
    gameType: JEOPARDY_TYPE,
    title: "Jeopardy",
    description: "Categories, clues and point values on one board. Load a game file, name your teams and run the round from this screen.",
    schemaVersions: [1],
    hasBuilder: true,
    appearance: { accentColor: "#79B8FF", backgroundPreset: "spotlight" },
    validate: validateJeopardy as GameEngine["validate"],
  },
];

export function listEngines(): GameEngine[] {
  return engines;
}

export function getEngine(gameType: string): GameEngine | undefined {
  return engines.find((e) => e.gameType === gameType);
}

/** A readable name for any game type, including ones this version cannot run. */
export function gameTypeName(gameType: string): string {
  const known = getEngine(gameType);
  if (known) return known.title;
  const clean = gameType.replace(/[^a-z0-9 _-]/gi, "").slice(0, 40);
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "another game";
}
