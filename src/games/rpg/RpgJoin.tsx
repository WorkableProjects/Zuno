import { useEffect, useRef, useState } from "react";
import { useRegisterSoundboard } from "../../lib/soundboard";
import { ArrowLeft, Check, CircleAlert, LogIn } from "lucide-react";
import { Avatar, AvatarPicker } from "../../components/avatar/AvatarView";
import { loadAvatar, saveAvatar } from "../../components/avatar/avatarData";
import { useEscape } from "../../components/navigation/spatialNav";
import { formatCoins } from "../../game-files/schema/rpg";
import { normalizeCode, playerId } from "../headbands/lobby";
import { adoptSeatId, clearSeat, loadSeat, saveSeat } from "../../lib/rejoin";
import { RpgOnlinePlay } from "./RpgOnlinePlay";
import { RpgTitle } from "./RpgTitle";
import { isStaleOnline, joinRpgLobby, keepRpgSeat, leaveRpgLobby, orderedPlayers, releaseRpgSeat, rpgLobbyExists, setRpgReady, watchRpgLobby, type RpgLobbyState } from "./rpgLobby";
import "../headbands/headbands.css";
import "./rpg.css";

interface Props {
  code: string | null;
  /** Set when the player already entered a name on another join screen. */
  name?: string;
  onExit: () => void;
}

const NAME_KEY = "zuno.hb.name";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

const seatAtLoad = loadSeat("rpg");

