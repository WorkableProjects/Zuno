import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CircleCheck, Eye, EyeOff, Flag, Pause, Play, RotateCcw, SkipForward, Undo2, UserMinus, Users, X } from "lucide-react";
import type { HeadbandsFile } from "../../game-files/schema/headbands";
import { ZunoMark } from "../../components/brand/Logo";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog, Dialog } from "../../components/ui/Dialog";
import type { HeadbandsStart } from "./HeadbandsSetup";
import { IdentityCard } from "./IdentityCard";
import { ActivityLog } from "./ActivityLog";
import { moveToAction, publishGame, watchMoves, type OnlineGame } from "./lobby";
import {
  activePlayers,
  createSession,
  deckOf,
  getPlayer,
  nextUnsolved,
  sessionReducer,
  solvedCount,
  turnPosition,
  type GroupAnswer,
  type Player,
  type SessionAction,
  type SessionState,
} from "./headbandsEngine";
import "../jeopardy/jeopardy.css";
import "./headbands.css";

interface Props {
  file: HeadbandsFile;
  start: HeadbandsStart;
  /** Set when players joined from their phones: the game is published to the lobby. */
  lobbyCode?: string;
  /** Back to setup for a fresh deal. */
  onAgain: () => void;
  onExit: () => void;
}

type Confirm = "exit" | "restart" | "end" | "reveal" | { remove: string } | null;
type Dispatch = (action: SessionAction) => void;

const ANSWERS: Array<[GroupAnswer, string]> = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unsure", "Not sure"],
];

/** What the phones see. No identities and no undo history. */
function toOnline(state: SessionState): OnlineGame {
  return {
    phase: state.phase,
    mode: state.mode,
    rules: state.rules,
    turn: state.turn,
    current: state.current,
    paused: state.paused,
    revealed: state.revealed,
    endedEarly: state.endedEarly,
    order: state.order,
    players: state.players.map(({ id, name, solved, solvedOrder, byHost, removed, questions, guesses }) => ({ id, name, solved, solvedOrder, byHost, removed, questions, guesses })),
    pending: state.pending,
    lastGuess: state.lastGuess,
    log: state.log,
  };
}

