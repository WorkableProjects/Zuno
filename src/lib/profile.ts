import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type Auth, type User } from "firebase/auth";
import { get, onValue, ref, runTransaction, set, update, type Unsubscribe } from "firebase/database";
import { useSyncExternalStore } from "react";
import { loadAvatar, parseAvatar, saveAvatar, type AvatarSpec } from "../components/avatar/avatarData";
import { database, firebaseApp, lobbiesAvailable } from "../games/headbands/lobby";
import { adoptProgress, cleanProgress, getProgress, setProgressSink, track, unlockedIds, type ProgressMap } from "./achievements";
import { cleanCosmeticId, findCosmetic, isAdminEmail, type CosmeticKind, type Inventory } from "./cosmetics";
import type { RailPosition } from "../app/storage";

/**
 * Zuno profiles: an email/password account holding a username and a picture.
 * Signed in, every join and lobby screen starts with them filled in, on any device.
 * Stored at /profiles/{uid} with usernames reserved at /usernames/{lowercase}.
 */

export interface Profile {
  uid: string;
  email: string;
  emailVerified: boolean;
  username: string;
  avatar: AvatarSpec;
  /** Join date (ms), when known. */
  createdAt: number | null;
  decoration: string | null;
  nameStyle: string | null;
  /** Sidebar placement saved with the account. */
  sidebar: RailPosition | null;
  /** The verified admin account. The database rules make the real check. */
  admin: boolean;
  inventory: Inventory;
}

/** What anyone signed in may see of another player (profiles/{uid}, public children only). */
export interface PublicProfile {
  uid: string;
  username: string;
  avatar: AvatarSpec | null;
  createdAt: number | null;
  decoration: string | null;
  nameStyle: string | null;
  achievements: ProgressMap;
}

const RAILS: readonly RailPosition[] = ["left", "top", "right", "bottom"];
const cleanRail = (v: unknown): RailPosition | null => (RAILS as readonly unknown[]).includes(v) ? (v as RailPosition) : null;
const keys = (v: unknown) => (v && typeof v === "object" ? Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] === true && cleanCosmeticId(k)) : []);

/** The key every join and lobby screen reads the player's name from. */
const NAME_KEY = "zuno.hb.name";

export const profilesAvailable = lobbiesAvailable;

let auth: Auth | null = null;
let current: Profile | null = null;
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function getAuthOnce(): Auth {
  if (!auth) {
    auth = getAuth(firebaseApp());
    // Local development against the Auth emulator, e.g. VITE_FIREBASE_AUTH_EMULATOR=http://127.0.0.1:9099
    const emulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR as string | undefined;
    if (emulator) connectAuthEmulator(auth, emulator, { disableWarnings: true });
    onAuthStateChanged(auth, (user) => void hydrate(user));
  }
  return auth;
}

function writeLocal(p: Profile) {
  try {
    localStorage.setItem(NAME_KEY, p.username);
  } catch {
    /* optional */
  }
  saveAvatar(p.avatar);
}

/** Live listeners for the signed-in account (its profile node and its grants). */
let live: Unsubscribe[] = [];
const stopLive = () => {
  live.forEach((u) => u());
  live = [];
};

/** Builds the Profile from the stored node, the auth user and the grants. */
function build(user: User, v: Record<string, unknown>, grants: Record<string, unknown>): Profile {
  const admin = isAdminEmail(user.email, user.emailVerified);
  const progress = cleanProgress(v.achievements);
  const avatarBase = parseAvatar(v.avatar) ?? loadAvatar();
  const decoration = cleanCosmeticId(v.equippedDecoration);
  const nameStyle = cleanCosmeticId(v.equippedNameStyle);
  return {
    uid: user.uid,
    email: user.email ?? "",
    emailVerified: user.emailVerified,
    username: typeof v.username === "string" ? v.username : (user.email?.split("@")[0] ?? "Player").slice(0, 24),
    avatar: { ...avatarBase, deco: decoration, style: nameStyle },
    createdAt: typeof v.createdAt === "number" ? v.createdAt : user.metadata.creationTime ? Date.parse(user.metadata.creationTime) : null,
    decoration,
    nameStyle,
    sidebar: cleanRail(v.sidebar),
    admin,
    inventory: {
      grantedDecorations: keys((grants as Record<string, unknown>).decorations),
      grantedNameStyles: keys((grants as Record<string, unknown>).nameStyles),
      achievements: unlockedIds(mergeForInventory(progress)),
      admin,
    },
  };
}
const mergeForInventory = (remote: ProgressMap): ProgressMap => ({ ...remote, ...Object.fromEntries(Object.entries(getProgress()).filter(([, p]) => p.at)) });

