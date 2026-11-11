import { BACKGROUND_PRESETS, CURRENT_SCHEMA_VERSION, LIMITS, checkImage, isRecord, type GameFile, type ValidationResult } from "./common";
import { checkPlainText, parseCommon, textOrNull } from "./shared";

export const HEADBANDS_TYPE = "headbands";

export const HEADBANDS_LIMITS = {
  minPlayers: 2,
  maxPlayers: 8,
  maxIdentities: 300,
  /** Identity text and subtext are short labels, not paragraphs. */
  maxLabelLength: 120,
};

export const HEADBANDS_MODES = ["text", "image"] as const;
export type HeadbandsMode = (typeof HEADBANDS_MODES)[number];

export interface HeadbandsIdentity {
  id: string;
  /** Identity used in Text Mode. */
  text: string;
  /** https image URL or embedded raster data URL. Required for Image Mode. */
  image: string | null;
  /** Answer label shown under the image. Required for Image Mode. */
  subtext: string | null;
  /** May be assigned to more than one player when the session allows duplicates. */
  allowDuplicate?: boolean;
}

export interface HeadbandsContent {
  identities: HeadbandsIdentity[];
}

export interface HeadbandsSettings {
  defaultMode: HeadbandsMode;
  continueAfterYes: boolean;
  unlimitedGuesses: boolean;
  allowDuplicateAssignments: boolean;
  maxPlayers: number;
}

export type HeadbandsFile = GameFile<HeadbandsContent, HeadbandsSettings>;

export const DEFAULT_HEADBANDS_SETTINGS: HeadbandsSettings = {
  defaultMode: "text",
  continueAfterYes: false,
  unlimitedGuesses: false,
  allowDuplicateAssignments: false,
  maxPlayers: HEADBANDS_LIMITS.maxPlayers,
};

/** Whether an identity can be dealt in a mode. */
export function isEligible(identity: HeadbandsIdentity, mode: HeadbandsMode): boolean {
  if (mode === "text") return identity.text.trim() !== "";
  return !!identity.image && !!identity.subtext && identity.subtext.trim() !== "";
}

export function eligibleIdentities(file: HeadbandsFile, mode: HeadbandsMode): HeadbandsIdentity[] {
  return file.content.identities.filter((i) => isEligible(i, mode));
}

/** The label a player has to guess: the text in Text Mode, the subtext in Image Mode. */
export function answerFor(identity: HeadbandsIdentity, mode: HeadbandsMode): string {
  return mode === "image" ? (identity.subtext ?? "") : identity.text;
}

/** Why each identity left out of a mode was left out, for the host. */
export function exclusionReasons(file: HeadbandsFile, mode: HeadbandsMode): string[] {
  if (mode === "text") return [];
  const out: string[] = [];
  for (const i of file.content.identities) {
    if (isEligible(i, "image")) continue;
    if (!i.image && !i.subtext) continue; // A text-only identity; counted, not listed.
    if (!i.image) out.push(`"${i.subtext}" has answer text but no image.`);
    else out.push(`"${i.text}" has an image but no answer text under it.`);
  }
  return out;
}

export function textOnlyCount(file: HeadbandsFile): number {
  return file.content.identities.filter((i) => !i.image && !i.subtext).length;
}

/**
 * Validates the Headbands parts of a parsed game file and returns a clean
 * copy. Every string stays plain text; images are only https links or
 * embedded raster data.
 */
