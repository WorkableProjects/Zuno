import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ArrowLeft, Check, Flag, RotateCcw, Trophy, X } from "lucide-react";
import type { JeopardyFile } from "../../game-files/schema/jeopardy";
import { ZunoMark } from "../../components/brand/Logo";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { createSession, findQuestion, maxWager, sessionReducer, standings, totalClues, type Mark, type SessionAction, type SessionState } from "./jeopardyEngine";
import "./jeopardy.css";

interface Props {
  file: JeopardyFile;
  teamNames: string[];
  allowNegativeScores: boolean;
  onExit: () => void;
}

type Confirm = "exit" | "reset" | "end" | null;

const formatScore = (n: number) => n.toLocaleString("en-US");

export function JeopardyGame({ file, teamNames, allowNegativeScores, onExit }: Props) {
  const reducer = useCallback((state: SessionState, action: SessionAction) => sessionReducer(file, state, action), [file]);
  const [state, dispatch] = useReducer(reducer, null, () => createSession(teamNames, allowNegativeScores));
  const [confirm, setConfirm] = useState<Confirm>(null);
  const stage = useRef<HTMLDivElement>(null);

  const total = totalClues(file);
  const left = total - state.used.length;
  const finalReady = file.content.finalJeopardy.enabled && !state.final.played;

  // Move focus to the first meaningful control whenever the stage changes.
  const stageKey = `${state.phase}:${state.current?.questionId ?? ""}:${state.answerShown}:${state.final.step}`;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("button:not([disabled])");
    target?.focus({ preventScroll: true });
  }, [stageKey]);

  useEscape(
    useCallback(() => {
      if (state.phase === "clue") dispatch({ type: "backToBoard" });
      else if (state.phase === "results") onExit();
      else setConfirm("exit");
    }, [state.phase, onExit]),
  );

  return (
    <main className="screen game game-scope" style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar game-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Exit to dashboard" onClick={() => (state.phase === "results" ? onExit() : setConfirm("exit"))}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <ZunoMark size={24} />
        <span className="screen-bar-title game-title">{file.metadata.title}</span>
        <span className="screen-bar-spacer" />
        {state.phase !== "results" && (
          <>
            <span className="meta game-left">
              {left} of {total} clues left
            </span>
            {finalReady && state.phase === "board" && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: "startFinal" })}>
                <Flag size={18} strokeWidth={1.5} />
                Final round
              </button>
            )}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm("reset")}>
              <RotateCcw size={18} strokeWidth={1.5} />
              Restart
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm("end")}>
              <Trophy size={18} strokeWidth={1.5} />
              End game
            </button>
          </>
        )}
      </header>

      <div className="stage" ref={stage} key={state.phase === "clue" ? state.current?.questionId : state.phase}>
        {state.phase === "board" && <Board file={file} state={state} dispatch={dispatch} />}
        {state.phase === "clue" && <Clue file={file} state={state} dispatch={dispatch} />}
        {state.phase === "final" && <Final file={file} state={state} dispatch={dispatch} />}
        {state.phase === "results" && <Results state={state} onAgain={() => dispatch({ type: "reset" })} onExit={onExit} />}
      </div>

      {state.phase !== "results" && <Scoreboard state={state} />}

      {confirm === "exit" && (
        <ConfirmDialog
          title="Leave this game"
          text="Scores and progress will be lost. Your game file is not changed."
          confirmLabel="Leave game"
          danger
          onConfirm={onExit}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "reset" && (
        <ConfirmDialog
          title="Restart the game"
          text="Every clue comes back and all scores return to zero."
          confirmLabel="Restart"
          danger
          onConfirm={() => dispatch({ type: "reset" })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "end" && (
        <ConfirmDialog
          title="End the game now"
          text={left > 0 ? `${left} ${left === 1 ? "clue is" : "clues are"} still on the board. The final standings will be shown.` : "The final standings will be shown."}
          confirmLabel="End game"
          onConfirm={() => dispatch({ type: "finish" })}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}

interface PartProps {
  file: JeopardyFile;
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
}

function Board({ file, state, dispatch }: PartProps) {
  const categories = file.content.categories;
  const rows = Math.max(...categories.map((c) => c.questions.length));
  const allUsed = state.used.length >= totalClues(file);
  let focusGiven = false;

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="Game board" style={{ "--cols": categories.length, "--rows": rows } as React.CSSProperties}>
        <div className="board-row" role="row">
          {categories.map((c) => (
            <div key={c.id} className="board-head" role="columnheader">
              <span>{c.title}</span>
            </div>
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="board-row" role="row">
            {categories.map((c) => {
              const q = c.questions[r];
              if (!q) return <div key={c.id} className="board-gap" role="gridcell" />;
              const used = state.used.includes(q.id);
              const autofocus = !used && !focusGiven;
              if (autofocus) focusGiven = true;
              return (
                <div key={c.id} role="gridcell" className="board-slot">
                  <button
                    type="button"
                    className={`board-cell${used ? " is-used" : ""}`}
                    data-nav-row={r + 1}
                    data-autofocus={autofocus ? "" : undefined}
                    disabled={used}
                    aria-label={`${c.title}, ${q.value} points${used ? ", already played" : ""}`}
                    onClick={() => dispatch({ type: "open", categoryId: c.id, questionId: q.id })}
                  >
                    <span className="board-value">{q.value}</span>
                    {used && <Check size={16} strokeWidth={1.5} className="board-used-mark" />}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {allUsed && (
        <div className="board-done" data-nav-row="40">
          <p>Every clue has been played</p>
          {file.content.finalJeopardy.enabled && !state.final.played ? (
            <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "startFinal" })}>
              <Flag size={18} strokeWidth={1.5} />
              Start the final round
            </button>
          ) : (
            <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "finish" })}>
              <Trophy size={18} strokeWidth={1.5} />
              Show final standings
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MarkButtons({ amount, mark, onMark, teamName, first }: { amount: number; mark: Mark; onMark: (m: Mark) => void; teamName: string; first?: boolean }) {
  return (
    <span className="marks">
      <button type="button" className={`mark mark-wrong${mark === -1 ? " is-on" : ""}`} aria-pressed={mark === -1} aria-label={`${teamName} answered wrong, take ${amount}`} onClick={() => onMark(-1)}>
        <X size={16} strokeWidth={1.5} />
        {formatScore(amount)}
      </button>
      <button type="button" className={`mark mark-right${mark === 1 ? " is-on" : ""}`} aria-pressed={mark === 1} aria-label={`${teamName} answered right, add ${amount}`} data-autofocus={first ? "" : undefined} onClick={() => onMark(1)}>
        <Check size={16} strokeWidth={1.5} />
        {formatScore(amount)}
      </button>
    </span>
  );
}

function Clue({ file, state, dispatch }: PartProps) {
  if (!state.current) return null;
  const category = file.content.categories.find((c) => c.id === state.current!.categoryId);
  const q = findQuestion(file, state.current.categoryId, state.current.questionId);
  if (!category || !q) return null;

  return (
    <article className="clue">
      <p className="clue-kicker">
        {category.title} <span className="clue-value">{q.value}</span>
      </p>
      <h1 className="clue-text">{q.clue}</h1>

      {!state.answerShown ? (
        <div className="clue-actions" data-nav-row="1">
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "revealAnswer" })}>
            Show answer
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: "backToBoard" })}>
            Back to board
          </button>
        </div>
      ) : (
        <div className="answer">
          <p className="answer-label">Answer</p>
          <p className="answer-text">{q.answer}</p>
          {q.explanation &&
            (state.explanationShown ? (
              <p className="answer-note">{q.explanation}</p>
            ) : (
              <div data-nav-row="1">
                <button type="button" className="btn btn-quiet btn-sm answer-more" onClick={() => dispatch({ type: "showExplanation" })}>
                  Show explanation
                </button>
              </div>
            ))}

          <ul className="award" aria-label="Score this clue">
            {state.teams.map((t, i) => (
              <li key={i} className="award-row" data-nav-row={2 + i}>
                <span className="award-name">{t.name}</span>
                <span className="award-score">{formatScore(t.score)}</span>
                <MarkButtons amount={q.value} mark={state.marks[i]} teamName={t.name} first={i === 0} onMark={(mark) => dispatch({ type: "mark", team: i, mark })} />
              </li>
            ))}
          </ul>
          <div className="clue-actions" data-nav-row="30">
            <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: "backToBoard" })}>
              Back to board
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Final({ file, state, dispatch }: PartProps) {
  const f = file.content.finalJeopardy;
  const { step, wagers, marks } = state.final;
  return (
    <article className="clue">
      <p className="clue-kicker">Final round</p>
      <h1 className={step === "category" ? "clue-text" : "clue-category"}>{f.category}</h1>
      {step !== "category" && <p className="clue-text">{f.clue}</p>}

      {step === "answer" && (
        <div className="answer">
          <p className="answer-label">Answer</p>
          <p className="answer-text">{f.answer}</p>
        </div>
      )}

      <ul className="award" aria-label={step === "answer" ? "Score the final round" : "Wagers"}>
        {state.teams.map((t, i) => (
          <li key={i} className="award-row" data-nav-row={2 + i}>
            <span className="award-name">{t.name}</span>
            <span className="award-score">{formatScore(t.score)}</span>
            {step === "answer" ? (
              <MarkButtons amount={wagers[i]} mark={marks[i]} teamName={t.name} onMark={(mark) => dispatch({ type: "finalMark", team: i, mark })} />
            ) : (
              <label className="wager">
                <span className="meta">Wager, up to {formatScore(maxWager(file, t.score))}</span>
                <input
                  className="input wager-input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={maxWager(file, t.score)}
                  value={wagers[i] === 0 ? "" : wagers[i]}
                  placeholder="0"
                  aria-label={`${t.name} wager`}
                  onChange={(e) => dispatch({ type: "finalWager", team: i, wager: Number(e.target.value) })}
                />
              </label>
            )}
          </li>
        ))}
      </ul>

      <div className="clue-actions" data-nav-row="30">
        {step === "category" && (
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "finalNext" })}>
            Show clue
          </button>
        )}
        {step === "clue" && (
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "finalNext" })}>
            Show answer
          </button>
        )}
        {step === "answer" && (
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "finish" })}>
            <Trophy size={18} strokeWidth={1.5} />
            Show final standings
          </button>
        )}
      </div>
    </article>
  );
}