export function HeadbandsGame({ file, start, lobbyCode, onAgain, onExit }: Props) {
  const deck = useMemo(() => deckOf(file.content.identities), [file]);
  const reducer = useCallback((state: SessionState, action: SessionAction) => sessionReducer(deck, state, action), [deck]);
  const [state, dispatch] = useReducer(reducer, null, () => createSession(start.players, start.mode, start.rules));
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [guessOpen, setGuessOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  const current = getPlayer(state, state.current);
  const solved = solvedCount(state);
  const total = state.players.filter((p) => !p.removed).length;

  // Online: publish every change, and apply the moves players send from their phones.
  const published = useMemo(() => JSON.stringify(toOnline(state)), [state]);
  useEffect(() => {
    if (lobbyCode) void publishGame(lobbyCode, JSON.parse(published) as OnlineGame).catch(() => undefined);
  }, [lobbyCode, published]);
  useEffect(() => {
    if (!lobbyCode) return;
    return watchMoves(lobbyCode, (by, move) => {
      const action = moveToAction(move, by);
      if (action) dispatch(action);
    });
  }, [lobbyCode]);

  const stageKey = `${state.phase}:${state.current}:${state.turn}:${state.cardVisible}:${state.paused}:${state.lastGuess ? (state.lastGuess.correct ? "right" : "wrong") : ""}`;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("button:not([disabled])");
    target?.focus({ preventScroll: true });
  }, [stageKey]);

  useEscape(
    useCallback(() => {
      if (state.phase === "over") onExit();
      else if (state.cardVisible) dispatch({ type: "hideCard" });
      else setConfirm("exit");
    }, [state.phase, state.cardVisible, onExit]),
    !guessOpen && !playersOpen && confirm === null,
  );

  return (
    <main className="screen game hb-game game-scope" style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar game-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Exit to dashboard" onClick={() => (state.phase === "over" ? onExit() : setConfirm("exit"))}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <ZunoMark size={24} />
        <span className="screen-bar-title game-title">{file.metadata.title}</span>
        <span className="screen-bar-spacer" />
        {state.phase === "play" && (
          <>
            <span className="meta game-left">
              {solved} of {total} solved
            </span>
            <button type="button" className="btn btn-quiet btn-sm" aria-label={state.paused ? "Resume" : "Pause"} aria-pressed={state.paused} onClick={() => dispatch({ type: state.paused ? "resume" : "pause" })}>
              {state.paused ? <Play size={18} strokeWidth={1.5} /> : <Pause size={18} strokeWidth={1.5} />}
              <span className="hb-bar-label">{state.paused ? "Resume" : "Pause"}</span>
            </button>
            <button type="button" className="btn btn-quiet btn-sm" aria-label="Players" onClick={() => setPlayersOpen(true)}>
              <Users size={18} strokeWidth={1.5} />
              <span className="hb-bar-label">Players</span>
            </button>
            <button type="button" className="btn btn-quiet btn-sm" aria-label="Restart round" onClick={() => setConfirm("restart")}>
              <RotateCcw size={18} strokeWidth={1.5} />
              <span className="hb-bar-label">Restart</span>
            </button>
            <button type="button" className="btn btn-quiet btn-sm" aria-label="End game" onClick={() => setConfirm("end")}>
              <Flag size={18} strokeWidth={1.5} />
              <span className="hb-bar-label">End game</span>
            </button>
          </>
        )}
      </header>

      <div className="stage hb-stage" ref={stage} key={state.phase === "over" ? "over" : `turn-${state.turn}`}>
        {state.phase === "play" && current && <Turn file={file} state={state} current={current} online={!!lobbyCode} dispatch={dispatch} onGuess={() => setGuessOpen(true)} />}
        {state.phase === "over" && <Recap file={file} state={state} onReveal={() => setConfirm("reveal")} onAgain={onAgain} onExit={onExit} />}
      </div>

      {guessOpen && current && (
        <GuessDialog
          name={current.name}
          onSubmit={(text) => dispatch({ type: "guess", text })}
          onClose={() => setGuessOpen(false)}
        />
      )}
      {playersOpen && <PlayersDialog state={state} dispatch={dispatch} onRemove={(id) => setConfirm({ remove: id })} onClose={() => setPlayersOpen(false)} />}

      {confirm === "exit" && <ConfirmDialog title="Leave this game?" text="The session ends and progress is not kept." confirmLabel="Leave game" danger onConfirm={onExit} onClose={() => setConfirm(null)} />}
      {confirm === "restart" && (
        <ConfirmDialog
          title="Restart the round?"
          text="Everyone keeps the same identity. Solved players, questions and guesses are cleared."
          confirmLabel="Restart round"
          danger
          onConfirm={() => dispatch({ type: "restart" })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "end" && (
        <ConfirmDialog
          title="End the game now?"
          text="Players who have not solved will not see their identities unless you choose to reveal them on the next screen."
          confirmLabel="End game"
          danger
          onConfirm={() => dispatch({ type: "end" })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "reveal" && (
        <ConfirmDialog
          title="Reveal every identity?"
          text="Everyone who did not solve will see their identity on this screen."
          confirmLabel="Reveal"
          onConfirm={() => dispatch({ type: "reveal" })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm !== null && typeof confirm === "object" && (
        <ConfirmDialog
          title={`Remove ${getPlayer(state, confirm.remove)?.name ?? "this player"}?`}
          text="They leave the turn order. The game continues with everyone else."
          confirmLabel="Remove player"
          danger
          onConfirm={() => dispatch({ type: "remove", playerId: confirm.remove })}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}

function Turn({ file, state, current, online, dispatch, onGuess }: { file: HeadbandsFile; state: SessionState; current: Player; online: boolean; dispatch: Dispatch; onGuess: () => void }) {
  const deck = useMemo(() => deckOf(file.content.identities), [file]);
  const [question, setQuestion] = useState("");
  const { index, total } = turnPosition(state);
  const upNext = getPlayer(state, nextUnsolved(state, state.current));
  const identity = deck.get(current.identityId);
  const mine = state.history.filter((h) => h.playerId === current.id);
  const feedback = state.lastGuess && state.lastGuess.playerId === current.id ? state.lastGuess : null;
  const busy = state.paused || feedback !== null;
  const lastOne = activePlayers(state).filter((p) => !p.solved).length === 0;
  const pending = state.pending?.playerId === current.id ? state.pending.question : null;
  const waiting = pending !== null;
  const nameOf = (id: string) => getPlayer(state, id)?.name ?? "Someone";

  const ask = (answer: GroupAnswer) => {
    dispatch({ type: "ask", question, answer });
    setQuestion("");
  };

  return (
    <div className="hb-turn">
      <section className="hb-main" aria-label="Current turn">
        <div className="hb-turn-head">
          <p className="meta">
            Turn {state.turn} · Player {index} of {total}
          </p>
          <h1 className="hb-name">{current.name}</h1>
        </div>

        <div className="hb-card-area">
          {state.paused ? (
            <div className="hb-cover" role="status">
              <Pause size={28} strokeWidth={1.5} />
              <p className="hb-cover-title">Paused</p>
              <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "resume" })}>
                <Play size={18} strokeWidth={1.5} />
                Resume
              </button>
            </div>
          ) : feedback?.correct ? (
            <div className="hb-feedback is-right" role="status">
              <p className="hb-feedback-title">
                <CircleCheck size={22} strokeWidth={1.5} />
                {current.name} got it{current.byHost ? ", accepted by the host" : ""}
              </p>
              {identity && <IdentityCard identity={identity} mode={state.mode} size="md" />}
              <div className="hb-feedback-actions" data-nav-row="1">
                {state.undo && (
                  <button type="button" className="btn btn-quiet" onClick={() => dispatch({ type: "undoOverride" })}>
                    <Undo2 size={18} strokeWidth={1.5} />
                    Undo
                  </button>
                )}
                <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "continue" })}>
                  {lastOne ? "See the results" : upNext ? `Next: ${upNext.name}` : "Next player"}
                </button>
              </div>
            </div>
          ) : feedback ? (
            <div className="hb-feedback is-wrong" role="status">
              <p className="hb-feedback-title">
                <X size={22} strokeWidth={1.5} />
                Not quite
              </p>
              <p className="hb-feedback-text">
                “{feedback.guess}” is not it.{state.rules.unlimitedGuesses ? " Keep going." : " The turn passes on."}
              </p>
              <div className="hb-feedback-actions" data-nav-row="1">
                <button type="button" className="btn btn-quiet" onClick={() => dispatch({ type: "markCorrect" })}>
                  <Check size={18} strokeWidth={1.5} />
                  Host: accept this guess
                </button>
                <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "continue" })}>
                  {state.rules.unlimitedGuesses ? "Back to the turn" : upNext && upNext.id !== current.id ? `Next: ${upNext.name}` : "Next turn"}
                </button>
              </div>
            </div>
          ) : !state.cardVisible ? (
            <div className="hb-cover">
              <EyeOff size={28} strokeWidth={1.5} />
              <p className="hb-cover-title">Keep your own identity hidden from yourself.</p>
              <p className="hb-cover-text">
                {current.name}, look away from the screen, or hold the device facing the group. Then show the card.
              </p>
              <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "showCard" })}>
                <Eye size={18} strokeWidth={1.5} />
                Show card to the group
              </button>
            </div>
          ) : (
            <div className="hb-shown">
              {identity && <IdentityCard identity={identity} mode={state.mode} />}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: "hideCard" })}>
                <EyeOff size={16} strokeWidth={1.5} />
                Hide card
              </button>
            </div>
          )}
        </div>

        <div className="hb-ask card">
          {waiting && (
            <p className="hb-pending" role="status">
              <span className="meta">{current.name} asks</span>
              <span className="hb-pending-q">{pending ? `“${pending}”` : "Out loud"}</span>
            </p>
          )}
          <label className="field">
            <span className="field-label">{waiting ? "Or type a different question" : `${current.name} asks`}</span>
            <input
              className="input"
              value={question}
              maxLength={200}
              disabled={busy}
              placeholder="Am I something you can eat? (optional)"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
          </label>
          <div className="hb-answers" role="group" aria-label="The group answers" data-nav-row="2">
            {ANSWERS.map(([value, label]) => (
              <button key={value} type="button" className={`btn hb-answer hb-answer-${value}`} disabled={busy} data-autofocus={state.cardVisible && !busy && value === "yes" ? "" : undefined} onClick={() => ask(value)}>
                {label}
              </button>
            ))}
            <button type="button" className="btn btn-primary hb-guess" disabled={busy} onClick={onGuess}>
              Make a guess
            </button>
          </div>
          <p className="field-hint">
            {state.rules.continueAfterYes ? "A Yes keeps the turn; a No passes it." : "Each answer passes the turn."} Not sure lets {current.name} ask again. Typing the question is optional.
            {online && " Players can also ask, answer, guess and skip from their phones."}
          </p>
        </div>

        <div className="hb-host" data-nav-row="3" aria-label="Host controls" role="group">
          <span className="meta">Host</span>
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => dispatch({ type: "skip" })}>
            <SkipForward size={16} strokeWidth={1.5} />
            Skip turn
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => dispatch({ type: "markCorrect" })}>
            <Check size={16} strokeWidth={1.5} />
            Mark solved
          </button>
          {state.undo && !feedback && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => dispatch({ type: "undoOverride" })}>
              <Undo2 size={16} strokeWidth={1.5} />
              Undo last override
            </button>
          )}
        </div>
      </section>

      <aside className="hb-side" aria-label="Players and questions">
        <section className="card hb-side-block">
          <h2 className="aside-title">Players</h2>
          <ol className="hb-roster">
            {activePlayers(state).map((p) => (
              <li key={p.id} className={`hb-roster-row${p.id === current.id ? " is-current" : ""}${p.solved ? " is-solved" : ""}`}>
                <span className="hb-roster-name">{p.name}</span>
                <span className="hb-roster-status">
                  {p.solved ? (
                    <>
                      <CircleCheck size={14} strokeWidth={1.5} /> Solved
                    </>
                  ) : p.id === current.id ? (
                    "Asking now"
                  ) : (
                    `${p.questions} ${p.questions === 1 ? "question" : "questions"}`
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="card hb-side-block">
          <h2 className="aside-title">Activity</h2>
          <ActivityLog log={state.log} nameOf={nameOf} limit={30} />
        </section>
        <section className="card hb-side-block">
          <h2 className="aside-title">{current.name}’s answers so far</h2>
          {mine.length === 0 ? (
            <p className="meta">No questions recorded yet.</p>
          ) : (
            <ol className="hb-history">
              {mine.map((h, i) => (
                <li key={i}>
                  <span className={`hb-pill hb-pill-${h.answer}`}>{h.answer === "unsure" ? "Not sure" : h.answer === "yes" ? "Yes" : "No"}</span>
                  <span className="hb-history-q">{h.question || "Asked out loud"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

function GuessDialog({ name, onSubmit, onClose }: { name: string; onSubmit: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <Dialog title="Make a guess" onClose={onClose}>
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() === "") return;
            onSubmit(text);
            close();
          }}
        >
          <h2 className="dialog-title">{name}, who are you?</h2>
          <p className="dialog-text">Type the guess exactly. Capital letters and extra spaces do not matter.</p>
          <label className="field">
            <span className="sr-only">Your guess</span>
            <input className="input input-lg" data-autofocus value={text} maxLength={200} autoComplete="off" spellCheck={false} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="dialog-actions" data-nav-row="0">
            <button type="button" className="btn btn-secondary" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={text.trim() === ""}>
              Submit guess
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function PlayersDialog({ state, dispatch, onRemove, onClose }: { state: SessionState; dispatch: Dispatch; onRemove: (id: string) => void; onClose: () => void }) {
  const list = activePlayers(state);
  return (
    <Dialog title="Players" onClose={onClose}>
      {(close) => (
        <>
          <h2 className="dialog-title">Players</h2>
          <p className="dialog-text">Change the turn order, mark a player solved, or remove someone who left.</p>
          <ol className="hb-manage">
            {list.map((p, i) => (
              <li key={p.id} className="hb-manage-row" data-nav-row={i + 1}>
                <span className="hb-roster-name">
                  {p.name}
                  {p.solved && <span className="meta"> · Solved</span>}
                </span>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${p.name} earlier`} disabled={i === 0} onClick={() => dispatch({ type: "move", playerId: p.id, by: -1 })}>
                  <ArrowUp size={16} strokeWidth={1.5} />
                </button>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${p.name} later`} disabled={i === list.length - 1} onClick={() => dispatch({ type: "move", playerId: p.id, by: 1 })}>
                  <ArrowDown size={16} strokeWidth={1.5} />
                </button>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Mark ${p.name} solved`} disabled={p.solved} onClick={() => dispatch({ type: "markCorrect", playerId: p.id })}>
                  <Check size={16} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => {
                    close();
                    onRemove(p.id);
                  }}
                >
                  <UserMinus size={16} strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ol>
          <div className="dialog-actions" data-nav-row="20">
            <button type="button" className="btn btn-primary" data-autofocus onClick={close}>
              Done
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function Recap({ file, state, onReveal, onAgain, onExit }: { file: HeadbandsFile; state: SessionState; onReveal: () => void; onAgain: () => void; onExit: () => void }) {
  const deck = useMemo(() => deckOf(file.content.identities), [file]);
  const players = activePlayers(state);
  const hidden = players.some((p) => !p.solved) && !state.revealed;
  const everyone = players.every((p) => p.solved);
  return (
    <div className="hb-recap">
      <div className="hb-recap-head">
        <p className="meta">{file.metadata.title}</p>
        <h1 className="page-title">{everyone ? "Everyone solved" : state.endedEarly ? "Game ended" : "Game over"}</h1>
        <p className="page-lede">
          {players.filter((p) => p.solved).length} of {players.length} players found their identity.
        </p>
      </div>
      <ol className="hb-recap-list">
        {players.map((p) => {
          const identity = deck.get(p.identityId);
          const show = p.solved || state.revealed;
          return (
            <li key={p.id} className={`hb-recap-row card${p.solved ? " is-solved" : ""}`}>
              <div className="hb-recap-who">
                <p className="hb-recap-name">{p.name}</p>
                <p className="hb-recap-status">
                  {p.solved ? (
                    <>
                      <CircleCheck size={16} strokeWidth={1.5} /> Solved{p.byHost ? " (host)" : ""}
                    </>
                  ) : (
                    <>
                      <X size={16} strokeWidth={1.5} /> Not solved
                    </>
                  )}
                </p>
                <p className="meta">
                  {p.questions} {p.questions === 1 ? "question" : "questions"} · {p.guesses} {p.guesses === 1 ? "guess" : "guesses"}
                </p>
              </div>
              <div className="hb-recap-card">{show && identity ? <IdentityCard identity={identity} mode={state.mode} size="sm" /> : <span className="hb-recap-hidden">Hidden</span>}</div>
            </li>
          );
        })}
      </ol>
      {state.log.length > 0 && (
        <section className="card hb-side-block hb-recap-log">
          <h2 className="aside-title">Activity</h2>
          <ActivityLog log={state.log} nameOf={(id) => getPlayer(state, id)?.name ?? "Someone"} />
        </section>
      )}
      <div className="hb-recap-actions" data-nav-row="1">
        {hidden && (
          <button type="button" className="btn btn-secondary" onClick={onReveal}>
            <Eye size={18} strokeWidth={1.5} />
            Reveal identities
          </button>
        )}
        <button type="button" className="btn btn-primary" data-autofocus onClick={onAgain}>
          <RotateCcw size={18} strokeWidth={1.5} />
          Play again
        </button>
        <button type="button" className="btn btn-quiet" onClick={onExit}>
          Return to Zuno
        </button>
      </div>
    </div>
  );
}
