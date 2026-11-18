import { useEffect, useRef, useState } from "react";
import { Check, Eye, FastForward, Flag, Lightbulb, Pause, Play, SkipForward, Undo2, X } from "lucide-react";
import type { GauntletFile } from "../../game-files/schema/gauntlet";
import * as G from "./gauntletEngine";
import { GauntletResults } from "./GauntletResults";
import { TimerBadge } from "../../components/ui/Status";
import { clearHost, markHost, publishGauntlet, saveHost, toGauntletPublic, watchGauntletLobby, watchGauntletMoves, applyGauntletMove } from "./gauntletLobby";
import "./gauntlet.css";

interface Props {
  file: GauntletFile;
  teams: G.TeamSetup[];
  options: G.Options;
  onAgain: () => void;
  onExit: () => void;
  /** Online room: phones send moves; this host publishes a public view. */
  online?: { code: string; teamMap: Record<number, string>; initial?: G.GauntletState };
}

const LANE_INFO: Record<G.LaneType, { title: string; blurb: string }> = {
  quickfire: { title: "Quickfire", blurb: "10 second answers. Streaks multiply up to 5x." },
  puzzle: { title: "Puzzle", blurb: "500 points, less with each hint." },
  wild: { title: "Wild", blurb: "A twist card changes the rules." },
};
const PHASE_TITLE: Record<G.Phase, string> = {
  lobby: "Lobby",
  warmup: "Warm-Up Sprint",
  laneChoice: "Lane selection",
  laneRound: "Lane round",
  intermission: "Intermission",
  choice: "Choice round",
  chaos: "Chaos round",
  final: "Final Gauntlet",
  results: "Results",
};

/** What the board shows for a turn. */
function turnContent(file: GauntletFile, t: G.Turn): { prompt: string; answer: string; hints: string[]; extra?: string; statements?: string[] } {
  const c = file.content;
  switch (t.kind) {
    case "warmup":
      return { ...c.warmup[t.itemIndex], hints: [] };
    case "quickfire":
      return { ...c.lanes.quickfire[t.itemIndex], hints: [] };
    case "puzzle":
      return { ...c.lanes.puzzle[t.itemIndex] };
    case "wild": {
      const w = c.lanes.wild[t.itemIndex];
      return { ...w, hints: [], extra: `Wild card: ${w.effect}` };
    }
    case "choice":
      return { ...c.choice[t.itemIndex][t.tier ?? "safe"], hints: [], extra: `${t.tier} challenge` };
    case "chaos":
      return { ...c.chaos[t.itemIndex], hints: [] };
    case "climb":
      return { ...c.final.climb[t.itemIndex], hints: [], extra: "Climb" };
    case "crossroads": {
      const x = c.final.crossroads[t.itemIndex];
      return { ...x, hints: [], extra: `Crossroads: ${x.category}` };
    }
    case "lock": {
      const l = c.final.lock[t.itemIndex];
      return { prompt: l.prompt, answer: `Statement ${l.falseIndex + 1} is false`, hints: [], statements: l.statements, extra: "Lock" };
    }
    case "summit":
      return { ...c.final.summit[t.itemIndex], hints: [], extra: "Summit: first correct team wins 750" };
  }
}

function onlineStart(file: GauntletFile, teams: G.TeamSetup[], options: G.Options): G.GauntletState {
  // Players are present on their phones, so everyone starts ready.
  const s = G.createGauntlet(file, teams, options, `s${Date.now().toString(36)}`);
  return s.teams.reduce((acc, t) => t.players.reduce((a, p) => G.setReady(a, p.id, true), acc), s);
}