function Results({ state, onAgain, onExit }: { state: SessionState; onAgain: () => void; onExit: () => void }) {
  const table = standings(state.teams);
  const winners = table.filter((t) => t.rank === 1);
  return (
    <article className="results">
      <p className="clue-kicker">Final standings</p>
      <h1 className="clue-text">
        {winners.length === 1 ? `${winners[0].name} wins` : `${winners.map((w) => w.name).join(" and ")} tie for first`}
      </h1>
      <ol className="standings">
        {table.map((t, i) => (
          <li key={i} className={`standing${t.rank === 1 ? " is-first" : ""}`}>
            <span className="standing-rank">{t.rank}</span>
            <span className="standing-name">{t.name}</span>
            <span className="standing-score">{formatScore(t.score)}</span>
          </li>
        ))}
      </ol>
      <div className="clue-actions" data-nav-row="1">
        <button type="button" className="btn btn-primary" data-autofocus onClick={onExit}>
          Back to dashboard
        </button>
        <button type="button" className="btn btn-secondary" onClick={onAgain}>
          <RotateCcw size={18} strokeWidth={1.5} />
          Play again
        </button>
      </div>
    </article>
  );
}

function Scoreboard({ state }: { state: SessionState }) {
  return (
    <footer className="scoreboard" aria-label="Scores">
      {state.teams.map((t, i) => (
        <div key={i} className="score">
          <span className="score-name">{t.name}</span>
          <span className="score-value" aria-live="polite">
            {formatScore(t.score)}
          </span>
        </div>
      ))}
    </footer>
  );
}
