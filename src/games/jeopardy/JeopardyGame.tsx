import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ArrowLeft, Check, Flag, History, Pause, Pencil, Play, RotateCcw, SkipForward, Trophy, Undo2, X } from "lucide-react";
import type { JeopardyFile } from "../../game-files/schema/jeopardy";
import { ZunoMark } from "../../components/brand/Logo";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog, Dialog } from "../../components/ui/Dialog";
import { ClueImage, RichText } from "../../components/ui/RichText";
import {
  categoryProgress,
  clueAmount,
  clueStatus,
  createSession,
  eligibleTeams,
  matchReport,
  teamProgress,
  winners,
  type ClueStatus,
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
import { playSfx, type Sfx } from "../../lib/sfx";

function jeopardySound(a: SessionAction): Sfx | null {
  switch (a.type) {
    case "open":
      return "select";
    case "revealAnswer":
    case "startFinal":
      return "reveal";
    case "mark":
    case "finalMark":
      return a.mark === 1 ? "correct" : a.mark === -1 ? "wrong" : null;
    case "ddLock":
      return "turn";
    case "finish":
      return "win";
    default:
      return null;
  }
}
import { WinnerReveal } from "./WinnerReveal";
import "./jeopardy.css";
import { gameFontStyle } from "../gameFont";

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
  const [state, rawDispatch] = useReducer(reducer, null, () => createSession(teams, allowNegativeScores));
  const dispatch = useCallback((a: SessionAction) => {
    const sound = jeopardySound(a);
    if (sound) playSfx(sound);
    rawDispatch(a);
  }, []);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [showHistory, setShowHistory] = useState(false);
  const announce = useAnnouncer(file, state);
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

  // Keyboard host controls: 1-6 buzz a team, P pauses, Ctrl/Cmd+Z undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: "undo" });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === "p" && state.phase !== "results") {
        dispatch({ type: state.paused ? "resume" : "pause" });
      } else if (state.phase === "clue" && /^[1-6]$/.test(e.key)) {
        const team = Number(e.key) - 1;
        if (team < state.teams.length) dispatch({ type: "buzz", team });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.phase, state.paused, state.teams.length]);

  useEscape(
    useCallback(() => {
      if (state.paused) dispatch({ type: "resume" });
      else if (state.phase === "clue") dispatch({ type: "backToBoard" });
      else if (state.phase === "results") onExit();
      else setConfirm("exit");
    }, [state.phase, state.paused, onExit, dispatch]),
  );

  return (
    <main className="screen game game-scope" style={{ "--game": file.appearance.accentColor, ...gameFontStyle("jeopardy") } as React.CSSProperties}>
      <header className="screen-bar game-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Exit to dashboard" onClick={() => (state.phase === "results" ? onExit() : setConfirm("exit"))}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <ZunoMark size={24} />
        <span className="screen-bar-title game-title">{file.metadata.title}</span>
        <span className="host-chip" title="You are the host">
          Host · {phaseLabel(state)}
        </span>
        <span className="screen-bar-spacer" />
        {state.phase !== "results" && (
          <>
            <button type="button" className="icon-btn" aria-label={state.paused ? "Resume game (P)" : "Pause game (P)"} title={state.paused ? "Resume game (P)" : "Pause game (P)"} onClick={() => dispatch({ type: state.paused ? "resume" : "pause" })}>
              {state.paused ? <Play size={20} strokeWidth={1.5} /> : <Pause size={20} strokeWidth={1.5} />}
            </button>
            <button type="button" className="icon-btn" aria-label="Undo last action (Ctrl+Z)" title="Undo last action (Ctrl+Z)" disabled={state.undo.length === 0} onClick={() => dispatch({ type: "undo" })}>
              <Undo2 size={20} strokeWidth={1.5} />
            </button>
            <button type="button" className="icon-btn" aria-label="Score history" title="Score history" onClick={() => setShowHistory(true)}>
              <History size={20} strokeWidth={1.5} />
            </button>
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

      <div className="stage" ref={stage} data-phase={state.phase} key={state.phase === "clue" ? state.current?.questionId : state.phase}>
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
        {state.phase === "results" && <MatchReportView file={file} state={state} />}
      </div>

      {state.phase !== "results" && <Scoreboard state={state} dispatch={dispatch} />}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {state.paused && (
        <div className="paused-overlay" role="dialog" aria-modal="true" aria-label="Game paused">
          <div className="paused-card card">
            <h2 className="dialog-title">Game paused</h2>
            <p className="dialog-text">Timers are stopped and the board is locked. Scores are kept.</p>
            <button type="button" className="btn btn-primary" autoFocus onClick={() => dispatch({ type: "resume" })}>
              <Play size={18} strokeWidth={1.5} />
              Resume
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <Dialog title="Score history" onClose={() => setShowHistory(false)}>
          {(close) => (
            <>
              <h2 className="dialog-title">Score history</h2>
              {state.history.length === 0 ? (
                <p className="dialog-text">No score changes yet.</p>
              ) : (
                <ol className="history-list">
                  {[...state.history].reverse().map((h, k) => (
                    <li key={k} className="history-row">
                      <TeamDot team={state.teams[h.team]} index={h.team} />
                      <span className="history-team">{state.teams[h.team]?.name}</span>
                      <span className={`history-delta ${h.after >= h.before ? "is-up" : "is-down"}`}>
                        {h.after >= h.before ? "+" : "−"}
                        {formatScore(Math.abs(h.after - h.before))}
                      </span>
                      <span className="history-reason">{h.reason}</span>
                      <span className="meta">→ {formatScore(h.after)}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="dialog-actions" data-nav-row="0">
                <button type="button" className="btn btn-secondary" disabled={state.undo.length === 0} onClick={() => dispatch({ type: "undo" })}>
                  <Undo2 size={18} strokeWidth={1.5} />
                  Undo latest
                </button>
                <button type="button" className="btn btn-primary" onClick={close}>
                  Close
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}

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

/** Games whose board has already been dealt once; later returns to the board skip the deal. */
const dealt = new WeakSet<object>();

function Board({ file, state, dispatch }: PartProps) {
  const [deal] = useState(() => !dealt.has(file));
  useEffect(() => {
    dealt.add(file);
  }, [file]);
  const categories = file.content.categories;
  const rows = Math.max(...categories.map((c) => c.questions.length));
  const allUsed = state.used.length >= totalClues(file);
  const tiebreakMode = file.content.finalJeopardy.mode === "tiebreaker";
  let focusGiven = false;

  return (
    <div className={`board-wrap${deal ? " is-dealing" : ""}`}>
      <div className="board" role="grid" aria-label="Game board" style={{ "--cols": categories.length, "--rows": rows } as React.CSSProperties}>
        <div className="board-row board-head-row" role="row">
          {categories.map((c) => {
            const p = categoryProgress(file, state, c.id);
            return (
              <div key={c.id} className="board-head" role="columnheader">
                <span>{c.title}</span>
                <span className="board-progress" aria-label={`${p.played} of ${p.total} played`}>
                  {p.played}/{p.total}
                </span>
              </div>
            );
          })}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="board-row" role="row">
            {categories.map((c) => {
              const q = c.questions[r];
              if (!q) return <div key={c.id} className="board-gap" role="gridcell" />;
              const used = state.used.includes(q.id);
              const status = clueStatus(state, q.id);
              const autofocus = !used && !focusGiven;
              if (autofocus) focusGiven = true;
              return (
                <div key={c.id} role="gridcell" className="board-slot" style={{ "--r": r, "--c": categories.indexOf(c) } as React.CSSProperties}>
                  <button
                    type="button"
                    className={`board-cell is-${status}${used ? " is-used" : ""}`}
                    data-nav-row={r + 1}
                    data-autofocus={autofocus ? "" : undefined}
                    disabled={used}
                    aria-label={`${c.title}, ${q.value} points, ${STATUS_LABEL[status]}`}
                    onClick={(e) => {
                      // The clue zooms open from the cell that was picked.
                      const stage = e.currentTarget.closest<HTMLElement>(".stage");
                      if (stage) {
                        const a = e.currentTarget.getBoundingClientRect();
                        const b = stage.getBoundingClientRect();
                        const root = document.documentElement.style;
                        root.setProperty("--clue-ox", `${a.left + a.width / 2 - b.left}px`);
                        root.setProperty("--clue-oy", `${a.top + a.height / 2 - b.top}px`);
                      }
                      dispatch({ type: "open", categoryId: c.id, questionId: q.id });
                    }}
                  >
                    <span className="board-value">{q.value}</span>
                    {used && <StatusIcon status={status} />}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ul className="board-legend" aria-label="Board legend">
        {(Object.keys(STATUS_LABEL) as ClueStatus[]).map((s) => (
          <li key={s} className={`legend-item is-${s}`}>
            <span className="legend-swatch" aria-hidden="true">
              <StatusIcon status={s} />
            </span>
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>
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
      <span className="award-name">
        <TeamDot team={team} />
        {team.name}
      </span>
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

      <p className="clue-phase meta">
        Step: {CLUE_PHASE_LABEL[state.cluePhase ?? "revealing"]} · {eligibleText(state)}
      </p>

      {!dd && !state.answerShown && <Buzzers state={state} dispatch={dispatch} />}

      {!state.answerShown ? (
        <>
          {state.buzzQueue.length > 0 && (
            <ul className="award" aria-label="Judge the answering team">
              {state.buzzQueue
                .filter((i) => state.marks[i] === 0)
                .slice(0, 1)
                .map((i) => (
                  <li key={i} className="award-row" data-nav-row={2}>
                    <TeamLabel team={state.teams[i]} />
                    <span className="award-score">{formatScore(state.teams[i].score)}</span>
                    <MarkButtons amount={amount} mark={state.marks[i]} teamName={state.teams[i].name} onMark={(mark) => dispatch({ type: "mark", team: i, mark })} />
                  </li>
                ))}
            </ul>
          )}
          <div className="clue-actions" data-nav-row="1">
            <button type="button" className="btn btn-primary" data-autofocus onClick={() => dispatch({ type: "revealAnswer" })}>
              Show answer
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: "skip" })}>
              <SkipForward size={18} strokeWidth={1.5} />
              Skip clue
            </button>
            {limit > 0 && <Timer key={`${q.id}:${dd?.locked ?? ""}`} seconds={limit} paused={state.paused} />}
          </div>
        </>
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
            {!state.marks.some((m) => m !== 0) && (
              <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: "skip" })}>
                <SkipForward size={18} strokeWidth={1.5} />
                No one answered
              </button>
            )}
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
            {limit > 0 && <Timer key="final" seconds={limit} paused={state.paused} />}
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

/** Rolls a number toward its new value over half a second (instantly when motion is off). */
function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const still = document.documentElement.dataset.motion === "off" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    if (still || start === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 550);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (value - start) * eased);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

function ScoreCell({ team, index, dispatch, progress }: { team: Team; index: number; dispatch: React.Dispatch<SessionAction>; progress?: { correct: number; incorrect: number } }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const shown = useCountUp(team.score);
  const prev = useRef(team.score);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; n: number } | null>(null);
  useEffect(() => {
    if (team.score === prev.current) return;
    setFlash((f) => ({ dir: team.score > prev.current ? "up" : "down", n: (f?.n ?? 0) + 1 }));
    prev.current = team.score;
  }, [team.score]);
  const open = () => {
    setDraft(String(team.score));
    setEditing(true);
  };
  const n = Number(draft);
  const preview = draft.trim() !== "" && Number.isFinite(n) && n !== team.score ? n : null;
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) dispatch({ type: "setScore", team: index, score: n });
    setEditing(false);
  };
  const nudge = (delta: number) => {
    const base = Number(draft);
    setDraft(String((Number.isFinite(base) && draft.trim() !== "" ? base : team.score) + delta));
  };
  return (
    <div className="score">
      {flash && <span key={flash.n} className={`score-flash is-${flash.dir}`} aria-hidden="true" />}
      <span className="score-who">
        <span className="score-name">
          <TeamDot team={team} index={index} />
          {team.name}
        </span>
        {progress && (
          <span className="meta score-progress" aria-label={`${progress.correct} right, ${progress.incorrect} wrong`}>
            <Check size={12} strokeWidth={2} aria-hidden="true" />
            {progress.correct} <X size={12} strokeWidth={2} aria-hidden="true" />
            {progress.incorrect}
          </span>
        )}
        <Members team={team} />
      </span>
      <button type="button" className="score-edit" aria-label={`Edit ${team.name} score, now ${formatScore(team.score)}`} aria-expanded={editing} onClick={open}>
        <span className={`score-value${flash ? ` is-${flash.dir}` : ""}`} key={flash?.n ?? 0} aria-hidden="true">
          {formatScore(shown)}
        </span>
        <span className="sr-only" aria-live="polite">
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
          <span className="score-preview meta" aria-live="polite">
            {preview === null ? "No change" : `${formatScore(team.score)} → ${formatScore(preview)} (${preview > team.score ? "+" : "−"}${formatScore(Math.abs(preview - team.score))})`}
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={preview === null} onClick={commit}>
            Confirm
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => nudge(-100)}>
            −100
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
  const progress = teamProgress(state);
  return (
    <footer className="scoreboard" aria-label="Scores">
      {state.teams.map((t, i) => (
        <ScoreCell key={i} team={t} index={i} dispatch={dispatch} progress={progress[i]} />
      ))}
    </footer>
  );
}

const STATUS_LABEL: Record<ClueStatus, string> = {
  available: "Available",
  open: "Open",
  correct: "Correct",
  incorrect: "Incorrect",
  skipped: "Skipped",
};

const CLUE_PHASE_LABEL: Record<NonNullable<SessionState["cluePhase"]>, string> = {
  revealing: "Revealing",
  buzzing: "Buzzers open",
  answering: "Answering",
  judging: "Judging",
  resolved: "Resolved",
};

function phaseLabel(state: SessionState): string {
  if (state.paused) return "Paused";
  if (state.phase === "clue") return CLUE_PHASE_LABEL[state.cluePhase ?? "revealing"];
  return { board: "Board", clue: "Clue", final: "Final question", results: "Results" }[state.phase];
}

function eligibleText(state: SessionState): string {
  const e = eligibleTeams(state);
  if (e.length === 0) return "No team can answer";
  if (e.length === state.teams.length) return "All teams can answer";
  return `Can answer: ${e.map((i) => state.teams[i].name).join(", ")}`;
}

function StatusIcon({ status }: { status: ClueStatus }) {
  if (status === "correct") return <Check size={16} strokeWidth={2} className="board-used-mark" aria-hidden="true" />;
  if (status === "incorrect") return <X size={16} strokeWidth={2} className="board-used-mark" aria-hidden="true" />;
  if (status === "skipped") return <SkipForward size={16} strokeWidth={2} className="board-used-mark" aria-hidden="true" />;
  if (status === "open") return <span className="board-used-mark legend-open" aria-hidden="true" />;
  return <span className="board-used-mark legend-avail" aria-hidden="true" />;
}

const FALLBACK_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777"];

function TeamDot({ team, index }: { team?: Team; index?: number }) {
  if (!team) return null;
  const initials = team.initials || team.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();
  return (
    <span className="team-dot" aria-hidden="true" style={{ background: team.color ?? FALLBACK_COLORS[(index ?? 0) % FALLBACK_COLORS.length] }}>
      {initials}
    </span>
  );
}

function Buzzers({ state, dispatch }: { state: SessionState; dispatch: React.Dispatch<SessionAction> }) {
  const eligible = eligibleTeams(state);
  return (
    <div className="buzzers" data-nav-row="2">
      {state.cluePhase === "revealing" && (
        <button type="button" className="btn btn-secondary" onClick={() => dispatch({ type: "openBuzzers" })}>
          Open buzzers
        </button>
      )}
      {state.teams.map((t, i) => {
        const pos = state.buzzQueue.indexOf(i);
        const locked = state.lockedOut.includes(i) || state.marks[i] === -1;
        return (
          <button
            key={i}
            type="button"
            className={`buzzer${pos >= 0 ? " is-buzzed" : ""}${locked ? " is-locked" : ""}`}
            style={{ "--team": t.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] } as React.CSSProperties}
            disabled={!eligible.includes(i) || pos >= 0}
            aria-label={`Buzz ${t.name} (key ${i + 1})${pos >= 0 ? `, buzzed number ${pos + 1}` : ""}${locked ? ", locked out" : ""}`}
            title={`Key ${i + 1}`}
            onClick={() => dispatch({ type: "buzz", team: i })}
          >
            <TeamDot team={t} index={i} />
            <span>{t.name}</span>
            <span className="buzzer-tag">{pos >= 0 ? `#${pos + 1}` : locked ? "Locked out" : `Key ${i + 1}`}</span>
          </button>
        );
      })}
      {(state.buzzQueue.length > 0 || state.lockedOut.length > 0) && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => dispatch({ type: "clearBuzz" })}>
          Clear buzzers
        </button>
      )}
    </div>
  );
}

/** Builds screen reader announcements for phase, turn, score, and reveal changes. */
function useAnnouncer(file: JeopardyFile, state: SessionState): string {
  const [message, setMessage] = useState("");
  const prev = useRef(state);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (p === state) return;
    const parts: string[] = [];
    if (p.paused !== state.paused) parts.push(state.paused ? "Game paused" : "Game resumed");
    if (p.phase !== state.phase) parts.push(phaseLabel(state));
    if (state.current && p.current?.questionId !== state.current.questionId) {
      const q = findQuestion(file, state.current.categoryId, state.current.questionId);
      if (q) parts.push(`Clue for ${q.value} opened`);
    }
    if (p.cluePhase !== state.cluePhase && state.cluePhase && state.phase === "clue") parts.push(CLUE_PHASE_LABEL[state.cluePhase]);
    const first = state.buzzQueue.find((t) => !p.buzzQueue.includes(t));
    if (first !== undefined) parts.push(`${state.teams[first].name} buzzed in`);
    if (!p.answerShown && state.answerShown) parts.push("Answer revealed");
    state.teams.forEach((t, i) => {
      if (p.teams[i] && p.teams[i].score !== t.score) parts.push(`${t.name} now ${formatScore(t.score)}`);
    });
    if (parts.length) setMessage(parts.join(". "));
  }, [file, state]);
  return message;
}

function MatchReportView({ file, state }: { file: JeopardyFile; state: SessionState }) {
  const r = matchReport(file, state);
  const win = winners(state.teams);
  const catTitle = (id: string | null) => file.content.categories.find((c) => c.id === id)?.title ?? "—";
  const clueName = (cid: string, qid: string) => {
    const q = findQuestion(file, cid, qid);
    return `${catTitle(cid)} ${q?.value ?? ""}`;
  };
  return (
    <section className="match-report card" aria-label="Match report">
      <h2 className="section-title">Match report</h2>
      <p className="meta">
        {win.length > 1 ? `Shared win: ${win.map((i) => state.teams[i].name).join(" and ")}. ` : r.bestTeam !== null ? `Best team: ${state.teams[r.bestTeam].name}. ` : ""}
        {r.answered} of {r.totalClues} clues answered right. {r.missed.length} missed or skipped.
      </p>
      <ul className="report-list">
        {r.strengths.map((s) => (
          <li key={s.team}>
            <TeamDot team={state.teams[s.team]} index={s.team} /> {state.teams[s.team].name}: strongest category {catTitle(s.categoryId)}
            {s.points > 0 ? ` (${formatScore(s.points)} points)` : ""}
          </li>
        ))}
      </ul>
      {r.missed.length > 0 && (
        <details>
          <summary>Missed clues</summary>
          <ul className="report-list">
            {r.missed.map((m) => (
              <li key={m.questionId}>{clueName(m.categoryId, m.questionId)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

