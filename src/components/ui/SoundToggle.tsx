import { useSyncExternalStore } from "react";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";
import { getVolume, isMuted, setMuted, setVolume, subscribeMuted } from "../../lib/audio";

/**
 * Always-visible sound control. Clicking the speaker mutes; hovering or
 * focusing it opens a level meter from 0% to 100%.
 */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const volume = useSyncExternalStore(subscribeMuted, getVolume, () => 0.3);
  const percent = Math.round(volume * 100);
  const silent = muted || percent === 0;
  const Icon = silent ? VolumeX : percent < 34 ? Volume : percent < 67 ? Volume1 : Volume2;
  return (
    <div className="sound-control">
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
      </div>
      <button
        type="button"
        className="icon-btn sound-toggle"
        aria-pressed={muted}
        aria-label={muted ? "Sound is off. Turn sound on" : "Sound is on. Turn sound off"}
        title={muted ? "Sound off" : `Volume ${percent}%`}
        onClick={() => {
          // Unmuting at 0% would still be silent, so bring the level back up.
          if (muted && percent === 0) setVolume(0.3);
          setMuted(!muted);
        }}
      >
        <Icon size={20} strokeWidth={1.5} />
      </button>
    </div>
  );
}
