import { useEffect, useState } from "react";
import { Check, Crown, Lightbulb, Plus, Send, Trash2, Trophy, X } from "lucide-react";
import { useSoundOnChange } from "../../lib/useGameSounds";
import { FeedList, PartyTimer, Standings } from "../party/PartyBits";
import type { PlayProps } from "../party/types";
import { MIN_ANSWERS, type FeudAnswer, type FeudOnline, type FeudPrivate } from "./feudEngine";
import "./feud.css";

const IDEAS = [
  "Name something people do right after waking up",
  "Name a food you eat with your hands",
  "Name something you find in a school backpack",
  "Name a reason you might be late",
  "Name an animal you'd see at a farm",
  "Name something people take to the beach",
  "Name a popular pizza topping",
  "Name something that has wheels",
  "Name a job where you wear a uniform",
  "Name something you do at a sleepover",
  "Name a sport played with a ball",
  "Name something that is cold",
  "Name a place people go on vacation",
  "Name a chore people hate doing",
  "Name something with buttons",
];

type Row = { text: string; points: string };
const blankRows = (n: number): Row[] => Array.from({ length: n }, () => ({ text: "", points: "" }));

function SurveyWriter({ game, priv, send, busy }: { game: FeudOnline; priv: FeudPrivate | null; send: PlayProps<FeudOnline, FeudPrivate>["send"]; busy: boolean }) {
  const [prompt, setPrompt] = useState(priv?.mine?.prompt ?? "");
  const [rows, setRows] = useState<Row[]>(() => (priv?.mine ? priv.mine.answers.map((a) => ({ text: a.text, points: String(a.points) })) : blankRows(Math.min(5, game.maxAnswers))));
  const [dirty, setDirty] = useState(!priv?.mine);
  const clean = rows.map((r) => ({ text: r.text.trim(), points: Number(r.points) })).filter((r) => r.text && Number.isInteger(r.points) && r.points >= 1 && r.points <= 100);
  const ok = prompt.trim().length >= 3 && clean.length >= MIN_ANSWERS;
  const total = clean.reduce((n, r) => n + r.points, 0);
  const set = (i: number, patch: Partial<Row>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  return (
    <form
      className="feud-writer card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        void send({ type: "survey", prompt: prompt.trim(), answers: clean });
        setDirty(false);
      }}
    >
      <label className="field">
        <span className="field-label">Your survey question</span>
        <div className="rpg-row">
          <input className="input rpg-grow" maxLength={140} placeholder="Name something you find in a kitchen" value={prompt} onChange={(e) => (setPrompt(e.target.value), setDirty(true))} />
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => (setPrompt(IDEAS[Math.floor(Math.random() * IDEAS.length)]), setDirty(true))}>
            <Lightbulb size={16} strokeWidth={1.5} />
            Idea
          </button>
        </div>
      </label>
      <div className="feud-rows">
        <span className="field-label">Answers and points (1 to 100). Higher points sort to the top.</span>
        {rows.map((r, i) => (
          <div key={i} className="feud-row" style={{ "--i": i } as React.CSSProperties}>
            <span className="feud-rank">{i + 1}</span>
            <input className="input rpg-grow" maxLength={60} placeholder={i === 0 ? "Top answer (use / for alternatives: car / auto)" : "Answer"} value={r.text} aria-label={`Answer ${i + 1}`} onChange={(e) => set(i, { text: e.target.value })} />
            <input className="input feud-pts" inputMode="numeric" placeholder="pts" value={r.points} aria-label={`Points for answer ${i + 1}`} onChange={(e) => set(i, { points: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })} />
            <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove answer ${i + 1}`} disabled={rows.length <= MIN_ANSWERS} onClick={() => (setRows(rows.filter((_, j) => j !== i)), setDirty(true))}>
              <Trash2 size={16} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        {rows.length < game.maxAnswers && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRows([...rows, { text: "", points: "" }])}>
            <Plus size={16} strokeWidth={1.5} />
            Add answer
          </button>
        )}
      </div>
      <div className="rpg-row">
        <button type="submit" className="btn btn-primary" disabled={!ok || busy || !dirty}>
          <Check size={18} strokeWidth={1.5} />
          {priv?.mine && !dirty ? "Survey saved" : priv?.mine ? "Save changes" : "Submit survey"}
        </button>
        <span className="meta">
          {clean.length} answers · {total} points
        </span>
      </div>
      {!ok && <p className="field-hint">A question and at least {MIN_ANSWERS} answers with points.</p>}
    </form>
  );
}

function Board({ game, hostAnswers, onJudge, judging, busy }: { game: FeudOnline; hostAnswers: FeudAnswer[] | null; onJudge?: (i: number) => void; judging: boolean; busy: boolean }) {
  const nameOf = (id: string | null) => game.players.find((p) => p.id === id)?.name ?? "";
  const half = Math.ceil(game.board.length / 2);
  return (
    <ol className="feud-board" style={{ "--rows": half } as React.CSSProperties}>
      {game.board.map((a, i) => {
        const secret = !a && hostAnswers ? hostAnswers[i] : null;
        return (
          <li key={i} className={`feud-tile${a ? " is-open" : ""}`}>
            <div className="feud-flip">
              <div className="feud-face feud-front">
                <span className="feud-num">{i + 1}</span>
                {secret && <span className="feud-secret">{secret.text}</span>}
                {judging && secret && onJudge && (
                  <button type="button" className="btn btn-primary btn-sm feud-judge-btn" disabled={busy} onClick={() => onJudge(i)}>
                    It's this
                  </button>
                )}
              </div>
              <div className="feud-face feud-back">
                <span className="feud-answer">{a?.text}</span>
                <span className="feud-points">{a?.points}</span>
                {a?.by && <span className="feud-by">{nameOf(a.by)}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function FeudPlay({ me, game, priv, send, busy, host, avatarOf }: PlayProps<FeudOnline, FeudPrivate>) {
  const [guess, setGuess] = useState("");
  const nameOf = (id: string | null) => game.players.find((p) => p.id === id)?.name ?? "Someone";
  const isRoundHost = game.host === me;
  const myGuess = game.phase === "guess" && game.guesser === me;
  const wrote = game.written.includes(me);

  useEffect(() => {
    if (myGuess) setGuess("");
  }, [myGuess]);

  useSoundOnChange(`${game.phase}|${game.strikes}|${game.board.filter(Boolean).length}|${game.round}`, (a, b) => {
    const [p0, s0, r0, n0] = a.split("|");
    const [p1, s1, r1, n1] = b.split("|");
    if (n1 !== n0) return "open";
    if (Number(r1) > Number(r0)) return "correct";
    if (Number(s1) > Number(s0)) return "wrong";
    if (p1 !== p0 && p1 === "over") return "win";
    if (p1 !== p0 && p1 === "guess" && game.guesser === me) return "turn";
    return null;
  });

  return (
    <div className="rpg-online">
      <section className="card rpg-main feud-main" aria-live="polite">
        {game.phase === "write" ? (
          <div className="rpg-stage rpg-phase">
            <div className="rpg-head">
              <div>
                <h2 className="rpg-h">Write your survey</h2>
                <p className="meta">Ask a question and list the answers you'd expect, with points for how popular each is. You'll host your round and judge the guesses.</p>
              </div>
              <PartyTimer seconds={game.timeLeft} />
            </div>
            <SurveyWriter game={game} priv={priv} send={send} busy={busy} />
            <p className="meta">
              {game.written.length} of {game.players.filter((p) => !p.removed).length} surveys in{wrote ? ". You can still edit yours until everyone is done." : ""}
            </p>
          </div>
        ) : game.phase === "over" ? (
          <div className="rpg-stage rpg-phase">
            <h2 className="rpg-h ru-reveal">
              <Trophy size={24} strokeWidth={1.5} /> {game.endedEarly ? "Game ended" : "Game over"}
            </h2>
            <Standings final players={game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, removed: p.removed }))} me={me} avatarOf={avatarOf} />
          </div>
        ) : (
          <div key={`round-${game.round}`} className="rpg-stage rpg-phase">
            <div className="rpg-head">
              <div>
                <p className="rpg-pill ru-pill feud-pill ru-turn">
                  Round {game.round} of {game.rounds} · <Crown size={12} strokeWidth={2} /> {isRoundHost ? "You're hosting" : `${nameOf(game.host)} hosts`}
                </p>
                <h2 className="rpg-h feud-prompt">{game.prompt}</h2>
              </div>
              {game.phase !== "roundEnd" && <PartyTimer seconds={game.timeLeft} />}
            </div>
            <div className="feud-strikes" aria-label={`${game.strikes} of ${game.maxStrikes} strikes`}>
              {Array.from({ length: game.maxStrikes }, (_, i) => (
                <span key={i} className={`feud-x ru-badge${i < game.strikes ? " is-on" : ""}`}>
                  <X size={22} strokeWidth={3} />
                </span>
              ))}
            </div>
            <Board game={game} hostAnswers={isRoundHost ? (priv?.answers ?? null) : null} judging={game.phase === "judge" && isRoundHost} busy={busy} onJudge={(i) => void send({ type: "judge", index: i })} />

            {game.phase === "show" && game.last && (
              <div key={`last-${game.last.by}-${game.last.text}-${game.strikes}`} className={`feud-callout${game.last.answer === null ? " is-strike" : " is-hit"}`}>
                {game.last.answer === null ? (
                  <>
                    <span className="feud-big-x" aria-hidden="true">
                      <X size={72} strokeWidth={4} />
                    </span>
                    <span>{game.last.text ? `"${game.last.text}" is not on the board` : `${nameOf(game.last.by)} ran out of time`}</span>
                  </>
                ) : (
                  <span>
                    {nameOf(game.last.by)} said "{game.last.text}"
                  </span>
                )}
              </div>
            )}

            {game.phase === "judge" && game.pending && (
              <div className="feud-judge card ru-reveal">
                <p className="rpg-h">
                  {nameOf(game.pending.by)} guessed "{game.pending.text}"
                </p>
                {isRoundHost ? (
                  <>
                    <p className="meta">The game couldn't match it. Tap the answer it counts as on the board, or strike it.</p>
                    <button type="button" className="btn rpg-btn-danger" disabled={busy} onClick={() => void send({ type: "judge", index: -1 })}>
                      <X size={18} strokeWidth={2} />
                      Strike
                    </button>
                  </>
                ) : (
                  <p className="meta">{nameOf(game.host)} is judging…</p>
                )}
              </div>
            )}

            {game.phase === "guess" &&
              (myGuess ? (
                <form
                  className="feud-guess"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (guess.trim()) void send({ type: "guess", text: guess.trim() });
                  }}
                >
                  <input className="input input-lg rpg-grow" autoFocus maxLength={60} placeholder="Your answer" value={guess} onChange={(e) => setGuess(e.target.value)} aria-label="Your answer" />
                  <button type="submit" className="btn btn-primary" disabled={busy || !guess.trim()}>
                    <Send size={18} strokeWidth={1.5} />
                    Answer
                  </button>
                </form>
              ) : (
                <p key={game.guesser} className="rpg-wait">{isRoundHost ? `${nameOf(game.guesser)} is answering. You'll judge anything the game can't match.` : `${nameOf(game.guesser)} is answering…`}</p>
              ))}
            {game.phase === "roundEnd" && <p className="meta">Next survey soon.</p>}
          </div>
        )}
      </section>

      <aside className="rpg-side">
        {host}
        <section className="card rpg-block">
          <h2 className="aside-title">Scores</h2>
          <Standings
            players={game.players.map((p) => ({
              id: p.id,
              name: p.name,
              score: p.score,
              removed: p.removed,
              tag: game.phase === "write" ? (game.written.includes(p.id) ? "Survey done" : undefined) : p.id === game.host && game.phase !== "over" ? "Hosting" : p.id === game.guesser ? "Answering" : undefined,
            }))}
            me={me}
            avatarOf={avatarOf}
          />
        </section>
        <section className="card rpg-block">
          <h2 className="aside-title">Feed</h2>
          <FeedList lines={game.log} />
        </section>
      </aside>
    </div>
  );
}
