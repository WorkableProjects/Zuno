import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { playSfx } from "../../lib/sfx";

function beep() {
  playSfx("timeUp");
}

/**
 * Countdown for a clue. Starts on mount; mount it with a key that changes when
 * the clue changes, and unmount it when the answer is shown. Renders inline
 * controls so it can sit inside an existing nav row.
 */
export function Timer({ seconds, paused = false }: { seconds: number; paused?: boolean }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(true);
  const beeped = useRef(false);

  useEffect(() => {
    if (!running || paused || remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [running, paused, remaining]);

  useEffect(() => {
    if (running && !paused && remaining > 0 && remaining <= 5) playSfx("tick");
  }, [running, paused, remaining]);

  useEffect(() => {
    if (remaining === 0 && !beeped.current) {
      beeped.current = true;
      beep();
    }
  }, [remaining]);

  const done = remaining === 0;
  const restart = () => {
    beeped.current = false;
    setRemaining(seconds);
    setRunning(true);
  };

  return (
    <span className={`timer${done ? " is-done" : ""}`} role="timer" aria-label="Time left">
      <span className="timer-readout" aria-live="off">
        {done ? "Time's up" : `${remaining}s`}
      </span>
      {done && <span className="sr-only" aria-live="assertive">Time is up. Scores change only when you mark a team.</span>}
      <span className="timer-bar" aria-hidden="true">
        <span className="timer-fill" style={{ transform: `scaleX(${seconds > 0 ? remaining / seconds : 0})` }} />
      </span>
      {!done && (
        <button type="button" className="icon-btn" aria-label={running ? "Pause timer" : "Resume timer"} title={running ? "Pause timer" : "Resume timer"} onClick={() => setRunning((r) => !r)}>
          {running ? <Pause size={18} strokeWidth={1.5} /> : <Play size={18} strokeWidth={1.5} />}
        </button>
      )}
      <button type="button" className="icon-btn" aria-label="Restart timer" title="Restart timer" onClick={restart}>
        <RotateCcw size={18} strokeWidth={1.5} />
      </button>
    </span>
  );
}