async function hydrate(user: User | null) {
  stopLive();
  if (!user) {
    // Signed out: cosmetics belong to the account, so the local avatar used in rooms drops them.
    if (current) {
      const { color, emoji, photo } = current.avatar;
      saveAvatar({ color, emoji, photo });
    }
    current = null;
    setProgressSink(null);
  } else {
    const db = database();
    const snap = await get(ref(db, `profiles/${user.uid}`)).catch(() => null);
    const v = (snap?.val() ?? {}) as Record<string, unknown>;
    let username = typeof v.username === "string" ? v.username : null;
    const avatar = parseAvatar(v.avatar) ?? loadAvatar();
    if (!username && !creating) {
      // First sign-in with Google: make the profile from the Google name.
      username = await claimFirstFree(user.uid, user.displayName || user.email?.split("@")[0] || "Player").catch(() => null);
      if (username) {
        await set(ref(db, `profiles/${user.uid}`), { username, avatar: JSON.stringify(avatar), createdAt: Date.now() }).catch(() => undefined);
        track({ type: "profileCreated" });
      }
    }
    // Keep the email on the profile so the admin panel can find accounts (the rules only accept the token's own email).
    if (user.email && v.email !== user.email.toLowerCase()) void update(ref(db, `profiles/${user.uid}`), { email: user.email.toLowerCase() }).catch(() => undefined);
    // The admin account always owns the exclusive Zuno items. Only the admin may write grants, so this fails harmlessly for anyone else.
    if (isAdminEmail(user.email, user.emailVerified)) {
      void update(ref(db, `grants/${user.uid}`), { "decorations/zuno": true, "nameStyles/zuno": true }).catch(() => undefined);
    }
    // Progress earned while signed out joins the account's.
    adoptProgress(cleanProgress(v.achievements));
    setProgressSink((m) => {
      if (current?.uid === user.uid) void set(ref(db, `profiles/${user.uid}/achievements`), cleanProgress(m)).catch(() => undefined);
    });
    void set(ref(db, `profiles/${user.uid}/achievements`), cleanProgress(getProgress())).catch(() => undefined);

    let node: Record<string, unknown> = { ...v, username: username ?? v.username };
    let grants: Record<string, unknown> = {};
    const refresh = () => {
      current = build(user, node, grants);
      writeLocal(current);
      emit();
    };
    refresh();
    // Live: an admin grant, revoke or forced unequip shows up at once.
    live.push(
      onValue(ref(db, `profiles/${user.uid}`), (s) => {
        node = (s.val() ?? {}) as Record<string, unknown>;
        refresh();
      }, () => undefined),
      onValue(ref(db, `grants/${user.uid}`), (s) => {
        grants = (s.val() ?? {}) as Record<string, unknown>;
        refresh();
      }, () => undefined),
    );
  }
  ready = true;
  emit();
}

function subscribe(fn: () => void) {
  if (profilesAvailable()) getAuthOnce();
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The signed-in profile, null when signed out, undefined while loading. */
export function useProfile(): Profile | null | undefined {
  return useSyncExternalStore(subscribe, () => (ready || !profilesAvailable() ? current : undefined), () => null);
}

export const USERNAME_RE = /^[A-Za-z0-9_ .-]{2,24}$/;

function friendly(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/email-already-in-use": "That email already has a Zuno profile. Sign in instead.",
    "auth/invalid-email": "That email doesn't look right.",
    "auth/weak-password": "Use a password of at least 6 characters.",
    "auth/invalid-credential": "Email or password is wrong.",
    "auth/wrong-password": "Email or password is wrong.",
    "auth/user-not-found": "No profile with that email.",
    "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
    "auth/network-request-failed": "No connection. Check your internet.",
    "auth/operation-not-allowed": "Email sign-in isn't turned on for this site yet.",
  };
  return new Error(map[code] ?? (e instanceof Error ? e.message : "Something went wrong."));
}

async function claimUsername(uid: string, username: string, previous?: string) {
  const key = username.trim().toLowerCase();
  const res = await runTransaction(ref(database(), `usernames/${key}`), (owner) => (owner === null || owner === uid ? uid : undefined));
  if (!res.committed) throw new Error("That username is taken.");
  const prev = previous?.trim().toLowerCase();
  if (prev && prev !== key) await set(ref(database(), `usernames/${prev}`), null).catch(() => undefined);
}

/** Tries the name, then name2, name3… until one is free. */
async function claimFirstFree(uid: string, raw: string): Promise<string> {
  let base = raw.replace(/[^A-Za-z0-9_ .-]/g, "").trim().slice(0, 20);
  if (base.length < 2) base = "Player";
  for (let i = 1; i < 50; i++) {
    const name = i === 1 ? base : `${base}${i}`;
    try {
      await claimUsername(uid, name);
      return name;
    } catch {
      /* taken, try the next */
    }
  }
  throw new Error("No free username.");
}

