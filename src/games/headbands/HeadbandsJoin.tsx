import { useEffect, useState } from "react";
import { useRegisterRoom } from "../../lib/room";
import { ArrowLeft, CircleAlert, CircleCheck, EyeOff, LogIn } from "lucide-react";
import { HEADBANDS_LIMITS } from "../../game-files/schema/headbands";
import { IdentityImageField } from "../../components/builder/IdentityImageField";
import { AvatarPicker } from "../../components/avatar/AvatarView";
import { loadAvatar, saveAvatar } from "../../components/avatar/avatarData";
import { useEscape } from "../../components/navigation/spatialNav";
import { IdentityCard } from "./IdentityCard";
import { PhoneGame } from "./PhoneGame";
import { useHeadbandsSounds } from "./useHeadbandsSounds";
import { useJoinSound } from "../../lib/useGameSounds";
import { customIdentityProblems } from "./headbandsEngine";
import { adoptSeatId, clearSeat, loadSeat, saveSeat } from "../../lib/rejoin";
import { isNewerRevision } from "./headbandsEngine";
import { joinLobby, leaveLobby, lobbyExists, normalizeCode, playerId, submitEntry, watchLobby, type LobbyEntry, type LobbyState } from "./lobby";
import "../jeopardy/setup.css";
import "./headbands.css";
import { gameFontStyle } from "../gameFont";

interface Props {
  code: string | null;
  onExit: () => void;
  /** Called with a code that is not a Headbands room; resolves true when another game took it. */
  onOtherRoom?: (code: string, name: string) => Promise<boolean>;
}

const NAME_KEY = "zuno.hb.name";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

/** A player's phone: join a room, then write the identity for the next player. */
const seatAtLoad = loadSeat("headbands");

