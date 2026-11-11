import { useState } from "react";
import { CircleCheck, EyeOff, HelpCircle, Pause, Send, SkipForward, X } from "lucide-react";
import type { HeadbandsIdentity } from "../../game-files/schema/headbands";
import { ActivityLog } from "./ActivityLog";
import { IdentityCard } from "./IdentityCard";
import type { GroupAnswer, LogEntry } from "./headbandsEngine";
import { sendMove, type LobbyState, type OnlineGame, type PlayerMove } from "./lobby";

interface Props {
  code: string;
  me: string;
  lobby: LobbyState;
  game: OnlineGame;
}

const ANSWERS: Array<[GroupAnswer, string]> = [
  ["yes", "Yes"],
  ["no", "No"],
  ["unsure", "Not sure"],
];

/** The identity another player wrote for `target`: the writer sits just before them in the circle. */
export function cardFor(lobby: LobbyState, target: string): HeadbandsIdentity | null {
  const n = lobby.circle.length;
  const i = lobby.circle.indexOf(target);
  if (i === -1 || n < 2) return null;
  const entry = lobby.entries[lobby.circle[(i - 1 + n) % n]];
  if (!entry) return null;
  const label = lobby.mode === "image" ? (entry.subtext ?? entry.text) : entry.text;
  return { id: `card-${target}`, text: label, image: lobby.mode === "image" ? entry.image : null, subtext: lobby.mode === "image" ? label : null };
}

const answerLabel = (a: GroupAnswer) => (a === "yes" ? "Yes" : a === "no" ? "No" : "Not sure");

