import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ArrowLeft, Check, Flag, Pencil, RotateCcw, Trophy, X } from "lucide-react";
import type { JeopardyFile } from "../../game-files/schema/jeopardy";
import { ZunoMark } from "../../components/brand/Logo";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog, Dialog } from "../../components/ui/Dialog";
import { ClueImage, RichText } from "../../components/ui/RichText";
import {
  clueAmount,
  createSession,
  finalAvailable,
  findQuestion,
  maxWager,
  sessionReducer,
  tiedLeaders,
  totalClues,
  type Mark,
  type SessionAction,
  type SessionState,
  type Team,
  type TeamSetup,
} from "./jeopardyEngine";
import { Timer } from "./Timer";
import { WinnerReveal } from "./WinnerReveal";
import "./jeopardy.css";

interface Props {
  file: JeopardyFile;
  teams: TeamSetup[];
  allowNegativeScores: boolean;
  /** Session default chosen at setup. A question's own timeLimit still wins. */
  timeLimitSeconds: number;
  onExit: () => void;
}

type Confirm = "exit" | "reset" | "end" | null;

const formatScore = (n: number) => n.toLocaleString("en-US");

export function JeopardyGame({ file, teams, allowNegativeScores, timeLimitSeconds, onExit }: Props) {
  const reducer = useCallback((state: SessionState, action: SessionAction) => sessionReducer(file, state, action), [file]);
  const [state, dispatch] = useReducer(reducer, null, () => createSession(teams, allowNegativeScores));
  const [confirm, setConfirm] = useState<Confirm>(null);
  const stage = useRef<HTMLDivElement>(null);

  const total = totalClues(file);
  const left = total - state.used.length;
  const tiebreakMode = file.content.finalJeopardy.mode === "tiebreaker";
  const canFinal = finalAvailable(file, state);
  const canBreakTie = canFinal && tiebreakMode && tiedLeaders(state.teams).length > 0;

  // Move focus to the first meaningful control whenever the stage changes.
  const stageKey = `${state.phase}:${state.current?.questionId ?? ""}:${state.dailyDouble?.locked ?? ""}:${state.answerShown}:${state.final.step}`;
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
            {canFinal && !tiebreakMode && state.phase === "board" && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ type: "startFinal" })}>
                <Flag size={18} strokeWidth={1.5} />
                Final question
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
        {state.phase === "clue" && <Clue file={file} state={state} dispatch={dispatch} timeLimitSeconds={timeLimitSeconds} />}
        {state.phase === "final" && <Final file={file} state={state} dispatch={dispatch} />}
        {state.phase === "results" && (
          <WinnerReveal
            teams={state.teams}
            onAgain={() => dispatch({ type: "reset" })}
            onExit={onExit}
            onTiebreak={canFinal ? () => dispatch({ type: "startFinal" }) : undefined}
          />
        )}
      </div>

      {state.phase !== "results" && <Scoreboard state={state} dispatch={dispatch} />}

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
      {confirm === "end" && canBreakTie && (
        <Dialog title="End the game now" onClose={() => setConfirm(null)}>
          {(close) => (
            <>
              <h2 className="dialog-title">End the game now</h2>
              <p className="dialog-text">{tiedLeaders(state.teams).length} teams are tied for the lead. You can break the tie with the final question.</p>
              <div className="dialog-actions" data-nav-row="0">
                <button type="button" className="btn btn-secondary" onClick={close}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setConfirm(null);
                    dispatch({ type: "finish" });
                  }}
                >
                  Show final standings
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  data-autofocus
                  onClick={() => {
                    setConfirm(null);
                    dispatch({ type: "startFinal" });
                  }}
                >
                  Break the tie with the final question
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
      {confirm === "end" && !canBreakTie && (
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
  const tiebreakMode = file.content.finalJeopardy.mode === "tiebreaker";
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
          {finalAvailable(file, state) ? (
            tiebreakMode ? (
              <>
                <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "startFinal" })}>
                  <Flag size={18} strokeWidth={1.5} />
                  Break the tie with the final question
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: "finish" })}>
                  <Trophy size={18} strokeWidth={1.5} />
                  Show final standings
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "startFinal" })}>
                <Flag size={18} strokeWidth={1.5} />
                Start the final question
              </button>
            )
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

