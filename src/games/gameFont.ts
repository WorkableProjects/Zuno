import { useEffect, type CSSProperties } from "react";
import { getEngine } from "./registry";
import "./gameFont.css";
import "./atmosphere.css";

/**
 * Per-game display fonts, self-hosted through @fontsource and loaded only when
 * a game is opened. Games without one fall back to the shell display face.
 */
const loaders: Record<string, () => Promise<unknown>> = {
  anton: () => import("@fontsource/anton/latin-400.css"),
  fredoka: () => import("@fontsource/fredoka/latin-600.css"),
  "special-elite": () => import("@fontsource/special-elite/latin-400.css"),
  bungee: () => import("@fontsource/bungee/latin-400.css"),
  "playfair-display": () => import("@fontsource/playfair-display/latin-700.css"),
  caveat: () => import("@fontsource/caveat/latin-700.css"),
  "alfa-slab-one": () => import("@fontsource/alfa-slab-one/latin-400.css"),
};

const requested = new Set<string>();

/** Starts loading a font once. Safe to call on every render. */
export function loadGameFont(id: string | undefined, family?: string): void {
  if (!id || requested.has(id) || !loaders[id]) return;
  requested.add(id);
  loaders[id]()
    // The stylesheet only declares the face; ask for the file now so it is ready before the hero or a title card draws with it.
    .then(() => (family && typeof document !== "undefined" && document.fonts ? document.fonts.load(`1em "${family}"`) : undefined))
    .catch(() => requested.delete(id));
}

/** Style carrying --game-font for a game type, and kicks off the font load. */
export function gameFontStyle(gameType: string): CSSProperties {
  const font = getEngine(gameType)?.font;
  if (!font) return {};
  loadGameFont(font.id, font.family);
  const stack = `"${font.family}", "Dutch Display Sans", "Figtree Variable", ui-sans-serif, system-ui, sans-serif`;
  // --font-display is redefined too, so every in-game heading, score and board cell that already uses it picks the game face up.
  return { "--game-font": stack, "--font-display": stack } as CSSProperties;
}

/** Same as gameFontStyle, for components that prefer a hook. */
export function useGameFont(gameType: string): CSSProperties {
  const font = getEngine(gameType)?.font;
  useEffect(() => loadGameFont(font?.id, font?.family), [font?.id, font?.family]);
  return gameFontStyle(gameType);
}
