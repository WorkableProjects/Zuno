import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CircleAlert, LogIn } from "lucide-react";
import { useRegisterRoom } from "../../lib/room";
import { Avatar, AvatarPicker } from "../../components/avatar/AvatarView";
import { loadAvatar, saveAvatar } from "../../components/avatar/avatarData";
import { useEscape } from "../../components/navigation/spatialNav";
import { adoptSeatId, clearSeat, loadSeat, saveSeat } from "../../lib/rejoin";
import { normalizeCode, playerId } from "../headbands/lobby";
import { PartyPlayer } from "./PartyPlayer";
import { PartyTitle } from "./PartyLobby";
import { joinPartyRoom, keepPartySeat, leavePartyRoom, orderedPartyPlayers, partyRoomExists, releasePartySeat, setPartyReady, watchPartyRoom, type PartyLobbyState } from "./partyRoom";
import type { AnyPartyDef, Published } from "./types";
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

interface Props {
  def: AnyPartyDef;
  code: string | null;
  name?: string;
  onExit: () => void;
}

/** A player's phone in an online party game room. */
export function PartyJoin({ def, code: linkCode, name: givenName, onExit }: Props) {
  const kind = def.kind;
  const [seatAtLoad] = useState(() => loadSeat(kind));
  const resume = !givenName && seatAtLoad && (!linkCode || linkCode === seatAtLoad.code) ? seatAtLoad : null;
  if (resume) adoptSeatId(resume);
  const me = playerId();
  const [code, setCode] = useState(linkCode ?? "");
  const [name, setName] = useState(givenName ?? savedName());
  const [avatar, setAvatar] = useState(loadAvatar);
  const [joined, setJoined] = useState<string | null>(null);
  const [lobby, setLobby] = useState<PartyLobbyState<Published<unknown>> | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEscape(onExit);
  const removed = joined && lobby && !(me in lobby.players);
  useRegisterRoom(joined && !removed ? `${kind}/${joined}` : null, (resume?.name ?? name).trim() || "Player");

  useEffect(() => {
    if (!joined) return;
    // Drop broadcasts older than the game already on screen.
    return watchPartyRoom<Published<unknown>>(kind, joined, (next) => setLobby((prev) => (next && prev?.game && next.game && next.game.rev < prev.game.rev ? { ...next, game: prev.game } : next)), setProblem);
  }, [joined, kind]);

  const join = async (c: string, n: string) => {
    if (c.length !== 5 || n.trim() === "") return;
    setBusy(true);
    setProblem(null);
    try {
      if (!(await partyRoomExists(kind, c))) {
        clearSeat(kind);
        setProblem(`There is no open room ${c}. Check the code on the host's screen.`);
        return;
      }
      await joinPartyRoom(kind, c, me, n, avatar);
      saveAvatar(avatar);
      try {
        localStorage.setItem(NAME_KEY, n.trim());
      } catch {
        /* optional */
      }
      saveSeat(kind, { code: c, name: n.trim(), extra: `id:${me}` });
      setJoined(c);
    } catch (e) {
      const started = e instanceof Error && e.message.startsWith("That game");
      if (started) clearSeat(kind);
      setProblem(started ? "That game has already started. Ask the host to open a new room." : "Could not reach the room. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (givenName && linkCode) void join(linkCode, givenName);
    else if (resume) void join(resume.code, resume.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wasPlaying = useRef(false);
  const phase = lobby?.phase;
  const seatedNow = !!joined && !!lobby && me in lobby.players;
  useEffect(() => {
    if (!joined || !seatedNow) return;
    if (phase === "playing" && !wasPlaying.current) {
      wasPlaying.current = true;
      void keepPartySeat(kind, joined, me).catch(() => undefined);
    } else if (phase === "lobby" && wasPlaying.current) {
      wasPlaying.current = false;
      void releasePartySeat(kind, joined, me).catch(() => undefined);
    }
  }, [joined, me, phase, seatedNow, kind]);

  const playing = joined && lobby && !removed && lobby.phase === "playing" && lobby.game;
  const players = lobby ? orderedPartyPlayers(lobby) : [];
  const mine = lobby?.players[me];

  return (
    <main className={`screen game-scope party-scope${playing ? " rpg-online-screen" : ""}`} style={{ "--game": def.accent, ...gameFontStyle(def.gameType) } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button
          type="button"
          className="icon-btn"
          aria-label="Leave"
          onClick={() => {
            if (joined) void leavePartyRoom(kind, joined, me).catch(() => undefined);
            clearSeat(kind);
            onExit();
          }}
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">
          {def.title}
          {joined ? ` · Room ${joined}` : ""}
        </span>
      </header>

      {playing && lobby?.game ? (
        <PartyPlayer def={def} code={joined!} me={me} lobby={lobby} game={lobby.game} />
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
              <PartyTitle text={def.title} className="rpg-title-sm" />
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
              <PartyTitle text={def.title} className="rpg-title-sm" />
              <p className="page-lede">{lobby.phase === "playing" ? "The game is starting…" : `${lobby.note ? `${lobby.note}. ` : ""}Ready up, then wait for the host to start.`}</p>
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
              <button type="button" className={`btn ${mine?.ready ? "btn-secondary" : "btn-primary"}`} aria-pressed={!!mine?.ready} onClick={() => void setPartyReady(kind, joined, me, !mine?.ready).catch(() => setProblem("Could not update your ready state."))}>
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
