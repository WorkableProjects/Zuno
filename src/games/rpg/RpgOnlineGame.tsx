import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowLeft, Flag, RotateCcw, UserMinus } from "lucide-react";
import type { RpgFile, RpgSettings } from "../../game-files/schema/rpg";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { playerId } from "../headbands/lobby";
import { RpgOnlinePlay } from "./RpgOnlinePlay";
import { createSession, rpgReducer } from "./rpgEngine";
import { leaveRpgLobby, publishRpgGame, rpgMoveToAction, toRpgOnline, watchRpgLobby, watchRpgMoves, type RpgLobbyState, type RpgMove } from "./rpgLobby";
import "./rpg.css";

interface Props {
  file: RpgFile;
  code: string;
  /** Seated players in turn order. */
  players: Array<{ id: string; name: string }>;
  settings: RpgSettings;
  /** Back to the lobby for another game. */
  onAgain: () => void;
  onExit: () => void;
}

/** The host's device: runs the game clock and the rules, publishes the table, and plays like everyone else. */
export function RpgOnlineGame({ file, code, players, settings, onAgain, onExit }: Props) {
  const me = useMemo(() => playerId(), []);
  const [state, dispatch] = useReducer(rpgReducer, undefined, () => createSession(players, settings));
  const [lobby, setLobby] = useState<RpgLobbyState | null>(null);
  const [confirm, setConfirm] = useState<null | "exit" | "end">(null);
  const [manage, setManage] = useState(false);

  useEffect(() => watchRpgLobby(code, setLobby, () => undefined), [code]);

  // The clock. It counts real time so a busy or throttled tab catches up instead of stretching the timers.
  useEffect(() => {
    let last = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      let owed = Math.min(Math.floor((now - last) / 1000), 30);
      last += Math.floor((now - last) / 1000) * 1000;
      while (owed-- > 0) dispatch({ type: "tick" });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  // Moves from phones. The sender is the inbox the move came from.
  const seated = useMemo(() => players.map((p) => p.id), [players]);
  const apply = useCallback((by: string, move: unknown) => {
    const action = rpgMoveToAction(move, by);
    if (action) dispatch(action);
  }, []);
  useEffect(() => watchRpgMoves(code, seated, apply), [code, seated, apply]);

  // A player whose seat disappeared has left.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (!lobby) return;
    for (const p of stateRef.current.players) if (!p.removed && !(p.id in lobby.players)) dispatch({ type: "removePlayer", id: p.id });
  }, [lobby]);

  const online = useMemo(() => toRpgOnline(state), [state]);
  const published = useMemo(() => JSON.stringify(online), [online]);
  useEffect(() => {
    void publishRpgGame(code, JSON.parse(published)).catch(() => undefined);
  }, [code, published]);

  const done = state.phase === "over";
  const hostControls = (
    <section className="card rpg-block rpg-host" aria-label="Host controls">
      <h2 className="aside-title">Host</h2>
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
        <div className="rpg-tools">
          <button type="button" className="btn btn-quiet btn-sm" aria-expanded={manage} onClick={() => setManage((v) => !v)}>
            <UserMinus size={16} strokeWidth={1.5} />
            Remove…
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm("end")}>
            <Flag size={16} strokeWidth={1.5} />
            End game
          </button>
        </div>
      )}
      {manage && !done && (
        <ul className="rpg-manage">
          {state.players
            .filter((p) => p.id !== me && !p.removed)
            .map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    dispatch({ type: "removePlayer", id: p.id });
                    void leaveRpgLobby(code, p.id).catch(() => undefined);
                  }}
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
    <main className="screen game-scope rpg-game rpg-online-screen" style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Exit to dashboard" onClick={() => (done ? onExit() : setConfirm("exit"))}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">
          {file.metadata.title} · Room {code}
        </span>
      </header>
      {lobby ? (
        <RpgOnlinePlay code={code} me={me} lobby={lobby} game={online} onMove={(m: RpgMove) => apply(me, m)} host={hostControls} />
      ) : (
        <p className="meta" role="status">
          Connecting…
        </p>
      )}
      {confirm === "exit" && <ConfirmDialog title="Leave this game?" text="The room closes for everyone." confirmLabel="Leave game" danger onConfirm={onExit} onClose={() => setConfirm(null)} />}
      {confirm === "end" && (
        <ConfirmDialog title="End the game now?" text="Stakes in a duel are refunded and everyone sees the final standings." confirmLabel="End game" danger onConfirm={() => dispatch({ type: "endGame" })} onClose={() => setConfirm(null)} />
      )}
    </main>
  );
}