function Members({ team }: { team: Team }) {
  return team.members.length > 0 ? <span className="members">{team.members.join(", ")}</span> : null;
}

function TeamLabel({ team }: { team: Team }) {
  return (
    <span className="award-who">
      <span className="award-name">{team.name}</span>
      <Members team={team} />
    </span>
  );
}

function DailyDoublePanel({ file, state, dispatch }: PartProps) {
  const dd = state.dailyDouble!;
  const [splash, setSplash] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setSplash(false), 1800);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!splash) input.current?.focus({ preventScroll: true });
  }, [splash]);

  if (splash) {
    return (
      <div className="dd-splash" role="status" onClick={() => setSplash(false)}>
        <span className="dd-splash-text">Daily Double!</span>
      </div>
    );
  }
  const max = maxWager(file, state.teams[dd.team]?.score ?? 0);
  return (
    <section className="dd-panel" aria-label="Daily Double">
      <p className="clue-kicker">Daily Double</p>
      <h1 className="clue-text">Who found it, and how much?</h1>
      <div className="dd-teams" role="radiogroup" aria-label="Team that found the Daily Double" data-nav-row="1">
        {state.teams.map((t, i) => (
          <button key={i} type="button" role="radio" aria-checked={dd.team === i} className={`dd-team${dd.team === i ? " is-on" : ""}`} onClick={() => dispatch({ type: "ddTeam", team: i })}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="dd-wager" data-nav-row="2">
        <label className="wager">
          <span className="meta">Wager, up to {formatScore(max)}</span>
          <input
            ref={input}
            className="input wager-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={dd.wager === 0 ? "" : dd.wager}
            placeholder="0"
            aria-label="Wager"
            onChange={(e) => dispatch({ type: "ddWager", wager: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="clue-actions" data-nav-row="3">
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: "ddLock" })}>
          Lock wager and show clue
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: "backToBoard" })}>
          Back to board
        </button>
      </div>
    </section>
  );
}

