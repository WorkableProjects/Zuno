import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CircleAlert, Copy, Play, RotateCcw, Shuffle, UserMinus } from "lucide-react";
import type { HeadbandsFile, HeadbandsIdentity, HeadbandsMode } from "../../game-files/schema/headbands";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog } from "../../components/ui/Dialog";
import type { HeadbandsStart } from "./HeadbandsSetup";
import { HEADBANDS_LIMITS } from "../../game-files/schema/headbands";
import { customIdentityProblems, shuffle, writingPairs, type Rules } from "./headbandsEngine";
import { closeLobby, createLobby, joinLink, leaveLobby, setLobby, syncCircle, watchLobby, type LobbyState } from "./lobby";
import "../jeopardy/jeopardy.css";
import "../jeopardy/setup.css";
import "./headbands.css";

interface Props {
  /** Title and look of the game. Its own deck is not used: players write the identities. */
  base: HeadbandsFile;
  /** Set when returning to a lobby that is already open. */
  code: string | null;
  onCode: (code: string) => void;
  onBack: () => void;
  onStart: (file: HeadbandsFile, start: HeadbandsStart) => void;
}

/** Turns the lobby's written entries into a playable deck, in circle order. */
export function lobbyToGame(base: HeadbandsFile, lobby: LobbyState, rules: Rules): { file: HeadbandsFile; start: HeadbandsStart } {
  const pairs = writingPairs(lobby.circle.map((_, i) => i));
  const identities: HeadbandsIdentity[] = [];
  const forTarget = new Map<string, string>();
  for (const { writer, target } of pairs) {
    const writerId = lobby.circle[writer];
    const targetId = lobby.circle[target];
    const e = lobby.entries[writerId];
    if (!e) continue;
    const id = `custom-${target + 1}`;
    const label = lobby.mode === "image" ? (e.subtext ?? "").trim() : e.text.trim();
    identities.push({ id, text: label, image: lobby.mode === "image" ? e.image : null, subtext: lobby.mode === "image" ? label : null });
    forTarget.set(targetId, id);
  }
  return {
    file: { ...base, content: { identities }, settings: { ...base.settings, allowDuplicateAssignments: false } },
    start: { mode: lobby.mode, rules, players: lobby.circle.map((id) => ({ id, name: lobby.players[id].name, identityId: forTarget.get(id) ?? "" })) },
  };
}

