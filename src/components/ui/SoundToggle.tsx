import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Annoyed, Bell, Drum, Megaphone, Music2, PartyPopper, ThumbsDown, Trophy, Volume, Volume1, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { sendBoardSound, useSoundboardRoom, type BoardId } from "../../lib/soundboard";
import { getVolume, isMuted, setMuted, setVolume, subscribeMuted } from "../../lib/audio";

const BOARD: { id: BoardId; label: string; Icon: LucideIcon }[] = [
  { id: "airhorn", label: "Air horn", Icon: Megaphone },
  { id: "drumroll", label: "Drum roll", Icon: Drum },
  { id: "sadTrombone", label: "Sad trombone", Icon: ThumbsDown },
  { id: "applause", label: "Applause", Icon: PartyPopper },
  { id: "boing", label: "Boing", Icon: Annoyed },
  { id: "rimshot", label: "Rimshot", Icon: Bell },
  { id: "win", label: "Fanfare", Icon: Trophy },
  { id: "wrong", label: "Buzzer", Icon: Music2 },
];

/**
 * Always-visible sound control. Clicking the speaker mutes; hovering or
 * focusing it opens a level meter from 0% to 100%.
 */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const volume = useSyncExternalStore(subscribeMuted, getVolume, () => 0.7);
  const percent = Math.round(volume * 100);
  const silent = muted || percent === 0;
  const Icon = silent ? VolumeX : percent < 34 ? Volume : percent < 67 ? Volume1 : Volume2;
  const room = useSoundboardRoom();
  const [boardOpen, setBoardOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const boardBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!boardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Keep the screen underneath from also reacting to this Escape.
      e.preventDefault();
      setBoardOpen(false);
      boardBtn.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setBoardOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [boardOpen]);
  return (
    <div className="sound-control" ref={root}>
      <div className="sound-meter">
        <span className="sound-level" aria-hidden="true">
          {silent ? "Off" : `${percent}%`}
        </span>
        <input
          type="range"
          className="sound-slider"
          min={0}
          max={100}
          step={1}
          value={muted ? 0 : percent}
          aria-label="Music volume"
          aria-valuetext={silent ? "Off" : `${percent} percent`}
          style={{ "--level": `${muted ? 0 : percent}%` } as React.CSSProperties}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
        />
        <button
          ref={boardBtn}
          type="button"
          className="icon-btn sound-board-btn"
          aria-expanded={boardOpen}
          aria-controls="sound-board"
          aria-label="Soundboard"
          title="Soundboard"
          onClick={() => setBoardOpen((o) => !o)}
        >
          <Music2 size={16} strokeWidth={1.5} />
        </button>
        {boardOpen && (
          <div className="sound-board" id="sound-board" role="group" aria-label="Soundboard">
            <div className="sound-board-grid">
              {BOARD.map(({ id, label, Icon }) => (
                <button key={id} type="button" className="icon-btn sound-board-sound" title={label} aria-label={label} onClick={() => sendBoardSound(id)}>
                  <Icon size={18} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <p className="sound-board-hint">{room ? "Plays for everyone in this room" : "Plays on this device"}</p>
          </div>
        )}
      </div>
      <button
        type="button"
        className="icon-btn sound-toggle"
        aria-pressed={muted}
        aria-label={muted ? "Sound is off. Turn sound on" : "Sound is on. Turn sound off"}
        title={muted ? "Sound off" : `Volume ${percent}%`}
        onClick={() => {
          // Unmuting at 0% would still be silent, so bring the level back up.
          if (muted && percent === 0) setVolume(0.7);
          setMuted(!muted);
        }}
      >
        <Icon size={20} strokeWidth={1.5} />
      </button>
    </div>
  );
}