export function GauntletGame({ file, teams, options, onAgain, onExit, online }: Props) {
  const [state, setState] = useState(() => (online?.initial ? { ...online.initial, timer: { ...online.initial.timer, runningSince: null } } : null) ?? (online ? onlineStart(file, teams, options) : G.createGauntlet(file, teams, options)));
  const seats = useRef<Record<string, string>>({});
  const code = online?.code;
  const teamMap = online?.teamMap;

  // Track which team each phone belongs to, including late joiners.
  useEffect(() => {
    if (!code || !teamMap) return;
    void markHost(code).catch(() => undefined);
    const stopLobby = watchGauntletLobby(code, (l) => {
      seats.current = Object.fromEntries(Object.entries(l?.players ?? {}).map(([id, p]) => [id, p.team === null ? "" : (teamMap[p.team] ?? "")]));
    }, () => undefined);
    const stopMoves = watchGauntletMoves(code, (by, move) => setState((s) => applyGauntletMove(s, seats.current[by] || null, move, Date.now())));
    return () => {
      stopLobby();
      stopMoves();
    };
  }, [code, teamMap]);

  // Publish every revision and keep a copy so a refreshed host can resume.
  useEffect(() => {
    if (!code || !teamMap) return;
    void publishGauntlet(code, toGauntletPublic(file, state)).catch(() => undefined);
    if (state.phase === "results") clearHost();
    else saveHost({ code, file, state, seats: Object.fromEntries(Object.entries(teamMap).map(([k, v]) => [k, v])) });
  }, [code, teamMap, file, state]);
  const [now, setNow] = useState(() => Date.now());
  const [reveal, setReveal] = useState(false);
  const [partial, setPartial] = useState("");
  const [shared, setShared] = useState<string>("");
  const act = (f: (s: G.GauntletState, t: number) => G.GauntletState) => setState((s) => f(s, Date.now()));
  const turn = G.currentTurn(state);
  const open = turn && !turn.resolved ? turn : null;

  useEffect(() => {
    if (!open || state.timer.runningSince === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      setState((s) => G.expireTimer(s, t));
    }, 250);
    return () => window.clearInterval(id);
  }, [open, state.timer.runningSince]);

  useEffect(() => {
    setReveal(false);
    setPartial("");
    setShared("");
  }, [state.turnIndex, state.phase]);

  const secs = Math.ceil(G.remaining(state.timer, now) / 1000);
  const content = turn ? turnContent(file, turn) : null;
  const sharedTurn = !!open && open.teamId === null;
  const target = sharedTurn ? shared || undefined : undefined;
  const picker = state.phase === "laneChoice" ? G.nextPicker(state) : null;

  return (
    <main className="screen game-scope" style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <div className="gl-wrap">
        <header className="gl-row" data-nav-row="0">
          <div>
            <p className="meta">{file.metadata.title}{code ? ` · Room ${code}` : ""} · {options.mode === "survival" ? "Survival" : "Standard"}{options.safeMode ? " · Safe mode" : ""}</p>
            <h1 className="page-title">{PHASE_TITLE[state.phase]}{state.phase === "laneRound" || state.phase === "laneChoice" ? ` ${state.roundIndex + 1}` : ""}</h1>
          </div>
          <div className="gl-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={state.history.length === 0} onClick={() => act((s) => G.undoLastAction(s))}>
              <Undo2 size={16} strokeWidth={1.5} /> Undo
            </button>
            {state.phase !== "results" && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => act((s) => G.finishMatch(s))}>
                <Flag size={16} strokeWidth={1.5} /> End match
              </button>
            )}
            <button type="button" className="btn btn-quiet btn-sm" onClick={onExit}>
              <X size={16} strokeWidth={1.5} /> Exit
            </button>
          </div>
        </header>

        <ul className="gl-rail" aria-label="Teams" data-nav-row="1">
          {state.teams.map((t) => (
            <li key={t.id} className={`gl-team${state.activeTeamId === t.id ? " is-active" : ""}${t.eliminated ? " is-out" : ""}`} aria-current={state.activeTeamId === t.id ? "true" : undefined}>
              <span>{t.name}{state.finalists.includes(t.id) && state.phase === "final" ? " · finalist" : ""}</span>
              <span className="gl-team-score" aria-label={`${state.scores[t.id]} points`}>{state.scores[t.id]}</span>
              <span className="meta">
                Streak {state.streaks[t.id]} · {G.multiplier(state.streaks[t.id])}x
                {state.laneSelections[t.id] ? ` · ${LANE_INFO[state.laneSelections[t.id]].title}` : ""}
                {t.eliminated ? " · out" : ""}
              </span>
            </li>
          ))}
        </ul>

        {state.phase === "results" && <GauntletResults state={state} onAgain={onAgain} onExit={onExit} />}

        {state.phase === "lobby" && (
          <section className="card gl-panel" aria-label="Readiness">
            <p className="meta">Mark each player ready, or move them between teams.</p>
            {state.teams.map((t) => (
              <div key={t.id} className="gl-actions" data-nav-row={10}>
                <strong className="gl-grow">{t.name}</strong>
                {t.players.map((p) => (
                  <span key={p.id} className="gl-actions">
                    <button type="button" className={`btn btn-sm ${p.ready ? "btn-primary" : "btn-secondary"}`} aria-pressed={p.ready} onClick={() => act((s) => G.setReady(s, p.id, !p.ready))}>
                      {p.ready && <Check size={16} strokeWidth={1.5} />} {p.name}
                    </button>
                    <label>
                      <span className="sr-only">Move {p.name} to</span>
                      <select className="input" value={t.id} onChange={(e) => act((s) => G.movePlayer(s, p.id, e.target.value))}>
                        {state.teams.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </label>
                  </span>
                ))}
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setState((s) => s.teams.reduce((acc, t) => t.players.reduce((a, p) => G.setReady(a, p.id, true), acc), s))}>
                <Check size={16} strokeWidth={1.5} /> Mark everyone ready
              </button>
            </div>
          </section>
        )}

        {state.phase === "laneChoice" && (
          <section className="card gl-panel" aria-live="polite">
            <p className="meta">{picker ? `${G.teamName(state, picker)} picks a lane` : "Every team has a lane."}</p>
            <div className="gl-lanes" data-nav-row={10}>
              {G.LANES.map((l) => (
                <button key={l} type="button" className="gl-lane" disabled={!picker || G.laneLocked(state, l)} onClick={() => picker && act((s) => G.chooseLane(s, picker, l))}>
                  <strong>{LANE_INFO[l].title}</strong>
                  <span className="meta">{LANE_INFO[l].blurb}</span>
                  <span className="meta">{Object.entries(state.laneSelections).filter(([, x]) => x === l).map(([id]) => G.teamName(state, id)).join(", ") || (G.laneLocked(state, l) ? "Locked" : "Open")}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {state.phase === "choice" && state.turns.length === 0 && (
          <section className="card gl-panel">
            <p className="meta">Each team secretly picks: Safe 300, Bold 600 (miss costs 100), Unknown 450.</p>
            {G.activeTeams(state).map((t) => (
              <div key={t.id} className="gl-actions" data-nav-row={10}>
                <strong className="gl-grow">{t.name}</strong>
                {state.choiceSelections[t.id] ? (
                  <span className="meta">Locked in</span>
                ) : (
                  (["safe", "bold", "unknown"] as const).map((tier) => (
                    <button key={tier} type="button" className="btn btn-secondary btn-sm" onClick={() => act((s) => G.submitChoice(s, t.id, tier))}>
                      {tier}
                    </button>
                  ))
                )}
              </div>
            ))}
          </section>
        )}

        {state.phase === "intermission" && (
          <section className="card gl-panel">
            <p className="meta">Lane round {state.roundIndex + 1} complete.</p>
            {state.eliminationHistory.length > 0 && <p>Eliminated so far: {state.eliminationHistory.map((id) => G.teamName(state, id)).join(", ")}</p>}
            {!options.safeMode && (
              <div className="gl-actions">
                {G.activeTeams(state).map((t) => (
                  <button key={t.id} type="button" className="btn btn-quiet btn-sm" onClick={() => act((s) => G.eliminateTeam(s, t.id))}>
                    Eliminate {t.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {turn && content && state.phase !== "results" && (
          <section className="card gl-question" aria-live="polite" aria-labelledby="gl-q">
            <div className="gl-row">
              <span className="meta">
                {content.extra ? `${content.extra} · ` : ""}Question {state.turnIndex + 1} of {state.turns.length} · {turn.teamId ? G.teamName(state, turn.teamId) : "All teams"}
                {turn.teamId && !turn.resolved ? ` · worth ${G.turnValue(state, turn, turn.teamId)}` : ""}
              </span>
              {open && <TimerBadge seconds={secs} paused={state.timer.runningSince === null} />}
            </div>
            <p id="gl-q" className="gl-prompt">{content.prompt}</p>
            {content.statements && <ol>{content.statements.map((x) => <li key={x}>{x}</li>)}</ol>}
            {content.hints.slice(0, turn.hintsUsed).map((h, i) => <p key={i} className="meta">Hint {i + 1}: {h}</p>)}
            {turn.submission && <p>Answer from {G.teamName(state, turn.submission.teamId)}: <strong>{turn.submission.text}</strong></p>}
            {(reveal || turn.resolved) && <p className="gl-answer">{content.answer}</p>}
            {turn.resolved && <p className="meta">Result: {turn.outcome}{turn.points ? ` (${turn.points > 0 ? "+" : ""}${turn.points})` : ""}</p>}
            {open && (
              <div className="gl-actions" data-nav-row={20}>
                {sharedTurn && (
                  <label>
                    <span className="sr-only">Team answering</span>
                    <select className="input" value={shared} onChange={(e) => setShared(e.target.value)}>
                      <option value="">Choose team</option>
                      {G.activeTeams(state).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReveal((r) => !r)}>
                  <Eye size={16} strokeWidth={1.5} /> {reveal ? "Hide" : "Reveal"} answer
                </button>
                <button type="button" className="btn btn-primary btn-sm" disabled={sharedTurn && !target} onClick={() => act((s, t) => G.resolveAnswer(s, true, t, target))}>
                  <Check size={16} strokeWidth={1.5} /> Accept
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={sharedTurn && !target} onClick={() => act((s, t) => G.resolveAnswer(s, false, t, target))}>
                  <X size={16} strokeWidth={1.5} /> Reject
                </button>
                <label>
                  <span className="sr-only">Partial points</span>
                  <input className="input" inputMode="numeric" style={{ width: 96 }} placeholder="Points" value={partial} onChange={(e) => setPartial(e.target.value.replace(/\D/g, ""))} />
                </label>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!partial || (sharedTurn && !target)} onClick={() => act((s, t) => G.awardPartialCredit(s, Number(partial), t, target))}>
                  Partial
                </button>
                {turn.kind === "puzzle" && (
                  <button type="button" className="btn btn-quiet btn-sm" disabled={turn.hintsUsed >= content.hints.length} onClick={() => act((s) => G.revealHint(s))}>
                    <Lightbulb size={16} strokeWidth={1.5} /> Hint
                  </button>
                )}
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => act((s, t) => G.passQuestion(s, t))}>
                  <SkipForward size={16} strokeWidth={1.5} /> Pass
                </button>
                <button type="button" className="btn btn-quiet btn-sm" aria-pressed={state.timer.runningSince === null} onClick={() => act((s, t) => G.pauseTimer(s, t))}>
                  {state.timer.runningSince === null ? <Play size={16} strokeWidth={1.5} /> : <Pause size={16} strokeWidth={1.5} />}
                  {state.timer.runningSince === null ? "Resume" : "Pause"}
                </button>
              </div>
            )}
          </section>
        )}

        {state.phase !== "results" && (
          <div className="gl-actions" data-nav-row={30}>
            <button type="button" className="btn btn-primary" disabled={!G.canAdvance(state)} onClick={() => act((s, t) => G.advanceRound(s, t))}>
              <FastForward size={18} strokeWidth={1.5} /> {state.phase === "lobby" ? "Start warm-up" : state.phase === "choice" && state.turns.length === 0 ? "Reveal choices" : "Advance"}
            </button>
          </div>
        )}

        {state.log.length > 0 && (
          <details className="card gl-panel">
            <summary>Event log</summary>
            <ol className="gl-log">{state.log.slice(-20).map((l, i) => <li key={i}>{l}</li>)}</ol>
          </details>
        )}
      </div>
    </main>
  );
}
