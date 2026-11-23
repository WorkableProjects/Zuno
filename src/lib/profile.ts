import { createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type Auth, type User } from "firebase/auth";
import { get, ref, runTransaction, set, update } from "firebase/database";
import { useSyncExternalStore } from "react";
import { loadAvatar, parseAvatar, saveAvatar, type AvatarSpec } from "../components/avatar/avatarData";
import { database, firebaseApp, lobbiesAvailable } from "../games/headbands/lobby";

/**
 * Zuno profiles: an email/password account holding a username and a picture.
 * Signed in, every join and lobby screen starts with them filled in, on any device.
 * Stored at /profiles/{uid} with usernames reserved at /usernames/{lowercase}.
 */

export interface Profile {
  uid: string;
  email: string;
  username: string;
  avatar: AvatarSpec;
}

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

async function hydrate(user: User | null) {
  if (!user) {
    current = null;
  } else {
    const snap = await get(ref(database(), `profiles/${user.uid}`)).catch(() => null);
    const v = (snap?.val() ?? {}) as Record<string, unknown>;
    let username = typeof v.username === "string" ? v.username : null;
    const avatar = parseAvatar(v.avatar) ?? loadAvatar();
    if (!username && !creating) {
      // First sign-in with Google: make the profile from the Google name.
      username = await claimFirstFree(user.uid, user.displayName || user.email?.split("@")[0] || "Player").catch(() => null);
      if (username) await set(ref(database(), `profiles/${user.uid}`), { username, avatar: JSON.stringify(avatar), createdAt: Date.now() }).catch(() => undefined);
    }
    current = { uid: user.uid, email: user.email ?? "", username: username ?? (user.email?.split("@")[0] ?? "Player").slice(0, 24), avatar };
    writeLocal(current);
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
  if (next.avatar) patch.avatar = JSON.stringify(next.avatar);
  if (Object.keys(patch).length === 0) return;
  await update(ref(database(), `profiles/${current.uid}`), patch);
  current = { ...current, username: (patch.username as string) ?? current.username, avatar: next.avatar ?? current.avatar };
  writeLocal(current);
  emit();
}

export async function logOut(): Promise<void> {
  await signOut(getAuthOnce());
}
