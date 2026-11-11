import type { BackgroundPreset, GameFile, ValidationResult } from "../game-files/schema/common";
import { HEADBANDS_TYPE, eligibleIdentities, validateHeadbands, type HeadbandsFile } from "../game-files/schema/headbands";
import { JEOPARDY_TYPE, countClues, validateJeopardy, type JeopardyFile } from "../game-files/schema/jeopardy";

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
  /** Decorative scene drawn behind the dashboard for this engine. */
  artwork: "board" | "cards" | null;
  /** A sample in public/samples that the importer can load. */
  sampleFile: string;
  /** What a game file holds, for the import screen. */
  fileHolds: string;
  /** Builder heading, such as "Build a Jeopardy game". */
  buildTitle: string;
  /** One line for the recent-games tile, such as "5 categories · 25 clues". */
  summarize: (file: GameFile) => string;
  /** Numbers shown in the import preview. */
  stats: (file: GameFile) => Array<[string, string | number]>;
  /** Names listed under the import preview, such as category titles. Null keeps the content private. */
  listing: (file: GameFile) => { label: string; items: string[] } | null;
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
    artwork: "board",
    sampleFile: "science-review.zuno.json",
    fileHolds: "the categories, clues and answers",
    buildTitle: "Build a Jeopardy game",
    summarize: (f) => {
      const file = f as JeopardyFile;
      const cats = file.content.categories.length;
      return `${cats} ${cats === 1 ? "category" : "categories"} · ${countClues(file)} clues`;
    },
    stats: (f) => {
      const file = f as JeopardyFile;
      return [
        ["Categories", file.content.categories.length],
        ["Clues", countClues(file)],
        ["Final round", file.content.finalJeopardy.enabled ? "Yes" : "No"],
      ];
    },
    listing: (f) => ({ label: "Categories", items: (f as JeopardyFile).content.categories.map((c) => c.title) }),
  },
  {
    gameType: HEADBANDS_TYPE,
    title: "Headbands",
    description: "Everyone holds a secret identity they can't see. Ask the group yes-or-no questions and work out who, or what, you are.",
    schemaVersions: [1],
    hasBuilder: true,
    appearance: { accentColor: "#FFB454", backgroundPreset: "tide" },
    validate: validateHeadbands as GameEngine["validate"],
    artwork: "cards",
    sampleFile: "everyday-things.zuno.json",
    fileHolds: "the deck of identities players guess",
    buildTitle: "Build a Headbands deck",
    summarize: (f) => {
      const n = (f as HeadbandsFile).content.identities.length;
      return `${n} ${n === 1 ? "identity" : "identities"}`;
    },
    stats: (f) => {
      const file = f as HeadbandsFile;
      return [
        ["Text identities", eligibleIdentities(file, "text").length],
        ["Image identities", eligibleIdentities(file, "image").length],
        ["Players", `2 to ${file.settings.maxPlayers}`],
      ];
    },
    // The host may play too, so the preview never lists the deck.
    listing: () => null,
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
