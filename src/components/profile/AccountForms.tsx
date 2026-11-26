import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { loadAvatar, type AvatarSpec } from "../avatar/avatarData";
import { AvatarPicker } from "../avatar/AvatarView";
import { resetPassword, signIn, signInWithGoogle, signUp, updateProfile, useProfile } from "../../lib/profile";

type Mode = "signin" | "signup";

/** Sign in, or make a new profile. */
export function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem("zuno.hb.name") ?? "";
    } catch {
      return "";
    }
  });
  const [avatar, setAvatar] = useState<AvatarSpec>(loadAvatar);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      if (mode === "signup") await signUp(email, password, username, avatar);
      else await signIn(email, password);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setProblem(null);
    if (!email.trim()) return setProblem("Type your email first.");
    try {
      await resetPassword(email);
      setNote("Check your inbox for a reset link.");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't send the email.");
    }
  };

  return (
    <form className="st-auth" onSubmit={submit}>
      <div className="segmented" role="tablist" data-nav-row="10">
        {(
          [
            ["signin", "Sign in"],
            ["signup", "New profile"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={`segment${mode === m ? " is-on" : ""}`} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-secondary st-google"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          try {
            await signInWithGoogle();
          } catch (err) {
            setProblem(err instanceof Error ? err.message : "Google sign-in failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continue with Google
      </button>
      <p className="st-or">or with email</p>
      <p className="field-hint">Sign in once and Zuno fills in your name and picture every time you join a game, on any device.</p>
      {mode === "signup" && (
        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" value={username} maxLength={24} autoComplete="nickname" required onChange={(e) => setUsername(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span className="field-label">Email</span>
        <input className="input" type="email" value={email} autoComplete="email" required onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input className="input" type="password" value={password} minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} required onChange={(e) => setPassword(e.target.value)} />
      </label>
      {mode === "signup" && <AvatarPicker name={username} value={avatar} onChange={setAvatar} />}
      {problem && (
        <p className="st-problem" role="alert">
          {problem}
        </p>
      )}
      {note && <p className="field-hint">{note}</p>}
      <div className="st-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "One moment…" : mode === "signup" ? "Create profile" : "Sign in"}
        </button>
        {mode === "signin" && (
          <button type="button" className="btn btn-quiet" onClick={forgot}>
            Forgot password?
          </button>
        )}
      </div>
    </form>
  );
}

/** Username and picture (photo upload, emoji or initial), with a save confirmation. */
export function IdentityEditor() {
  const profile = useProfile()!;
  const [username, setUsername] = useState(profile.username);
  // The picker edits the picture only; cosmetics are equipped below.
  const [avatar, setAvatar] = useState<AvatarSpec>(() => ({ color: profile.avatar.color, emoji: profile.avatar.emoji, photo: profile.avatar.photo }));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = username.trim() !== profile.username || avatar.color !== profile.avatar.color || avatar.emoji !== profile.avatar.emoji || avatar.photo !== profile.avatar.photo;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await updateProfile({ username, avatar });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="st-auth" onSubmit={save}>
      <label className="field">
        <span className="field-label">Display name</span>
        <input className="input" value={username} maxLength={24} onChange={(e) => setUsername(e.target.value)} data-nav-row="11" />
        <span className="field-hint">2–24 letters, numbers, spaces, dots, dashes or underscores. Names are unique.</span>
      </label>
      <AvatarPicker name={username} value={avatar} onChange={setAvatar} />
      {problem && (
        <p className="st-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="st-row">
        <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="pf-saved" role="status">
            <Check size={16} /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
