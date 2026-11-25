import { useEffect, useMemo, useReducer, useState } from "react";
import { Check, Eye, EyeOff, Pause, Play, Plus, SkipForward, Trash2, UserMinus, X } from "lucide-react";
import type { LiarFile } from "../../game-files/schema/liar";
import {
  MAX_STATEMENT_LENGTH,
  STATEMENT_COUNT,
  activePlayers,
  allVotesIn,
  createSession,
  liarReducer,
  progress,
  publicTurn,
  storyteller,
  tally,
  validateTurn,
  voters,
  votePaths,
  votesIn,
  winners,
  type Options,
  type Statement,
  type Turn,
} from "./liarEngine";
import { useLiarSounds } from "./useLiarSounds";
import { Notepad } from "../../components/notepad/Notepad";
import "./liar.css";
import { gameFontStyle } from "../gameFont";

interface Props {
  file: LiarFile;
  names: string[];
  options: Options;
  onAgain: () => void;
  onExit: () => void;
}

const blankTurn = (): { statements: Statement[]; lieIndex: number } => ({
  statements: Array.from({ length: STATEMENT_COUNT }, () => ({ text: "", questions: [""] })),
  lieIndex: -1,
});

export function LiarGame({ file, names, options, onAgain, onExit }: Props) {
  const [state, dispatch] = useReducer(liarReducer, undefined, () => createSession(names, options));
  const [confirm, setConfirm] = useState<null | "end" | "skip">(null);
  const [showPlayers, setShowPlayers] = useState(false);
  const [sessionId] = useState(() => Date.now().toString(36));
  const st = storyteller(state);
  const prog = progress(state);
  useLiarSounds(state.phase, Object.keys(state.votes).length, state.paused, st?.id ?? null);

  if (state.phase === "done") return <Done state={state} onAgain={onAgain} onExit={onExit} />;

  return (
    <main className="screen game-scope liar-game" style={{ "--game": file.appearance.accentColor, ...gameFontStyle("liar") } as React.CSSProperties}>
      <header className="liar-head">
        <div>
          <h1 className="liar-title">{file.metadata.title}</h1>
          <p className="meta" aria-live="polite">
            <strong>{st?.name}</strong> is the storyteller · Player {prog.turn} of {prog.of}
            {prog.rounds > 1 ? ` · Round ${prog.round} of ${prog.rounds}` : ""}
          </p>
        </div>
        <div className="liar-host" role="group" aria-label="Host controls">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => dispatch({ type: "pause", paused: true })}>
            <Pause size={16} strokeWidth={1.5} />
            Pause
          </button>
          {state.phase !== "reveal" &&
            (confirm === "skip" ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { dispatch({ type: "skipTurn" }); setConfirm(null); }}>
                Confirm skip {st?.name}
              </button>
            ) : (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm("skip")}>
                <SkipForward size={16} strokeWidth={1.5} />
                Skip turn
              </button>
            ))}
          <button type="button" className="btn btn-quiet btn-sm" aria-expanded={showPlayers} onClick={() => setShowPlayers((v) => !v)}>
            <UserMinus size={16} strokeWidth={1.5} />
            Players
          </button>
          {confirm === "end" ? (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => dispatch({ type: "end" })}>
              Confirm: end game{state.phase === "reveal" ? "" : " (hidden lie is not shown)"}
            </button>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm("end")}>
              <Trash2 size={16} strokeWidth={1.5} />
              End game
            </button>
          )}
          {confirm && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          )}
        </div>
      </header>

      {showPlayers && (
        <ul className="liar-players card" aria-label="Remove a player">
          {activePlayers(state).map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => dispatch({ type: "removePlayer", id: p.id })}>
                Remove {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.paused && (
        <div className="liar-pause" role="dialog" aria-modal="true" aria-label="Game paused">
          <div className="card liar-pause-card">
            <h2 className="dialog-title">Paused</h2>
            <p className="meta">Statements and votes are hidden while the game is paused.</p>
            <button type="button" className="btn btn-primary" data-autofocus ref={(el) => el?.focus()} onClick={() => dispatch({ type: "pause", paused: false })}>
              <Play size={18} strokeWidth={1.5} />
              Resume
            </button>
          </div>
        </div>
      )}

      {!state.paused && (
        <section className="liar-stage" key={`${state.round}-${state.turnIndex}-${state.phase}`}>
          {state.phase === "prep" && st && <Prep name={st.name} prompts={file.content.questionPrompts.map((p) => p.text)} onSubmit={(turn) => dispatch({ type: "submitTurn", turn })} />}
          {state.phase === "discuss" && <Discuss state={state} onVote={() => dispatch({ type: "startVoting" })} />}
          {state.phase === "vote" && <Voting state={state} dispatch={dispatch} />}
          {state.phase === "reveal" && <Reveal state={state} dispatch={dispatch} />}
        </section>
      )}
      <Scores state={state} />
      <Notepad storageKey={`zuno.liar.notes.local.${sessionId}`} me="" players={activePlayers(state)} className="card liar-panel" />
    </main>
  );
}