export function HeadbandsJoin({ code: linkCode, onExit, onOtherRoom }: Props) {
  if (seatAtLoad && (!linkCode || linkCode === seatAtLoad.code)) adoptSeatId(seatAtLoad);
  const me = playerId();
  const [code, setCode] = useState(linkCode ?? "");
  const [name, setName] = useState(savedName);
  const [avatar, setAvatar] = useState(loadAvatar);
  const [joined, setJoined] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEscape(onExit);
  // A kicked player gives up the room's chat identity.
  const removed = joined && lobby && !(me in lobby.players);
  useRegisterRoom(joined && !removed ? `hb/${joined}` : null, (seatAtLoad?.name ?? name).trim() || "Player");
  useHeadbandsSounds(lobby?.game);
  useJoinSound(lobby ? Object.keys(lobby.players).length : 0);

  useEffect(() => {
    if (!joined) return;
    // Ignore snapshots whose game is older than the one already shown.
    return watchLobby(
      joined,
      (next) =>
        setLobby((prev) => {
          if (!next || !prev?.game || !next.game) return next;
          return isNewerRevision(next.game as { revision?: number }, prev.game as { revision?: number }) || next.game.revision === prev.game.revision ? next : { ...next, game: prev.game };
        }),
      setProblem,
    );
  }, [joined]);

  // A refresh or reopened tab rejoins the saved room.
  useEffect(() => {
    if (seatAtLoad && (!linkCode || linkCode === seatAtLoad.code)) void join(seatAtLoad.code, seatAtLoad.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = async (rc?: string, rn?: string) => {
    const c = normalizeCode(rc ?? code);
    const nm = rn ?? name;
    if (c.length !== 5 || nm.trim() === "") return;
    setBusy(true);
    setProblem(null);
    try {
      if (!(await lobbyExists(c))) {
        saveAvatar(avatar);
        if (onOtherRoom && (await onOtherRoom(c, nm.trim()))) return;
        if (rc) clearSeat("headbands");
        setProblem(`There is no open room ${c}. Check the code on the host's screen.`);
        return;
      }
      await joinLobby(c, me, nm, avatar);
      saveAvatar(avatar);
      try {
        localStorage.setItem(NAME_KEY, nm.trim());
      } catch {
        /* optional */
      }
      saveSeat("headbands", { code: c, name: nm.trim(), extra: `id:${me}` });
      setJoined(c);
    } catch {
      setProblem("Could not reach the room. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    if (joined) void leaveLobby(joined, me);
    clearSeat("headbands");
    onExit();
  };

  const inCircle = lobby ? lobby.circle.indexOf(me) : -1;
  const target = lobby && inCircle !== -1 && lobby.circle.length >= 2 ? lobby.circle[(inCircle + 1) % lobby.circle.length] : null;
  const targetName = target && lobby ? (lobby.players[target]?.name ?? "the next player") : null;

  return (
    <main className="screen game-scope" style={{ "--game": "#FFB454", ...gameFontStyle("headbands") } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Leave" onClick={leave}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Headbands{joined ? ` · Room ${joined}` : ""}</span>
      </header>

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
              void join();
            }}
          >
            <h1 className="page-title">Join a game</h1>
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
                data-autofocus={linkCode ? undefined : ""}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Your name</span>
              <input className="input input-lg" value={name} maxLength={24} autoComplete="nickname" data-autofocus={linkCode ? "" : undefined} autoFocus={!!linkCode} onChange={(e) => setName(e.target.value)} />
            </label>
            <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
            <button type="submit" className="btn btn-primary" disabled={busy || normalizeCode(code).length !== 5 || name.trim() === ""}>
              <LogIn size={18} strokeWidth={1.5} />
              {busy ? "Joining…" : "Join"}
            </button>
          </form>
        )}

        {joined && lobby === undefined && <p className="meta" role="status">Connecting…</p>}

        {joined && (lobby === null || lobby?.phase === "over" || removed) && (
          <div className="card hb-phone-card">
            <h1 className="page-title">{removed ? "You left the room" : "The room has closed"}</h1>
            <button type="button" className="btn btn-primary" onClick={onExit}>
              Back to Zuno
            </button>
          </div>
        )}

        {joined && lobby && !removed && lobby.phase === "lobby" && (
          <div className="card hb-phone-card" role="status">
            <p className="meta">You're in, {lobby.players[me]?.name}</p>
            <h1 className="page-title">Waiting for the host</h1>
            <p className="page-lede">{targetName ? `Right now you'll write for ${targetName}. The host can still change the order.` : "The host is waiting for more players."}</p>
            <p className="meta">{lobby.mode === "image" ? "You'll pick a picture and write its answer." : "You'll write a word, name or phrase. Any topic."}</p>
          </div>
        )}

        {joined && lobby && !removed && lobby.phase === "writing" && target && targetName && (
          <WriteFor key={`${target}-${lobby.mode}`} code={joined} me={me} targetName={targetName} lobby={lobby} />
        )}
        {joined && lobby && !removed && lobby.phase === "writing" && !target && (
          <div className="card hb-phone-card" role="status">
            <h1 className="page-title">Hang on</h1>
            <p className="page-lede">You joined after writing started. The host can take everyone back to the lobby to add you.</p>
          </div>
        )}

        {joined && lobby && !removed && lobby.phase === "playing" &&
          (lobby.game ? (
            <PhoneGame code={joined} me={me} lobby={lobby} game={lobby.game} />
          ) : (
            <div className="card hb-phone-card" role="status">
              <EyeOff size={28} strokeWidth={1.5} />
              <h1 className="page-title">The game is starting</h1>
              <p className="page-lede">Your card stays hidden from you. Everyone else's shows up here.</p>
            </div>
          ))}
      </div>
    </main>
  );
}

export function WriteFor({ code, me, targetName, lobby }: { code: string; me: string; targetName: string; lobby: LobbyState }) {
  const saved = lobby.entries[me];
  const mode = lobby.mode;
  const [text, setText] = useState(saved?.text ?? "");
  const [image, setImage] = useState<string | null>(saved?.image ?? null);
  const [subtext, setSubtext] = useState(saved?.subtext ?? "");
  const [editing, setEditing] = useState(!saved);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const entry: LobbyEntry = mode === "image" ? { text: subtext.trim(), image, subtext: subtext.trim() } : { text: text.trim(), image: null, subtext: null };
  const problems = customIdentityProblems(entry, mode);

  const send = async () => {
    if (problems.length > 0) return;
    setSending(true);
    setProblem(null);
    try {
      await submitEntry(code, me, entry);
      setEditing(false);
    } catch {
      setProblem("That didn't send. If the picture is very large, try a smaller one.");
    } finally {
      setSending(false);
    }
  };

  if (!editing && saved) {
    return (
      <div className="card hb-phone-card" role="status">
        <p className="hb-sent">
          <CircleCheck size={20} strokeWidth={1.5} /> Sent for {targetName}
        </p>
        <IdentityCard identity={{ id: "mine", ...saved }} mode={mode} size="md" />
        <p className="meta">Keep this screen away from {targetName}. You can change it until the host starts the game.</p>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
          Change it
        </button>
      </div>
    );
  }

  return (
    <form
      className="card hb-phone-card"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <p className="meta">Don't let {targetName} see this screen</p>
      <h1 className="page-title">Write for {targetName}</h1>
      {mode === "text" ? (
        <label className="field">
          <span className="field-label">Who or what will {targetName} be?</span>
          <input className="input input-lg" value={text} maxLength={HEADBANDS_LIMITS.maxLabelLength} autoComplete="off" placeholder="A famous person, an animal, a food…" onChange={(e) => setText(e.target.value)} />
          <span className="field-hint">Anything the group would recognize. This is also the answer {targetName} has to guess.</span>
        </label>
      ) : (
        <>
          <IdentityImageField label="Picture" value={image} onChange={setImage} hint="Take a photo or pick one from your device. It is shrunk before sending." />
          <label className="field">
            <span className="field-label">Answer under the picture</span>
            <input className="input input-lg" value={subtext} maxLength={HEADBANDS_LIMITS.maxLabelLength} autoComplete="off" placeholder="What the picture shows" onChange={(e) => setSubtext(e.target.value)} />
            <span className="field-hint">{targetName} has to guess exactly this.</span>
          </label>
        </>
      )}
      {(mode === "text" ? text.trim() : image || subtext.trim()) && (
        <div className="hb-preview-item">
          <p className="field-label">Preview</p>
          <IdentityCard key={`${image?.length ?? 0}`} identity={{ id: "preview", ...entry }} mode={mode} size="md" />
        </div>
      )}
      {problem && (
        <div className="notice notice-error" role="alert">
          <CircleAlert size={18} strokeWidth={1.5} />
          <p>{problem}</p>
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={problems.length > 0 || sending}>
        {sending ? "Sending…" : saved ? "Send the change" : "Send it"}
      </button>
      {problems.length > 0 && (mode === "image" ? image || subtext : text) && <p className="field-hint">{problems.join(" ")}</p>}
    </form>
  );
}
