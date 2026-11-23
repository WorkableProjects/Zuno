import { useState, type ReactNode } from "react";
import { Check, CircleCheck, Pause, PenLine } from "lucide-react";
import { Avatar } from "../../components/avatar/AvatarView";
import { Notepad } from "../../components/notepad/Notepad";
import { Prep } from "./LiarGame";
import { tally } from "./liarEngine";
import { useLiarSounds } from "./useLiarSounds";
import {
  sendLiarMove,
  type LiarLobbyState,
  type LiarMove,
  type LiarOnline,
} from "./liarLobby";

interface Props {
  code: string;
  me: string;
  lobby: LiarLobbyState;
  game: LiarOnline;
  prompts: string[];
  /** The host's device applies moves directly. */
  onMove?: (move: LiarMove) => void;
  /** Host-only controls, shown above the players. */
  host?: ReactNode;
}

/** Every device during an online LIAR game: the turn on the left, the table on the right. */
export function LiarOnlinePlay({
  code,
  me,
  lobby,
  game,
  prompts,
  onMove,
  host,
}: Props) {
  useLiarSounds(game.phase, game.voted.length, game.paused, game.storytellerId);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const players = game.players.filter((p) => !p.removed);
  const nameOf = (id: string) =>
    game.players.find((p) => p.id === id)?.name ?? "Someone";
  const teller = game.storytellerId;
  const tellerName = teller ? nameOf(teller) : "";
  const mine = teller === me;
  const inGame = players.some((p) => p.id === me);

  const send = async (move: LiarMove) => {
    if (sending) return;
    setSending(true);
    setProblem(null);
    try {
      if (onMove) onMove(move);
      else await sendLiarMove(code, me, move);
    } catch {
      setProblem(
        "That didn't reach the host. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="liar-online">
      <section className="card liar-online-main" aria-live="polite">
        <p key={`${game.round}-${teller}`} className="meta ru-pill ru-turn liar-round-pill">
          Round {game.round + 1} of {game.rounds} · {tellerName} is the
          storyteller
        </p>
        {game.paused ? (
          <h1 className="page-title liar-online-title">
            <Pause size={24} strokeWidth={1.5} /> Paused by the host
          </h1>
        ) : game.phase === "done" ? (
          <Over game={game} nameOf={nameOf} />
        ) : game.phase === "prep" ? (
          mine ? (
            <Prep
              key={`${game.round}-${game.turnIndex}`}
              direct
              name="Your turn"
              prompts={prompts}
              onSubmit={(turn) =>
                void send({ type: "submit", turn: JSON.stringify(turn) })
              }
            />
          ) : (
            <div className="liar-wait ru-turn">
              <PenLine size={28} strokeWidth={1.5} />
              <h1 className="page-title liar-online-title">
                {tellerName} is writing
              </h1>
              <p className="page-lede">Two truths and a lie are on the way.</p>
            </div>
          )
        ) : (
          <>
            <h1 key={game.phase} className="page-title liar-online-title ru-reveal">
              {game.phase === "discuss"
                ? "Ask questions"
                : game.phase === "vote"
                  ? mine
                    ? "The group is voting"
                    : "Which one is the lie?"
                  : `The lie was statement ${(game.lieIndex ?? 0) + 1}`}
            </h1>
            {game.phase === "discuss" && (
              <p className="meta">
                {mine
                  ? "Answer out loud. You can skip any question."
                  : `Ask ${tellerName} anything. The host opens voting when you're ready.`}
              </p>
            )}
            {!(game.phase === "vote" && !mine && inGame) && (
              <ol className="liar-cards liar-online-cards">
                {(game.statements ?? []).map((s, i) => {
                  const isLie = game.lieIndex === i;
                  const counts = game.votes ? tally(game.votes).counts : null;
                  const voters = game.votes
                    ? Object.entries(game.votes)
                        .filter(([, v]) => v === i)
                        .map(([id]) => id)
                    : [];
                  return (
                    <li
                      key={i}
                      className={`liar-card card ${game.phase === "reveal" ? "ru-flip" : "ru-deal"}${game.phase === "reveal" && isLie ? " is-lie" : ""}`}
                      style={{ "--i": i } as React.CSSProperties}
                    >
                      <span className="liar-num">{i + 1}</span>
                      <div className="liar-grow">
                        <p className="liar-text">{s.text}</p>
                        <ul className="liar-askable">
                          {s.questions.map((q, k) => (
                            <li key={k}>{q}</li>
                          ))}
                        </ul>
                        {game.phase === "reveal" && (
                          <>
                            <p
                              className={`liar-badge ru-badge ru-reveal ${isLie ? "is-lie" : "is-truth"}`}
                              style={{ "--i": i + 2 } as React.CSSProperties}
                            >
                              {isLie ? "The lie" : "True"}
                            </p>
                            <p className="meta liar-who-voted">
                              {counts?.[i] ?? 0}{" "}
                              {counts?.[i] === 1 ? "vote" : "votes"}
                              {voters.map((id) => (
                                <Avatar
                                  key={id}
                                  name={nameOf(id)}
                                  avatar={lobby.players[id]?.avatar}
                                  size={22}
                                />
                              ))}
                            </p>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {game.phase === "vote" && !mine && inGame && (
              <VoteButtons
                game={game}
                me={me}
                sending={sending}
                onVote={(v) => void send({ type: "vote", vote: String(v) })}
              />
            )}
          </>
        )}
        {problem && (
          <p className="field-hint liar-problem" role="alert">
            {problem}
          </p>
        )}
      </section>

      <aside className="liar-online-side">
        {host}
        <section className="card liar-online-block">
          <h2 className="aside-title">Players</h2>
          <ol className="liar-online-players">
            {players.map((p) => (
              <li key={p.id} className={p.id === teller ? "is-teller" : ""}>
                <Avatar
                  name={p.name}
                  avatar={lobby.players[p.id]?.avatar}
                  size={36}
                />
                <span className="liar-grow">
                  {p.name}
                  {p.id === me && <span className="meta"> · you</span>}
                  <span className="meta liar-online-status">
                    {p.id === teller
                      ? "Storyteller"
                      : game.phase === "vote"
                        ? game.voted.includes(p.id)
                          ? "Voted"
                          : "Voting…"
                        : ""}
                  </span>
                </span>
                {game.phase === "vote" && game.voted.includes(p.id) && (
                  <Check size={16} strokeWidth={2} className="liar-voted" />
                )}
                {game.scoring && (
                  <strong key={game.scores[p.id] ?? 0} className="liar-online-score ru-reveal">
                    {game.scores[p.id] ?? 0}
                  </strong>
                )}
              </li>
            ))}
          </ol>
        </section>
        <Notepad storageKey={`zuno.liar.notes.${code}.${me}`} me={me} players={players} meHint="Your statements, reminders…" className="card liar-online-block" />
      </aside>
    </div>
  );
}

function VoteButtons({
  game,
  me,
  sending,
  onVote,
}: {
  game: LiarOnline;
  me: string;
  sending: boolean;
  onVote: (v: number | "abstain") => void;
}) {
  const [picked, setPicked] = useState<number | "abstain" | null>(null);
  const done = game.voted.includes(me);
  return (
    <div className="liar-options" role="group" aria-label="Choose the lie">
      {(game.statements ?? []).map((s, i) => (
        <button
          key={i}
          type="button"
          className={`liar-option${picked === i && done ? " is-picked" : ""}`}
          disabled={sending}
          onClick={() => {
            setPicked(i);
            onVote(i);
          }}
        >
          <span className="liar-num">{i + 1}</span>
          {s.text}
        </button>
      ))}
      {game.allowAbstain && (
        <button
          type="button"
          className={`btn btn-quiet${picked === "abstain" && done ? " is-picked" : ""}`}
          disabled={sending}
          onClick={() => {
            setPicked("abstain");
            onVote("abstain");
          }}
        >
          Abstain
        </button>
      )}
      {done && (
        <p className="liar-voted">
          <CircleCheck size={16} strokeWidth={1.5} /> Vote in. You can change it
          until voting closes.
        </p>
      )}
    </div>
  );
}

function Over({
  game,
  nameOf,
}: {
  game: LiarOnline;
  nameOf: (id: string) => string;
}) {
  const active = game.players.filter((p) => !p.removed);
  const top = Math.max(0, ...active.map((p) => game.scores[p.id] ?? 0));
  const win =
    game.scoring && top > 0
      ? active.filter((p) => (game.scores[p.id] ?? 0) === top)
      : [];
  return (
    <div className="liar-phase">
      <h1 className="page-title ru-reveal">
        {game.endedEarly ? "Game ended" : "Game over"}
      </h1>
      {game.scoring && (
        <p className="liar-h ru-win">
          {win.length === 0
            ? "No points scored."
            : win.length > 1
              ? `It is a tie: ${win.map((p) => p.name).join(" and ")}`
              : `${win[0].name} wins`}
        </p>
      )}
      <ol className="liar-recap">
        {game.recap.map((r, i) => (
          <li key={i} className="card ru-deal" style={{ "--i": i } as React.CSSProperties}>
            <p className="liar-h">{nameOf(r.storytellerId)}</p>
            <ul>
              {r.turn.statements.map((s, k) => (
                <li key={k}>
                  {s.text} —{" "}
                  <strong>{k === r.turn.lieIndex ? "the lie" : "true"}</strong>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
