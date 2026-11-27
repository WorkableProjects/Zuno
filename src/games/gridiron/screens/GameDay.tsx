import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FastForward, Flag, Keyboard, Pause, Play, Repeat, SkipForward, StepForward, Timer } from "lucide-react";
import { FieldView } from "../FieldView";
import { duration, type CameraMode } from "../fieldRender";
import { gameSeed } from "../gmCareer";
import { attackDir, clockText, createGame, fgDistance, nextDecision, quarterText, runPlay, step, type Decision, type GameState, type PlayAfter, type PlayRecord, type StepInput } from "../gmEngine";
import { defCallFor, getDefensivePlays, getOffensivePlays, offCallFor } from "../gmPlaybook";
import { shortName } from "../gmPlayers";
import { buildPlayScript } from "../gmPlayScript";
import { chime, crowd, hit, horn, whistle } from "../gmSfx";
import { COVERAGES, type PlayScript, type ScheduledGame, type StatLine, type Team } from "../gmTypes";
import { PlayPicker, type PickSit } from "./PlayPicker";
import { Seg, TeamLogo, useGm } from "./ui";

interface Props {
  game: ScheduledGame;
  /** 0 = you coach the home side, 1 = away, null = watching. */
  userSide: 0 | 1 | null;
  onDone: (state: GameState) => void;
  onExit?: () => void;
}

const ordinal = (n: number) => ["", "1st", "2nd", "3rd", "4th"][n] ?? `${n}th`;
type Status = "idle" | "animating" | "between" | "await" | "final";

/** The situation shown in the scorebug. Separate from the engine, which is always one play ahead of the animation. */
export interface Sit {
  down: number;
  dist: number;
  ballOn: number;
  poss: 0 | 1;
  quarter: number;
  clock: number;
  score: [number, number];
  phase: GameState["phase"];
}
export const snapSit = (g: GameState): Sit => ({ down: g.down, dist: g.dist, ballOn: g.ballOn, poss: g.poss, quarter: g.quarter, clock: g.clock, score: [g.score[0], g.score[1]], phase: g.phase });
/** While a play animates: the snap situation the record carries, with the score from before the play. */
export const snapOfRecord = (r: PlayRecord, before: Sit): Sit => ({
  down: r.down,
  dist: r.dist,
  ballOn: r.ballOn,
  poss: r.poss,
  quarter: r.quarter,
  clock: r.clock,
  score: before.score,
  phase: r.spec.special === "kickoff" || r.spec.special === "onside" ? "kickoff" : r.spec.special === "pat" || r.spec.special === "twopoint" ? "pat" : "play",
});
/** Once the play is over: the engine's own after-play snapshot. */
export const afterSit = (a: PlayAfter): Sit => ({ down: a.down, dist: a.dist, ballOn: a.ballOn, poss: a.poss, quarter: a.quarter, clock: a.clock, score: [a.score[0], a.score[1]], phase: a.phase });

export const downText = (s: Sit): string => (s.phase === "play" ? `${ordinal(s.down)} & ${s.ballOn + s.dist >= 100 ? "Goal" : s.dist}` : s.phase === "kickoff" ? "Kickoff" : s.phase === "pat" ? "Try" : "");

export type Tone = "score" | "turnover" | "gain" | "neutral";
/** A short label for a finished play, from the engine's outcome flags (never parsed from text). */
export function resultOf(r: PlayRecord): { label: string; tone: Tone } {
  const o = r.spec.outcome;
  if (o.kind === "pat") return o.good ? { label: "Extra point good", tone: "score" } : { label: "Extra point missed", tone: "turnover" };
  if (o.kind === "twopoint") return o.good ? { label: "Two-point good", tone: "score" } : { label: "Two-point stopped", tone: "turnover" };
  if (o.kind === "fg") return o.good ? { label: "Field goal good", tone: "score" } : { label: "Field goal missed", tone: "turnover" };
  if (o.kind === "safety" || o.safety) return { label: "Safety", tone: "score" };
  if (o.defTouchdown) return { label: o.kind === "interception" ? "Pick-six" : "Defensive touchdown", tone: "score" };
  if (o.touchdown) return { label: "Touchdown", tone: "score" };
  if (o.turnoverOnDowns) return { label: "Turnover on downs", tone: "turnover" };
  if (o.kind === "interception") return { label: "Interception", tone: "turnover" };
  if (o.kind === "fumble" && o.recoveredByDefense) return { label: "Fumble lost", tone: "turnover" };
  if (o.kind === "penalty" || o.penalty) return { label: o.penalty ? `Penalty: ${o.penalty.name}` : "Penalty", tone: "neutral" };
  if (o.kind === "sack") return { label: "Sack", tone: "turnover" };
  if (o.kind === "incomplete") return { label: o.dropped ? "Incomplete, dropped" : o.deflected ? "Incomplete, broken up" : "Incomplete", tone: "neutral" };
  if (o.firstDown) return { label: "First down", tone: "gain" };
  if (o.kind === "punt") return { label: o.touchback ? "Punt, touchback" : "Punt", tone: "neutral" };
  if (o.kind === "kickoff") return { label: o.touchback ? "Touchback" : "Kickoff", tone: "neutral" };
  if (o.kind === "kneel") return { label: "Kneel down", tone: "neutral" };
  if (o.kind === "spike") return { label: "Spike", tone: "neutral" };
  return { label: o.yards === 0 ? "No gain" : `${o.yards > 0 ? "+" : ""}${o.yards} yds`, tone: "neutral" };
}

// ---------------------------------------------------------------------------
// Team colours that stay readable on the dark broadcast surfaces.

const lum = (hex: string): number => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.2;
  const v = parseInt(m[1], 16);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((v >> 16) & 255) + 0.7152 * f((v >> 8) & 255) + 0.0722 * f(v & 255);
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const BUG_BG = "#0f1310";
/** The team colour to use as an accent or line on a dark surface: primary, else secondary, else a neutral light grey. */
export const accentOn = (colors: [string, string], bg = BUG_BG): string => (contrast(colors[0], bg) >= 3 ? colors[0] : contrast(colors[1], bg) >= 3 ? colors[1] : "#d4d8d0");
/** Black or white, whichever reads on the colour. */
export const inkOn = (bg: string): string => (contrast("#ffffff", bg) >= contrast("#101410", bg) ? "#ffffff" : "#101410");

const cloneTeam = (t: Team): Team => ({ ...t, plan: { ...t.plan } });
const spot = (g: GameState, s: Sit): string => {
  if (s.ballOn === 50) return "50";
  const own = (s.poss === 0 ? g.home : g.away).abbr;
  const opp = (s.poss === 0 ? g.away : g.home).abbr;
  return s.ballOn < 50 ? `${own} ${s.ballOn}` : `${opp} ${100 - s.ballOn}`;
};
const nameOf = (t: Team) => `${t.city} ${t.name}`;

