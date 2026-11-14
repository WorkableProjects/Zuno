import { useEffect, useState } from "react";
import { Monitor, MousePointerClick, Smartphone } from "lucide-react";
import { unlockAudio } from "../../lib/audio";
import { ZunoLogo } from "../brand/Logo";
import type { Device } from "../../app/storage";
import "./intro.css";

/**
 * Shown at every start. The logo plays in, then Zuno waits for a click or a
 * key press. That gesture is what lets the browser play music, so hovering a
 * game afterwards can fade its track in.
 */
export function StartupIntro() {
  const [phase, setPhase] = useState<"waiting" | "leaving" | "gone">("waiting");
  useEffect(() => {
    if (phase === "gone") {
      document.documentElement.classList.remove("intro-playing");
      return;
    }
    document.documentElement.classList.add("intro-playing");
    if (phase !== "waiting") return;
    const start = (e: Event) => {
      // Modifier keys alone are not a real press for the browser's sound rules.
      if (e instanceof KeyboardEvent && ["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      unlockAudio();
      setPhase("leaving");
    };
    window.addEventListener("keydown", start, true);
    window.addEventListener("pointerdown", start, true);
    return () => {
      window.removeEventListener("keydown", start, true);
      window.removeEventListener("pointerdown", start, true);
    };
  }, [phase]);
  useEffect(() => {
    if (phase !== "leaving") return;
    const t = window.setTimeout(() => setPhase("gone"), 450);
    return () => window.clearTimeout(t);
  }, [phase]);
  if (phase === "gone") return null;
  return (
    <div className={`intro${phase === "leaving" ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-label="Start Zuno">
      <div className="intro-mark">
        <ZunoLogo />
      </div>
      <span className="intro-line" />
      <p className="intro-prompt">
        <MousePointerClick size={18} strokeWidth={1.5} aria-hidden="true" />
        Click or press any key to start
      </p>
      <p className="intro-note">This also turns on the music</p>
    </div>
  );
}

/** Asked once at first launch. The answer picks the initial layout and can be changed in Settings. */
export function DevicePrompt({ onChoose }: { onChoose: (d: Device) => void }) {
  return (
    <div className="device-prompt" role="dialog" aria-modal="true" aria-labelledby="device-title">
      <div className="card device-card">
        <h2 id="device-title" className="dialog-title">
          Which device are you on?
        </h2>
        <p className="meta">Zuno adapts its layout to fit. You can change this later in Settings.</p>
        <div className="device-options">
          <button type="button" className="btn btn-secondary" data-autofocus ref={(el) => el?.focus()} onClick={() => onChoose("desktop")}>
            <Monitor size={20} strokeWidth={1.5} />
            Desktop or laptop
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onChoose("mobile")}>
            <Smartphone size={20} strokeWidth={1.5} />
            Phone or tablet
          </button>
        </div>
      </div>
    </div>
  );
}
