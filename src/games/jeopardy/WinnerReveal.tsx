import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, RotateCcw, Trophy } from "lucide-react";
import { standings, type Team } from "./jeopardyEngine";
import "./winnerReveal.css";

const formatScore = (n: number) => n.toLocaleString("en-US");

const INTRO_MS = 1500;
const PLACE_MS = 1500;
const DRUM_MS = 1900;
const CONFETTI_MS = 4000;

type Stage = "intro" | "places" | "drum" | "done";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Subtle rising tone while the drum roll builds. Never throws. */
function playRise(ms: number): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    const d = ms / 1000;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + d);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + d * 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + d + 0.2);
    osc.onended = () => void ctx.close().catch(() => {});
  } catch {
    /* audio is optional */
  }
}

function CountUp({ value, instant }: { value: number; instant: boolean }) {
  const [shown, setShown] = useState(instant ? value : 0);
  useEffect(() => {
    if (instant) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, instant]);
  return <>{formatScore(shown)}</>;
}

function Confetti({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      onDone();
      return;
    }
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const css = getComputedStyle(canvas);
    const colors = ["--game", "--game", "--game", "--sunset-1", "--sunset-2", "--sunset-3", "--positive", "--text"]
      .map((v) => css.getPropertyValue(v).trim())
      .filter(Boolean);
    if (!colors.length) colors.push("#79b8ff");
    const pieces = Array.from({ length: 120 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.45,
      vx: (Math.random() - 0.5) * 16,
      vy: -6 - Math.random() * 12,
      size: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const age = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = age > CONFETTI_MS - 800 ? Math.max(0, (CONFETTI_MS - age) / 800) : 1;
      ctx.globalAlpha = fade;
      for (const p of pieces) {
        p.vy += 0.28;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (age < CONFETTI_MS) raf = requestAnimationFrame(tick);
      else onDone();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return <canvas ref={ref} className="wr-confetti" aria-hidden="true" />;
}

export function WinnerReveal({
  teams,
  onAgain,
  onExit,
  onTiebreak,
}: {
  teams: Team[];
  onAgain: () => void;
  onExit: () => void;
  onTiebreak?: () => void;
}) {
  const table = useMemo(() => standings(teams), [teams]);
  const reduced = useMemo(prefersReducedMotion, []);
  const winners = table.filter((t) => t.rank === 1);
  const podium = table.filter((t) => t.rank <= 3);
  const rest = table.filter((t) => t.rank > 3);
  // Ranks to reveal before first place, lowest place first.
  const lowerRanks = useMemo(() => [...new Set(podium.map((t) => t.rank))].filter((r) => r !== 1).sort((a, b) => b - a), [podium]);

  const [stage, setStage] = useState<Stage>(reduced ? "done" : "intro");
  const [placesShown, setPlacesShown] = useState(reduced ? lowerRanks.length : 0);
  const [skipped, setSkipped] = useState(reduced);
  const [confetti, setConfetti] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  const skip = useCallback(() => {
    setSkipped(true);
    setPlacesShown(lowerRanks.length);
    setStage("done");
  }, [lowerRanks.length]);

  // Timeline.
  useEffect(() => {
    if (stage === "done") return;
    let t: number;
    if (stage === "intro") {
      t = window.setTimeout(() => setStage(lowerRanks.length ? "places" : "drum"), INTRO_MS);
    } else if (stage === "places") {
      if (placesShown < lowerRanks.length) {
        t = window.setTimeout(() => setPlacesShown((n) => n + 1), placesShown === 0 ? 300 : PLACE_MS);
      } else {
        t = window.setTimeout(() => setStage("drum"), PLACE_MS);
      }
    } else {
      playRise(DRUM_MS);
      t = window.setTimeout(() => setStage("done"), DRUM_MS);
    }
    return () => window.clearTimeout(t);
  }, [stage, placesShown, lowerRanks.length]);

  // Confetti on reveal.
  useEffect(() => {
    if (stage === "done" && !reduced) setConfetti(true);
  }, [stage, reduced]);

  // Enter or Space skips while animating.
  useEffect(() => {
    if (stage === "done") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, skip]);

  // Move focus to the primary action once the reveal finishes.
  useEffect(() => {
    if (stage !== "done") return;
    rootRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [stage]);

  const done = stage === "done";
  const tie = winners.length > 1;
  const showTiebreak = done && tie && !!onTiebreak;
  const joinNames = (names: string[]) => (names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join(" and "));

  const visible = (rank: number) => {
    if (rank === 1) return done;
    return placesShown >= lowerRanks.indexOf(rank) + 1 && lowerRanks.includes(rank);
  };

  // Podium column order: 2nd, 1st, 3rd.
  const order = (rank: number) => (rank === 2 ? 0 : rank === 1 ? 1 : 2);
  const columns = [...podium].sort((a, b) => order(a.rank) - order(b.rank));

  const heading = done
    ? tie
      ? `${joinNames(winners.map((w) => w.name))} tie for first`
      : `${winners[0].name} wins`
    : "And the winner is…";

  return (
    <article className={`results winner-reveal${done ? " is-done" : ""}${reduced ? " is-reduced" : ""}`} ref={rootRef} data-stage={stage}>
      <div className="wr-dim" aria-hidden="true" />
      <p className="clue-kicker">Final standings</p>
      <h1 className="clue-text wr-heading" aria-live="polite" key={done ? "done" : "build"}>
        {heading}
      </h1>

      <ol className="wr-podium" aria-label="Podium">
        {columns.map((t, i) => {
          const shown = visible(t.rank);
          const drum = stage === "drum" && t.rank === 1;
          return (
            <li
              key={i}
              className={`wr-col wr-rank-${t.rank}${shown ? " is-shown" : ""}${drum ? " is-drum" : ""}${done && t.rank === 1 ? " is-winner" : ""}`}
              aria-hidden={!shown}
            >
              {done && t.rank === 1 && (
                <Crown className="wr-crown" size={48} strokeWidth={1.5} aria-hidden="true" />
              )}
              <div className="wr-block">
                <span className="wr-place">{t.rank}</span>
                <span className="wr-name">{t.name}</span>
                {t.members.length > 0 && <span className="wr-members">{t.members.join(", ")}</span>}
                <span className="wr-score">{shown ? <CountUp value={t.score} instant={skipped} /> : formatScore(0)}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {done && (
        <div className="wr-after">
          {rest.length > 0 && (
            <ol className="standings wr-rest" start={4}>
              {rest.map((t, i) => (
                <li key={i} className="standing">
                  <span className="standing-rank">{t.rank}</span>
                  <span className="standing-name">{t.name}</span>
                  <span className="standing-score">{formatScore(t.score)}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="clue-actions" data-nav-row="1">
            {showTiebreak && (
              <button type="button" className="btn btn-primary" data-autofocus onClick={onTiebreak}>
                <Trophy size={18} strokeWidth={1.5} />
                Break the tie with the final question
              </button>
            )}
            <button
              type="button"
              className={showTiebreak ? "btn btn-secondary" : "btn btn-primary"}
              {...(showTiebreak ? {} : { "data-autofocus": true })}
              onClick={onExit}
            >
              Back to dashboard
            </button>
            <button type="button" className="btn btn-secondary" onClick={onAgain}>
              <RotateCcw size={18} strokeWidth={1.5} />
              Play again
            </button>
          </div>
        </div>
      )}

      {!done && (
        <button type="button" className="btn btn-quiet btn-sm wr-skip" onClick={skip}>
          Skip
        </button>
      )}
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
    </article>
  );
}