export function validateHeadbands(raw: Record<string, unknown>): ValidationResult<HeadbandsFile> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { metadata, appearance } = parseCommon(raw, HEADBANDS_TYPE, errors, warnings);

  const label = (value: unknown, where: string, required: boolean): string | null => {
    if (value === undefined || value === null) {
      if (required) errors.push(`${where} is missing.`);
      return null;
    }
    const t = textOrNull(value);
    if (t === null) {
      errors.push(`${where} must be text.`);
      return null;
    }
    if (t.trim() === "") {
      errors.push(required ? `${where} is missing.` : `${where} is empty. Leave it out or set it to null.`);
      return null;
    }
    const clean = t.trim();
    if (clean.length > HEADBANDS_LIMITS.maxLabelLength) errors.push(`${where} is longer than ${HEADBANDS_LIMITS.maxLabelLength} characters.`);
    checkPlainText(clean, where, errors);
    return clean;
  };

  const identities: HeadbandsIdentity[] = [];
  if (!isRecord(raw.content)) {
    errors.push("The file is missing its content section.");
  } else if (!Array.isArray(raw.content.identities)) {
    errors.push("The file is missing its list of identities.");
  } else if (raw.content.identities.length === 0) {
    errors.push("The game needs identities to guess. The list is empty.");
  } else {
    const list = raw.content.identities;
    if (list.length > HEADBANDS_LIMITS.maxIdentities) errors.push(`The game has ${list.length} identities. The limit is ${HEADBANDS_LIMITS.maxIdentities}.`);
    const used = new Set<string>();
    let renamed = 0;
    list.forEach((rawId, n) => {
      const name = `Identity ${n + 1}`;
      if (!isRecord(rawId)) {
        errors.push(`${name} is not a valid identity object.`);
        return;
      }
      let id = typeof rawId.id === "string" ? rawId.id.trim() : "";
      if (id === "") {
        errors.push(`${name} is missing its id.`);
        return;
      }
      if (used.has(id)) {
        renamed++;
        let k = 2;
        while (used.has(`${id}-${k}`)) k++;
        id = `${id}-${k}`;
      }
      used.add(id);
      const text = label(rawId.text, `${name}'s text`, true);
      const subtext = label(rawId.subtext, `${name}'s subtext`, false);
      let image: string | null = null;
      if (rawId.image !== undefined && rawId.image !== null) {
        if (rawId.image === "") errors.push(`${name}'s image is empty. Leave it out or set it to null.`);
        else {
          const imageError = checkImage(rawId.image, `${name}'s image`);
          if (imageError) errors.push(imageError);
          else image = rawId.image as string;
        }
      }
      const identity: HeadbandsIdentity = { id, text: text ?? "", image, subtext };
      if (rawId.allowDuplicate !== undefined && rawId.allowDuplicate !== null) {
        if (typeof rawId.allowDuplicate !== "boolean") errors.push(`${name}'s allowDuplicate setting must be true or false.`);
        else if (rawId.allowDuplicate) identity.allowDuplicate = true;
      }
      identities.push(identity);
    });
    if (renamed > 0) warnings.push(`${renamed} duplicate ${renamed === 1 ? "ID was" : "IDs were"} renamed so every identity is unique.`);
  }

  const settings: HeadbandsSettings = { ...DEFAULT_HEADBANDS_SETTINGS };
  if (raw.settings !== undefined && raw.settings !== null) {
    if (!isRecord(raw.settings)) {
      errors.push("The settings section must be an object.");
    } else {
      const s = raw.settings;
      if (s.defaultMode !== undefined && s.defaultMode !== null) {
        if ((HEADBANDS_MODES as readonly unknown[]).includes(s.defaultMode)) settings.defaultMode = s.defaultMode as HeadbandsMode;
        else errors.push(`The defaultMode setting must be "text" or "image".`);
      }
      for (const key of ["continueAfterYes", "unlimitedGuesses", "allowDuplicateAssignments"] as const) {
        const v = s[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== "boolean") errors.push(`The ${key} setting must be true or false.`);
        else settings[key] = v;
      }
      if (s.maxPlayers !== undefined && s.maxPlayers !== null) {
        const v = s.maxPlayers;
        if (typeof v !== "number" || !Number.isInteger(v) || v < HEADBANDS_LIMITS.minPlayers || v > HEADBANDS_LIMITS.maxPlayers) {
          errors.push(`The maxPlayers setting must be a whole number from ${HEADBANDS_LIMITS.minPlayers} to ${HEADBANDS_LIMITS.maxPlayers}.`);
        } else settings.maxPlayers = v;
      }
    }
  }

  if (errors.length === 0) {
    const textCount = identities.filter((i) => isEligible(i, "text")).length;
    const imageCount = identities.filter((i) => isEligible(i, "image")).length;
    if (textCount < 2) errors.push("The game needs at least two identities to play.");
    if (settings.defaultMode === "image" && imageCount < 2) {
      errors.push(`The default mode is Images, but only ${imageCount} ${imageCount === 1 ? "identity has" : "identities have"} both an image and answer text. Image Mode needs at least two.`);
    }
    const partial = identities.filter((i) => (i.image || i.subtext) && !isEligible(i, "image")).length;
    if (partial > 0) {
      warnings.push(`${partial} ${partial === 1 ? "identity has" : "identities have"} only half of an image card (an image without answer text, or the other way around). ${partial === 1 ? "It" : "They"} can only be used in Text Mode.`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    file: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      gameType: HEADBANDS_TYPE,
      metadata,
      appearance,
      content: { identities },
      settings,
    },
  };
}

/** Choices from the AI Builder screen that shape the copied guide. */
export interface HeadbandsGuideOptions {
  deckSize: number;
  imageLinks: string[];
}

