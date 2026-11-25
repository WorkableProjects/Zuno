import { useEffect, useRef, useState } from "react";
import { FlipCode } from "../../components/ui/FlipCode";
import QRCode from "qrcode";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CircleAlert, Copy, Crown, Play, UserMinus } from "lucide-react";
import { useRegisterRoom } from "../../lib/room";
import { Avatar, AvatarPicker } from "../../components/avatar/AvatarView";
import { loadAvatar, saveAvatar } from "../../components/avatar/avatarData";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { useJoinSound } from "../../lib/useGameSounds";
import { playerId } from "../headbands/lobby";
import {
  canStartParty,
  clearPartyReady,
  closePartyRoom,
  createPartyRoom,
  joinPartyRoom,
  leavePartyRoom,
  orderedPartyPlayers,
  partyJoinLink,
  setPartyRoom,
  watchPartyRoom,
  type PartyLobbyState,
} from "./partyRoom";
import type { AnyPartyDef } from "./types";
import "../jeopardy/setup.css";
import "../headbands/headbands.css";
import "../rpg/rpg.css";
import "./party.css";
import { gameFontStyle } from "../gameFont";

const NAME_KEY = "zuno.hb.name";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

function moveInOrder(ids: string[], id: string, by: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = ids.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

interface Props {
  def: AnyPartyDef;
  code: string | null;
  onCode: (code: string) => void;
  onBack: () => void;
  onStart: (players: Array<{ id: string; name: string }>, settings: unknown) => void;
}

/** The host's lobby for a party game. The host plays too. */
export function PartyLobby({ def, code: initialCode, onCode, onBack, onStart }: Props) {
  const me = playerId();
  const kind = def.kind;
  const [name, setName] = useState(savedName);
  const [avatar, setAvatar] = useState(loadAvatar);
  const [code, setCode] = useState<string | null>(initialCode);
  const [lobby, setLobby] = useState<PartyLobbyState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [settings, setSettings] = useState(def.defaultSettings);
  const created = useRef(false);
  const cleared = useRef(false);
  useEscape(() => setConfirmLeave(true), !confirmLeave);
  useRegisterRoom(code ? `${kind}/${code}` : null, "Host");

  useEffect(() => {
    if (code || created.current) return;
    created.current = true;
    createPartyRoom(kind)
      .then((c) => {
        setCode(c);
        onCode(c);
      })
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : "Could not open a room."));
  }, [code, onCode, kind]);

  useEffect(() => {
    if (!code) return;
    void setPartyRoom(kind, code, { phase: "lobby", game: null, actions: null, private: null, canvas: null });
    return watchPartyRoom(kind, code, setLobby, setProblem);
  }, [code, kind]);

  useEffect(() => {
    if (!code || !lobby || cleared.current) return;
    cleared.current = true;
    const ready = Object.entries(lobby.players).filter(([, p]) => p.ready).map(([id]) => id);
    if (ready.length > 0) void clearPartyReady(kind, code, ready).catch(() => undefined);
  }, [code, lobby, kind]);

  const trimmed = name.trim();
  useEffect(() => {
    if (!code || trimmed === "") return;
    const t = window.setTimeout(() => {
      void joinPartyRoom(kind, code, me, trimmed, avatar).catch(() => setProblem("Could not add you to the room."));
      saveAvatar(avatar);
      try {
        localStorage.setItem(NAME_KEY, trimmed);
      } catch {
        /* optional */
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [code, me, trimmed, avatar, kind]);

  const valid = def.settingsValid(settings);
  useEffect(() => {
    if (!code || !valid) return;
    const t = window.setTimeout(() => void setPartyRoom(kind, code, { note: def.note(settings) }).catch(() => undefined), 250);
    return () => window.clearTimeout(t);
  }, [code, settings, valid, def, kind]);

  useEffect(() => {
    if (code)
      void QRCode.toDataURL(partyJoinLink(kind, code), { margin: 1, width: 240 })
        .then(setQr)
        .catch(() => setQr(""));
  }, [code, kind]);

  const list = lobby ? orderedPartyPlayers(lobby) : [];
  useJoinSound(list.length);
  const names = list.map((p) => p.name.trim().toLowerCase());
  const dupes = new Set(names).size !== names.length;
  const ready = !!code && valid && !dupes && canStartParty(list, me, def.minPlayers, def.maxPlayers);
  const notReady = list.filter((p) => p.id !== me && !p.ready).length;

  const reorder = (id: string, by: -1 | 1) => {
    if (!code) return;
    void setPartyRoom(kind, code, { order: JSON.stringify(moveInOrder(list.map((p) => p.id), id, by)) }).catch(() => setProblem("Could not change the order."));
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(partyJoinLink(kind, code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The link is on screen. */
    }
  };

  const start = async () => {
    if (!code || !ready) return;
    try {
      await setPartyRoom(kind, code, { order: JSON.stringify(list.map((p) => p.id)), phase: "playing", note: def.note(settings) });
    } catch {
      setProblem("Could not start the game. Check your connection.");
      return;
    }
    onStart(
      list.map((p) => ({ id: p.id, name: p.name })),
      settings,
    );
  };

  const Editor = def.SettingsEditor;
  return (
    <main className="screen game-scope party-scope" style={{ "--game": def.accent, ...gameFontStyle(def.gameType) } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Close the room" onClick={() => setConfirmLeave(true)}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">{def.title} online</span>
      </header>
      <div className="setup">
        <div className="setup-intro">
          <PartyTitle text={def.title} />
          <p className="page-lede">{def.tagline}</p>
          {code ? (
            <div className="hb-join-info">
              {qr && <img className="hb-qr" src={qr} alt={`QR code to join room ${code}`} width={200} height={200} />}
              <div className="hb-join-text">
                <p className="meta">Room code</p>
                <FlipCode code={code} />
                <p className="hb-link">{partyJoinLink(kind, code)}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
                  {copied ? <Check size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />}
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
            </div>
          ) : (
            !problem && (
              <p className="page-lede" role="status">
                Opening a room…
              </p>
            )
          )}
          <div className="hb-howto">
            <p>You play too. Everyone else scans the code, or opens Zuno, taps Join and types the room code.</p>
            {def.howto.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {problem && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>{problem}</p>
            </div>
          )}
        </div>

        <div className="setup-panel card">
          <label className="field setup-field">
            <span className="setup-label">Your name</span>
            <input className="input" value={name} maxLength={24} autoComplete="nickname" placeholder="You play as well" data-autofocus onChange={(e) => setName(e.target.value)} />
          </label>
          <AvatarPicker name={name} value={avatar} onChange={setAvatar} />

          <div className="setup-field">
            <span className="setup-label">
              Players · {list.length} of {def.maxPlayers}
            </span>
            {list.length === 0 ? (
              <p className="meta">Nobody has joined yet.</p>
            ) : (
              <ol className="hb-circle">
                {list.map((p, i) => (
                  <li key={p.id} className="hb-circle-row">
                    <span className="team-index">{i + 1}</span>
                    <span className="hb-circle-who">
                      <Avatar name={p.name} avatar={p.avatar} size={28} />
                      <strong>{p.name}</strong>
                      {p.id === me && (
                        <span className="meta">
                          {" "}
                          <Crown size={14} strokeWidth={1.5} aria-label="Host" /> you
                        </span>
                      )}
                    </span>
                    <span className="hb-circle-tools">
                      <span className={`hb-circle-status${p.ready || p.id === me ? " is-done" : ""}`}>{p.id === me ? "Host" : p.ready ? "Ready" : "Not ready"}</span>
                      <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => reorder(p.id, -1)}>
                        <ArrowUp size={16} strokeWidth={1.5} />
                      </button>
                      <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${p.name} down`} disabled={i === list.length - 1} onClick={() => reorder(p.id, 1)}>
                        <ArrowDown size={16} strokeWidth={1.5} />
                      </button>
                      <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove ${p.name}`} disabled={p.id === me} onClick={() => code && void leavePartyRoom(kind, code, p.id)}>
                        <UserMinus size={16} strokeWidth={1.5} />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <Editor value={settings} onChange={setSettings} />

          {dupes && (
            <div className="notice notice-error">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>Two players share a name. One of them needs to rejoin with a different name.</p>
            </div>
          )}
          <div className="setup-actions">
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void start()}>
              <Play size={18} strokeWidth={1.5} />
              {ready ? "Start game" : notReady > 0 ? `Waiting for ${notReady} to ready up` : "Start game"}
            </button>
          </div>
          {list.length < def.minPlayers && <p className="field-hint">At least {def.minPlayers} players, you included, need to join.</p>}
        </div>
      </div>
      {confirmLeave && (
        <ConfirmDialog
          title="Close the room?"
          text="Everyone in it is disconnected."
          confirmLabel="Close room"
          danger
          onConfirm={() => {
            if (code) void closePartyRoom(kind, code);
            onBack();
          }}
          onClose={() => setConfirmLeave(false)}
        />
      )}
    </main>
  );
}

/** The game's name rolling in letter by letter. */
export function PartyTitle({ text, className = "" }: { text: string; className?: string }) {
  const words = text.split(" ");
  const starts = words.map((_, i) => words.slice(0, i).reduce((sum, w) => sum + w.length, 0));
  return (
    <h1 className={`rpg-title ${className}`} aria-label={text}>
      {words.map((w, wi) => (
        <span key={wi} className={`rpg-title-word${wi === words.length - 1 && words.length > 1 ? " is-gamble" : ""}`} aria-hidden="true">
          {w.split("").map((ch, ci) => (
            <span key={ci} className="rpg-roll" style={{ "--n": starts[wi] + ci } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

/** A labelled whole-number setting with bounds. */
export function NumberSetting({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; hint?: string }) {
  const bad = !(Number.isInteger(value) && value >= min && value <= max);
  return (
    <label className="field setup-field">
      <span className="setup-label">{label}</span>
      <input className="input party-num" inputMode="numeric" value={Number.isFinite(value) ? String(value) : ""} aria-invalid={bad} onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9]/g, "")))} />
      {bad ? (
        <span className="field-hint rpg-problem">
          Choose {min.toLocaleString("en-US")} to {max.toLocaleString("en-US")}.
        </span>
      ) : (
        hint && <span className="meta">{hint}</span>
      )}
    </label>
  );
}

export const inRange = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