/** Private entry: the device is handed to the storyteller before anything is typed. */
export function Prep({ name, prompts, onSubmit, direct = false }: { name: string; prompts: string[]; onSubmit: (t: Turn) => void; direct?: boolean }) {
  const [ready, setReady] = useState(direct);
  const [draft, setDraft] = useState(blankTurn);
  const [tried, setTried] = useState(false);
  const [comfy, setComfy] = useState(false);
  const [preview, setPreview] = useState(false);
  const draftKey = `zuno.liar.draft.${name}`;
  const [saved] = useState<Turn | null>(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as Turn) : null;
    } catch {
      return null;
    }
  });
  const [restorable, setRestorable] = useState(saved !== null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        if (draft.statements.some((x) => x.text.trim() !== "")) localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        /* storage unavailable: drafts just are not kept */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [draft, draftKey]);
  const submit = (t: Turn) => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    onSubmit(t);
  };
  const errors = useMemo(() => validateTurn(draft), [draft]);
  const patch = (i: number, fn: (s: Statement) => Statement) => setDraft((d) => ({ ...d, statements: d.statements.map((s, k) => (k === i ? fn(s) : s)) }));

  if (!ready) {
    return (
      <div className="card liar-gate">
        <EyeOff size={28} strokeWidth={1.5} aria-hidden="true" />
        <h2 className="liar-h">Pass the device to {name}</h2>
        <p className="meta">{name} writes three statements and secretly marks the lie. Everyone else, look away.</p>
        <button type="button" className="btn btn-primary" data-autofocus ref={(el) => el?.focus()} onClick={() => setReady(true)}>
          I am {name}
        </button>
      </div>
    );
  }

  const shuffle = () => setDraft((d) => {
    const order = d.statements.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { statements: order.map((i) => d.statements[i]), lieIndex: d.lieIndex < 0 ? -1 : order.indexOf(d.lieIndex) };
  });

  return (
    <form
      className="card liar-prep"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (errors.length === 0 && comfy) submit(draft);
      }}
    >
      <h2 className="liar-h">{name}: two truths and a lie</h2>
      <p className="meta">Write three statements, add a question for each, and mark the one that is false. Only you can see this screen. Drafts are saved on this device.</p>
      {restorable && saved && (
        <div className="notice" role="status">
          You have a saved draft.{" "}
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setDraft(saved); setRestorable(false); }}>Restore draft</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRestorable(false)}>Start fresh</button>
        </div>
      )}
      {draft.statements.map((s, i) => (
        <fieldset key={i} className="liar-statement">
          <legend>Statement {i + 1}</legend>
          <label className="liar-field">
            <span className="field-label">What you will say</span>
            <input className="input" maxLength={200} value={s.text} data-autofocus={i === 0 ? "" : undefined} onChange={(e) => patch(i, (x) => ({ ...x, text: e.target.value }))} />
            <span className="field-hint">{s.text.trim() === "" ? "No text entered" : `${s.text.length} / ${MAX_STATEMENT_LENGTH}`}</span>
          </label>
          {s.questions.map((q, k) => (
            <div key={k} className="liar-q">
              <label className="liar-grow">
                <span className="sr-only">Statement {i + 1} follow-up question {k + 1}</span>
                <input className="input" maxLength={200} placeholder="Follow-up question the group could ask" value={q} onChange={(e) => patch(i, (x) => ({ ...x, questions: x.questions.map((y, z) => (z === k ? e.target.value : y)) }))} />
              </label>
              <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove question ${k + 1} of statement ${i + 1}`} disabled={s.questions.length <= 1} onClick={() => patch(i, (x) => ({ ...x, questions: x.questions.filter((_, z) => z !== k) }))}>
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
          ))}
          <div className="liar-q-tools">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => patch(i, (x) => ({ ...x, questions: [...x.questions, ""] }))}>
              <Plus size={16} strokeWidth={1.5} />
              Add question
            </button>
            {prompts.slice(0, 3).map((p) => (
              <button key={p} type="button" className="chip ru-chip" onClick={() => patch(i, (x) => ({ ...x, questions: x.questions.some((q) => q.trim() === "") ? x.questions.map((q, z) => (q.trim() === "" && z === x.questions.findIndex((y) => y.trim() === "") ? p : q)) : [...x.questions, p] }))}>
                {p}
              </button>
            ))}
          </div>
          <label className="liar-lie">
            <input type="radio" name="lie" checked={draft.lieIndex === i} onChange={() => setDraft((d) => ({ ...d, lieIndex: i }))} />
            <span>This one is the lie</span>
          </label>
        </fieldset>
      ))}
      <div className="liar-tools">
        <button type="button" className="btn btn-quiet btn-sm" onClick={shuffle}>Shuffle order</button>
        <button type="button" className="btn btn-quiet btn-sm" aria-pressed={preview} onClick={() => setPreview((v) => !v)}>
          <Eye size={16} strokeWidth={1.5} />
          {preview ? "Hide preview" : "Preview order"}
        </button>
      </div>
      {preview && (
        <ol className="liar-preview" aria-label="Order the group will see">
          {draft.statements.map((s, i) => <li key={i}>{s.text.trim() || "(empty)"}</li>)}
        </ol>
      )}
      <label className="switch">
        <span>I am comfortable sharing these with the group</span>
        <input type="checkbox" checked={comfy} onChange={(e) => setComfy(e.target.checked)} />
        <span className="switch-track" />
      </label>
      {tried && (errors.length > 0 || !comfy) && (
        <div className="notice" role="alert">
          <ul>
            {errors.map((e) => <li key={e}>{e}</li>)}
            {!comfy && <li>Confirm you are comfortable sharing the statements.</li>}
          </ul>
        </div>
      )}
      <button type="submit" className="btn btn-primary">Present to the group</button>
    </form>
  );
}

function Statements({ state, mark }: { state: ReturnType<typeof createSession>; mark?: boolean }) {
  const view = publicTurn(state)!;
  return (
    <ol className="liar-cards">
      {view.statements.map((s, i) => {
        const isLie = view.lieIndex === i;
        return (
          <li key={i} className={`liar-card card ${mark ? "ru-flip" : "ru-deal"}${mark && isLie ? " is-lie" : ""}`} style={{ "--i": i } as React.CSSProperties}>
            <span className="liar-num">{i + 1}</span>
            <div>
              <p className="liar-text">{s.text}</p>
              <ul className="liar-askable" aria-label={`Questions for statement ${i + 1}`}>
                {s.questions.map((q, k) => <li key={k}>{q}</li>)}
              </ul>
              {mark && view.lieIndex !== null && <p className={`liar-badge ru-badge ru-reveal ${isLie ? "is-lie" : "is-truth"}`} style={{ "--i": i + 2 } as React.CSSProperties}>{isLie ? "The lie" : "True"}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Discuss({ state, onVote }: { state: ReturnType<typeof createSession>; onVote: () => void }) {
  return (
    <div className="liar-phase">
      <h2 className="liar-h">Ask questions</h2>
      <p className="meta">The group may ask anything. {storyteller(state)?.name} can skip any question.</p>
      <Statements state={state} />
      <button type="button" className="btn btn-primary" data-autofocus ref={(el) => el?.focus()} onClick={onVote}>Start voting</button>
    </div>
  );
}

function Voting({ state, dispatch }: { state: ReturnType<typeof createSession>; dispatch: (a: Parameters<typeof liarReducer>[1]) => void }) {
  const list = voters(state);
  const [editing, setEditing] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const current = list.find((p) => p.id === editing) ?? (done ? undefined : list.find((p) => state.votes[p.id] === undefined));
  const view = publicTurn(state)!;
  const closeable = votesIn(state) > 0;

  return (
    <div className="liar-phase">
      <h2 className="liar-h">Vote for the lie</h2>
      <p className="meta" aria-live="polite">{votesIn(state)} of {list.length} votes in. Votes stay hidden until voting closes.</p>
      {current && !done ? (
        <div className="card liar-gate ru-turn" key={current.id}>
          <h3 className="liar-h">{current.name}, which statement is the lie?</h3>
          <div className="liar-options" role="group" aria-label="Choose the lie">
            {view.statements.map((s, i) => (
              <button key={i} type="button" className="liar-option" onClick={() => { dispatch({ type: "vote", voter: current.id, vote: i }); setEditing(null); setDone(true); }}>
                <span className="liar-num">{i + 1}</span>
                {s.text}
              </button>
            ))}
            {state.options.allowAbstain && (
              <button type="button" className="btn btn-quiet" onClick={() => { dispatch({ type: "vote", voter: current.id, vote: "abstain" }); setEditing(null); setDone(true); }}>
                Abstain
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card liar-gate">
          <EyeOff size={28} strokeWidth={1.5} aria-hidden="true" />
          <p className="liar-h">Vote locked in and hidden</p>
          {!allVotesIn(state) && <button type="button" className="btn btn-primary" data-autofocus ref={(el) => el?.focus()} onClick={() => setDone(false)}>Next voter: {list.find((p) => state.votes[p.id] === undefined)?.name}</button>}
        </div>
      )}
      <ul className="liar-voters" aria-label="Who has voted">
        {list.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            {state.votes[p.id] !== undefined ? (
              <>
                <span className="liar-voted"><Check size={14} strokeWidth={2} aria-hidden="true" /> Voted</span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setEditing(p.id); setDone(false); }}>Change vote</button>
              </>
            ) : <span className="meta">Waiting</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" disabled={!closeable} onClick={() => dispatch({ type: "closeVoting" })}>
        {allVotesIn(state) ? "Lock votes and reveal" : "Close voting early and reveal"}
      </button>
    </div>
  );
}

function Reveal({ state, dispatch }: { state: ReturnType<typeof createSession>; dispatch: (a: Parameters<typeof liarReducer>[1]) => void }) {
  const last = state.recap[state.recap.length - 1];
  const t = tally(last.votes);
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const correct = Object.entries(last.votes).filter(([, v]) => v === last.turn.lieIndex).map(([id]) => byId[id]);
  return (
    <div className="liar-phase">
      <h2 className="liar-h ru-reveal">The lie was statement {last.turn.lieIndex + 1}</h2>
      <Statements state={state} mark />
      <ul className="liar-tally" aria-label="Vote totals">
        {t.counts.map((n, i) => <li key={i}>Statement {i + 1}: {n} {n === 1 ? "vote" : "votes"}</li>)}
        {t.abstained > 0 && <li>Abstained: {t.abstained}</li>}
      </ul>
      <p className="meta">Storyteller: <strong>{byId[last.storytellerId]}</strong>. The lie: statement {last.turn.lieIndex + 1}.</p>
      {!state.options.anonymousVotes && (
        <ul className="liar-tally" aria-label="Vote paths">
          {Object.entries(votePaths(state)).map(([id, path]) => (
            <li key={id}>{byId[id]}: {path.map((r) => (r.vote === "abstain" ? "abstain" : `#${r.vote + 1}`) + (r.confidence !== undefined ? ` (${r.confidence}%)` : "")).join(" -> ")} {path[path.length - 1]?.vote === last.turn.lieIndex ? "(correct)" : "(wrong)"}</li>
          ))}
        </ul>
      )}
      {state.options.scoring && (
        <ul className="liar-tally ru-reveal" aria-label="Points this turn" aria-live="polite">
          {(state.scoreLog ?? []).filter((e) => e.round === state.round && e.turnIndex === state.turnIndex).map((e, i) => (
            <li key={i}>{byId[e.playerId]} {e.points > 0 ? "+" : ""}{e.points}: {e.explanation}</li>
          ))}
        </ul>
      )}
      <p className="meta">
        {correct.length > 0 ? `Spotted it: ${correct.join(", ")}.` : `Nobody spotted it. ${storyteller(state)?.name} fooled everyone.`}
        {t.counts.filter((n) => n > 0 && n === Math.max(...t.counts)).length > 1 ? " The vote was a tie." : ""}
      </p>
      <div className="liar-tools">
        <label className="liar-fix">
          <span className="field-label">Marked the wrong one by accident?</span>
          <select className="input" value={last.turn.lieIndex} onChange={(e) => dispatch({ type: "fixLie", lieIndex: Number(e.target.value) })}>
            {last.turn.statements.map((_, i) => <option key={i} value={i}>Statement {i + 1} is the lie</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-primary" data-autofocus ref={(el) => el?.focus()} onClick={() => dispatch({ type: "next" })}>
          Next storyteller
        </button>
      </div>
    </div>
  );
}

function Scores({ state, final, win }: { state: ReturnType<typeof createSession>; final?: boolean; win?: { id: string }[] }) {
  if (!state.options.scoring) return null;
  return (
    <ul className="liar-scores" aria-label="Scores">
      {activePlayers(state).map((p) => (
        <li key={p.id} className={`score${storyteller(state)?.id === p.id ? " is-teller" : ""}${final && win?.some((w) => w.id === p.id) ? " ru-win" : ""}`}>
          <span className="score-name">{p.name}</span>
          <span key={state.scores[p.id] ?? 0} className="score-value ru-reveal">{state.scores[p.id] ?? 0}</span>
        </li>
      ))}
    </ul>
  );
}

function Done({ state, onAgain, onExit }: { state: ReturnType<typeof createSession>; onAgain: () => void; onExit: () => void }) {
  const [recap, setRecap] = useState(false);
  const win = winners(state);
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const rounds = new Set(state.recap.map((r) => r.round)).size;
  return (
    <main className="screen game-scope liar-game">
      <section className="liar-stage">
        <div className="liar-phase">
          <h1 className="page-title">{state.endedEarly ? "Game ended" : "Game over"}</h1>
          <p className="page-lede">
            {state.recap.length} {state.recap.length === 1 ? "turn" : "turns"} played{rounds > 0 ? ` across ${rounds} ${rounds === 1 ? "round" : "rounds"}` : ""}.
          </p>
          {state.options.scoring ? (
            <>
              <p className="liar-h ru-reveal">{win.length === 0 ? "No points scored." : win.length > 1 ? `It is a tie: ${win.map((p) => p.name).join(" and ")}` : `${win[0].name} wins`}</p>
              <Scores state={state} final win={win} />
            </>
          ) : (
            <p className="meta">Casual game: no scores, just a recap.</p>
          )}
          <div className="liar-tools">
            <button type="button" className="btn btn-secondary" aria-expanded={recap} onClick={() => setRecap((v) => !v)}>
              {recap ? "Hide recap" : "Show recap and revealed lies"}
            </button>
          </div>
          {recap && (
            <ol className="liar-recap">
              {state.recap.map((r, i) => (
                <li key={i} className="card">
                  <p className="liar-h">{byId[r.storytellerId]}</p>
                  <ul>
                    {r.turn.statements.map((s, k) => <li key={k}>{s.text} — <strong>{k === r.turn.lieIndex ? "the lie" : "true"}</strong></li>)}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          <div className="liar-tools">
            <button type="button" className="btn btn-primary" data-autofocus ref={(el) => el?.focus()} onClick={onAgain}>Play again</button>
            <button type="button" className="btn btn-quiet" onClick={onExit}>Return to Zuno</button>
          </div>
        </div>
      </section>
    </main>
  );
}
