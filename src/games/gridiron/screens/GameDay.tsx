import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FastForward, Flag, Pause, Play, Repeat, SkipForward, Timer } from "lucide-react";
import { FieldView } from "../FieldView";
import { duration, type CameraMode } from "../fieldRender";
import { gameSeed } from "../gmCareer";
import { attackDir, clockText, createGame, fgDistance, nextDecision, quarterText, step, yardLine, type Decision, type GameState, type PlayRecord, type StepInput } from "../gmEngine";
import { DEF_PLAYS, OFF_PLAYS } from "../gmPlaybook";
import { shortName } from "../gmPlayers";
import { buildPlayScript } from "../gmPlayScript";
import { crowd, hit, horn, whistle } from "../gmSfx";
import { COVERAGES, type PlayScript, type ScheduledGame, type StatLine } from "../gmTypes";
import { Seg, TeamLogo, useGm } from "./ui";

interface Props {
  game: ScheduledGame;
  /** 0 = you coach the home side, 1 = away, null = watching. */
  userSide: 0 | 1 | null;
  onDone: (state: GameState) => void;
  onExit: () => void;
}

const ordinal = (n: number) => ["", "1st", "2nd", "3rd", "4th"][n] ?? `${n}th`;
type Status = "idle" | "animating" | "between" | "await" | "final";

