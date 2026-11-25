import { useEffect, useRef, useState } from "react";
import { Annoyed, Bell, Drum, Megaphone, Music2, PartyPopper, Play, ThumbsDown, Trophy, type LucideIcon } from "lucide-react";
import { BOARD_COOLDOWN_MS, BOARD_IDS, BOARD_INFO, boardKind, sendBoardSound, type BoardId } from "../../lib/soundboard";
import "./soundboard.css";

const ICONS: Record<BoardId, LucideIcon> = {
  airhorn: Megaphone,
  drumroll: Drum,
  sadTrombone: ThumbsDown,
  applause: PartyPopper,
  boing: Annoyed,
  rimshot: Bell,
  win: Trophy,
  wrong: Music2,
};

const tag = (id: BoardId) => {
  const { seconds } = BOARD_INFO[id];
  return `${boardKind(id) === "clip" ? "Clip" : "Synth"} · ${seconds.toFixed(1)}s`;
};

/**
 * Soundboard as a keyboard-friendly list: one row per sound with its name,
 * type and length, and a cooldown bar on the row that was just played. Arrow
 * keys, Home and End move between rows; Enter or Space plays.
 */
export function SoundBoard({ by }: { by?: string }) {
  const [cool, setCool] = useState<{ id: BoardId; n: number } | null>(null);
  const [cur, setCur] = useState(0);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const play = (id: BoardId) => {
    if (cool) return;
    if (!sendBoardSound(id, by)) return;
    setCool((c) => ({ id, n: (c?.n ?? 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCool(null), BOARD_COOLDOWN_MS);
  };

  const move = (to: number) => {
    const i = (to + BOARD_IDS.length) % BOARD_IDS.length;
    setCur(i);
    rows.current[i]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown") move(i + 1);
    else if (e.key === "ArrowUp") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(BOARD_IDS.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="sb-list" role="toolbar" aria-orientation="vertical" aria-label="Soundboard">
      {BOARD_IDS.map((id, i) => {
        const Icon = ICONS[id];
        const { label } = BOARD_INFO[id];
        const active = cool?.id === id;
        return (
          <button
            key={id}
            ref={(el) => void (rows.current[i] = el)}
            type="button"
            className={`sb-row${active ? " is-cooling" : ""}`}
            tabIndex={i === cur ? 0 : -1}
            aria-disabled={cool ? true : undefined}
            aria-label={`${label}, ${tag(id)}${active ? ", cooling down" : ""}`}
            onFocus={() => setCur(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => play(id)}
          >
            <Icon className="sb-icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="sb-label">{label}</span>
            <span className="sb-tag">{tag(id)}</span>
            <Play className="sb-play" size={14} strokeWidth={1.75} aria-hidden="true" />
            {active && <span key={cool.n} className="sb-cool" aria-hidden="true" style={{ animationDuration: `${BOARD_COOLDOWN_MS}ms` }} />}
          </button>
        );
      })}
    </div>
  );
}