export function HeadbandsLobby({ base, code: initialCode, onCode, onBack, onStart }: Props) {
  const [code, setCode] = useState<string | null>(initialCode);
  const [lobby, setLobbyState] = useState<LobbyState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [rules, setRules] = useState<Rules>({ continueAfterYes: base.settings.continueAfterYes, unlimitedGuesses: base.settings.unlimitedGuesses });
  const created = useRef(false);
  useEscape(() => setConfirmLeave(true), !confirmLeave);

  // Open a lobby once, or reuse the one we came back to.
  useEffect(() => {
    if (code || created.current) return;
    created.current = true;
    createLobby(base.settings.defaultMode)
      .then((c) => {
        setCode(c);
        onCode(c);
      })
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : "Could not open a lobby."));
  }, [code, base.settings.defaultMode, onCode]);

  useEffect(() => {
    if (!code) return;
    // Coming back after a round: everyone writes again.
    void setLobby(code, { phase: "lobby", entries: null, game: null, actions: null });
    return watchLobby(code, setLobbyState, setProblem);
  }, [code]);

  useEffect(() => {
    if (code) void QRCode.toDataURL(joinLink(code), { margin: 1, width: 240 }).then(setQr).catch(() => setQr(""));
  }, [code]);

  // The host owns the circle: newcomers join at the end, leavers drop out.
  const players = lobby?.players;
  useEffect(() => {
    if (!code || !lobby || !players || lobby.phase !== "lobby") return;
    const next = syncCircle(lobby.circle, players);
    if (next.join() !== lobby.circle.join()) void setLobby(code, { circle: next });
  }, [code, lobby, players]);

  const circle = lobby?.circle ?? [];
  const pairs = useMemo(() => writingPairs(circle.map((_, i) => i)), [circle]);
  const nameOf = (id: string) => lobby?.players[id]?.name ?? "Someone";
  const phase = lobby?.phase ?? "lobby";
  const tooMany = circle.length > HEADBANDS_LIMITS.maxPlayers;
  const written = circle.filter((id) => lobby?.entries[id] && customIdentityProblems(lobby.entries[id], lobby.mode).length === 0);
  const allWritten = circle.length >= 2 && written.length === circle.length;
  const missingPlayers = phase === "writing" && lobby ? Object.keys(lobby.players).length !== circle.length || circle.some((id) => !(id in lobby.players)) : false;

  const moveIn = (i: number, by: -1 | 1) => {
    if (!code) return;
    const next = [...circle];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    void setLobby(code, { circle: next });
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(joinLink(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The link is on screen to copy by hand. */
    }
  };

  const start = async () => {
    if (!code || !lobby || !allWritten) return;
    const game = lobbyToGame(base, lobby, rules);
    await setLobby(code, { phase: "playing" });
    onStart(game.file, game.start);
  };

  const leave = () => {
    if (code) void closeLobby(code);
    onBack();
  };

  return (
    <main className="screen game-scope" style={{ "--game": base.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Close the lobby" onClick={() => setConfirmLeave(true)}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Headbands lobby</span>
      </header>

      <div className="setup">
        <div className="setup-intro">
          <p className="meta">{base.metadata.title}</p>
          <h1 className="page-title setup-title">Join on your phone</h1>
          {code ? (
            <div className="hb-join-info">
              {qr && <img className="hb-qr" src={qr} alt={`QR code to join room ${code}`} width={200} height={200} />}
              <div className="hb-join-text">
                <p className="meta">Room code</p>
                <p className="hb-code" aria-label={`Room code ${code.split("").join(" ")}`}>
                  {code}
                </p>
                <p className="hb-link">{joinLink(code)}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
                  {copied ? <Check size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />}
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
            </div>
          ) : (
            !problem && <p className="page-lede" role="status">Opening a room…</p>
          )}
          <div className="hb-howto">
            <p>Everyone scans the code, or opens Zuno, picks Headbands and types the room code. Each player then writes, or uploads a picture, for the next player in the circle.</p>
            <p>Nobody sees what was written for them. During the game everyone asks, answers, guesses and follows the activity on their own phone.</p>
          </div>
          {problem && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>{problem}</p>
            </div>
          )}
        </div>

        <div className="setup-panel card">
          <div className="setup-field">
            <span className="setup-label" id="lobby-mode">
              Players write
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="lobby-mode" data-nav-row="1">
              {(
                [
                  ["text", "Text, any topic"],
                  ["image", "A picture with its answer"],
                ] as Array<[HeadbandsMode, string]>
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={lobby?.mode === m}
                  disabled={!code || phase !== "lobby"}
                  className={`segment${lobby?.mode === m ? " is-active" : ""}`}
                  onClick={() => code && void setLobby(code, { mode: m })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="setup-field">
            <div className="setup-row">
              <span className="setup-label">
                Circle · {circle.length} {circle.length === 1 ? "player" : "players"}
              </span>
              {phase === "lobby" && circle.length > 2 && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => code && void setLobby(code, { circle: shuffle(circle) })}>
                  <Shuffle size={16} strokeWidth={1.5} />
                  Shuffle
                </button>
              )}
            </div>
            {circle.length === 0 ? (
              <p className="meta">Nobody has joined yet.</p>
            ) : (
              <ol className="hb-circle">
                {pairs.length === 0 && circle.length === 1 && (
                  <li className="hb-circle-row">
                    <span className="team-index">1</span>
                    <span className="hb-circle-who">{nameOf(circle[0])}</span>
                  </li>
                )}
                {pairs.map(({ writer, target }) => {
                  const id = circle[writer];
                  const done = written.includes(id);
                  return (
                    <li key={id} className="hb-circle-row" data-nav-row={10 + writer}>
                      <span className="team-index">{writer + 1}</span>
                      <span className="hb-circle-who">
                        <strong>{nameOf(id)}</strong> writes for {nameOf(circle[target])}
                      </span>
                      {phase === "writing" ? (
                        <span className={`hb-circle-status${done ? " is-done" : ""}`}>{done ? "Written" : "Writing…"}</span>
                      ) : (
                        <span className="hb-circle-tools">
                          <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${nameOf(id)} earlier`} disabled={writer === 0} onClick={() => moveIn(writer, -1)}>
                            <ArrowUp size={16} strokeWidth={1.5} />
                          </button>
                          <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${nameOf(id)} later`} disabled={writer === circle.length - 1} onClick={() => moveIn(writer, 1)}>
                            <ArrowDown size={16} strokeWidth={1.5} />
                          </button>
                          <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove ${nameOf(id)}`} onClick={() => code && void leaveLobby(code, id)}>
                            <UserMinus size={16} strokeWidth={1.5} />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <span className="field-hint">The order is also the turn order. The last player writes for the first.</span>
          </div>

          <div className="setup-field">
            <span className="setup-label">Rules</span>
            <label className="switch" data-nav-row="40">
              <span>
                Continue after Yes
                <span className="field-hint switch-hint">When the group answers Yes, the same player asks again.</span>
              </span>
              <input type="checkbox" checked={rules.continueAfterYes} onChange={(e) => setRules((r) => ({ ...r, continueAfterYes: e.target.checked }))} />
              <span className="switch-track" />
            </label>
            <label className="switch" data-nav-row="41">
              <span>
                Unlimited guesses
                <span className="field-hint switch-hint">A wrong guess keeps the turn.</span>
              </span>
              <input type="checkbox" checked={rules.unlimitedGuesses} onChange={(e) => setRules((r) => ({ ...r, unlimitedGuesses: e.target.checked }))} />
              <span className="switch-track" />
            </label>
          </div>

          {tooMany && (
            <div className="notice notice-error">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>Headbands allows up to {HEADBANDS_LIMITS.maxPlayers} players. Remove {circle.length - HEADBANDS_LIMITS.maxPlayers}.</p>
            </div>
          )}
          {missingPlayers && (
            <div className="notice notice-error">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>Someone joined or left while writing. Go back to the lobby to fix the circle.</p>
            </div>
          )}

          <div className="setup-actions hb-lobby-actions" data-nav-row="50">
            {phase === "lobby" && (
              <button type="button" className="btn btn-primary" data-autofocus disabled={!code || circle.length < 2 || tooMany} onClick={() => code && void setLobby(code, { phase: "writing", entries: null })}>
                Everyone, start writing
              </button>
            )}
            {phase === "writing" && (
              <>
                <button type="button" className="btn btn-quiet" onClick={() => code && void setLobby(code, { phase: "lobby", entries: null })}>
                  <RotateCcw size={18} strokeWidth={1.5} />
                  Back to lobby
                </button>
                <button type="button" className="btn btn-primary" disabled={!allWritten || missingPlayers} onClick={() => void start()}>
                  <Play size={18} strokeWidth={1.5} />
                  {allWritten ? "Start game" : `${written.length} of ${circle.length} written`}
                </button>
              </>
            )}
          </div>
          {phase === "lobby" && circle.length < 2 && <p className="field-hint">At least 2 players need to join.</p>}
        </div>
      </div>

      {confirmLeave && <ConfirmDialog title="Close the lobby?" text="Everyone in it is disconnected and the room code stops working." confirmLabel="Close lobby" danger onConfirm={leave} onClose={() => setConfirmLeave(false)} />}
    </main>
  );
}
