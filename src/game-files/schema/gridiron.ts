import { BACKGROUND_PRESETS, CURRENT_SCHEMA_VERSION, isHexColor, isRecord, type GameFile, type ValidationResult } from "./common";
import { checkPlainText, parseCommon } from "./shared";

/**
 * Zuno Gridiron GM files. A file can hold a custom league (32 team names and colours) used to start a new career,
 * a saved career exported from the game, or both.
 */
export const GRIDIRON_TYPE = "gridiron";

export interface GridironTeamSeed {
  city: string;
  name: string;
  abbr: string;
  colors: [string, string];
}

export interface GridironContent {
  league: { teams: GridironTeamSeed[] } | null;
  /** An exported career (validated for shape only; it is data and never executed). */
  career: Record<string, unknown> | null;
}

export type GridironSettings = Record<string, never>;
export type GridironFile = GameFile<GridironContent, GridironSettings>;

export function validateGridiron(raw: Record<string, unknown>): ValidationResult<GridironFile> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { metadata, appearance } = parseCommon(raw, GRIDIRON_TYPE, errors, warnings);
  const content: GridironContent = { league: null, career: null };
  if (!isRecord(raw.content)) errors.push("The file is missing its content section.");
  else {
    const c = raw.content;
    if (c.league !== undefined && c.league !== null) {
      if (!isRecord(c.league) || !Array.isArray(c.league.teams)) errors.push("The league section needs a list of teams.");
      else if (c.league.teams.length !== 32) errors.push(`A custom league needs exactly 32 teams. This one has ${c.league.teams.length}.`);
      else {
        const teams: GridironTeamSeed[] = [];
        const abbrs = new Set<string>();
        c.league.teams.forEach((t: unknown, i: number) => {
          const where = `Team ${i + 1}`;
          if (!isRecord(t)) return errors.push(`${where} must be an object.`);
          const city = typeof t.city === "string" ? t.city.trim() : "";
          const name = typeof t.name === "string" ? t.name.trim() : "";
          const abbr = typeof t.abbr === "string" ? t.abbr.trim().toUpperCase() : "";
          if (!city || city.length > 30) errors.push(`${where} needs a city of 1 to 30 characters.`);
          if (!name || name.length > 30) errors.push(`${where} needs a nickname of 1 to 30 characters.`);
          if (!/^[A-Z]{2,4}$/.test(abbr)) errors.push(`${where} needs a 2 to 4 letter abbreviation.`);
          else if (abbrs.has(abbr)) errors.push(`${where} repeats the abbreviation ${abbr}.`);
          abbrs.add(abbr);
          checkPlainText(city, `${where}'s city`, errors);
          checkPlainText(name, `${where}'s nickname`, errors);
          const colors = Array.isArray(t.colors) && t.colors.length === 2 && t.colors.every((x) => typeof x === "string" && isHexColor(x)) ? (t.colors as [string, string]) : null;
          if (!colors) errors.push(`${where} needs two colours as #RRGGBB.`);
          teams.push({ city, name, abbr, colors: colors ?? ["#333333", "#cccccc"] });
        });
        content.league = { teams };
      }
    }
    if (c.career !== undefined && c.career !== null) {
      const k = c.career;
      if (!isRecord(k)) errors.push("The saved career must be an object.");
      else if (k.version !== 1) errors.push("This saved career is from a version Zuno can't read.");
      else if (!Array.isArray(k.teams) || k.teams.length !== 32) errors.push("The saved career is missing its 32 teams.");
      else if (!isRecord(k.players) || !Array.isArray(k.schedule)) errors.push("The saved career is missing players or its schedule.");
      else if (typeof k.userTeam !== "number" || k.userTeam < 0 || k.userTeam > 31) errors.push("The saved career doesn't say which team you coach.");
      else if (typeof k.coachName !== "string" || k.coachName.length > 40) errors.push("The saved career has an invalid coach name.");
      else content.career = k;
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, warnings, file: { schemaVersion: CURRENT_SCHEMA_VERSION, gameType: GRIDIRON_TYPE, metadata, appearance, content, settings: {} } };
}

export function blankGridironFile(): GridironFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType: GRIDIRON_TYPE,
    metadata: { title: "Zuno Gridiron GM", description: "The default 32-team league.", author: "Zuno", coverImage: null },
    appearance: { accentColor: "#22C55E", backgroundPreset: BACKGROUND_PRESETS[2] },
    content: { league: null, career: null },
    settings: {},
  };
}