/** A player's phone in an online Rock Paper Gamble room. */
export function RpgJoin({ code: linkCode, name: givenName, onExit }: Props) {
  const resume = !givenName && seatAtLoad && (!linkCode || linkCode === seatAtLoad.code) ? seatAtLoad : null;
  if (resume) adoptSeatId(resume);
  const me = playerId();
  const [code, setCode] = useState(linkCode ?? "");
  const [name, setName] = useState(givenName ?? savedName());
  const [avatar, setAvatar] = useState(loadAvatar);
  const [joined, setJoined] = useState<string | null>(null);
  const [lobby, setLobby] = useState<RpgLobbyState | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEscape(onExit);
  useRegisterSoundboard(joined ? `rpg/${joined}` : null);

  useEffect(() => {
    if (!joined) return;
    // Drop broadcasts older than the game already on screen.
    return watchRpgLobby(joined, (next) => setLobby((prev) => (next && prev?.game && next.game && isStaleOnline(prev.game, next.game) ? { ...next, game: prev.game } : next)), setProblem);
  }, [joined]);

  const join = async (c: string, n: string) => {
    if (c.length !== 5 || n.trim() === "") return;
    setBusy(true);
    setProblem(null);
    try {
      if (!(await rpgLobbyExists(c))) {
        clearSeat("rpg");
        setProblem(`There is no open room ${c}. Check the code on the host's screen.`);
        return;
      }
      await joinRpgLobby(c, me, n, avatar);
      saveAvatar(avatar);
      try {
        localStorage.setItem(NAME_KEY, n.trim());
      } catch {
        /* optional */
      }
      saveSeat("rpg", { code: c, name: n.trim(), extra: `id:${me}` });
      setJoined(c);
    } catch (e) {
      const started = e instanceof Error && e.message.startsWith("That game");
      if (started) clearSeat("rpg");
      setProblem(started ? "That game has already started. Ask the host to open a new room." : "Could not reach the room. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // Arriving from the shared Join screen: the code and name are already known.
  useEffect(() => {
    if (givenName && linkCode) void join(linkCode, givenName);
    else if (resume) void join(resume.code, resume.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the game starts a dropped connection keeps the seat. Back in the lobby it gives it up again.
  const wasPlaying = useRef(false);
  const phase = lobby?.phase;
  const seatedNow = !!joined && !!lobby && me in lobby.players;
  useEffect(() => {
    if (!joined || !seatedNow) return;
    if (phase === "playing" && !wasPlaying.current) {
      wasPlaying.current = true;
      void keepRpgSeat(joined, me).catch(() => undefined);
    } else if (phase === "lobby" && wasPlaying.current) {
      wasPlaying.current = false;
      void releaseRpgSeat(joined, me).catch(() => undefined);
    }
  }, [joined, me, phase, seatedNow]);

  const removed = joined && lobby && !(me in lobby.players);
  const playing = joined && lobby && !removed && lobby.phase === "playing" && lobby.game;
  const players = lobby ? orderedPlayers(lobby) : [];
  const mine = lobby?.players[me];

  return (
    <main className={`screen game-scope${playing ? " rpg-online-screen" : ""}`} style={{ "--game": "#7C3AED" } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button
          type="button"
          className="icon-btn"
          aria-label="Leave"
          onClick={() => {
            if (joined) void leaveRpgLobby(joined, me).catch(() => undefined);
            clearSeat("rpg");
            onExit();
          }}
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Rock Paper Gamble{joined ? ` · Room ${joined}` : ""}</span>
      </header>

      {playing && lobby?.game ? (
        <RpgOnlinePlay code={joined!} me={me} lobby={lobby} game={lobby.game} />
      ) : (
        <div className="hb-phone">
          {problem && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>{problem}</p>
            </div>
          )}
          {!joined && (
            <form
              className="card hb-phone-card"
              onSubmit={(e) => {
                e.preventDefault();
                void join(normalizeCode(code), name);
              }}
            >
              <RpgTitle className="rpg-title-sm" />
              <label className="field">
                <span className="field-label">Room code</span>
                <input className="input input-lg hb-code-input" value={code} maxLength={5} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCDE" onChange={(e) => setCode(normalizeCode(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">Your name</span>
                <input className="input input-lg" value={name} maxLength={24} autoComplete="nickname" autoFocus={!!linkCode} onChange={(e) => setName(e.target.value)} />
              </label>
              <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
              <button type="submit" className="btn btn-primary" disabled={busy || normalizeCode(code).length !== 5 || name.trim() === ""}>
                <LogIn size={18} strokeWidth={1.5} />
                {busy ? "Joining…" : "Join"}
              </button>
            </form>
          )}
          {joined && lobby === undefined && (
            <p className="meta" role="status">
              Connecting…
            </p>
          )}
          {joined && (lobby === null || removed) && (
            <div className="card hb-phone-card">
              <h1 className="page-title">{removed ? "You left the room" : "The room has closed"}</h1>
              <button type="button" className="btn btn-primary" onClick={onExit}>
                Back to Zuno
              </button>
            </div>
          )}
          {joined && lobby && !removed && !playing && (
            <div className="card hb-phone-card" role="status">
              <p className="meta">You're in, {mine?.name}</p>
              <RpgTitle className="rpg-title-sm" />
              <p className="page-lede">
                {lobby.phase === "playing" ? "The game is starting…" : `Everyone starts with ${lobby.startingMoney ? formatCoins(lobby.startingMoney) : "the same money"}. Ready up, then wait for the host to start.`}
              </p>
              <ol className="rpg-players">
                {players.map((p, i) => (
                  <li key={p.id} className={p.id === me ? "is-turn" : ""}>
                    <span className="rpg-rank">{i + 1}</span>
                    <Avatar name={p.name} avatar={p.avatar} size={34} />
                    <span className="rpg-grow">
                      {p.name}
                      {p.id === me && <span className="meta"> · you</span>}
                    </span>
                    <span className={`rpg-status${p.ready ? " is-ready" : ""}`}>{p.ready ? "Ready" : "Not ready"}</span>
                  </li>
                ))}
              </ol>
              <button type="button" className={`btn ${mine?.ready ? "btn-secondary" : "btn-primary"}`} aria-pressed={!!mine?.ready} onClick={() => void setRpgReady(joined, me, !mine?.ready).catch(() => setProblem("Could not update your ready state."))}>
                <Check size={18} strokeWidth={1.5} />
                {mine?.ready ? "Ready. Tap to cancel" : "Ready up"}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
