import { get, ref, set, update } from "firebase/database";
import { database } from "../games/headbands/lobby";
import { parseAvatar, type AvatarSpec } from "../components/avatar/avatarData";
import { cleanCosmeticId, findCosmetic, type CosmeticKind } from "./cosmetics";

/**
 * Admin operations. These are plain database calls: what makes them admin-only is
 * database.rules.json, which Firebase enforces on its servers. A non-admin calling
 * any of these gets PERMISSION_DENIED (the Realtime Database's 403), whatever the UI shows.
 */

export interface AdminUser {
  uid: string;
  username: string;
  email: string;
  avatar: AvatarSpec | null;
  createdAt: number | null;
  decoration: string | null;
  nameStyle: string | null;
  grantedDecorations: string[];
  grantedNameStyles: string[];
}

const trueKeys = (v: unknown) => (v && typeof v === "object" ? Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] === true) : []);

export class ForbiddenError extends Error {
  constructor() {
    super("403 Forbidden: this account is not the Zuno admin.");
  }
}
const guard = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (e) {
    if (/permission/i.test(String((e as { code?: string; message?: string })?.code ?? (e as Error)?.message ?? ""))) throw new ForbiddenError();
    throw e;
  }
};

/** Every registered profile with its grants. Readable only by the admin. */
export async function listUsers(): Promise<AdminUser[]> {
  return guard(async () => {
    const db = database();
    const [profiles, grants] = await Promise.all([get(ref(db, "profiles")), get(ref(db, "grants"))]);
    const p = (profiles.val() ?? {}) as Record<string, Record<string, unknown>>;
    const g = (grants.val() ?? {}) as Record<string, Record<string, unknown>>;
    return Object.entries(p)
      .map(([uid, v]) => ({
        uid,
        username: typeof v.username === "string" ? v.username : "(no name)",
        email: typeof v.email === "string" ? v.email : "",
        avatar: parseAvatar(v.avatar),
        createdAt: typeof v.createdAt === "number" ? v.createdAt : null,
        decoration: cleanCosmeticId(v.equippedDecoration),
        nameStyle: cleanCosmeticId(v.equippedNameStyle),
        grantedDecorations: trueKeys(g[uid]?.decorations),
        grantedNameStyles: trueKeys(g[uid]?.nameStyles),
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  });
}

const folder = (kind: CosmeticKind) => (kind === "decoration" ? "decorations" : "nameStyles");
const field = (kind: CosmeticKind) => (kind === "decoration" ? "equippedDecoration" : "equippedNameStyle");

export async function grant(uid: string, kind: CosmeticKind, id: string): Promise<void> {
  if (!findCosmetic(kind, id)) throw new Error("Unknown item.");
  await guard(() => set(ref(database(), `grants/${uid}/${folder(kind)}/${id}`), true));
}

/** Revokes an item; with `unequip`, also takes it off the player right away if they're wearing it. */
export async function revoke(uid: string, kind: CosmeticKind, id: string, unequip: boolean): Promise<void> {
  await guard(async () => {
    const db = database();
    const patch: Record<string, unknown> = { [`grants/${uid}/${folder(kind)}/${id}`]: null };
    if (unequip) {
      const worn = await get(ref(db, `profiles/${uid}/${field(kind)}`));
      if (worn.val() === id) patch[`profiles/${uid}/${field(kind)}`] = null;
    }
    await update(ref(db), patch);
  });
}

/** Takes any equipped item off a player. */
export async function forceUnequip(uid: string, kind: CosmeticKind): Promise<void> {
  await guard(() => set(ref(database(), `profiles/${uid}/${field(kind)}`), null));
}
