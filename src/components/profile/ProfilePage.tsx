import { useEffect, useState, useSyncExternalStore } from "react";
import { BadgeCheck, CalendarDays, Copy, Fingerprint, Lock, Mail, ShieldCheck, Trophy } from "lucide-react";
import { UserAvatar } from "../avatar/AvatarView";
import { StyledUsername } from "../cosmetics/Cosmetics";
import { AuthForm, IdentityEditor } from "./AccountForms";
import { ACHIEVEMENTS, getProgress, subscribeProgress, type ProgressMap } from "../../lib/achievements";
import { DECORATIONS, NAME_STYLES, canEquip, type Cosmetic, type CosmeticKind } from "../../lib/cosmetics";
import { equip, fetchPublicProfile, profilesAvailable, useProfile, type Profile, type PublicProfile } from "../../lib/profile";
import { playSfx } from "../../lib/sfx";
import "../settings/settings.css";
import "./profile.css";

const fmtDate = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Unknown");

/** The Profile page: your identity, cosmetics and achievements, or another player's public profile (#/profile/<uid>). */
export function ProfilePage({ viewUid, onOpenProfile }: { viewUid: string | null; onOpenProfile: (uid: string | null) => void }) {
  const profile = useProfile();
  if (!profilesAvailable())
    return (
      <Shell title="Profile">
        <p className="field-hint">Profiles need the online service, which isn't set up for this site.</p>
      </Shell>
    );
  if (profile === undefined)
    return (
      <Shell title="Profile">
        <p className="field-hint">Loading your profile…</p>
      </Shell>
    );
  if (viewUid && viewUid !== profile?.uid) return <PublicView uid={viewUid} signedIn={!!profile} onBack={() => onOpenProfile(null)} />;
  if (!profile)
    return (
      <Shell title="Profile">
        <section className="st-card pf-auth">
          <h2 className="st-card-title">Sign in or make a profile</h2>
          <AuthForm />
        </section>
      </Shell>
    );
  return <OwnProfile profile={profile} />;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="lx-page pf">
      <header className="lx-head">
        <h1 className="lx-title">{title}</h1>
      </header>
      {children}
    </main>
  );
}

function OwnProfile({ profile }: { profile: Profile }) {
  const progress = useSyncExternalStore(subscribeProgress, getProgress);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${window.location.pathname}#/profile/${profile.uid}`;
  return (
    <main className="lx-page pf">
      <header className="pf-hero">
        <UserAvatar name={profile.username} avatar={profile.avatar} size={96} />
        <div className="pf-hero-text">
          <p className="lx-eyebrow">Your profile</p>
          <h1 className="pf-name">
            <StyledUsername name={profile.username} styleId={profile.nameStyle} />
          </h1>
          <p className="pf-badges">
            {profile.admin && (
              <span className="pf-badge pf-badge-admin">
                <ShieldCheck size={14} /> Zuno admin
              </span>
            )}
            <span className="pf-badge">
              <Trophy size={14} /> {ACHIEVEMENTS.filter((a) => progress[a.id]?.at).length} / {ACHIEVEMENTS.length} achievements
            </span>
          </p>
        </div>
        <button
          type="button"
          className="btn btn-quiet pf-share"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          <Copy size={16} /> {copied ? "Link copied" : "Copy profile link"}
        </button>
      </header>

      <div className="pf-grid">
        <section className="st-card" aria-labelledby="pf-id-h">
          <h2 id="pf-id-h" className="st-card-title">
            Identity
          </h2>
          <IdentityEditor key={profile.uid} />
        </section>

        <section className="st-card" aria-labelledby="pf-acct-h">
          <h2 id="pf-acct-h" className="st-card-title">
            Account
          </h2>
          <dl className="pf-facts">
            <div>
              <dt>
                <Mail size={14} /> Email
              </dt>
              <dd>
                {profile.email || "None"}
                {profile.emailVerified && <BadgeCheck size={15} className="pf-verified" aria-label="Verified" />}
              </dd>
            </div>
            <div>
              <dt>
                <CalendarDays size={14} /> Joined
              </dt>
              <dd>{fmtDate(profile.createdAt)}</dd>
            </div>
            <div>
              <dt>
                <Fingerprint size={14} /> User ID
              </dt>
              <dd className="pf-mono">{profile.uid}</dd>
            </div>
          </dl>
          <p className="field-hint">Sign out from Settings.</p>
        </section>
      </div>

      <Cosmetics profile={profile} progress={progress} />
      <Achievements progress={progress} />
    </main>
  );
}