export const DEFAULT_HEADBANDS_GUIDE: HeadbandsGuideOptions = { deckSize: 24, imageLinks: [] };

/** The prompt copied by the Headbands AI Builder. Versioned with the schema: change both together. */
export function buildHeadbandsGuide(options: HeadbandsGuideOptions = DEFAULT_HEADBANDS_GUIDE): string {
  const links = options.imageLinks.filter((l) => /^https:\/\/\S+$/i.test(l.trim())).map((l) => l.trim());
  const imageLines =
    links.length > 0
      ? [
          `- Images: I am giving you ${links.length} https image ${links.length === 1 ? "link" : "links"}. Make one identity for each link: set "image" to the link exactly as written, and set both "text" and "subtext" to the short name of what the picture shows. Do not invent other links.`,
          ...links.map((l) => `  - ${l}`),
          `- Every other identity is text only: set "image" and "subtext" to null.`,
          `- If at least two identities have images, you may set settings.defaultMode to "image"; otherwise use "text".`,
        ]
      : [`- Images: set "image" and "subtext" to null on every identity. Do not invent image links.`, `- Set settings.defaultMode to "text".`];

  return `You are creating a game file for Zuno, a browser-based game platform.

Create a Headbands deck as valid Zuno JSON (schema version ${CURRENT_SCHEMA_VERSION}). In Headbands, each player is given a secret identity they cannot see, and asks the group yes-or-no questions until they guess it.

Requirements:
- Output JSON only. Do not use Markdown code fences or add an explanation before or after the JSON.
- Use schemaVersion: ${CURRENT_SCHEMA_VERSION} and gameType: "${HEADBANDS_TYPE}".
- Include metadata with title, description, author, and coverImage. Set coverImage to null.
- Include appearance with accentColor (a six-digit hex color such as "#FFB454") and backgroundPreset (one of: ${BACKGROUND_PRESETS.map((p) => `"${p}"`).join(", ")}).
- Include content.identities as an array of ${options.deckSize} identity objects.
- Every identity must have a unique id (lowercase words joined by hyphens, such as "identity-eiffel-tower"), a text label, an image, and a subtext.
- text is the identity itself: a short, well-known word or name that players could guess by asking yes-or-no questions, such as "Pizza", "Eiffel Tower" or "Golden Retriever". Keep it under ${HEADBANDS_LIMITS.maxLabelLength} characters.
- Pick identities that most of the group will recognize, with a mix of easy and harder ones. Do not repeat an identity.
- subtext is the answer label shown under an image. It is only used with an image. When image is null, subtext must also be null.
${imageLines.join("\n")}
- allowDuplicate is optional; leave it out.
- Include settings with defaultMode, continueAfterYes (false), unlimitedGuesses (false), allowDuplicateAssignments (false), and maxPlayers (a whole number from ${HEADBANDS_LIMITS.minPlayers} to ${HEADBANDS_LIMITS.maxPlayers}, default ${HEADBANDS_LIMITS.maxPlayers}).
- Ensure all IDs are unique and all JSON strings are correctly escaped.
- Do not include HTML, JavaScript, functions, or other executable content.
- Keep every text field under ${LIMITS.maxTextLength} characters.

Use this structure:
{
  "schemaVersion": ${CURRENT_SCHEMA_VERSION},
  "gameType": "${HEADBANDS_TYPE}",
  "metadata": {
    "title": "Deck Title",
    "description": "Deck description",
    "author": "Author",
    "coverImage": null
  },
  "appearance": {
    "accentColor": "#FFB454",
    "backgroundPreset": "horizon"
  },
  "content": {
    "identities": [
      { "id": "identity-pizza", "text": "Pizza", "image": null, "subtext": null },
      { "id": "identity-iphone", "text": "iPhone", "image": "https://example.com/iphone.jpg", "subtext": "iPhone" }
    ]
  },
  "settings": {
    "defaultMode": "text",
    "continueAfterYes": false,
    "unlimitedGuesses": false,
    "allowDuplicateAssignments": false,
    "maxPlayers": ${HEADBANDS_LIMITS.maxPlayers}
  }
}

The second identity above only shows the image format. Use image links only if I gave you some.

After generating the JSON, do not wrap it in Markdown. Make sure the result is valid and complete so it can be saved as a .zuno.json file and imported into Zuno.

My deck:
- Theme: [for example, animals, famous landmarks, movie characters]
- Audience: [for example, a 6th grade class, family game night]
- Anything else: [optional requests]`;
}
