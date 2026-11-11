/** Shared shape of every Zuno game file, whatever the game type. */

export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;
export const CURRENT_SCHEMA_VERSION = 1;

export const BACKGROUND_PRESETS = ["aurora", "horizon", "tide", "spotlight"] as const;
export type BackgroundPreset = (typeof BACKGROUND_PRESETS)[number];

/** Size limits. Change them here; messages read from these values. */
export const LIMITS = {
  maxFileBytes: 6 * 1024 * 1024,
  maxImageBytes: 3 * 1024 * 1024,
  maxTitleLength: 120,
  maxTextLength: 2000,
};

export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export interface GameMetadata {
  title: string;
  description: string;
  author: string;
  coverImage: string | null;
}

export interface GameAppearance {
  accentColor: string;
  backgroundPreset: BackgroundPreset;
}

export interface GameFile<Content = unknown, Settings = unknown> {
  schemaVersion: number;
  gameType: string;
  metadata: GameMetadata;
  appearance: GameAppearance;
  content: Content;
  settings: Settings;
}

export interface ValidationOk<F extends GameFile = GameFile> {
  ok: true;
  file: F;
  /** Things Zuno fixed safely, such as duplicate IDs. Never required data. */
  warnings: string[];
}

export interface ValidationFail {
  ok: false;
  errors: string[];
}

export type ValidationResult<F extends GameFile = GameFile> = ValidationOk<F> | ValidationFail;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bytes held by a base64 data URL payload. */
export function dataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  const payload = comma === -1 ? "" : url.slice(comma + 1);
  return Math.floor((payload.length * 3) / 4);
}

/**
 * An image may be an https URL or an embedded raster image. The label names
 * it in messages, such as "The cover image".
 * Returns an error message, or null when the value is usable.
 */
export function checkImage(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return `${label} must be an image link or left empty.`;
  if (value.startsWith("data:")) {
    const match = /^data:([a-z0-9.+/-]+);base64,/i.exec(value);
    const mime = match?.[1]?.toLowerCase();
    if (!mime || !(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) {
      return `${label} uses an unsupported format. Use PNG, JPEG, WebP or GIF.`;
    }
    if (dataUrlBytes(value) > LIMITS.maxImageBytes) {
      const embedded = label.startsWith("The ") ? `The embedded ${label.slice(4)}` : label;
      return `${embedded} is too large. The limit is ${formatBytes(LIMITS.maxImageBytes)}.`;
    }
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${label} link is not a valid address.`;
  }
  if (url.protocol !== "https:") {
    return `${label} link must start with https://. Other link types are not allowed.`;
  }
  return null;
}

/** A cover image may be an https URL or an embedded raster image. */
export function checkCoverImage(value: unknown): string | null {
  return checkImage(value, "The cover image");
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
