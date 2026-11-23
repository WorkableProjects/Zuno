import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useRegisterSoundboard } from "../../lib/soundboard";
import {
  ArrowLeft,
  Flag,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  UserMinus,
} from "lucide-react";
import type { LiarFile } from "../../game-files/schema/liar";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { playerId } from "../headbands/lobby";
import { LiarOnlinePlay } from "./LiarOnlinePlay";
import {
  activePlayers,
  allVotesIn,
  createSessionWith,
  liarReducer,
  votesIn,
  type Options,
  type Player,
} from "./liarEngine";
import {
  liarMoveToAction,
  publishLiarGame,
  toLiarOnline,
  watchLiarLobby,
  watchLiarMoves,
  type LiarLobbyState,
  type LiarMove,
} from "./liarLobby";
import "./liar.css";

interface Props {
  file: LiarFile;
  code: string;
  players: Player[];
  options: Options;
  /** Back to the lobby for another game. */
  onAgain: () => void;
  onExit: () => void;
}

/** The host's device: runs the game, publishes it, and plays like everyone else. */
export function LiarOnlineGame({
  file,
  code,
  players,
  options,
  onAgain,
  onExit,
}: Props) {
  const me = useMemo(() => playerId(), []);
  useRegisterSoundboard(`liar/${code}`);
  const [state, dispatch] = useReducer(liarReducer, undefined, () =>
    createSessionWith(players, options),
  );
  const [lobby, setLobby] = useState<LiarLobbyState | null>(null);
  const [confirm, setConfirm] = useState<null | "exit" | "end" | "skip">(null);
  const [manage, setManage] = useState(false);

  useEffect(() => watchLiarLobby(code, setLobby, () => undefined), [code]);

  // Moves are checked against the latest state.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const apply = useCallback(
    (by: string, move: LiarMove) => {
      const action = liarMoveToAction(move, by, stateRef.current);
      if (action) dispatch(action);
    },
    [stateRef],
  );
  useEffect(() => watchLiarMoves(code, apply), [code, apply]);

  const online = useMemo(() => toLiarOnline(state), [state]);
  const published = useMemo(() => JSON.stringify(online), [online]);
  useEffect(() => {
    void publishLiarGame(code, JSON.parse(published)).catch(() => undefined);
  }, [code, published]);

  const done = state.phase === "done";
  const hostControls = (
    <section
      className="card liar-online-block liar-online-host"
      aria-label="Host controls"
    >
      <h2 className="aside-title">Host</h2>
      {state.phase === "discuss" && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => dispatch({ type: "startVoting" })}
        >
          Start voting
        </button>
      )}
      {state.phase === "vote" && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={votesIn(state) === 0}
          onClick={() => dispatch({ type: "closeVoting" })}
        >
          {allVotesIn(state)
            ? "Reveal the lie"
            : `Close voting early (${votesIn(state)} in)`}
        </button>
      )}
      {state.phase === "reveal" && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => dispatch({ type: "next" })}
        >
          Next storyteller
        </button>
      )}
      {done ? (
        <>
          <button type="button" className="btn btn-primary" onClick={onAgain}>
            <RotateCcw size={18} strokeWidth={1.5} />
            Back to the lobby
          </button>
          <button type="button" className="btn btn-quiet" onClick={onExit}>
            Return to Zuno
          </button>
        </>
      ) : (
        <div className="liar-tools">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => dispatch({ type: "pause", paused: !state.paused })}
          >
            {state.paused ? (
              <Play size={16} strokeWidth={1.5} />
            ) : (
              <Pause size={16} strokeWidth={1.5} />
            )}
            {state.paused ? "Resume" : "Pause"}
          </button>
          {state.phase !== "reveal" && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setConfirm("skip")}
            >
              <SkipForward size={16} strokeWidth={1.5} />
              Skip turn
            </button>
          )}
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-expanded={manage}
            onClick={() => setManage((v) => !v)}
          >
            <UserMinus size={16} strokeWidth={1.5} />
            Remove…
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setConfirm("end")}
          >
            <Flag size={16} strokeWidth={1.5} />
            End game
          </button>
        </div>
      )}
      {manage && !done && (
        <ul className="liar-players">
          {activePlayers(state)
            .filter((p) => p.id !== me)
            .map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => dispatch({ type: "removePlayer", id: p.id })}
                >
                  Remove {p.name}
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );

  return (
    <main
      className="screen game-scope liar-game liar-online-screen"
      style={{ "--game": file.appearance.accentColor } as React.CSSProperties}
    >
      <header className="screen-bar" data-nav-row="0">
        <button
          type="button"
          className="icon-btn"
          aria-label="Exit to dashboard"
          onClick={() => (done ? onExit() : setConfirm("exit"))}
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">
          {file.metadata.title} · Room {code}
        </span>
      </header>
      {lobby ? (
        <LiarOnlinePlay
          code={code}
          me={me}
          lobby={lobby}
          game={online}
          prompts={file.content.questionPrompts.map((p) => p.text)}
          onMove={(m) => apply(me, m)}
          host={hostControls}
        />
      ) : (
        <p className="meta" role="status">
          Connecting…
        </p>
      )}
      {confirm === "exit" && (
        <ConfirmDialog
          title="Leave this game?"
          text="The room closes for everyone."
          confirmLabel="Leave game"
          danger
          onConfirm={onExit}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "end" && (
        <ConfirmDialog
          title="End the game now?"
          text="Everyone sees the final scores."
          confirmLabel="End game"
          danger
          onConfirm={() => dispatch({ type: "end" })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "skip" && (
        <ConfirmDialog
          title="Skip this storyteller?"
          text="Their turn is dropped."
          confirmLabel="Skip turn"
          onConfirm={() => dispatch({ type: "skipTurn" })}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}
