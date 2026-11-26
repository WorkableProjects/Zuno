import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { UserAvatar } from "../avatar/AvatarView";
import { StyledUsername } from "../cosmetics/Cosmetics";
import { ForbiddenError, forceUnequip, grant, listUsers, revoke, type AdminUser } from "../../lib/admin";
import { DECORATIONS, NAME_STYLES, type Cosmetic, type CosmeticKind } from "../../lib/cosmetics";
import { playSfx } from "../../lib/sfx";
import "../settings/settings.css";
import "../profile/profile.css";

/**
 * The admin panel (#/admin). App only renders it for the verified admin, but that is a
 * convenience: every read and write here is checked by the database rules on Firebase's
 * servers, so anyone else gets PERMISSION_DENIED (403) whatever the page does.
 */
export function AdminPage({ onOpenProfile }: { onOpenProfile: (uid: string) => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [unequip, setUnequip] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setUsers(await listUsers());
    } catch (e) {
      setProblem(e instanceof ForbiddenError ? e.message : e instanceof Error ? e.message : "Couldn't load users.");
      setUsers([]);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => !q || u.username.toLowerCase().includes(q) || u.email.includes(q) || u.uid.toLowerCase().startsWith(q));
  }, [users, query]);
  const user = users?.find((u) => u.uid === selected) ?? null;

  const act = async (key: string, run: () => Promise<void>) => {
    setBusy(key);
    setProblem(null);
    try {
      await run();
      playSfx("equip");
      await load();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn't work.");
      playSfx("wrong");
    } finally {
      setBusy(null);
    }
  };

  const rows = (kind: CosmeticKind, items: readonly Cosmetic[]) =>
    user &&
    items.map((c) => {
      const granted = (kind === "decoration" ? user.grantedDecorations : user.grantedNameStyles).includes(c.id);
      const worn = (kind === "decoration" ? user.decoration : user.nameStyle) === c.id;
      const key = `${kind}:${c.id}`;
      // Free and achievement items aren't granted; exclusive Zuno items stay with the admin account.
      const grantable = c.unlock === "grant" || c.unlock === "achievement";
      return (
        <div key={key} className="ad-row">
          <span aria-hidden="true">{kind === "decoration" ? <UserAvatar name={user.username} avatar={user.avatar} decoration={c.id} size={36} /> : <StyledUsername name="Aa" styleId={c.id} />}</span>
          <span className="ad-row-text">
            <strong>{c.label}</strong>
            <small>
              {c.unlock === "free" ? "Free for everyone" : c.unlock === "admin" ? "Admin only" : c.unlock === "achievement" ? "Achievement reward (grant to give it early)" : "Gift"}
              {worn ? " · wearing" : ""}
            </small>
          </span>
          {grantable ? (
            granted ? (
              <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void act(key, () => revoke(user.uid, kind, c.id, unequip))}>
                Revoke
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void act(key, () => grant(user.uid, kind, c.id))}>
                Grant
              </button>
            )
          ) : (
            <span className={`ad-state${worn ? " is-yes" : ""}`}>{worn ? <><Check size={13} /> Wearing</> : "—"}</span>
          )}
        </div>
      );
    });

  return (
    <main className="lx-page pf">
      <header className="lx-head">
        <h1 className="lx-title">Admin</h1>
        <button type="button" className="btn btn-quiet" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </header>
      {problem && (
        <p className="st-problem" role="alert">
          <ShieldAlert size={16} /> {problem}
        </p>
      )}
      <div className="ad-layout">
        <section className="st-card" aria-label="Users">
          <label className="ad-search">
            <Search size={18} aria-hidden="true" />
            <input className="input" placeholder="Search name, email or ID" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search users" />
          </label>
          {users === null ? (
            <p className="field-hint">Loading users…</p>
          ) : (
            <ul className="ad-users">
              {shown.map((u) => (
                <li key={u.uid}>
                  <button type="button" className={`ad-user${selected === u.uid ? " is-on" : ""}`} onClick={() => setSelected(u.uid)}>
                    <UserAvatar name={u.username} avatar={u.avatar} decoration={u.decoration} size={36} />
                    <span className="ad-user-text">
                      <StyledUsername name={u.username} styleId={u.nameStyle} />
                      <small>{u.email || u.uid}</small>
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="field-hint">No users match.</li>}
            </ul>
          )}
        </section>

        <section className="st-card" aria-label="Selected user">
          {!user ? (
            <p className="field-hint">Pick a user to see and change their cosmetics.</p>
          ) : (
            <>
              <div className="pf-hero">
                <UserAvatar name={user.username} avatar={user.avatar} decoration={user.decoration} size={64} />
                <div className="pf-hero-text">
                  <h2 className="st-card-title" style={{ margin: 0 }}>
                    <StyledUsername name={user.username} styleId={user.nameStyle} />
                  </h2>
                  <small className="field-hint">
                    {user.email || "No email on file"} · joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "unknown"}
                  </small>
                  <small className="field-hint pf-mono" style={{ display: "block" }}>
                    {user.uid}
                  </small>
                </div>
                <button type="button" className="btn btn-quiet" onClick={() => onOpenProfile(user.uid)}>
                  <ExternalLink size={16} /> Profile
                </button>
              </div>
              <label className="ad-opts">
                <input type="checkbox" checked={unequip} onChange={(e) => setUnequip(e.target.checked)} /> Take an item off right away when I revoke it
              </label>
              <h3 className="pf-sub">Avatar decorations</h3>
              <div className="ad-rows">{rows("decoration", DECORATIONS)}</div>
              <h3 className="pf-sub">Name styles</h3>
              <div className="ad-rows">{rows("nameStyle", NAME_STYLES)}</div>
              <div className="st-row" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-quiet" disabled={busy !== null || !user.decoration} onClick={() => void act("unequip:d", () => forceUnequip(user.uid, "decoration"))}>
                  Remove worn decoration
                </button>
                <button type="button" className="btn btn-quiet" disabled={busy !== null || !user.nameStyle} onClick={() => void act("unequip:n", () => forceUnequip(user.uid, "nameStyle"))}>
                  Remove worn name style
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