/** A player's phone during the game: whose turn it is, everyone else's card, their moves and the activity. */
export function PhoneGame({ code, me, lobby, game }: Props) {
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? lobby.players[id]?.name ?? "Someone";
  const myself = game.players.find((p) => p.id === me && !p.removed);
  const current = game.players.find((p) => p.id === game.current) ?? null;
  const myTurn = !!current && current.id === me;
  // "" means the question was asked out loud.
  const pending = game.pending && game.pending.playerId === game.current ? game.pending.question : null;
  const guess = game.lastGuess && game.lastGuess.playerId === game.current ? game.lastGuess : null;
  const players = game.order.map((id) => game.players.find((p) => p.id === id)).filter((p): p is OnlineGame["players"][number] => !!p && !p.removed);

  const send = async (move: PlayerMove) => {
    if (sending) return;
    setSending(true);
    setProblem(null);
    try {
      await sendMove(code, me, move);
    } catch {
      setProblem("That didn't reach the host. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (game.phase === "over") return <PhoneRecap lobby={lobby} game={game} me={me} nameOf={nameOf} />;

  return (
    <div className="hb-play">
      <section className={`card hb-phone-card hb-turn-banner${myTurn ? " is-mine" : ""}`} aria-live="polite">
        <p className="meta">
          Turn {game.turn}
          {myself?.solved ? " · You solved yours" : ""}
        </p>
        {game.paused ? (
          <h1 className="page-title hb-turn-title">
            <Pause size={24} strokeWidth={1.5} /> Paused by the host
          </h1>
        ) : (
          <h1 className="page-title hb-turn-title">{myTurn ? "Your turn" : `${current?.name ?? "Someone"}’s turn`}</h1>
        )}

        {!game.paused && myTurn && <MyTurn game={game} pending={pending} guess={guess} sending={sending} send={send} />}

        {!game.paused && !myTurn && current && (
          <>
            {guess ? (
              <p className={`hb-guess-note${guess.correct ? " is-right" : ""}`}>
                {guess.correct ? <CircleCheck size={18} strokeWidth={1.5} /> : <X size={18} strokeWidth={1.5} />}
                {current.name} guessed “{guess.guess}”, {guess.correct ? "correct" : "not it"}
              </p>
            ) : pending !== null ? (
              <div className="hb-question">
                <p className="meta">{current.name} asks</p>
                <p className="hb-question-text">{pending ? `“${pending}”` : "Out loud. Listen, then answer"}</p>
                {myself && (
                  <div className="hb-answers hb-phone-answers" role="group" aria-label="Your answer">
                    {ANSWERS.map(([value, label]) => (
                      <button key={value} type="button" className={`btn hb-answer hb-answer-${value}`} disabled={sending} onClick={() => void send({ type: "ask", answer: value })}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="page-lede">Waiting for {current.name} to ask a question or guess.</p>
            )}
            {(() => {
              const card = cardFor(lobby, current.id);
              return card ? (
                <div className="hb-their-card">
                  <p className="field-label">{current.name}’s card, hidden from them</p>
                  <IdentityCard identity={card} mode={game.mode} size="md" />
                </div>
              ) : null;
            })()}
          </>
        )}

        {problem && (
          <p className="field-hint hb-phone-problem" role="alert">
            {problem}
          </p>
        )}
      </section>

      <section className="card hb-phone-card">
        <h2 className="aside-title">Players</h2>
        <ol className="hb-phone-players">
          {players.map((p) => (
            <PlayerRow key={p.id} lobby={lobby} game={game} player={p} me={me} />
          ))}
        </ol>
      </section>

      <section className="card hb-phone-card">
        <h2 className="aside-title">Activity</h2>
        <ActivityLog log={game.log} nameOf={nameOf} />
      </section>
    </div>
  );
}

function MyTurn({ game, pending, guess, sending, send }: { game: OnlineGame; pending: string | null; guess: OnlineGame["lastGuess"]; sending: boolean; send: (m: PlayerMove) => Promise<void> }) {
  const [question, setQuestion] = useState("");
  const [text, setText] = useState("");

  if (guess) {
    return (
      <div className={`hb-feedback ${guess.correct ? "is-right" : "is-wrong"}`} role="status">
        <p className="hb-feedback-title">
          {guess.correct ? <CircleCheck size={22} strokeWidth={1.5} /> : <X size={22} strokeWidth={1.5} />}
          {guess.correct ? `You got it: “${guess.guess}”` : `“${guess.guess}” is not it`}
        </p>
        <button type="button" className="btn btn-primary" disabled={sending} onClick={() => void send({ type: "continue" })}>
          {guess.correct || !game.rules.unlimitedGuesses ? "Pass the turn on" : "Back to my turn"}
        </button>
      </div>
    );
  }

  return (
    <div className="hb-my-turn">
      <p className="hb-hidden-note">
        <EyeOff size={18} strokeWidth={1.5} /> Your card is hidden from you. Someone else wrote it.
      </p>
      {pending !== null ? (
        <div className="hb-question">
          <p className="meta">You asked</p>
          <p className="hb-question-text">{pending ? `“${pending}”` : "Out loud"}</p>
          <p className="page-lede">Waiting for the group to answer.</p>
        </div>
      ) : (
        <form
          className="hb-phone-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ type: "pose", question: question.trim() }).then(() => setQuestion(""));
          }}
        >
          <label className="field">
            <span className="field-label">Ask the group a yes-or-no question</span>
            <input className="input input-lg" value={question} maxLength={200} autoComplete="off" placeholder="Optional, you can ask out loud" onChange={(e) => setQuestion(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            <Send size={18} strokeWidth={1.5} />
            {question.trim() ? "Ask" : "I asked out loud"}
          </button>
        </form>
      )}
      <form
        className="hb-phone-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() === "") return;
          void send({ type: "guess", text: text.trim() }).then(() => setText(""));
        }}
      >
        <label className="field">
          <span className="field-label">Know who you are?</span>
          <input className="input input-lg" value={text} maxLength={200} autoComplete="off" spellCheck={false} placeholder="Your guess" onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-secondary" disabled={sending || text.trim() === ""}>
          <HelpCircle size={18} strokeWidth={1.5} />
          Guess
        </button>
      </form>
      <button type="button" className="btn btn-quiet" disabled={sending} onClick={() => void send({ type: "skip" })}>
        <SkipForward size={18} strokeWidth={1.5} />
        Skip my turn
      </button>
    </div>
  );
}

/** One player with their card (never your own) and the answers they have received. */
function PlayerRow({ lobby, game, player, me }: { lobby: LobbyState; game: OnlineGame; player: OnlineGame["players"][number]; me: string }) {
  const mine = player.id === me;
  const card = cardFor(lobby, player.id);
  const asked = game.log.filter((e): e is Extract<LogEntry, { kind: "ask" }> => e.kind === "ask" && e.playerId === player.id);
  const showCard = !mine || player.solved;
  return (
    <li className={`hb-phone-player${player.id === game.current ? " is-current" : ""}${player.solved ? " is-solved" : ""}`}>
      <div className="hb-phone-player-head">
        <span className="hb-roster-name">
          {player.name}
          {mine && <span className="meta"> · you</span>}
        </span>
        <span className="hb-roster-status">
          {player.solved ? (
            <>
              <CircleCheck size={14} strokeWidth={1.5} /> Solved
            </>
          ) : player.id === game.current ? (
            "Asking now"
          ) : (
            `${player.questions} ${player.questions === 1 ? "question" : "questions"}`
          )}
        </span>
      </div>
      <div className="hb-phone-player-body">
        <div className="hb-phone-player-card">{showCard && card ? <IdentityCard identity={card} mode={game.mode} size="sm" /> : <span className="hb-recap-hidden">Hidden from you</span>}</div>
        {asked.length === 0 ? (
          <p className="meta">No questions yet</p>
        ) : (
          <ol className="hb-history">
            {asked.map((h, i) => (
              <li key={i}>
                <span className={`hb-pill hb-pill-${h.answer}`}>{answerLabel(h.answer)}</span>
                <span className="hb-history-q">{h.question || "Asked out loud"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}

function PhoneRecap({ lobby, game, me, nameOf }: { lobby: LobbyState; game: OnlineGame; me: string; nameOf: (id: string) => string }) {
  const players = game.order.map((id) => game.players.find((p) => p.id === id)).filter((p): p is OnlineGame["players"][number] => !!p && !p.removed);
  const solved = players.filter((p) => p.solved).length;
  return (
    <div className="hb-play">
      <section className="card hb-phone-card">
        <p className="meta">Game over</p>
        <h1 className="page-title">{solved === players.length ? "Everyone solved" : `${solved} of ${players.length} solved`}</h1>
        <ol className="hb-phone-players">
          {players.map((p) => {
            const card = cardFor(lobby, p.id);
            const show = p.id !== me || p.solved || game.revealed;
            return (
              <li key={p.id} className={`hb-phone-player${p.solved ? " is-solved" : ""}`}>
                <div className="hb-phone-player-head">
                  <span className="hb-roster-name">
                    {p.name}
                    {p.id === me && <span className="meta"> · you</span>}
                  </span>
                  <span className="hb-roster-status">{p.solved ? "Solved" : "Not solved"}</span>
                </div>
                <div className="hb-phone-player-card">{show && card ? <IdentityCard identity={card} mode={game.mode} size="sm" /> : <span className="hb-recap-hidden">Hidden until the host reveals it</span>}</div>
              </li>
            );
          })}
        </ol>
        <p className="meta">The host can start another round from their screen.</p>
      </section>
      <section className="card hb-phone-card">
        <h2 className="aside-title">Activity</h2>
        <ActivityLog log={game.log} nameOf={nameOf} />
      </section>
    </div>
  );
}