function Clue({ file, state, dispatch, timeLimitSeconds }: PartProps & { timeLimitSeconds: number }) {
  if (!state.current) return null;
  const category = file.content.categories.find((c) => c.id === state.current!.categoryId);
  const q = findQuestion(file, state.current.categoryId, state.current.questionId);
  if (!category || !q) return null;

  const dd = state.dailyDouble;
  if (dd && !dd.locked) return <DailyDoublePanel file={file} state={state} dispatch={dispatch} />;

  const limit = q.timeLimit ?? timeLimitSeconds;
  const amount = clueAmount(state, q);
  const ddTeam = dd ? state.teams[dd.team] : null;
  const awardTeams = state.teams.map((t, i) => ({ t, i })).filter(({ i }) => !dd || i === dd.team);

  return (
    <article className="clue">
      <p className="clue-kicker">
        {category.title}{" "}
        {ddTeam && dd ? (
          <span className="clue-value">
            {ddTeam.name} · wager {formatScore(dd.wager)}
          </span>
        ) : (
          <span className="clue-value">{q.value}</span>
        )}
      </p>
      <h1 className="clue-text">
        <RichText text={q.clue} />
      </h1>
      {q.clueImage && <ClueImage src={q.clueImage} alt="Clue" />}

      {!state.answerShown ? (
        <div className="clue-actions" data-nav-row="1">
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "revealAnswer" })}>
            Show answer
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: "backToBoard" })}>
            Back to board
          </button>
          {limit > 0 && <Timer key={`${q.id}:${dd?.locked ?? ""}`} seconds={limit} />}
        </div>
      ) : (
        <div className="answer">
          <p className="answer-label">Answer</p>
          <p className="answer-text">
            <RichText text={q.answer} />
          </p>
          {q.answerImage && <ClueImage src={q.answerImage} alt="Answer" />}
          {q.explanation &&
            (state.explanationShown ? (
              <p className="answer-note">
                <RichText text={q.explanation} />
              </p>
            ) : (
              <div data-nav-row="1">
                <button type="button" className="btn btn-quiet btn-sm answer-more" onClick={() => dispatch({ type: "showExplanation" })}>
                  Show explanation
                </button>
              </div>
            ))}

          <ul className="award" aria-label="Score this clue">
            {awardTeams.map(({ t, i }, row) => (
              <li key={i} className="award-row" data-nav-row={2 + row}>
                <TeamLabel team={t} />
                <span className="award-score">{formatScore(t.score)}</span>
                <MarkButtons amount={amount} mark={state.marks[i]} teamName={t.name} first={row === 0} onMark={(mark) => dispatch({ type: "mark", team: i, mark })} />
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
  const { step, wagers, marks, participants, tiebreaker } = state.final;
  const limit = file.settings.finalTimeLimitSeconds;
  return (
    <article className="clue">
      <p className="clue-kicker">Final question</p>
      <h1 className={step === "category" ? "clue-text" : "clue-category"}>
        <RichText text={f.category} />
      </h1>
      {step !== "category" && (
        <>
          <p className="clue-text">
            <RichText text={f.clue} />
          </p>
          {f.clueImage && <ClueImage src={f.clueImage} alt="Clue" />}
        </>
      )}

      {step === "answer" && (
        <div className="answer">
          <p className="answer-label">Answer</p>
          <p className="answer-text">
            <RichText text={f.answer} />
          </p>
          {f.answerImage && <ClueImage src={f.answerImage} alt="Answer" />}
        </div>
      )}

      {tiebreaker && <p className="final-note">Tiebreaker: a right answer adds 1 point</p>}

      <ul className="award" aria-label={step === "answer" ? "Score the final question" : "Wagers"}>
        {state.teams.map((t, i) => {
          const playing = participants.includes(i);
          return (
            <li key={i} className={`award-row${playing ? "" : " is-out"}`} data-nav-row={playing ? 2 + i : undefined}>
              <TeamLabel team={t} />
              <span className="award-score">{formatScore(t.score)}</span>
              {!playing ? null : step === "answer" ? (
                <MarkButtons amount={tiebreaker ? 1 : wagers[i]} mark={marks[i]} teamName={t.name} onMark={(mark) => dispatch({ type: "finalMark", team: i, mark })} />
              ) : tiebreaker ? null : (
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
          );
        })}
      </ul>

      <div className="clue-actions" data-nav-row="30">
        {step === "category" && (
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "finalNext" })}>
            Show clue
          </button>
        )}
        {step === "clue" && (
          <>
            <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "finalNext" })}>
              Show answer
            </button>
            {limit > 0 && <Timer key="final" seconds={limit} />}
          </>
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

function ScoreCell({ team, index, dispatch }: { team: Team; index: number; dispatch: React.Dispatch<SessionAction> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const open = () => {
    setDraft(String(team.score));
    setEditing(true);
  };
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) dispatch({ type: "setScore", team: index, score: n });
    setEditing(false);
  };
  const nudge = (delta: number) => {
    dispatch({ type: "adjustScore", team: index, delta });
    setDraft(String(team.score + delta));
  };
  return (
    <div className="score">
      <span className="score-who">
        <span className="score-name">{team.name}</span>
        <Members team={team} />
      </span>
      <button type="button" className="score-edit" aria-label={`Edit ${team.name} score, now ${formatScore(team.score)}`} aria-expanded={editing} onClick={open}>
        <span className="score-value" aria-live="polite">
          {formatScore(team.score)}
        </span>
        <Pencil size={14} strokeWidth={1.5} className="score-pencil" aria-hidden="true" />
      </button>
      {editing && (
        <div
          ref={box}
          className="score-editor"
          role="group"
          aria-label={`Edit ${team.name} score`}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
          }}
          onBlur={(e) => {
            if (!box.current?.contains(e.relatedTarget as Node | null)) setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        >
          <input
            className="input score-input"
            type="number"
            inputMode="numeric"
            autoFocus
            value={draft}
            aria-label={`${team.name} score`}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={commit}>
            Set
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => nudge(-100)}>
            -100
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => nudge(100)}>
            +100
          </button>
        </div>
      )}
    </div>
  );
}

function Scoreboard({ state, dispatch }: { state: SessionState; dispatch: React.Dispatch<SessionAction> }) {
  return (
    <footer className="scoreboard" aria-label="Scores">
      {state.teams.map((t, i) => (
        <ScoreCell key={i} team={t} index={i} dispatch={dispatch} />
      ))}
    </footer>
  );
}