/** Snapshot of everything the side panels read, so they update when a play ends, not when the engine runs ahead. */
interface View {
  team: GameState["team"];
  stats: GameState["stats"];
  plays: PlayRecord[];
  drives: GameState["drives"];
  injuries: GameState["injuries"];
  log: string[];
  qScores: GameState["qScores"];
}
const snapView = (g: GameState): View => ({
  team: [{ ...g.team[0] }, { ...g.team[1] }],
  stats: Object.fromEntries(Object.entries(g.stats).map(([k, v]) => [k, { ...v }])) as GameState["stats"],
  plays: g.plays.slice(),
  drives: g.drives.map((d) => ({ ...d })),
  injuries: g.injuries.slice(),
  log: g.log.slice(-8),
  qScores: [g.qScores[0].slice(), g.qScores[1].slice()],
});

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function GameDay({ game, userSide, onDone }: Props) {
  const { c } = useGm();
  const home = c.teams[game.home];
  const away = c.teams[game.away];
  const coaching = userSide !== null && c.coachMode;
  // Teams are copied for the game so halftime adjustments apply to this game only.
  const g = useMemo<GameState>(
    () => createGame({ home: cloneTeam(home), away: cloneTeam(away), players: c.players, seed: gameSeed(c, game), playoff: !!game.round, neutral: game.neutral, week: game.week, userTeam: coaching ? userSide : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [, setTick] = useState(0);
  const rerender = () => setTick((x) => x + 1);
  const [status, setStatus] = useState<Status>("idle");
  const [script, setScript] = useState<PlayScript | null>(null);
  const [rec, setRec] = useState<PlayRecord | null>(null);
  const [caption, setCaption] = useState("Kickoff is coming up");
  const [announce, setAnnounce] = useState("");
  const [speed, setSpeed] = useState(1);
  const [replaySpeed, setReplaySpeed] = useState(0.5);
  const [paused, setPaused] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [mode, setMode] = useState<CameraMode>("follow");
  const [overlays, setOverlays] = useState({ routes: false, coverage: false, blocks: false, names: false });
  const [seek, setSeek] = useState<{ key: number; t: number } | undefined>();
  const [time, setTime] = useState({ t: 0, len: 1 });
  const [replaying, setReplaying] = useState(false);
  const [hasReplay, setHasReplay] = useState(false);
  const [animDone, setAnimDone] = useState(true);
  const [fourthGo, setFourthGo] = useState(false);
  const [clock, setClock] = useState(25);
  const [clockOn, setClockOn] = useState(true);
  const [halftime, setHalftime] = useState(false);
  const [timeoutArmed, setTimeoutArmed] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [sit, setSit] = useState<Sit>(() => snapSit(g));
  const [view, setView] = useState<View>(() => snapView(g));
  const [last, setLast] = useState<{ label: string; tone: Tone } | null>(null);
  const [side, setSide] = useState<"plays" | "stats" | "game">("plays");
  const halftimeShown = useRef(false);
  const timeoutRef = useRef(false);
  const doneRef = useRef(false);
  const lastScript = useRef<{ s: PlayScript; r: PlayRecord } | null>(null);
  const recRef = useRef<PlayRecord | null>(null);
  const timers = useRef(new Set<number>());
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  };
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach((id) => window.clearTimeout(id));
  }, []);

  const offPlays = useMemo(() => getOffensivePlays(c), [c, c.customPlays]);
  const defPlays = useMemo(() => getDefensivePlays(c), [c, c.customPlays]);

  const decision: Decision = nextDecision(g);
  const needsUser = (d: Decision): boolean => {
    if (!coaching || userSide === null || g.phase === "final") return false;
    if (d.kind === "play") return true;
    if (d.kind === "fourth" || d.kind === "pat" || d.kind === "challenge") return d.team === userSide;
    if (d.kind === "kickoff") return d.team === userSide && g.quarter >= 4 && g.score[userSide] < g.score[userSide === 0 ? 1 : 0];
    return false;
  };

  const settle = useCallback(
    (from?: Sit) => {
      const s = from ?? snapSit(g);
      setSit(s);
      setView(snapView(g));
      setAnimDone(true);
    },
    [g],
  );

  const runStep = useCallback(
    (input: StepInput = {}, play?: { id: string; name: string; call: ReturnType<typeof offCallFor> }) => {
      if (timeoutRef.current && userSide !== null && coaching) input = { ...input, timeout: userSide };
      timeoutRef.current = false;
      setTimeoutArmed(false);
      const before = snapSit(g);
      // Custom and built-in plays take the same engine route; the AI never receives a custom play.
      const r = play ? runPlay(g, { id: play.id, name: play.name, call: play.call }, input) : step(g, input);
      setFourthGo(false);
      setLast(null);
      if (r) {
        const s = buildPlayScript(r.spec);
        lastScript.current = { s, r };
        recRef.current = r;
        setHasReplay(true);
        setRec(r);
        setScript(s);
        setReplaying(false);
        setAnimDone(false);
        setSit(snapOfRecord(r, before));
        setStatus("animating");
        const sp = r.spec;
        setCaption(sp.off ? `${sp.playName ?? sp.off.formation} · ${sp.off.concept}` : sp.special === "kickoff" ? "Kickoff" : sp.special === "onside" ? "Onside kick" : sp.special === "punt" ? "Punt" : sp.special === "fg" ? "Field goal try" : sp.special === "pat" ? "Extra point" : sp.special === "twopoint" ? "Two-point try" : "");
      } else {
        setStatus("idle");
        settle();
      }
      rerender();
    },
    [g, userSide, coaching, settle],
  );

  // Drive the game: decide what happens when idle.
  useEffect(() => {
    if (status !== "idle" || replaying || halftime) return;
    if (g.phase === "final") {
      setStatus("final");
      setCaption(`Final${g.quarter > 4 ? " (OT)" : ""}`);
      setAnnounce(`Final${g.quarter > 4 ? " after overtime" : ""}: ${g.away.name} ${g.score[1]}, ${g.home.name} ${g.score[0]}.`);
      horn();
      return;
    }
    if (g.quarter === 3 && g.phase === "kickoff" && !halftimeShown.current && g.plays.length > 0) {
      halftimeShown.current = true;
      if (coaching) {
        setHalftime(true);
        setAnnounce("Halftime. Adjust your game plan, then start the second half.");
        return;
      }
    }
    const d = nextDecision(g);
    if (needsUser(d)) {
      setStatus("await");
      setClock(25);
      setAnnounce(
        d.kind === "challenge" ? "Replay review: you may challenge the call." :
        d.kind === "pat" ? "Your touchdown. Choose the extra point or a two-point try." :
        d.kind === "kickoff" ? "Your kickoff. Kick deep or try an onside kick." :
        d.kind === "fourth" ? `Fourth down. ${g.poss === userSide ? "Go for it, punt or kick a field goal." : ""}` :
        `${g.poss === userSide ? "Your offense" : "Your defense"}: ${downText(snapSit(g))}. Choose a play.`,
      );
      return;
    }
    if (paused) return;
    const id = window.setTimeout(() => runStep(), 120);
    return () => window.clearTimeout(id);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Play clock for your call.
  useEffect(() => {
    if (status !== "await" || decision.kind !== "play" || paused || !clockOn || replaying) return;
    const id = window.setInterval(() => setClock((x) => x - 1), 1000);
    return () => window.clearInterval(id);
  }, [status, decision.kind, paused, clockOn, replaying]);
  useEffect(() => {
    if (status === "await" && clock <= 0 && decision.kind === "play" && clockOn) runStep();
  }, [clock]); // eslint-disable-line react-hooks/exhaustive-deps

  const onEnd = () => {
    if (replaying) return;
    const r = recRef.current;
    if (r) {
      const res = resultOf(r);
      setCaption(r.text);
      setLast(res);
      settle(r.after ? afterSit(r.after) : undefined);
      setAnnounce(`${r.text} ${res.label}.`);
      if (r.spec.outcome.firstDown || res.tone === "score") chime(true);
      else if (res.tone === "turnover" && r.spec.outcome.kind !== "pat" && r.spec.outcome.kind !== "fg") chime(false);
    } else settle();
    if (stepMode) setStatus("between");
    else later(() => setStatus((s) => (s === "animating" ? "idle" : s)), 900 / Math.max(1, speed));
  };

  const onEvent = (e: PlayScript["events"][number]) => {
    setCaption(e.text);
    if (e.kind === "snap") return;
    // Pads first, then the official's whistle a beat later, as on a real field.
    if (e.kind === "tackle" || e.kind === "sack") {
      hit(e.kind === "sack" ? 1.2 : 1);
      if (!replaying) later(() => whistle(), 260 / Math.max(1, speed));
    } else if (e.kind === "pancake") hit(0.7);
    else if (e.kind === "kick") hit(0.45);
    else if (e.kind === "whistle" || e.kind === "incomplete") whistle(e.kind === "incomplete" ? 0.3 : 0.42);
    // The crowd and horn belong to the live moment, not to its replay.
    if (replaying) return;
    if (e.kind === "touchdown") horn();
    else if (e.kind === "interception") crowd(1.4);
    else if (e.kind === "sack" || (e.kind === "catch" && (recRef.current?.spec.outcome.yards ?? 0) >= 20)) crowd(1.1);
  };

  const skip = (until: "drive" | "quarter" | "end") => {
    if (replaying) setReplaying(false);
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current.clear();
    const startDrive = g.drives.length;
    const startQ = g.quarter;
    let lastRec: PlayRecord | null = null;
    let guard = 0;
    while (g.phase !== "final" && guard++ < 1500) {
      if (until === "drive" && g.drives.length > startDrive && g.phase !== "pat") break;
      if (until === "quarter" && g.quarter !== startQ) break;
      if (g.quarter === 3 && !halftimeShown.current && g.phase === "kickoff") {
        // Coaches get their halftime adjustments unless they asked for the whole game.
        if (coaching && until !== "end" && g.plays.length > 0) break;
        halftimeShown.current = true;
      }
      const r = step(g, {});
      if (r) lastRec = r;
    }
    if (lastRec) {
      recRef.current = lastRec;
      setRec(lastRec);
      setCaption(lastRec.text);
      setLast(resultOf(lastRec));
      lastScript.current = { s: buildPlayScript(lastRec.spec), r: lastRec };
      setHasReplay(true);
    }
    timeoutRef.current = false;
    setTimeoutArmed(false);
    setFourthGo(false);
    setScript(null);
    settle();
    setStatus("idle");
    setConfirmEnd(false);
    setAnnounce(until === "end" ? "Simulated to the end of the game." : until === "quarter" ? "Simulated to the end of the quarter." : "Simulated to the end of the drive.");
    rerender();
  };

  const replay = () => {
    if (!lastScript.current || status === "animating") return;
    setScript(lastScript.current.s);
    setRec(lastScript.current.r);
    setReplaying(true);
    setPaused(false);
    setSeek({ key: Date.now(), t: 0 });
    setAnnounce("Replaying the last play. Nothing in the game changes.");
  };
  const backToLive = () => {
    setReplaying(false);
    setSeek(undefined);
    if (status === "idle" || status === "between") setScript(null);
    const r = recRef.current;
    if (r) {
      setRec(r);
      setCaption(r.text);
    }
    setAnnounce("Back to the live game.");
  };

  const callTimeout = () => {
    if (!coaching || userSide === null || status !== "await" || (decision.kind !== "play" && decision.kind !== "fourth")) return;
    if (g.timeouts[userSide] <= 0) return;
    timeoutRef.current = !timeoutRef.current;
    setTimeoutArmed(timeoutRef.current);
    setCaption(timeoutRef.current ? "Timeout will be called before the snap" : "Timeout cancelled");
  };
  const canTimeout = coaching && status === "await" && (decision.kind === "play" || decision.kind === "fourth") && userSide !== null && g.timeouts[userSide] > 0;
  const timeoutWhy = !coaching ? "Timeouts are only available when you coach." : status === "final" ? "The game is over." : status !== "await" ? "Available when it is your turn to call a play." : userSide !== null && g.timeouts[userSide] <= 0 ? "You are out of timeouts." : "Call a timeout before this snap.";

  // Keyboard. Number keys are owned by the play picker while you are calling a play.
  const keys = useRef({ status, decision, replaying, canTimeout });
  keys.current = { status, decision, replaying, canTimeout };
  const actions = useRef({ replay, backToLive, callTimeout, runStep });
  actions.current = { replay, backToLive, callTimeout, runStep };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = keys.current;
      const el = e.target as HTMLElement | null;
      const key = e.key.toLowerCase();
      if (e.key === " ") {
        // Space belongs to a focused button or radio.
        if (el?.closest("button, a, [role='radio'], [role='tab'], summary, input")) return;
        e.preventDefault();
        setPaused((p) => !p);
      } else if (key === "t") actions.current.callTimeout();
      else if (key === "r") (k.replaying ? actions.current.backToLive : actions.current.replay)();
      else if (key === "c") {
        if (k.status === "await" && k.decision.kind === "challenge") actions.current.runStep({ challenge: true });
      } else if (key === "n") {
        if (k.status === "between") setStatus("idle");
      } else if (key === "k" || e.key === "?") setShowKeys((s) => !s);
      else if (e.key === "Escape") {
        if (k.replaying) actions.current.backToLive();
        setShowKeys(false);
        setConfirmEnd(false);
      } else if (/^[1-4]$/.test(e.key) && k.status !== "await") {
        if (k.replaying) {
          const v = [0.25, 0.5, 1][Number(e.key) - 1];
          if (v) setReplaySpeed(v);
        } else setSpeed([0.5, 1, 2, 4][Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Field lines. While the play animates they come from its record; afterwards from the engine.
  const dir = attackDir(g, g.poss);
  const idleLos = dir > 0 ? 10 + g.ballOn : 110 - g.ballOn;
  const showScript = status === "animating" || status === "between" || replaying || (script && status !== "idle");
  const useSpec = replaying || ((status === "animating" || status === "between") && !animDone);
  const spec = useSpec ? rec?.spec : null;
  const liveLines = g.phase === "play" && status !== "final";
  const losX = spec ? (spec.dir > 0 ? 10 + spec.los : 110 - spec.los) : liveLines ? idleLos : null;
  const firstX = spec ? (spec.special ? null : spec.dir > 0 ? 10 + spec.firstDownAt : 110 - spec.firstDownAt) : liveLines ? (dir > 0 ? 10 + Math.min(100, g.ballOn + g.dist) : 110 - Math.min(100, g.ballOn + g.dist)) : null;
  const shown = showScript ? rec?.spec : null;
  const offTeam = shown ? (shown.offTeam === g.home.id ? g.home : g.away) : g.poss === 0 ? g.home : g.away;
  const defTeam = offTeam === g.home ? g.away : g.home;
  // Home team in its colours, visitors in white.
  const kit = (t: Team): [string, string] => (t === g.home ? t.colors : ["#f3f3ef", t.colors[0]]);
  const teamsField = useMemo(() => ({ left: { abbr: home.abbr, colors: home.colors }, right: { abbr: away.abbr, colors: away.colors } }), [home, away]);

  const locked = status === "final";
  const simBlocked = locked ? "The game is over" : status === "await" ? "Make your call first (0 lets the coordinator call it)" : "";
  const playing = status === "animating" || (status === "idle" && !!script);
  const lastEnded = animDone && status !== "animating";

  return (
    <div className="gr-gameday" data-status={status}>
      <p className="gr-sr" role="status" aria-live="polite" aria-atomic="true">{announce}</p>
      <div className="gr-gd-top">
        <Scorebug g={g} sit={sit} last={lastEnded ? last : null} />
        <div className="gr-gd-controls" role="toolbar" aria-label="Playback controls">
          <div className="gr-ctl-group" role="group" aria-label="Pace">
            <button type="button" className={`btn btn-quiet gr-icon${paused ? " is-on" : ""}`} onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? "Resume" : "Pause"} title={`${paused ? "Resume" : "Pause"} (Space)`}>
              {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              <span className="gr-ctl-text">{paused ? "Paused" : "Live"}</span>
            </button>
            <Seg label="Speed" value={speed} options={[[0.5, "0.5×"], [1, "1×"], [2, "2×"], [4, "4×"]]} onChange={setSpeed} />
            <button type="button" className={`btn btn-quiet${stepMode ? " is-on" : ""}`} aria-pressed={stepMode} onClick={() => setStepMode((s) => !s)} title="Stop after every play and wait for Next snap">
              <StepForward size={16} aria-hidden="true" /> Step
            </button>
          </div>
          <div className="gr-ctl-group" role="group" aria-label="Skip">
            <button type="button" className="btn btn-quiet" onClick={() => skip("drive")} disabled={!!simBlocked} title={simBlocked || "Simulate to the end of this drive"}>
              <SkipForward size={16} aria-hidden="true" /> Drive
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => skip("quarter")} disabled={!!simBlocked} title={simBlocked || "Simulate to the end of this quarter"}>
              <FastForward size={16} aria-hidden="true" /> Quarter
            </button>
            {confirmEnd ? (
              <button type="button" className="btn btn-danger" onClick={() => skip("end")} onBlur={() => setConfirmEnd(false)} autoFocus>
                Sim to the end?
              </button>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmEnd(true)} disabled={!!simBlocked} title={simBlocked || "Simulate the rest of the game"}>
                End
              </button>
            )}
          </div>
          <div className="gr-ctl-group" role="group" aria-label="Review">
            <button type="button" className={`btn btn-quiet${replaying ? " is-on" : ""}`} onClick={replaying ? backToLive : replay} disabled={!hasReplay || (status === "animating" && !replaying)} title={replaying ? "Back to live (R)" : status === "animating" ? "Replay is available when the play ends" : "Replay the last play (R)"}>
              <Repeat size={16} aria-hidden="true" /> {replaying ? "Back to live" : "Replay"}
            </button>
            <button type="button" className={`btn btn-quiet${timeoutArmed ? " is-on" : ""}`} onClick={callTimeout} disabled={!canTimeout} aria-pressed={timeoutArmed} title={`${timeoutWhy} (T)`}>
              <Timer size={16} aria-hidden="true" /> {timeoutArmed ? "Timeout set" : "Timeout"}
            </button>
            <button type="button" className={`btn btn-quiet gr-keys-btn${showKeys ? " is-on" : ""}`} onClick={() => setShowKeys((s) => !s)} aria-expanded={showKeys} aria-controls="gr-keys" title="Keyboard shortcuts (K)">
              <Keyboard size={16} aria-hidden="true" /> <span className="gr-ctl-text">Keys</span>
            </button>
          </div>
        </div>
        {showKeys && (
          <div id="gr-keys" className="gr-keys" role="region" aria-label="Keyboard shortcuts">
            <span><kbd className="gr-kbd">Space</kbd> pause</span>
            <span><kbd className="gr-kbd">1</kbd>–<kbd className="gr-kbd">9</kbd> pick a play</span>
            <span><kbd className="gr-kbd">0</kbd> coordinator</span>
            <span><kbd className="gr-kbd">1</kbd>–<kbd className="gr-kbd">4</kbd> speed (outside play calls)</span>
            <span><kbd className="gr-kbd">T</kbd> timeout</span>
            <span><kbd className="gr-kbd">C</kbd> challenge</span>
            <span><kbd className="gr-kbd">R</kbd> replay / back to live</span>
            <span><kbd className="gr-kbd">N</kbd> next snap (step)</span>
            <span><kbd className="gr-kbd">Esc</kbd> close</span>
          </div>
        )}
      </div>

      <div className="gr-gd-main">
        <div className="gr-gd-stage" data-camera={mode}>
          <FieldView
            script={showScript ? script : null}
            teams={teamsField}
            offColors={kit(offTeam)}
            defColors={kit(defTeam)}
            losX={losX}
            firstX={firstX}
            speed={replaying ? replaySpeed : speed}
            paused={paused}
            mode={mode}
            overlays={overlays}
            seek={seek}
            onTime={(t, len) => setTime((x) => (Math.abs(x.t - t) > 0.05 || x.len !== len ? { t, len } : x))}
            onEvent={onEvent}
            onEnd={onEnd}
            idleBall={[idleLos, 26.6]}
            label={`${away.name} at ${home.name}. ${caption}`}
          />
          {replaying && <div className="gr-replay-badge" aria-hidden="true">Replay</div>}
          <div className={`gr-caption${replaying ? " is-replay" : ""}`}>{caption}</div>
          {replaying && script && (
            <div className="gr-scrub" role="group" aria-label="Replay controls">
              <span className="gr-scrub-tag">Replay · {replaySpeed === 0.25 ? "¼" : replaySpeed === 0.5 ? "½" : "1"}× speed</span>
              <input type="range" min={0} max={duration(script)} step={0.05} value={Math.min(time.t, duration(script))} onChange={(e) => { setPaused(true); setSeek({ key: Date.now(), t: Number(e.target.value) }); }} aria-label="Scrub replay" aria-valuetext={`${time.t.toFixed(1)} of ${duration(script).toFixed(1)} seconds`} />
              <Seg label="Replay speed" value={replaySpeed} options={[[0.25, "¼×"], [0.5, "½×"], [1, "1×"]]} onChange={setReplaySpeed} />
              <button type="button" className="btn btn-quiet" onClick={() => { setPaused(false); setSeek({ key: Date.now(), t: 0 }); }}>Restart</button>
              <button type="button" className="btn btn-primary" onClick={backToLive}>Back to live</button>
            </div>
          )}
          <div className="gr-view-toggles" role="group" aria-label="Field view">
            <Seg label="Camera" value={mode} options={[["follow", "Follow"], ["all22", "All-22"], ["broadcast", "Broadcast"]]} onChange={setMode} />
            {(["routes", "coverage", "blocks", "names"] as const).map((k) => (
              <label key={k} className="gr-check">
                <input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays({ ...overlays, [k]: e.target.checked })} />
                {k === "routes" ? "Routes" : k === "coverage" ? "Coverage" : k === "blocks" ? "Blocks" : "Names"}
              </label>
            ))}
          </div>

          {status === "between" && !replaying && (
            <div className="gr-callbar">
              <button type="button" className="btn btn-primary" onClick={() => setStatus("idle")} autoFocus>
                Next snap <kbd className="gr-kbd">N</kbd>
              </button>
            </div>
          )}
          {status === "await" && !halftime && !replaying && needsUser(decision) && (
            <CallSheet
              g={g}
              d={decision}
              sit={sit}
              userSide={userSide!}
              clock={clock}
              clockOn={clockOn}
              onClockOn={setClockOn}
              fourthGo={fourthGo}
              onFourthGo={setFourthGo}
              onCall={runStep}
              onTimeout={callTimeout}
              timeoutArmed={timeoutArmed}
              canTimeout={canTimeout}
              offPlays={offPlays}
              defPlays={defPlays}
              storageKey={`gridiron.picker.${c.slot}`}
            />
          )}
          {halftime && userSide !== null && <Halftime g={g} side={userSide} onDone={() => { setHalftime(false); setStatus("idle"); setAnnounce("Second half starting."); }} />}
          {status === "final" && !replaying && <FinalCard g={g} view={view} doneRef={doneRef} onDone={onDone} />}
        </div>

        <aside className="gr-gd-side" aria-label="Game panels">
          <div className="gr-side-tabs" role="tablist" aria-label="Game panels">
            {([["plays", "Plays"], ["stats", "Stats"], ["game", "Game"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" id={`gr-side-${k}`} aria-selected={side === k} aria-controls="gr-side-panel" tabIndex={side === k ? 0 : -1} className={side === k ? "is-on" : ""} onClick={() => setSide(k)}
                onKeyDown={(e) => {
                  const ks = ["plays", "stats", "game"] as const;
                  const i = ks.indexOf(k);
                  const to = e.key === "ArrowRight" ? ks[(i + 1) % 3] : e.key === "ArrowLeft" ? ks[(i + 2) % 3] : null;
                  if (!to) return;
                  e.preventDefault();
                  setSide(to);
                  document.getElementById(`gr-side-${to}`)?.focus();
                }}>
                {l}
              </button>
            ))}
          </div>
          <div id="gr-side-panel" role="tabpanel" aria-labelledby={`gr-side-${side}`} className="gr-side-body">
            {side === "plays" && (
              <>
                <DriveCard g={g} view={view} playing={playing} />
                <PlayByPlay g={g} view={view} />
              </>
            )}
            {side === "stats" && <LiveStats g={g} view={view} />}
            {side === "game" && (
              <>
                <section>
                  <h3>Win probability</h3>
                  <WinGraph g={g} view={view} />
                </section>
                <section>
                  <h3>Drives</h3>
                  <DriveList g={g} view={view} />
                </section>
                <section>
                  <h3>Event log</h3>
                  {view.log.length ? (
                    <ul className="gr-eventlog">
                      {view.log.slice().reverse().map((l, i) => <li key={`${i}-${l}`}>{l}</li>)}
                    </ul>
                  ) : (
                    <p className="gr-empty">Nothing yet. Timeouts, reviews and warnings appear here.</p>
                  )}
                </section>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Scorebug({ g, sit, last }: { g: GameState; sit: Sit; last: { label: string; tone: Tone } | null }) {
  const final = g.phase === "final";
  const team = (s: 0 | 1) => {
    const t = s === 0 ? g.home : g.away;
    const hasBall = sit.poss === s && sit.phase !== "final" && !final;
    const accent = accentOn(t.colors);
    return (
      <div className={`gr-bug-team${hasBall ? " has-ball" : ""}`} style={{ "--tc": accent, "--tc-ink": inkOn(accent) } as React.CSSProperties}>
        <TeamLogo team={t} size={24} />
        <span className="gr-bug-abbr" title={nameOf(t)}>
          {t.abbr}
          {hasBall && <span className="gr-bug-ball" aria-hidden="true" />}
          {hasBall && <span className="gr-sr"> has the ball</span>}
        </span>
        <span className="gr-bug-score" key={sit.score[s]}>{sit.score[s]}</span>
        <span className="gr-bug-to" role="img" aria-label={`${t.abbr} timeouts left: ${g.timeouts[s]}`}>
          {[0, 1, 2].map((i) => <i key={i} className={i < g.timeouts[s] ? "on" : ""} />)}
        </span>
      </div>
    );
  };
  const down = downText(sit);
  const where = sit.phase === "play" ? `at ${spot(g, sit)}` : "";
  const clockStr = final ? "Final" : `${quarterText(sit.quarter)} ${clockText(sit.clock)}`;
  return (
    <div className="gr-bug" aria-label="Scorebug">
      {team(1)}
      {team(0)}
      <div className="gr-bug-clock">
        <span className="gr-bug-q">{final ? "Final" : quarterText(sit.quarter)}</span>
        {!final && <span className="num gr-bug-time">{clockText(sit.clock)}</span>}
      </div>
      {down && !final && (
        <div className="gr-bug-down">
          <span className="gr-bug-dd">{down}</span>
          {where && <span className="gr-bug-spot">{where}</span>}
        </div>
      )}
      {last && !final && <div className={`gr-bug-res is-${last.tone}`} key={last.label}>{last.label}</div>}
      <div className="gr-bug-wx" title="Weather">{g.weather}</div>
      <div className="gr-bug-sum" aria-hidden="true">
        {clockStr}
        {!final && down ? ` · ${down}${where ? ` ${where}` : ""}` : ""}
        {!final ? ` · ${(sit.poss === 0 ? g.home : g.away).abbr} ball` : ""} · {g.weather}
      </div>
    </div>
  );
}

function CallSheet({ g, d, sit, userSide, clock, clockOn, onClockOn, fourthGo, onFourthGo, onCall, onTimeout, timeoutArmed, canTimeout, offPlays, defPlays, storageKey }: {
  g: GameState; d: Decision; sit: Sit; userSide: 0 | 1; clock: number; clockOn: boolean; onClockOn: (b: boolean) => void; fourthGo: boolean; onFourthGo: (b: boolean) => void;
  onCall: (i: StepInput, play?: { id: string; name: string; call: ReturnType<typeof offCallFor> }) => void; onTimeout: () => void; timeoutArmed: boolean; canTimeout: boolean;
  offPlays: ReturnType<typeof getOffensivePlays>; defPlays: ReturnType<typeof getDefensivePlays>; storageKey: string;
}) {
  const me = userSide === 0 ? g.home : g.away;
  const them = userSide === 0 ? g.away : g.home;
  const onOffense = g.poss === userSide;
  const lead = g.score[userSide] - g.score[userSide === 0 ? 1 : 0];
  const dd = downText(sit);
  const field = sit.phase === "play" ? `${dd} at ${spot(g, sit)}` : dd;
  const title = d.kind === "challenge" ? "Replay review" : d.kind === "pat" ? "After the touchdown" : d.kind === "kickoff" ? "Kickoff" : d.kind === "fourth" && !fourthGo ? "Fourth down" : onOffense ? "Call your offense" : "Call your defense";
  const head = (
    <div className="gr-call-head">
      <div className="gr-call-title">
        <span className={`gr-role ${onOffense ? "is-off" : "is-def"}`}>{d.kind === "challenge" || d.kind === "pat" || d.kind === "kickoff" ? "Decision" : onOffense ? "Offense" : "Defense"}</span>
        <strong>{title}</strong>
      </div>
      <div className="gr-call-sit" aria-label="Situation">
        <span className="num">{me.abbr} {g.score[userSide]}, {them.abbr} {g.score[userSide === 0 ? 1 : 0]}</span>
        <span>{field}</span>
        <span className="num">{quarterText(sit.quarter)} {clockText(sit.clock)}</span>
      </div>
      <div className="gr-call-tools">
        {d.kind === "play" && (
          <label className="gr-check" title="When the clock reaches zero the coordinator calls the play">
            <input type="checkbox" checked={clockOn} onChange={(e) => onClockOn(e.target.checked)} /> Play clock
          </label>
        )}
        {d.kind === "play" && clockOn && <span className={`gr-playclock${clock <= 5 ? " is-low" : ""}`} role="timer" aria-label={`Play clock, ${Math.max(0, clock)} seconds`}>{Math.max(0, clock)}</span>}
        <button type="button" className={`btn btn-quiet${timeoutArmed ? " is-on" : ""}`} onClick={onTimeout} disabled={!canTimeout} aria-pressed={timeoutArmed} title="T">
          <Timer size={16} aria-hidden="true" /> {timeoutArmed ? "Timeout set" : `Timeout (${g.timeouts[userSide]})`}
        </button>
      </div>
    </div>
  );

  if (d.kind === "challenge")
    return (
      <div className="gr-call" role="group" aria-label={title}>
        {head}
        <p>{d.text}</p>
        <p className="meta">You have {g.challenges[userSide]} challenge{g.challenges[userSide] === 1 ? "" : "s"} and {g.timeouts[userSide]} timeout{g.timeouts[userSide] === 1 ? "" : "s"}. A lost challenge costs a timeout.</p>
        <div className="gr-call-row">
          <button type="button" className="btn btn-primary" onClick={() => onCall({ challenge: true })} disabled={g.challenges[userSide] <= 0}>
            <Flag size={16} aria-hidden="true" /> Throw the flag <kbd className="gr-kbd">C</kbd>
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onCall({ challenge: false })}>Let it stand</button>
        </div>
      </div>
    );
  if (d.kind === "pat") {
    const diff = g.score[userSide] - g.score[userSide === 0 ? 1 : 0];
    return (
      <div className="gr-call" role="group" aria-label={title}>
        {head}
        <p className="meta">{diff === 0 ? "The game is tied." : diff > 0 ? `You lead by ${diff}.` : `You trail by ${-diff}.`} The kick is worth 1 point. The two-point try is worth 2 and is far from certain.</p>
        <div className="gr-call-row">
          <button type="button" className="btn btn-primary" onClick={() => onCall({ pat: "kick" })}>Kick the extra point</button>
          <button type="button" className="btn btn-secondary" onClick={() => onCall({ pat: "two" })}>Go for two</button>
        </div>
      </div>
    );
  }
  if (d.kind === "kickoff")
    return (
      <div className="gr-call" role="group" aria-label={title}>
        {head}
        <p className="meta">You trail late. A deep kick gives them the ball after a touchback or return. An onside kick can win it back, but if it fails they start near midfield.</p>
        <div className="gr-call-row">
          <button type="button" className="btn btn-primary" onClick={() => onCall({ onside: false })}>Kick deep</button>
          <button type="button" className="btn btn-secondary" onClick={() => onCall({ onside: true })}>Onside kick</button>
        </div>
      </div>
    );
  if (d.kind === "fourth" && !fourthGo) {
    const toGo = sit.ballOn + sit.dist >= 100 ? "the goal line" : `${sit.dist} yard${sit.dist === 1 ? "" : "s"}`;
    return (
      <div className="gr-call" role="group" aria-label={title}>
        {head}
        <div className="gr-fourth">
          <button type="button" className="gr-fourth-opt" onClick={() => onFourthGo(true)}>
            <strong>Go for it</strong>
            <span className="meta">Need {toGo}. If you miss, they take over here at {spot(g, sit)}.</span>
          </button>
          <button type="button" className="gr-fourth-opt" onClick={() => onCall({ fourth: "punt" })}>
            <strong>Punt</strong>
            <span className="meta">Give up the ball and flip the field.</span>
          </button>
          <button type="button" className="gr-fourth-opt" onClick={() => onCall({ fourth: "fg" })}>
            <strong>Field goal, {fgDistance(sit.ballOn)} yd</strong>
            <span className="meta">3 points if good. A miss hands them the ball.</span>
          </button>
        </div>
      </div>
    );
  }
  const extra: StepInput = d.kind === "fourth" ? { fourth: "go" } : {};
  // Calling frame: the team that has the ball. The defense sees the same situation.
  const pickSit: PickSit = { down: sit.down, dist: sit.dist, ballOn: sit.ballOn, quarter: sit.quarter, clock: sit.clock, diff: lead };
  return (
    <div className="gr-call gr-call-plays" role="group" aria-label={title}>
      {head}
      {d.kind === "fourth" && (
        <button type="button" className="btn btn-quiet btn-sm gr-back" onClick={() => onFourthGo(false)}>Back to fourth-down options</button>
      )}
      {onOffense ? (
        <PlayPicker
          key="off"
          unit="offense"
          plays={offPlays}
          sit={pickSit}
          storageKey={storageKey}
          coordinatorLabel="Let the offensive coordinator pick"
          onCoordinator={() => onCall(extra)}
          onPick={(p) => onCall(extra, { id: p.id, name: p.name, call: offCallFor(p, 1) })}
        />
      ) : (
        <PlayPicker
          key="def"
          unit="defense"
          plays={defPlays}
          sit={pickSit}
          storageKey={storageKey}
          coordinatorLabel="Let the defensive coordinator pick"
          onCoordinator={() => onCall({})}
          onPick={(p) => onCall({ def: defCallFor(p) })}
        />
      )}
    </div>
  );
}

function Halftime({ g, side, onDone }: { g: GameState; side: 0 | 1; onDone: () => void }) {
  const t = side === 0 ? g.home : g.away;
  const base = useRef({ passRatio: t.plan.passRatio, aggression: t.plan.aggression, blitz: t.plan.blitz, tempo: t.plan.tempo, coverage: t.coverage });
  const [, set] = useState(0);
  const LABELS = { passRatio: "Pass ratio", aggression: "4th-down aggression", blitz: "Blitz frequency", tempo: "Tempo" } as const;
  const slider = (key: keyof typeof LABELS) => (
    <label className="gr-slider">
      <span>{LABELS[key]}</span>
      <input type="range" min={0} max={100} value={t.plan[key]} onChange={(e) => { t.plan[key] = Number(e.target.value); set((x) => x + 1); }} />
      <span className="num">{t.plan[key]}</span>
    </label>
  );
  const changes = [
    ...(Object.keys(LABELS) as Array<keyof typeof LABELS>).filter((k) => t.plan[k] !== base.current[k]).map((k) => `${LABELS[k]} ${base.current[k]} → ${t.plan[k]}`),
    ...(t.coverage !== base.current.coverage ? [`Coverage ${base.current.coverage} → ${t.coverage}`] : []),
  ];
  const reset = () => {
    const b = base.current;
    t.plan.passRatio = b.passRatio;
    t.plan.aggression = b.aggression;
    t.plan.blitz = b.blitz;
    t.plan.tempo = b.tempo;
    t.coverage = b.coverage;
    set((x) => x + 1);
  };
  return (
    <div className="gr-call" role="group" aria-label="Halftime adjustments">
      <div className="gr-call-head">
        <div className="gr-call-title">
          <span className="gr-role is-off">Halftime</span>
          <strong>Adjust your game plan</strong>
        </div>
        <span className="gr-call-sit num">{g.away.abbr} {g.score[1]}, {g.home.abbr} {g.score[0]}</span>
      </div>
      <p className="meta">Changes apply to the second half of this game only. Your saved game plan is not touched.</p>
      {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map(slider)}
      <Seg label="Coverage" value={t.coverage} options={COVERAGES.map((x) => [x, x])} onChange={(v) => { t.coverage = v; set((x) => x + 1); }} />
      <p className="gr-halftime-sum" aria-live="polite">{changes.length ? `Changes: ${changes.join("; ")}.` : "No changes. You will start the second half with the same plan."}</p>
      <div className="gr-call-row">
        <button type="button" className="btn btn-primary" onClick={onDone}>Start the second half</button>
        <button type="button" className="btn btn-quiet" onClick={reset} disabled={!changes.length}>Reset changes</button>
      </div>
    </div>
  );
}

function FinalCard({ g, view, doneRef, onDone }: { g: GameState; view: View; doneRef: React.MutableRefObject<boolean>; onDone: (g: GameState) => void }) {
  const [clicked, setClicked] = useState(false);
  const qs = Math.max(4, view.qScores[0].length, view.qScores[1].length);
  const cols = Array.from({ length: qs }, (_, i) => i);
  return (
    <div className="gr-final" role="group" aria-label="Final score">
      <div>
        <h2>
          Final{g.quarter > 4 ? " (OT)" : ""}: {g.away.abbr} {g.score[1]}, {g.home.abbr} {g.score[0]}
        </h2>
        <table className="gr-table gr-table-tight gr-linescore">
          <thead>
            <tr>
              <th scope="col"><span className="gr-sr">Team</span></th>
              {cols.map((i) => <th key={i} scope="col" className="num">{i < 4 ? i + 1 : i === 4 ? "OT" : `${i - 3}OT`}</th>)}
              <th scope="col" className="num">T</th>
            </tr>
          </thead>
          <tbody>
            {([1, 0] as const).map((s) => (
              <tr key={s}>
                <th scope="row">{(s === 0 ? g.home : g.away).abbr}</th>
                {cols.map((i) => <td key={i} className="num">{view.qScores[s][i] ?? 0}</td>)}
                <td className="num"><strong>{g.score[s]}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="gr-final-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={clicked}
          autoFocus
          onClick={() => {
            if (doneRef.current) return;
            doneRef.current = true;
            setClicked(true);
            onDone(g);
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function DriveCard({ g, view, playing }: { g: GameState; view: View; playing: boolean }) {
  const drive = view.drives[view.drives.length - 1];
  const t = drive ? (drive.team === 0 ? g.home : g.away) : null;
  const yards = drive ? Math.max(0, drive.result ? drive.yards : (g.poss === drive.team ? g.ballOn : drive.start) - drive.start) : 0;
  return (
    <section className="gr-drive">
      <h3>{drive && !drive.result ? "Current drive" : "Last drive"}</h3>
      {drive && t ? (
        <>
          <p className="gr-drive-line">
            <strong style={{ color: accentOn(t.colors) }}>{t.abbr}</strong> · {drive.plays} play{drive.plays === 1 ? "" : "s"} · {yards} yd{yards === 1 ? "" : "s"}
            {drive.result ? <span className="gr-drive-res"> · {drive.result}</span> : playing ? <span className="meta"> · in progress</span> : null}
          </p>
          <div className="gr-drivebar" role="img" aria-label={`Drive started at ${drive.start} yards from its own goal and gained ${yards}`}>
            <span style={{ left: `${Math.min(99, drive.start)}%`, width: `${Math.min(100 - drive.start, Math.max(1, yards))}%`, background: accentOn(t.colors) }} />
          </div>
        </>
      ) : (
        <p className="gr-empty">No drives yet. The opening kickoff is coming up.</p>
      )}
    </section>
  );
}

function PlayByPlay({ g, view }: { g: GameState; view: View }) {
  const list = view.plays.slice(-30).reverse();
  return (
    <section className="gr-pbp">
      <h3>Play by play</h3>
      {list.length === 0 ? (
        <p className="gr-empty">Plays appear here as they finish.</p>
      ) : (
        <ol aria-label="Plays, newest first">
          {list.map((p, i) => {
            const res = resultOf(p);
            return (
              <li key={p.n} className={`${p.scoring ? "is-score " : ""}${i === 0 ? "is-latest" : ""}`}>
                <span className={`gr-pbp-tag is-${res.tone}`}>{res.label}</span>
                <span className="meta">{(p.poss === 0 ? g.home : g.away).abbr} · {quarterText(p.quarter)} {clockText(p.clock)}</span>
                <span className="gr-pbp-text">{p.text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function DriveList({ g, view }: { g: GameState; view: View }) {
  if (!view.drives.length) return <p className="gr-empty">No drives yet.</p>;
  return (
    <ol className="gr-drivelist">
      {view.drives.slice(-8).reverse().map((d, i) => {
        const t = d.team === 0 ? g.home : g.away;
        return (
          <li key={view.drives.length - i}>
            <strong style={{ color: accentOn(t.colors) }}>{t.abbr}</strong>
            <span>{d.plays} plays, {d.yards} yds</span>
            <span className="meta">{d.result || "In progress"}</span>
          </li>
        );
      })}
    </ol>
  );
}

function WinGraph({ g, view }: { g: GameState; view: View }) {
  const pts = [0.5, ...view.plays.map((p) => p.wp)];
  const w = 260;
  const h = 72;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, pts.length - 1)) * w).toFixed(1)},${((1 - v) * h).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const pct = Math.round(last * 100);
  return (
    <figure className="gr-wp">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${g.home.abbr} win probability ${pct}%`}>
        <line x1="0" x2={w} y1={h / 2} y2={h / 2} className="gr-wp-mid" />
        <path d={d} fill="none" stroke={accentOn(g.home.colors, "#161a17")} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="gr-wp-cap">
        <span><strong>{g.home.abbr}</strong> <span className="num">{pct}%</span></span>
        <span className="meta">line shows {g.home.abbr}</span>
        <span><strong>{g.away.abbr}</strong> <span className="num">{100 - pct}%</span></span>
      </figcaption>
    </figure>
  );
}

function LiveStats({ g, view }: { g: GameState; view: View }) {
  const [a, h] = [view.team[1], view.team[0]];
  const bars: Array<[string, number, number, string?, string?]> = [
    ["Total yards", a.totalYds, h.totalYds],
    ["Passing", a.passYds, h.passYds],
    ["Rushing", a.rushYds, h.rushYds],
    ["First downs", a.firstDowns, h.firstDowns],
    ["Turnovers", a.turnovers, h.turnovers],
    ["3rd down", a.thirdConv, h.thirdConv, `${a.thirdConv}/${a.thirdAtt}`, `${h.thirdConv}/${h.thirdAtt}`],
    ["Penalties", a.penalties, h.penalties, `${a.penalties}-${a.penYds}`, `${h.penalties}-${h.penYds}`],
  ];
  const top = (side: 0 | 1, key: keyof StatLine) => {
    const tid = (side === 0 ? g.home : g.away).id;
    let best: [number, number] | null = null;
    for (const k in view.stats) {
      const p = g.players[Number(k)];
      if (p?.teamId !== tid) continue;
      const v = view.stats[Number(k)][key];
      if (v > 0 && (!best || v > best[1])) best = [p.id, v];
    }
    return best ? `${shortName(g.players[best[0]])} ${best[1]}` : "—";
  };
  const hot = (id: string) => ({ color: accentOn(id === "a" ? g.away.colors : g.home.colors) });
  return (
    <>
      <section>
        <h3>Team comparison</h3>
        <div className="gr-cmp-head" aria-hidden="true">
          <strong style={hot("a")}>{g.away.abbr}</strong>
          <strong style={hot("h")}>{g.home.abbr}</strong>
        </div>
        <dl className="gr-cmp">
          {bars.map(([label, x, y, xs, ys]) => {
            const tot = x + y;
            return (
              <div key={label} className="gr-cmp-row">
                <dd className="num">{xs ?? x}</dd>
                <dt>{label}</dt>
                <dd className="num">{ys ?? y}</dd>
                <span className="gr-cmp-bar" aria-hidden="true">
                  <i style={{ width: `${tot ? (x / tot) * 100 : 50}%`, background: accentOn(g.away.colors) }} />
                  <i style={{ width: `${tot ? (y / tot) * 100 : 50}%`, background: accentOn(g.home.colors) }} />
                </span>
              </div>
            );
          })}
        </dl>
      </section>
      <section>
        <h3>Top performers</h3>
        <dl className="gr-leaders-mini">
          {([["Passing yds", "pYds"], ["Rushing yds", "rYds"], ["Receiving yds", "recYds"], ["Tackles", "tkl"]] as Array<[string, keyof StatLine]>).map(([l, k]) => (
            <div key={k}>
              <dt className="meta">{l}</dt>
              <dd><span style={hot("a")}>{g.away.abbr}</span> {top(1, k)}<br /><span style={hot("h")}>{g.home.abbr}</span> {top(0, k)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3>Injuries</h3>
        {view.injuries.length ? (
          <ul className="gr-eventlog">
            {view.injuries.map((i) => <li key={i.playerId}>{i.name}, {(g.players[i.playerId]?.teamId === g.home.id ? g.home : g.away).abbr}{i.weeks ? `, out ${i.weeks} wk${i.weeks === 1 ? "" : "s"}` : ""}</li>)}
          </ul>
        ) : (
          <p className="gr-empty">No injuries in this game.</p>
        )}
      </section>
    </>
  );
}