export function GameDay({ game, userSide, onDone, onExit }: Props) {
  const { c } = useGm();
  const home = c.teams[game.home];
  const away = c.teams[game.away];
  const coaching = userSide !== null && c.coachMode;
  const g = useMemo<GameState>(
    () => createGame({ home, away, players: c.players, seed: gameSeed(c, game), playoff: !!game.round, neutral: game.neutral, week: game.week, userTeam: coaching ? userSide : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [, setTick] = useState(0);
  const rerender = () => setTick((x) => x + 1);
  const [status, setStatus] = useState<Status>("idle");
  const [script, setScript] = useState<PlayScript | null>(null);
  const [rec, setRec] = useState<PlayRecord | null>(null);
  const [caption, setCaption] = useState("Kickoff is coming up");
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [mode, setMode] = useState<CameraMode>("follow");
  const [overlays, setOverlays] = useState({ routes: false, coverage: false, blocks: false, names: false });
  const [seek, setSeek] = useState<{ key: number; t: number } | undefined>();
  const [time, setTime] = useState({ t: 0, len: 1 });
  const [replaying, setReplaying] = useState(false);
  const [fourthGo, setFourthGo] = useState(false);
  const [clock, setClock] = useState(25);
  const [halftime, setHalftime] = useState(false);
  const halftimeShown = useRef(false);
  const timeoutNext = useRef(false);
  const lastScript = useRef<{ s: PlayScript; r: PlayRecord } | null>(null);

  const decision: Decision = nextDecision(g);
  const needsUser = (d: Decision): boolean => {
    if (!coaching || userSide === null) return false;
    if (d.kind === "play") return true;
    if (d.kind === "fourth" || d.kind === "pat" || d.kind === "challenge") return d.team === userSide;
    if (d.kind === "kickoff") return d.team === userSide && g.quarter >= 4 && g.score[userSide] < g.score[userSide === 0 ? 1 : 0];
    return false;
  };

  const runStep = useCallback(
    (input: StepInput = {}) => {
      if (timeoutNext.current && userSide !== null) {
        input = { ...input, timeout: userSide };
        timeoutNext.current = false;
      }
      const r = step(g, input);
      setFourthGo(false);
      if (r) {
        const s = buildPlayScript(r.spec);
        lastScript.current = { s, r };
        setRec(r);
        setScript(s);
        setReplaying(false);
        setStatus("animating");
        setCaption(r.spec.off ? `${r.spec.off.formation} · ${r.spec.off.concept}` : r.spec.special === "kickoff" ? "Kickoff" : r.spec.special === "punt" ? "Punt" : r.spec.special === "fg" ? "Field goal try" : r.spec.special === "pat" ? "Extra point" : "");
      } else {
        setStatus("idle");
      }
      rerender();
    },
    [g, userSide],
  );

  // Drive the game: decide what happens when idle.
  useEffect(() => {
    if (status !== "idle") return;
    if (g.phase === "final") {
      setStatus("final");
      setCaption(`Final${g.quarter > 4 ? " (OT)" : ""}`);
      horn();
      return;
    }
    if (g.quarter === 3 && g.phase === "kickoff" && !halftimeShown.current && g.plays.length > 0) {
      halftimeShown.current = true;
      if (coaching) {
        setHalftime(true);
        return;
      }
    }
    const d = nextDecision(g);
    if (needsUser(d)) {
      setStatus("await");
      setClock(25);
      return;
    }
    const id = window.setTimeout(() => runStep(), 120);
    return () => window.clearTimeout(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Play clock for your call.
  useEffect(() => {
    if (status !== "await" || decision.kind !== "play" || paused) return;
    const id = window.setInterval(() => setClock((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, [status, decision.kind, paused]);
  useEffect(() => {
    if (status === "await" && clock <= 0 && decision.kind === "play") runStep();
  }, [clock]); // eslint-disable-line react-hooks/exhaustive-deps

  const onEnd = () => {
    if (replaying) return;
    if (rec) setCaption(rec.text);
    if (stepMode) setStatus("between");
    else window.setTimeout(() => setStatus((s) => (s === "animating" ? "idle" : s)), 900 / Math.max(1, speed));
  };

  const onEvent = (e: PlayScript["events"][number]) => {
    setCaption(e.text);
    if (e.kind === "snap") return;
    // Pads first, then the official's whistle a beat later, as on a real field.
    if (e.kind === "tackle" || e.kind === "sack") {
      hit(e.kind === "sack" ? 1.2 : 1);
      window.setTimeout(() => whistle(), 260 / Math.max(1, speed));
    } else if (e.kind === "pancake") hit(0.7);
    else if (e.kind === "kick") hit(0.45);
    else if (e.kind === "whistle" || e.kind === "incomplete") whistle(e.kind === "incomplete" ? 0.3 : 0.42);
    if (e.kind === "touchdown") horn();
    else if (e.kind === "interception") crowd(1.4);
    else if (e.kind === "sack" || (e.kind === "catch" && (rec?.spec.outcome.yards ?? 0) >= 20)) crowd(1.1);
  };

  const skip = (until: "drive" | "quarter" | "end") => {
    const startDrive = g.drives.length;
    const startQ = g.quarter;
    let last: PlayRecord | null = null;
    let guard = 0;
    while (g.phase !== "final" && guard++ < 1500) {
      if (until === "drive" && g.drives.length > startDrive && g.phase !== "pat") break;
      if (until === "quarter" && g.quarter !== startQ) break;
      if (g.quarter === 3 && !halftimeShown.current && g.phase === "kickoff") halftimeShown.current = true;
      const r = step(g, {});
      if (r) last = r;
    }
    if (last) {
      setRec(last);
      setCaption(last.text);
      lastScript.current = { s: buildPlayScript(last.spec), r: last };
    }
    setScript(null);
    setStatus("idle");
    rerender();
  };

  const replay = () => {
    if (!lastScript.current) return;
    setScript(lastScript.current.s);
    setRec(lastScript.current.r);
    setReplaying(true);
    setSpeed(0.5);
    setPaused(false);
    setSeek({ key: Date.now(), t: 0 });
  };

  // Hot keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "t" || e.key === "T") callTimeout();
      else if (e.key === "r" || e.key === "R") replay();
      else if (e.key === "c" || e.key === "C") {
        if (status === "await" && decision.kind === "challenge") runStep({ challenge: true });
      } else if (["1", "2", "3", "4"].includes(e.key)) setSpeed([0.5, 1, 2, 4][Number(e.key) - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const callTimeout = () => {
    if (userSide === null || g.timeouts[userSide] <= 0 || timeoutNext.current) return;
    timeoutNext.current = true;
    setCaption("Timeout called for the next snap");
    rerender();
  };

  // Field lines.
  const dir = attackDir(g, g.poss);
  const idleLos = dir > 0 ? 10 + g.ballOn : 110 - g.ballOn;
  const showScript = status === "animating" || status === "between" || replaying || (script && status !== "idle");
  const playing = status === "animating" || status === "between" || replaying;
  const spec = playing ? rec?.spec : null;
  const losX = spec ? (spec.dir > 0 ? 10 + spec.los : 110 - spec.los) : g.phase === "play" ? idleLos : null;
  const firstX = spec ? (spec.special ? null : spec.dir > 0 ? 10 + spec.firstDownAt : 110 - spec.firstDownAt) : g.phase === "play" ? (dir > 0 ? 10 + Math.min(100, g.ballOn + g.dist) : 110 - Math.min(100, g.ballOn + g.dist)) : null;
  const shown = showScript ? rec?.spec : null;
  const offTeam = shown ? c.teams[shown.offTeam] : g.poss === 0 ? home : away;
  const defTeam = offTeam === home ? away : home;
  // Home team in its colours, visitors in white.
  const kit = (t: typeof home): [string, string] => (t === home ? t.colors : ["#f3f3ef", t.colors[0]]);
  const teamsField = useMemo(() => ({ left: { abbr: home.abbr, colors: home.colors }, right: { abbr: away.abbr, colors: away.colors } }), [home, away]);

  const down = g.phase === "play" ? `${ordinal(g.down)} & ${g.ballOn + g.dist >= 100 ? "Goal" : g.dist}` : g.phase === "kickoff" ? "Kickoff" : g.phase === "pat" ? "PAT" : "";
  const drive = g.drives[g.drives.length - 1];

  return (
    <div className="gr-gameday">
      <div className="gr-gd-top">
        <Scorebug g={g} down={down} />
        <div className="gr-gd-controls" role="toolbar" aria-label="Playback">
          <button type="button" className="btn btn-quiet gr-icon" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"} title="Space">
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <Seg label="Speed" value={speed} options={[[0.5, "0.5×"], [1, "1×"], [2, "2×"], [4, "4×"]]} onChange={setSpeed} />
          <button type="button" className={`btn btn-quiet${stepMode ? " is-on" : ""}`} onClick={() => setStepMode((s) => !s)} title="Stop after each play">
            Pause between snaps
          </button>
          <button type="button" className="btn btn-quiet" onClick={replay} disabled={!lastScript.current} title="R">
            <Repeat size={16} /> Replay
          </button>
          <span className="gr-sep" />
          <button type="button" className="btn btn-quiet" onClick={() => skip("drive")} disabled={status === "final" || status === "await"}>
            <SkipForward size={16} /> Drive
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => skip("quarter")} disabled={status === "final" || status === "await"}>
            <FastForward size={16} /> Quarter
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => skip("end")} disabled={status === "final"}>
            End
          </button>
        </div>
      </div>

      <div className="gr-gd-main">
        <div className="gr-gd-stage">
          <FieldView
            script={showScript ? script : null}
            teams={teamsField}
            offColors={kit(offTeam)}
            defColors={kit(defTeam)}
            losX={losX}
            firstX={firstX}
            speed={speed}
            paused={paused}
            mode={mode}
            overlays={overlays}
            seek={seek}
            onTime={(t, len) => setTime((x) => (Math.abs(x.t - t) > 0.05 || x.len !== len ? { t, len } : x))}
            onEvent={onEvent}
            onEnd={onEnd}
            idleBall={[idleLos, 26.6]}
            label={`${away.name} at ${home.name}, ${caption}`}
          />
          <div className="gr-caption" aria-live="polite">
            {caption}
          </div>
          {replaying && script && (
            <div className="gr-scrub">
              <span className="meta">Replay</span>
              <input type="range" min={0} max={duration(script)} step={0.05} value={time.t} onChange={(e) => setSeek({ key: Date.now(), t: Number(e.target.value) })} aria-label="Scrub replay" />
              <Seg label="Replay speed" value={speed} options={[[0.25, "¼×"], [0.5, "½×"], [1, "1×"]]} onChange={setSpeed} />
              <button type="button" className="btn btn-quiet" onClick={() => { setReplaying(false); setStatus("idle"); setSpeed(1); }}>
                Back to live
              </button>
            </div>
          )}
          <div className="gr-view-toggles">
            <Seg label="Camera" value={mode} options={[["follow", "Follow"], ["all22", "All-22"], ["broadcast", "Broadcast"]]} onChange={setMode} />
            {(["routes", "coverage", "blocks", "names"] as const).map((k) => (
              <label key={k} className="gr-check">
                <input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays({ ...overlays, [k]: e.target.checked })} />
                {k === "routes" ? "Routes" : k === "coverage" ? "Coverage" : k === "blocks" ? "Blocks" : "Names"}
              </label>
            ))}
          </div>

          {status === "between" && (
            <div className="gr-callbar">
              <button type="button" className="btn btn-primary" onClick={() => setStatus("idle")}>
                Next snap
              </button>
            </div>
          )}
          {status === "await" && !halftime && (
            <CallSheet
              g={g}
              d={decision}
              userSide={userSide!}
              clock={clock}
              fourthGo={fourthGo}
              onFourthGo={() => setFourthGo(true)}
              onCall={runStep}
              onTimeout={callTimeout}
              timeoutArmed={timeoutNext.current}
            />
          )}
          {halftime && userSide !== null && <Halftime g={g} side={userSide} onDone={() => { setHalftime(false); setStatus("idle"); }} />}
          {status === "final" && (
            <div className="gr-final">
              <h2>
                Final{g.quarter > 4 ? " (OT)" : ""}: {away.abbr} {g.score[1]}, {home.abbr} {g.score[0]}
              </h2>
              <div className="gr-final-actions">
                <button type="button" className="btn btn-primary" onClick={() => onDone(g)}>
                  Continue
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="gr-gd-side">
          <section>
            <h3>Drive</h3>
            {drive ? (
              <>
                <p className="meta">
                  {(drive.team === 0 ? home : away).abbr} · {drive.plays} plays · {Math.max(0, (drive.result ? drive.yards : g.ballOn - drive.start))} yds · from {yardLine(drive.start)}
                </p>
                <div className="gr-drivebar" aria-hidden="true">
                  <span style={{ left: `${drive.start}%`, width: `${Math.max(1, (drive.result ? drive.yards : g.ballOn - drive.start))}%`, background: (drive.team === 0 ? home : away).colors[0] }} />
                </div>
              </>
            ) : (
              <p className="meta">No drives yet</p>
            )}
          </section>
          <section>
            <h3>Win probability</h3>
            <WinGraph g={g} />
          </section>
          <section>
            <h3>Stats</h3>
            <LiveStats g={g} />
          </section>
          <section className="gr-pbp">
            <h3>Play by play</h3>
            <ol>
              {g.plays.slice(-14).reverse().map((p) => (
                <li key={p.n} className={p.scoring ? "is-score" : ""}>
                  <span className="meta">
                    {quarterText(p.quarter)} {clockText(p.clock)}
                  </span>{" "}
                  {p.text}
                </li>
              ))}
            </ol>
          </section>
          {g.log.length > 0 && <p className="meta gr-gamelog">{g.log[g.log.length - 1]}</p>}
          {status !== "final" && (
            <button type="button" className="btn btn-quiet" onClick={() => { skip("end"); onExit(); }}>
              Sim to the end and leave
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Scorebug({ g, down }: { g: GameState; down: string }) {
  const side = (s: 0 | 1) => {
    const t = s === 0 ? g.home : g.away;
    return (
      <div className={`gr-bug-team${g.poss === s && g.phase !== "final" ? " has-ball" : ""}`} style={{ "--tc": t.colors[0] } as React.CSSProperties}>
        <TeamLogo team={t} size={22} />
        <span className="gr-bug-abbr">{t.abbr}</span>
        <span className="gr-bug-score">{g.score[s]}</span>
        <span className="gr-bug-to" aria-label={`${g.timeouts[s]} timeouts`}>
          {[0, 1, 2].map((i) => (
            <i key={i} className={i < g.timeouts[s] ? "on" : ""} />
          ))}
        </span>
      </div>
    );
  };
  return (
    <div className="gr-bug">
      {side(1)}
      {side(0)}
      <div className="gr-bug-clock">
        <span>{g.phase === "final" ? "Final" : quarterText(g.quarter)}</span>
        <span className="num">{g.phase === "final" ? "" : clockText(g.clock)}</span>
      </div>
      {down && g.phase !== "final" && <div className="gr-bug-down">{down}</div>}
      <div className="meta gr-bug-wx">{g.weather}</div>
    </div>
  );
}

function CallSheet({ g, d, userSide, clock, fourthGo, onFourthGo, onCall, onTimeout, timeoutArmed }: {
  g: GameState; d: Decision; userSide: 0 | 1; clock: number; fourthGo: boolean; onFourthGo: () => void; onCall: (i: StepInput) => void; onTimeout: () => void; timeoutArmed: boolean;
}) {
  const onOffense = g.poss === userSide;
  const head = (
    <div className="gr-call-head">
      <strong>{d.kind === "challenge" ? "Replay" : d.kind === "pat" ? "After the touchdown" : d.kind === "kickoff" ? "Kickoff" : `${ordinal(g.down)} & ${g.ballOn + g.dist >= 100 ? "Goal" : g.dist} at the ${yardLine(g.ballOn)}`}</strong>
      {d.kind === "play" && <span className={`gr-playclock${clock <= 5 ? " is-low" : ""}`}>{clock}</span>}
      <button type="button" className="btn btn-quiet" onClick={onTimeout} disabled={g.timeouts[userSide] <= 0 || timeoutArmed} title="T">
        <Timer size={16} /> {timeoutArmed ? "Timeout set" : `Timeout (${g.timeouts[userSide]})`}
      </button>
    </div>
  );
  if (d.kind === "challenge")
    return (
      <div className="gr-call">
        {head}
        <p>{d.text} You have {g.challenges[userSide]} challenge{g.challenges[userSide] === 1 ? "" : "s"}. A lost challenge costs a timeout.</p>
        <div className="gr-call-row">
          <button type="button" className="btn btn-primary" onClick={() => onCall({ challenge: true })}>
            <Flag size={16} /> Throw the flag
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onCall({ challenge: false })}>
            Let it stand
          </button>
        </div>
      </div>
    );
  if (d.kind === "pat")
    return (
      <div className="gr-call">
        {head}
        <div className="gr-call-row">
          <button type="button" className="btn btn-primary" onClick={() => onCall({ pat: "kick" })}>Kick the extra point</button>
          <button type="button" className="btn btn-secondary" onClick={() => onCall({ pat: "two" })}>Go for two</button>
        </div>
      </div>
    );
  if (d.kind === "kickoff")
    return (
      <div className="gr-call">
        {head}
        <div className="gr-call-row">
          <button type="button" className="btn btn-primary" onClick={() => onCall({ onside: false })}>Kick deep</button>
          <button type="button" className="btn btn-secondary" onClick={() => onCall({ onside: true })}>Onside kick</button>
        </div>
      </div>
    );
  if (d.kind === "fourth" && !fourthGo)
    return (
      <div className="gr-call">
        {head}
        <div className="gr-call-row">
          <button type="button" className="btn btn-primary" onClick={onFourthGo}>Go for it</button>
          <button type="button" className="btn btn-secondary" onClick={() => onCall({ fourth: "punt" })}>Punt</button>
          <button type="button" className="btn btn-secondary" onClick={() => onCall({ fourth: "fg" })}>Field goal ({fgDistance(g.ballOn)} yd)</button>
        </div>
      </div>
    );
  const extra: StepInput = d.kind === "fourth" ? { fourth: "go" } : {};
  return (
    <div className="gr-call">
      {head}
      {onOffense ? (
        <div className="gr-cards">
          {OFF_PLAYS.map((p) => (
            <button key={p.name} type="button" className="gr-card" onClick={() => onCall({ ...extra, off: { ...p, side: 1 } })}>
              <strong>{p.name}</strong>
              <span className="meta">
                {p.formation} · {p.personnel} · {p.type === "playaction" ? "Play action" : p.type}
              </span>
            </button>
          ))}
          <button type="button" className="gr-card is-auto" onClick={() => onCall(extra)}>
            <strong>Coordinator call</strong>
            <span className="meta">Let the OC pick</span>
          </button>
        </div>
      ) : (
        <div className="gr-cards">
          {DEF_PLAYS.map((p) => (
            <button key={p.name} type="button" className="gr-card" onClick={() => onCall({ def: p })}>
              <strong>{p.name}</strong>
              <span className="meta">
                {p.pkg} · {p.call}
              </span>
            </button>
          ))}
          <button type="button" className="gr-card is-auto" onClick={() => onCall({})}>
            <strong>Coordinator call</strong>
            <span className="meta">Let the DC pick</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Halftime({ g, side, onDone }: { g: GameState; side: 0 | 1; onDone: () => void }) {
  const t = side === 0 ? g.home : g.away;
  const [, set] = useState(0);
  const slider = (key: "passRatio" | "aggression" | "blitz" | "tempo", label: string) => (
    <label className="gr-slider">
      <span>{label}</span>
      <input type="range" min={0} max={100} value={t.plan[key]} onChange={(e) => { t.plan[key] = Number(e.target.value); set((x) => x + 1); }} />
      <span className="num">{t.plan[key]}</span>
    </label>
  );
  return (
    <div className="gr-call">
      <div className="gr-call-head">
        <strong>Halftime adjustments</strong>
        <span className="meta">
          {g.away.abbr} {g.score[1]}, {g.home.abbr} {g.score[0]}
        </span>
      </div>
      {slider("passRatio", "Pass ratio")}
      {slider("aggression", "4th-down aggression")}
      {slider("blitz", "Blitz frequency")}
      {slider("tempo", "Tempo")}
      <Seg label="Coverage" value={t.coverage} options={COVERAGES.map((x) => [x, x])} onChange={(v) => { t.coverage = v; set((x) => x + 1); }} />
      <div className="gr-call-row">
        <button type="button" className="btn btn-primary" onClick={onDone}>Start the second half</button>
      </div>
    </div>
  );
}

function WinGraph({ g }: { g: GameState }) {
  const pts = [0.5, ...g.plays.map((p) => p.wp)];
  const w = 260;
  const h = 72;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, pts.length - 1)) * w).toFixed(1)},${((1 - v) * h).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <figure className="gr-wp">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${g.home.abbr} win probability ${Math.round(last * 100)}%`}>
        <line x1="0" x2={w} y1={h / 2} y2={h / 2} className="gr-wp-mid" />
        <path d={d} fill="none" stroke={g.home.colors[0] === "#111827" ? g.home.colors[1] : g.home.colors[0]} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="meta">
        {g.home.abbr} {Math.round(last * 100)}% · {g.away.abbr} {100 - Math.round(last * 100)}%
      </figcaption>
    </figure>
  );
}

function LiveStats({ g }: { g: GameState }) {
  const rows: Array<[string, (s: GameState["team"][0]) => string]> = [
    ["Total yards", (s) => String(s.totalYds)],
    ["Passing", (s) => String(s.passYds)],
    ["Rushing", (s) => String(s.rushYds)],
    ["First downs", (s) => String(s.firstDowns)],
    ["3rd down", (s) => `${s.thirdConv}/${s.thirdAtt}`],
    ["Turnovers", (s) => String(s.turnovers)],
    ["Penalties", (s) => `${s.penalties}-${s.penYds}`],
  ];
  const top = (side: 0 | 1, key: keyof StatLine) => {
    const tid = (side === 0 ? g.home : g.away).id;
    let best: [number, number] | null = null;
    for (const k in g.stats) {
      const p = g.players[Number(k)];
      if (p?.teamId !== tid) continue;
      const v = g.stats[Number(k)][key];
      if (v > 0 && (!best || v > best[1])) best = [p.id, v];
    }
    return best ? `${shortName(g.players[best[0]])} ${best[1]}` : "—";
  };
  return (
    <>
      <table className="gr-table gr-table-tight">
        <thead>
          <tr>
            <th />
            <th className="num">{g.away.abbr}</th>
            <th className="num">{g.home.abbr}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([l, f]) => (
            <tr key={l}>
              <td>{l}</td>
              <td className="num">{f(g.team[1])}</td>
              <td className="num">{f(g.team[0])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="gr-leaders-mini">
        {([["Passing yds", "pYds"], ["Rushing yds", "rYds"], ["Receiving yds", "recYds"], ["Tackles", "tkl"]] as Array<[string, keyof StatLine]>).map(([l, k]) => (
          <div key={k}>
            <dt className="meta">{l}</dt>
            <dd>
              {top(1, k)} · {top(0, k)}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
