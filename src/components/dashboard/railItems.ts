import type { RecentGame } from "../../app/storage";
import { listEngines } from "../../games/registry";
import type { BackdropSpec } from "./AmbientBackground";

/** What the dashboard knows about a tile. Common metadata only, never game content. */
export interface RailItem {
  id: string;
  kind: "engine" | "build" | "file";
  gameType: string;
  title: string;
  eyebrow: string;
  description: string;
  backdrop: BackdropSpec;
  recent?: RecentGame;
}

export const BUILD_TILE_ID = "build";

export function buildRailItems(recent: RecentGame[]): RailItem[] {
  const engines = listEngines();
  const items: RailItem[] = engines.map((e) => ({
    id: `engine:${e.gameType}`,
    kind: "engine",
    gameType: e.gameType,
    title: e.title,
    eyebrow: "No game file loaded yet",
    description: e.description,
    backdrop: {
      key: `engine:${e.gameType}`,
      cover: null,
      accent: e.appearance.accentColor,
      preset: e.appearance.backgroundPreset,
      artwork: "board",
    },
  }));

  items.push({
    id: BUILD_TILE_ID,
    kind: "build",
    gameType: engines[0].gameType,
    title: "Build a game",
    eyebrow: "Create",
    description: "Write your own categories and clues in the visual editor, or have an AI assistant draft the game file for you.",
    backdrop: { key: BUILD_TILE_ID, cover: null, accent: "#F06A9A", preset: "horizon", artwork: null },
  });

  for (const r of recent) {
    items.push({
      id: `file:${r.id}`,
      kind: "file",
      gameType: r.gameType,
      title: r.title,
      eyebrow: r.filename,
      description: [r.description, r.summary + (r.author ? ` · by ${r.author}` : "")].filter(Boolean).join("\n"),
      backdrop: {
        key: `file:${r.id}:${r.savedAt}`,
        cover: r.coverImage,
        accent: r.accentColor,
        preset: r.backgroundPreset,
        artwork: "board",
      },
      recent: r,
    });
  }
  return items;
}
