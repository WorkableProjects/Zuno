import { useEffect, useState } from "react";
import { useRegisterRoom } from "../../lib/room";
import { ArrowLeft, CircleAlert, LogIn } from "lucide-react";
import { AvatarPicker } from "../../components/avatar/AvatarView";
import { loadAvatar, saveAvatar } from "../../components/avatar/avatarData";
import { useEscape } from "../../components/navigation/spatialNav";
import { normalizeCode, playerId } from "../headbands/lobby";
import { LiarOnlinePlay } from "./LiarOnlinePlay";
import {
  joinLiarLobby,
  leaveLiarLobby,
  liarLobbyExists,
  watchLiarLobby,
  type LiarLobbyState,
} from "./liarLobby";
import { adoptSeatId, clearSeat, loadSeat, saveSeat } from "../../lib/rejoin";
import { isStaleOnline } from "./liarLobby";
import "../headbands/headbands.css";
import "./liar.css";

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

/** A player's phone in an online LIAR room. */
const seatAtLoad = loadSeat("liar");

export function LiarJoin({ code: linkCode, name: givenName, onExit }: Props) {
  const resume = !givenName && seatAtLoad && (!linkCode || linkCode === seatAtLoad.code) ? seatAtLoad : null;
  if (resume) adoptSeatId(resume);
  const me = playerId();
  const [code, setCode] = useState(linkCode ?? "");
  const [name, setName] = useState(givenName ?? savedName());
  const [avatar, setAvatar] = useState(loadAvatar);
  const [joined, setJoined] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LiarLobbyState | null | undefined>(
    undefined,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEscape(onExit);
  // A kicked player gives up the room's chat identity.
  const removed = joined && lobby && !(me in lobby.players);
  useRegisterRoom(joined && !removed ? `liar/${joined}` : null, (resume?.name ?? name).trim() || "Player");

  useEffect(() => {
    if (!joined) return;
    // Drop broadcasts older than the game already on screen.
    return watchLiarLobby(
      joined,
      (next) => setLobby((prev) => (next && prev?.game && next.game && isStaleOnline(prev.game, next.game) ? { ...next, game: prev.game } : next)),
      setProblem,
    );
  }, [joined]);

  const join = async (c: string, n: string) => {
    if (c.length !== 5 || n.trim() === "") return;
    setBusy(true);
    setProblem(null);
    try {
      if (!(await liarLobbyExists(c))) {
        clearSeat("liar");
        setProblem(
          `There is no open room ${c}. Check the code on the host's screen.`,
        );
        return;
      }
      await joinLiarLobby(c, me, n, avatar);
      saveAvatar(avatar);
      try {
        localStorage.setItem(NAME_KEY, n.trim());
      } catch {
        /* optional */
      }
      saveSeat("liar", { code: c, name: n.trim(), extra: `id:${me}` });
      setJoined(c);
    } catch {
      setProblem(
        "Could not reach the room. Check your connection and try again.",
      );
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

  const playing =
    joined && lobby && !removed && lobby.phase === "playing" && lobby.game;

  return (
    <main
      className={`screen game-scope${playing ? " liar-online-screen" : ""}`}
      style={{ "--game": "#E85D75" } as React.CSSProperties}
    >
      <header className="screen-bar" data-nav-row="0">
        <button
          type="button"
          className="icon-btn"
          aria-label="Leave"
          onClick={() => {
            if (joined) void leaveLiarLobby(joined, me);
            clearSeat("liar");
            onExit();
          }}
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">
          LIAR{joined ? ` · Room ${joined}` : ""}
        </span>
      </header>

      {playing && lobby?.game ? (
        <LiarOnlinePlay
          code={joined!}
          me={me}
          lobby={lobby}
          game={lobby.game}
          prompts={[]}
        />
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
              <h1 className="page-title">Join LIAR</h1>
              <label className="field">
                <span className="field-label">Room code</span>
                <input
                  className="input input-lg hb-code-input"
                  value={code}
                  maxLength={5}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ABCDE"
                  onChange={(e) => setCode(normalizeCode(e.target.value))}
                />
              </label>
              <label className="field">
                <span className="field-label">Your name</span>
                <input
                  className="input input-lg"
                  value={name}
                  maxLength={24}
                  autoComplete="nickname"
                  autoFocus={!!linkCode}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  busy || normalizeCode(code).length !== 5 || name.trim() === ""
                }
              >
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
              <h1 className="page-title">
                {removed ? "You left the room" : "The room has closed"}
              </h1>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onExit}
              >
                Back to Zuno
              </button>
            </div>
          )}
          {joined && lobby && !removed && !playing && (
            <div className="card hb-phone-card" role="status">
              <p className="meta">You're in, {lobby.players[me]?.name}</p>
              <h1 className="page-title">Waiting for the host</h1>
              <p className="page-lede">
                {Object.keys(lobby.players).length} players in the room. When
                it's your turn you'll write two truths and a lie here,
                privately.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
