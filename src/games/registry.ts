import type { BackgroundPreset, GameFile, ValidationResult } from "../game-files/schema/common";
import { HEADBANDS_TYPE, eligibleIdentities, validateHeadbands, type HeadbandsFile } from "../game-files/schema/headbands";
import { LIAR_TYPE, validateLiar, type LiarFile } from "../game-files/schema/liar";
import { RPG_TYPE, formatCoins, validateRpg, type RpgFile } from "../game-files/schema/rpg";
import { BLACKJACK_TYPE, DRAWIT_TYPE, FEUD_TYPE, validateBlackjack, validateDrawIt, validateFeud } from "../game-files/schema/party";
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
  /** In-game display font (self-hosted, lazy loaded by games/gameFont.ts). Omitted games use the shell display face. */
  font?: { id: string; family: string };
  validate: (raw: Record<string, unknown>) => ValidationResult<GameFile>;
  /** Decorative scene drawn behind the dashboard for this engine. */
  artwork: "board" | "cards" | "statements" | "hands" | "deck" | "sketch" | "survey" | null;
  /** Runs only in online lobbies. The dashboard offers Host lobby and Join instead of Load. */
  onlineOnly?: boolean;
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
    font: { id: "anton", family: "Anton" },
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
    font: { id: "fredoka", family: "Fredoka" },
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
  {
    gameType: LIAR_TYPE,
    title: "LIAR",
    description: "Two truths and a lie. Each storyteller shares three statements with follow-up questions, the group investigates, then everyone votes on the lie.",
    schemaVersions: [1],
    hasBuilder: false,
    appearance: { accentColor: "#FF6B8B", backgroundPreset: "aurora" },
    font: { id: "special-elite", family: "Special Elite" },
    validate: validateLiar as GameEngine["validate"],
    artwork: "statements",
    sampleFile: "liar-prompts.zuno.json",
    fileHolds: "optional question prompts and default settings",
    buildTitle: "Build a LIAR deck",
    summarize: (f) => {
      const n = (f as LiarFile).content.questionPrompts.length;
      return `${n} question ${n === 1 ? "prompt" : "prompts"}`;
    },
    stats: (f) => {
      const file = f as LiarFile;
      return [
        ["Question prompts", file.content.questionPrompts.length],
        ["Players", `${file.settings.minPlayers} to ${file.settings.maxPlayers}`],
        ["Scoring", file.settings.scoringEnabled ? "On" : "Off"],
      ];
    },
    listing: () => null,
  },
  {
    gameType: RPG_TYPE,
    title: "Rock Paper Gamble",
    description: "Rock paper scissors duels with money on the line. Challenge a rival, let everyone else bet on the winner, and take the whole pot.",
    schemaVersions: [1],
    hasBuilder: false,
    appearance: { accentColor: "#7C3AED", backgroundPreset: "vegas" },
    font: { id: "bungee", family: "Bungee" },
    validate: validateRpg as GameEngine["validate"],
    artwork: "hands",
    onlineOnly: true,
    sampleFile: "rock-paper-gamble.zuno.json",
    fileHolds: "the starting money and the timers",
    buildTitle: "Build a Rock Paper Gamble game",
    summarize: (f) => {
      const file = f as RpgFile;
      return `${formatCoins(file.settings.startingMoney)} each · up to ${file.settings.maxPlayers} players`;
    },
    stats: (f) => {
      const file = f as RpgFile;
      return [
        ["Starting money", formatCoins(file.settings.startingMoney)],
        ["Players", `2 to ${file.settings.maxPlayers}`],
        ["Round timer", `${file.settings.roundSeconds}s`],
      ];
    },
    listing: () => null,
  },
  {
    gameType: BLACKJACK_TYPE,
    title: "Blackjack",
    description: "Everyone plays against the dealer. Bet, hit, stand, double or split, and finish with the most chips.",
    schemaVersions: [1],
    hasBuilder: false,
    appearance: { accentColor: "#16A34A", backgroundPreset: "vegas" },
    font: { id: "playfair-display", family: "Playfair Display" },
    validate: validateBlackjack as GameEngine["validate"],
    artwork: "deck",
    onlineOnly: true,
    sampleFile: "blackjack.zuno.json",
    fileHolds: "default settings for the lobby",
    buildTitle: "Build a Blackjack game",
    summarize: () => "Online only",
    stats: (f) => Object.entries(f.settings as Record<string, unknown>).filter(([, v]) => typeof v === "number").slice(0, 3).map(([k, v]) => [k, v as number]),
    listing: () => null,
  },
  {
    gameType: DRAWIT_TYPE,
    title: "Draw It",
    description: "One player draws a secret word while everyone watches it appear live and races to guess. Faster guesses score more.",
    schemaVersions: [1],
    hasBuilder: false,
    appearance: { accentColor: "#F59E0B", backgroundPreset: "aurora" },
    font: { id: "caveat", family: "Caveat" },
    validate: validateDrawIt as GameEngine["validate"],
    artwork: "sketch",
    onlineOnly: true,
    sampleFile: "draw-it.zuno.json",
    fileHolds: "default settings for the lobby",
    buildTitle: "Build a Draw It game",
    summarize: () => "Online only",
    stats: (f) => Object.entries(f.settings as Record<string, unknown>).filter(([, v]) => typeof v === "number").slice(0, 3).map(([k, v]) => [k, v as number]),
    listing: () => null,
  },
  {
    gameType: FEUD_TYPE,
    title: "Survey Feud",
    description: "Everyone writes a survey with answers and points. Each survey becomes a round, hosted by its author, while everyone else guesses the board.",
    schemaVersions: [1],
    hasBuilder: false,
    appearance: { accentColor: "#2563EB", backgroundPreset: "spotlight" },
    font: { id: "alfa-slab-one", family: "Alfa Slab One" },
    validate: validateFeud as GameEngine["validate"],
    artwork: "survey",
    onlineOnly: true,
    sampleFile: "survey-feud.zuno.json",
    fileHolds: "default settings for the lobby",
    buildTitle: "Build a Survey Feud game",
    summarize: () => "Online only",
    stats: (f) => Object.entries(f.settings as Record<string, unknown>).filter(([, v]) => typeof v === "number").slice(0, 3).map(([k, v]) => [k, v as number]),
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