function Cosmetics({ profile }: { profile: Profile; progress: ProgressMap }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const put = async (kind: CosmeticKind, id: string | null) => {
    setBusy(`${kind}:${id}`);
    setProblem(null);
    try {
      await equip(kind, id);
      playSfx(id ? "equip" : "unequip");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't change that.");
      playSfx("wrong");
    } finally {
      setBusy(null);
    }
  };
  const grid = (kind: CosmeticKind, items: readonly Cosmetic[], equipped: string | null) => (
    <div className="pf-items" role="list" data-nav-row={kind === "decoration" ? "60" : "61"}>
      {items
        // Exclusive items are only listed for the account that can wear them.
        .filter((c) => c.unlock !== "admin" || profile.admin)
        .map((c) => {
          const owned = canEquip(c, profile.inventory);
          const on = equipped === c.id;
          return (
            <div key={c.id} role="listitem" className={`pf-item${on ? " is-on" : ""}${owned ? "" : " is-locked"}`}>
              <span className="pf-item-preview" aria-hidden="true">
                {kind === "decoration" ? <UserAvatar name={profile.username} avatar={profile.avatar} decoration={c.id} size={44} /> : <StyledUsername name={profile.username} styleId={c.id} />}
              </span>
              <span className="pf-item-text">
                <strong>{c.label}</strong>
                <small>{c.description}</small>
              </span>
              {owned ? (
                <button type="button" className={`btn ${on ? "btn-secondary" : "btn-primary"} pf-item-btn`} disabled={busy !== null} onClick={() => void put(kind, on ? null : c.id)}>
                  {on ? "Unequip" : "Equip"}
                </button>
              ) : (
                <span className="pf-lock">
                  <Lock size={14} /> {c.unlock === "grant" ? "Gift only" : "Locked"}
                </span>
              )}
            </div>
          );
        })}
    </div>
  );
  return (
    <section className="st-card pf-section" aria-labelledby="pf-cos-h">
      <h2 id="pf-cos-h" className="st-card-title">
        Cosmetics
      </h2>
      {problem && (
        <p className="st-problem" role="alert">
          {problem}
        </p>
      )}
      <h3 className="pf-sub">Avatar decoration</h3>
      {grid("decoration", DECORATIONS, profile.decoration)}
      <h3 className="pf-sub">Name style</h3>
      {grid("nameStyle", NAME_STYLES, profile.nameStyle)}
      <p className="field-hint">What you equip shows next to your name everywhere: the sidebar, lobbies, player lists and game feeds.</p>
    </section>
  );
}

function Achievements({ progress }: { progress: ProgressMap }) {
  return (
    <section className="st-card pf-section" aria-labelledby="pf-ach-h">
      <h2 id="pf-ach-h" className="st-card-title">
        Achievements
      </h2>
      <ul className="pf-achs">
        {ACHIEVEMENTS.map((a) => {
          const p = progress[a.id];
          const count = Math.min(a.goal, p?.count ?? 0);
          const done = !!p?.at;
          return (
            <li key={a.id} className={`pf-ach${done ? " is-done" : ""}`}>
              <span className="pf-ach-icon" aria-hidden="true">
                {done ? <Trophy size={18} /> : <Lock size={16} />}
              </span>
              <span className="pf-ach-text">
                <strong>{a.label}</strong>
                <small>{done ? `Unlocked ${fmtDate(p!.at!)}` : a.description}</small>
              </span>
              <span className="pf-ach-meter">
                <span className="pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={count} aria-label={`${a.label} progress`}>
                  <span style={{ width: `${(count / a.goal) * 100}%` }} />
                </span>
                <small>
                  {count}/{a.goal}
                </small>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PublicView({ uid, signedIn, onBack }: { uid: string; signedIn: boolean; onBack: () => void }) {
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void fetchPublicProfile(uid).then((r) => live && setP(r));
    return () => {
      live = false;
    };
  }, [uid]);
  if (!signedIn)
    return (
      <Shell title="Profile">
        <p className="field-hint">Sign in to see other players' profiles.</p>
        <button type="button" className="btn btn-primary" onClick={onBack}>
          Sign in
        </button>
      </Shell>
    );
  if (p === undefined)
    return (
      <Shell title="Profile">
        <p className="field-hint">Loading…</p>
      </Shell>
    );
  if (!p)
    return (
      <Shell title="Profile">
        <p className="field-hint">No player with that profile link.</p>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back to your profile
        </button>
      </Shell>
    );
  return (
    <main className="lx-page pf">
      <header className="pf-hero">
        <UserAvatar name={p.username} avatar={p.avatar} decoration={p.decoration} size={96} />
        <div className="pf-hero-text">
          <p className="lx-eyebrow">Player</p>
          <h1 className="pf-name">
            <StyledUsername name={p.username} styleId={p.nameStyle} />
          </h1>
          <p className="pf-badges">
            <span className="pf-badge">
              <CalendarDays size={14} /> Joined {fmtDate(p.createdAt)}
            </span>
          </p>
        </div>
        <button type="button" className="btn btn-quiet pf-share" onClick={onBack}>
          Your profile
        </button>
      </header>
      <Achievements progress={p.achievements} />
    </main>
  );
}
