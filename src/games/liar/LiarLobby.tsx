import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  Minus,
  Play,
  Plus,
  UserMinus,
} from "lucide-react";
import { Avatar, AvatarPicker } from "../../components/avatar/AvatarView";
import { loadAvatar, saveAvatar } from "../../components/avatar/avatarData";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { LIAR_LIMITS, type LiarFile } from "../../game-files/schema/liar";
import { playerId } from "../headbands/lobby";
import { useJoinSound } from "../../lib/useGameSounds";
import type { Options, Player } from "./liarEngine";
import {
  closeLiarLobby,
  createLiarLobby,
  joinLiarLobby,
  leaveLiarLobby,
  liarJoinLink,
  setLiarLobby,
  watchLiarLobby,
  type LiarLobbyState,
} from "./liarLobby";
import "../jeopardy/setup.css";
import "../headbands/headbands.css";
import "./liar.css";

interface Props {
  file: LiarFile;
  code: string | null;
  onCode: (code: string) => void;
  onBack: () => void;
  onStart: (players: Player[], options: Options) => void;
}

const NAME_KEY = "zuno.hb.name";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

/** The host's lobby for online LIAR. The host plays too. */
export function LiarLobby({
  file,
  code: initialCode,
  onCode,
  onBack,
  onStart,
}: Props) {
  const me = playerId();
  const [name, setName] = useState(savedName);
  const [avatar, setAvatar] = useState(loadAvatar);
  const [code, setCode] = useState<string | null>(initialCode);
  const [lobby, setLobby] = useState<LiarLobbyState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [rounds, setRounds] = useState(file.settings.defaultRounds);
  const [scoring, setScoring] = useState(file.settings.scoringEnabled);
  const [abstain, setAbstain] = useState(file.settings.allowAbstain);
  const created = useRef(false);
  useEscape(() => setConfirmLeave(true), !confirmLeave);

  useEffect(() => {
    if (code || created.current) return;
    created.current = true;
    createLiarLobby()
      .then((c) => {
        setCode(c);
        onCode(c);
      })
      .catch((e: unknown) =>
        setProblem(e instanceof Error ? e.message : "Could not open a room."),
      );
  }, [code, onCode]);

  useEffect(() => {
    if (!code) return;
    void setLiarLobby(code, { phase: "lobby", game: null, actions: null });
    return watchLiarLobby(code, setLobby, setProblem);
  }, [code]);

  const trimmed = name.trim();
  useEffect(() => {
    if (!code || trimmed === "") return;
    const t = window.setTimeout(() => {
      void joinLiarLobby(code, me, trimmed, avatar).catch(() =>
        setProblem("Could not add you to the room."),
      );
      saveAvatar(avatar);
      try {
        localStorage.setItem(NAME_KEY, trimmed);
      } catch {
        /* optional */
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [code, me, trimmed, avatar]);

  useEffect(() => {
    if (code)
      void QRCode.toDataURL(liarJoinLink(code), { margin: 1, width: 240 })
        .then(setQr)
        .catch(() => setQr(""));
  }, [code]);

  const list = Object.entries(lobby?.players ?? {})
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([id, p]) => ({ id, ...p }));
  useJoinSound(list.length);
  const { minPlayers, maxPlayers } = file.settings;
  const hostIn = list.some((p) => p.id === me);
  const names = list.map((p) => p.name.trim().toLowerCase());
  const dupes = new Set(names).size !== names.length;
  const ready =
    !!code &&
    hostIn &&
    list.length >= minPlayers &&
    list.length <= maxPlayers &&
    !dupes;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(liarJoinLink(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The link is on screen. */
    }
  };

  const start = async () => {
    if (!code || !ready) return;
    await setLiarLobby(code, { phase: "playing" });
    onStart(
      list.map((p) => ({ id: p.id, name: p.name })),
      { rounds, scoring, allowAbstain: abstain },
    );
  };

  return (
    <main
      className="screen game-scope"
      style={{ "--game": file.appearance.accentColor } as React.CSSProperties}
    >
      <header className="screen-bar" data-nav-row="0">
        <button
          type="button"
          className="icon-btn"
          aria-label="Close the room"
          onClick={() => setConfirmLeave(true)}
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">LIAR online</span>
      </header>
      <div className="setup">
        <div className="setup-intro">
          <p className="meta">{file.metadata.title}</p>
          <h1 className="page-title setup-title">Invite the players</h1>
          {code ? (
            <div className="hb-join-info">
              {qr && (
                <img
                  className="hb-qr"
                  src={qr}
                  alt={`QR code to join room ${code}`}
                  width={200}
                  height={200}
                />
              )}
              <div className="hb-join-text">
                <p className="meta">Room code</p>
                <p className="hb-code">{code}</p>
                <p className="hb-link">{liarJoinLink(code)}</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void copy()}
                >
                  {copied ? (
                    <Check size={16} strokeWidth={1.5} />
                  ) : (
                    <Copy size={16} strokeWidth={1.5} />
                  )}
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
            <p>
              You play too. Everyone else scans the code, or opens Zuno, taps
              Join and types the room code.
            </p>
            <p>
              Each storyteller writes their statements privately on their own
              phone. Everyone votes from their own device.
            </p>
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
            <input
              className="input"
              value={name}
              maxLength={24}
              autoComplete="nickname"
              placeholder="You play as well"
              data-autofocus
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <AvatarPicker name={name} value={avatar} onChange={setAvatar} />

          <div className="setup-field">
            <span className="setup-label">
              Players, in turn order · {list.length} of {maxPlayers}
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
                      {p.id === me && <span className="meta">(you)</span>}
                    </span>
                    <span className="hb-circle-tools">
                      <button
                        type="button"
                        className="icon-btn icon-btn-sm"
                        aria-label={`Remove ${p.name}`}
                        disabled={p.id === me}
                        onClick={() => code && void leaveLiarLobby(code, p.id)}
                      >
                        <UserMinus size={16} strokeWidth={1.5} />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="liar-row">
            <span className="setup-label" id="liar-online-rounds">
              Rounds
            </span>
            <div
              className="stepper"
              role="group"
              aria-labelledby="liar-online-rounds"
            >
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                aria-label="Fewer rounds"
                disabled={rounds <= LIAR_LIMITS.minRounds}
                onClick={() => setRounds(rounds - 1)}
              >
                <Minus size={18} strokeWidth={1.5} />
              </button>
              <output className="stepper-value">{rounds}</output>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                aria-label="More rounds"
                disabled={rounds >= LIAR_LIMITS.maxRounds}
                onClick={() => setRounds(rounds + 1)}
              >
                <Plus size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <label className="switch">
            <span>Keep score</span>
            <input
              type="checkbox"
              checked={scoring}
              onChange={(e) => setScoring(e.target.checked)}
            />
            <span className="switch-track" />
          </label>
          <label className="switch">
            <span>Allow abstaining</span>
            <input
              type="checkbox"
              checked={abstain}
              onChange={(e) => setAbstain(e.target.checked)}
            />
            <span className="switch-track" />
          </label>

          {dupes && (
            <div className="notice notice-error">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>
                Two players share a name. One of them needs to rejoin with a
                different name.
              </p>
            </div>
          )}
          <div className="setup-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready}
              onClick={() => void start()}
            >
              <Play size={18} strokeWidth={1.5} />
              Start game
            </button>
          </div>
          {list.length < minPlayers && (
            <p className="field-hint">
              At least {minPlayers} players, you included, need to join.
            </p>
          )}
        </div>
      </div>
      {confirmLeave && (
        <ConfirmDialog
          title="Close the room?"
          text="Everyone in it is disconnected."
          confirmLabel="Close room"
          danger
          onConfirm={() => {
            if (code) void closeLiarLobby(code);
            onBack();
          }}
          onClose={() => setConfirmLeave(false)}
        />
      )}
    </main>
  );
}
