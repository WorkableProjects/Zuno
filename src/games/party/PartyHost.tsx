import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowLeft, Flag, RotateCcw, UserMinus } from "lucide-react";
import { useRegisterRoom } from "../../lib/room";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { playerId } from "../headbands/lobby";
import { PartyPlayer } from "./PartyPlayer";
import { leavePartyRoom, publishPartyGame, publishPartyPrivate, watchPartyMoves, watchPartyRoom, type PartyLobbyState } from "./partyRoom";
import type { AnyPartyDef, PartyAction, Published } from "./types";
import "../rpg/rpg.css";
import "./party.css";
import { gameFontStyle } from "../gameFont";

interface Props {
  def: AnyPartyDef;
  code: string;
  players: Array<{ id: string; name: string }>;
  settings: unknown;
  onAgain: () => void;
  onExit: () => void;
}

type Wrapped = { s: unknown; rev: number };

/** The host's device: runs the clock and the rules, publishes the table, and plays like everyone else. */
export function PartyHost({ def, code, players, settings, onAgain, onExit }: Props) {
  const me = useMemo(() => playerId(), []);
  const kind = def.kind;
  useRegisterRoom(`${kind}/${code}`, "Host");
  const reducer = useCallback(
    (w: Wrapped, a: PartyAction): Wrapped => {
      const next = def.reduce(w.s, a);
      return next === w.s ? w : { s: next, rev: w.rev + 1 };
    },
    [def],
  );
  const [wrapped, dispatch] = useReducer(reducer, undefined, () => ({ s: def.create(players, settings, Math.floor(Math.random() * 2 ** 31)), rev: 0 }));
  const state = wrapped.s;
  const [lobby, setLobby] = useState<PartyLobbyState<Published<unknown>> | null>(null);
  const [confirm, setConfirm] = useState<null | "exit" | "end">(null);
  const [manage, setManage] = useState(false);

  useEffect(() => watchPartyRoom<Published<unknown>>(kind, code, setLobby, () => undefined), [code, kind]);

  // The clock counts real time so a throttled tab catches up instead of stretching timers.
  useEffect(() => {
    let last = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const whole = Math.floor((now - last) / 1000);
      let owed = Math.min(whole, 30);
      last += whole * 1000;
      while (owed-- > 0) dispatch({ type: "tick" });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const seated = useMemo(() => players.map((p) => p.id), [players]);
  const apply = useCallback((by: string, move: unknown) => {
    if (move && typeof move === "object") dispatch({ type: "move", by, move: move as Record<string, unknown> });
  }, []);
  useEffect(() => watchPartyMoves(kind, code, seated, apply), [code, seated, apply, kind]);

  // A player whose seat disappeared has left.
  const removedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!lobby) return;
    for (const id of seated) {
      if (!(id in lobby.players) && !removedRef.current.has(id)) {
        removedRef.current.add(id);
        dispatch({ type: "remove", id });
      }
    }
  }, [lobby, seated]);

  const online = useMemo(() => ({ ...def.toOnline(state), rev: wrapped.rev }), [def, state, wrapped.rev]);
  const published = useMemo(() => JSON.stringify(online), [online]);
  useEffect(() => {
    void publishPartyGame(kind, code, published).catch(() => undefined);
  }, [code, published, kind]);

  const sentPrivate = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const id of seated) {
      if (id === me) continue;
      const json = JSON.stringify(def.privateOf(state, id));
      if (sentPrivate.current[id] === json) continue;
      sentPrivate.current[id] = json;
      void publishPartyPrivate(kind, code, id, json).catch(() => undefined);
    }
  }, [state, code, me, seated, def, kind]);
  const myPrivate = useMemo(() => def.privateOf(state, me), [def, state, me]);

  const done = def.isOver(state);
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
          {players
            .filter((p) => p.id !== me && !removedRef.current.has(p.id))
            .map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    removedRef.current.add(p.id);
                    dispatch({ type: "remove", id: p.id });
                    void leavePartyRoom(kind, code, p.id).catch(() => undefined);
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
    <main className="screen game-scope party-scope rpg-online-screen" style={{ "--game": def.accent, ...gameFontStyle(def.gameType) } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Exit to dashboard" onClick={() => (done ? onExit() : setConfirm("exit"))}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">
          {def.title} · Room {code}
        </span>
      </header>
      {lobby ? (
        <PartyPlayer def={def} code={code} me={me} lobby={lobby} game={online} onMove={(m) => apply(me, m)} priv={myPrivate} host={hostControls} />
      ) : (
        <p className="meta" role="status">
          Connecting…
        </p>
      )}
      {confirm === "exit" && <ConfirmDialog title="Leave this game?" text="The room closes for everyone." confirmLabel="Leave game" danger onConfirm={onExit} onClose={() => setConfirm(null)} />}
      {confirm === "end" && <ConfirmDialog title="End the game now?" text={def.endText} confirmLabel="End game" danger onConfirm={() => dispatch({ type: "end" })} onClose={() => setConfirm(null)} />}
    </main>
  );
}
