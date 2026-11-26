import type { Theme } from "./storage";
import type { Sfx } from "../lib/sfx";

/**
 * The theme registry. A theme is a base palette (the dark or light block in
 * tokens.css) plus an optional skin: html[data-skin] overrides in vice.css or
 * themes.css. App and the settings picker both read from here.
 */
export interface ThemeDef {
  id: Theme;
  label: string;
  base: "light" | "dark";
  /** Value for html[data-skin], or null for the plain base palette. */
  skin: string | null;
  /** Browser chrome colour (meta theme-color). */
  themeColor: string;
  /** Picker preview: page, panel and accent. */
  swatch: { bg: string; panel: string; accent: string };
  /** The cue that plays when this theme is picked. */
  sfx: Sfx;
}

export const THEMES: readonly ThemeDef[] = [
  { id: "dark", label: "Dark", base: "dark", skin: null, themeColor: "#080B12", swatch: { bg: "#080b12", panel: "#1b2130", accent: "#79b8ff" }, sfx: "themeDark" },
  { id: "light", label: "Light", base: "light", skin: null, themeColor: "#F2F4F8", swatch: { bg: "#f2f4f8", panel: "#dfe3ec", accent: "#246bc4" }, sfx: "themeLight" },
  { id: "vice", label: "Vice", base: "dark", skin: "vice", themeColor: "#140726", swatch: { bg: "#140726", panel: "#2b1150", accent: "#ff3ea5" }, sfx: "themeVice" },
  { id: "ocean", label: "Ocean", base: "dark", skin: "ocean", themeColor: "#06141F", swatch: { bg: "#06141f", panel: "#12304a", accent: "#2dd4bf" }, sfx: "themeOcean" },
  { id: "zuno-special", label: "Zuno Special", base: "dark", skin: "zuno-special", themeColor: "#0F0A1A", swatch: { bg: "#0f0a1a", panel: "#251a3a", accent: "#ffa63d" }, sfx: "themeZunoSpecial" },
  { id: "anthropical", label: "Anthropical", base: "light", skin: "anthropical", themeColor: "#F5F0E6", swatch: { bg: "#f5f0e6", panel: "#e2d9c5", accent: "#b4532f" }, sfx: "themeAnthropical" },
];

export function themeDef(id: Theme): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