/** True while signUp is writing its own profile, so hydrate doesn't make one too. */
let creating = false;

export async function signInWithGoogle(): Promise<void> {
  try {
    const cred = await signInWithPopup(getAuthOnce(), new GoogleAuthProvider());
    await hydrate(cred.user);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    if (code === "auth/popup-blocked") throw new Error("Your browser blocked the Google window. Allow pop-ups and try again.");
    throw friendly(e);
  }
}

export async function signUp(email: string, password: string, username: string, avatar: AvatarSpec): Promise<void> {
  const name = username.trim();
  if (!USERNAME_RE.test(name)) throw new Error("Usernames are 2–24 letters, numbers, spaces, dots, dashes or underscores.");
  let cred;
  creating = true;
  try {
    cred = await createUserWithEmailAndPassword(getAuthOnce(), email.trim(), password);
  } catch (e) {
    creating = false;
    throw friendly(e);
  }
  try {
    await claimUsername(cred.user.uid, name);
  } catch (e) {
    creating = false;
    await cred.user.delete().catch(() => undefined);
    throw e;
  }
  await set(ref(database(), `profiles/${cred.user.uid}`), { username: name, avatar: JSON.stringify(avatar), createdAt: Date.now() }).finally(() => (creating = false));
  await hydrate(cred.user);
}

export async function signIn(email: string, password: string): Promise<void> {
  try {
    const cred = await signInWithEmailAndPassword(getAuthOnce(), email.trim(), password);
    await hydrate(cred.user);
  } catch (e) {
    throw friendly(e);
  }
}

export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getAuthOnce(), email.trim());
  } catch (e) {
    throw friendly(e);
  }
}

export async function updateProfile(next: { username?: string; avatar?: AvatarSpec }): Promise<void> {
  if (!current) throw new Error("Sign in first.");
  const patch: Record<string, unknown> = {};
  if (next.username !== undefined && next.username.trim() !== current.username) {
    const name = next.username.trim();
    if (!USERNAME_RE.test(name)) throw new Error("Usernames are 2–24 letters, numbers, spaces, dots, dashes or underscores.");
    await claimUsername(current.uid, name, current.username);
    patch.username = name;
  }
  if (next.avatar) patch.avatar = JSON.stringify({ color: next.avatar.color, emoji: next.avatar.emoji, photo: next.avatar.photo });
  if (Object.keys(patch).length === 0) return;
  await update(ref(database(), `profiles/${current.uid}`), patch);
  current = { ...current, username: (patch.username as string) ?? current.username, avatar: next.avatar ? { ...next.avatar, deco: current.decoration, style: current.nameStyle } : current.avatar };
  writeLocal(current);
  emit();
}

export async function logOut(): Promise<void> {
  stopLive();
  await signOut(getAuthOnce());
}

/** Equips (or with null, removes) a cosmetic. The database rules refuse items this account doesn't own. */
export async function equip(kind: CosmeticKind, id: string | null): Promise<void> {
  if (!current) throw new Error("Sign in first.");
  if (id !== null && !findCosmetic(kind, id)) throw new Error("Unknown item.");
  const field = kind === "decoration" ? "equippedDecoration" : "equippedNameStyle";
  try {
    await set(ref(database(), `profiles/${current.uid}/${field}`), id);
  } catch {
    throw new Error("You haven't unlocked that yet.");
  }
}

/** Saves the sidebar placement with the account (localStorage keeps it for instant start-up). */
export function saveSidebarRemote(pos: RailPosition): void {
  if (!current || current.sidebar === pos) return;
  void set(ref(database(), `profiles/${current.uid}/sidebar`), pos).catch(() => undefined);
}

/** Another player's public profile. Each public child is read on its own; email and settings stay private. */
export async function fetchPublicProfile(uid: string): Promise<PublicProfile | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null;
  getAuthOnce();
  const db = database();
  const read = (k: string) => get(ref(db, `profiles/${uid}/${k}`)).then((s) => s.val() as unknown).catch(() => null);
  const [username, avatar, createdAt, deco, style, achievements] = await Promise.all(["username", "avatar", "createdAt", "equippedDecoration", "equippedNameStyle", "achievements"].map(read));
  if (typeof username !== "string") return null;
  return {
    uid,
    username,
    avatar: parseAvatar(avatar),
    createdAt: typeof createdAt === "number" ? createdAt : null,
    decoration: cleanCosmeticId(deco),
    nameStyle: cleanCosmeticId(style),
    achievements: cleanProgress(achievements),
  };
}
