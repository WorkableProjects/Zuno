import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, setMuted, subscribeMuted } from "../../lib/audio";

/** Always-visible mute switch. State is announced through aria-pressed and the label. */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return (
    <button type="button" className="icon-btn sound-toggle" aria-pressed={muted} aria-label={muted ? "Sound is off. Turn sound on" : "Sound is on. Turn sound off"} title={muted ? "Sound off" : "Sound on"} onClick={() => setMuted(!muted)}>
      {muted ? <VolumeX size={20} strokeWidth={1.5} /> : <Volume2 size={20} strokeWidth={1.5} />}
    </button>
  );
}
