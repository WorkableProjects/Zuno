import { cleanCosmeticId } from "../../lib/cosmetics";

/**
 * A player's picture: an uploaded photo, an emoji, or their initial, on a colour.
 * `deco` and `style` are the equipped avatar decoration and name style. They ride along
 * with the avatar into every room, so cosmetics show everywhere a player appears.
 */
export interface AvatarSpec {
  color: string;
  emoji: string | null;
  photo: string | null;
  deco?: string | null;
  style?: string | null;
}

export const AVATAR_COLORS = [
  "#E85D75",
  "#FFB454",
  "#F2D45C",
  "#5CC98A",
  "#4FB3D9",
  "#6C8CFF",
  "#A877F0",
  "#8A94A6",
];
export const AVATAR_EMOJIS = [
  "😀",
  "😎",
  "🤠",
  "🥳",
  "🤖",
  "👽",
  "👻",
  "🐱",
  "🐶",
  "🦊",
  "🐼",
  "🐸",
  "🦄",
  "🐙",
  "🌵",
  "🍕",
  "⚽",
  "🎸",
  "🚀",
  "⭐",
];
/** About 20 KB of base64: a 96 px photo fits comfortably. */
export const MAX_PHOTO_LENGTH = 20000;

const KEY = "zuno.avatar";

export function defaultAvatar(): AvatarSpec {
  return {
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    emoji: null,
    photo: null,
  };
}

/** Accepts only well-formed avatars, so a bad value from the network can never break a page. */
export function parseAvatar(raw: unknown): AvatarSpec | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const color =
    typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color)
      ? r.color
      : null;
  if (!color) return null;
  const emoji =
    typeof r.emoji === "string" && r.emoji.length > 0 && r.emoji.length <= 16
      ? r.emoji
      : null;
  const photo =
    typeof r.photo === "string" &&
    r.photo.length <= MAX_PHOTO_LENGTH &&
    /^data:image\/(jpeg|webp|png);base64,/.test(r.photo)
      ? r.photo
      : null;
  const deco = cleanCosmeticId(r.deco);
  const style = cleanCosmeticId(r.style);
  return { color, emoji, photo, ...(deco ? { deco } : {}), ...(style ? { style } : {}) };
}

export function loadAvatar(): AvatarSpec {
  try {
    return parseAvatar(localStorage.getItem(KEY)) ?? defaultAvatar();
  } catch {
    return defaultAvatar();
  }
}

export function saveAvatar(a: AvatarSpec): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* optional */
  }
}

/** Crops a picture to a centred square and shrinks it to 96 px. */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file is not a picture."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read the picture.");
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      96,
      96,
    );
    for (const q of [0.8, 0.6, 0.4]) {
      const out = canvas.toDataURL("image/jpeg", q);
      if (out.length <= MAX_PHOTO_LENGTH) return out;
    }
    throw new Error("That picture is too detailed. Try another.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
