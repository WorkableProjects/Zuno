/**
 * Cosmetics: avatar decorations and name styles.
 *
 * Who may equip what is decided by the database rules (database.rules.json), not by
 * this file. The client mirrors those rules only to show the right buttons:
 *   - "free" items: anyone signed in.
 *   - "achievement" items: unlocked when profiles/{uid}/achievements/{id}/at exists (same id).
 *   - "grant" items: only when an admin wrote grants/{uid}/{decorations|nameStyles}/{id} = true.
 *   - "admin" items: only the verified admin account. Rules also keep them out of game rooms.
 * The id lists here must match the regexes in database.rules.json; tests/rules.test.ts checks that.
 */

export const ADMIN_EMAIL = "itzdutchs@gmail.com";

/** True for the one admin account. The rules make the same check server-side. */
export function isAdminEmail(email: string | null | undefined, verified: boolean): boolean {
  return verified && (email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}

export type CosmeticKind = "decoration" | "nameStyle";
export type Unlock = "free" | "achievement" | "grant" | "admin";

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  label: string;
  description: string;
  unlock: Unlock;
}

export const DECORATIONS: readonly Cosmetic[] = [
  { id: "ring", kind: "decoration", label: "Accent ring", description: "A clean ring in your theme's accent.", unlock: "free" },
  { id: "dashed", kind: "decoration", label: "Dotted halo", description: "A slowly turning dotted halo.", unlock: "free" },
  { id: "first-game", kind: "decoration", label: "Rookie glow", description: "A soft pulse. Play your first game.", unlock: "achievement" },
  { id: "regular", kind: "decoration", label: "Sunrise", description: "A warm gradient ring. Play 10 games.", unlock: "achievement" },
  { id: "explorer", kind: "decoration", label: "Prism", description: "A turning rainbow ring. Try every game.", unlock: "achievement" },
  { id: "neon", kind: "decoration", label: "Neon", description: "A flickering neon tube. Gift from the Zuno team.", unlock: "grant" },
  { id: "gold", kind: "decoration", label: "Gold frame", description: "A polished gold frame. Gift from the Zuno team.", unlock: "grant" },
  { id: "zuno", kind: "decoration", label: "Zuno", description: "The Zuno mark orbiting your picture. Zuno team only.", unlock: "admin" },
];

export const NAME_STYLES: readonly Cosmetic[] = [
  { id: "bold", kind: "nameStyle", label: "Bold", description: "Heavier type.", unlock: "free" },
  { id: "accent", kind: "nameStyle", label: "Accent", description: "Your theme's accent colour.", unlock: "free" },
  { id: "host", kind: "nameStyle", label: "Host", description: "A glowing name. Host an online room.", unlock: "achievement" },
  { id: "builder", kind: "nameStyle", label: "Blueprint", description: "Monospace blueprint type. Open the builder.", unlock: "achievement" },
  { id: "stylist", kind: "nameStyle", label: "Chameleon", description: "A shifting gradient. Try three themes.", unlock: "achievement" },
  { id: "sunset", kind: "nameStyle", label: "Sunset", description: "A sunset gradient. Gift from the Zuno team.", unlock: "grant" },
  { id: "chrome", kind: "nameStyle", label: "Chrome", description: "Polished chrome. Gift from the Zuno team.", unlock: "grant" },
  { id: "zuno", kind: "nameStyle", label: "Zuno Logo", description: "Your name in the Zuno wordmark style. Zuno team only.", unlock: "admin" },
];

export const ALL_COSMETICS: readonly Cosmetic[] = [...DECORATIONS, ...NAME_STYLES];

export const findCosmetic = (kind: CosmeticKind, id: string | null | undefined): Cosmetic | undefined =>
  id ? (kind === "decoration" ? DECORATIONS : NAME_STYLES).find((c) => c.id === id) : undefined;

/** Ids are short slugs; anything else from the network is ignored. */
export const COSMETIC_ID_RE = /^[a-z0-9-]{1,24}$/;
export const cleanCosmeticId = (v: unknown): string | null => (typeof v === "string" && COSMETIC_ID_RE.test(v) ? v : null);

export interface Inventory {
  /** Ids from grants/{uid}, written only by the admin. */
  grantedDecorations: string[];
  grantedNameStyles: string[];
  /** Achievement ids with an unlock time. */
  achievements: string[];
  admin: boolean;
}

const granted = (c: Cosmetic, inv: Inventory) => (c.kind === "decoration" ? inv.grantedDecorations : inv.grantedNameStyles).includes(c.id);

/** Whether this inventory may equip the item (mirrors the rules). */
export function canEquip(c: Cosmetic, inv: Inventory): boolean {
  switch (c.unlock) {
    case "free":
      return true;
    case "achievement":
      return inv.achievements.includes(c.id) || granted(c, inv);
    case "grant":
      return granted(c, inv);
    case "admin":
      return inv.admin;
  }
}

/** Ids per unlock class, for the rules regexes and their test. */
export const idsFor = (kind: CosmeticKind, unlock: Unlock) => (kind === "decoration" ? DECORATIONS : NAME_STYLES).filter((c) => c.unlock === unlock).map((c) => c.id);
