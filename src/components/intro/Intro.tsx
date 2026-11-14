import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { ZunoLogo } from "../brand/Logo";
import type { Device } from "../../app/storage";
import "./intro.css";

/** Plays once per session. Skipped for reduced motion, and any key or tap ends it early. */
export function StartupIntro() {
  const [show, setShow] = useState(() => {
    try {
      if (sessionStorage.getItem("zuno.intro") === "1") return false;
      sessionStorage.setItem("zuno.intro", "1");
    } catch {
      /* show it */
    }
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (!show) {
      document.documentElement.classList.remove("intro-playing");
      return;
    }
    document.documentElement.classList.add("intro-playing");
    const end = () => setShow(false);
    const t = window.setTimeout(end, 1900);
    window.addEventListener("keydown", end, { once: true });
    window.addEventListener("pointerdown", end, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", end);
      window.removeEventListener("pointerdown", end);
      document.documentElement.classList.remove("intro-playing");
    };
  }, [show]);
  if (!show) return null;
  return (
    <div className="intro" aria-hidden="true">
      <div className="intro-mark">
        <ZunoLogo />
      </div>
      <span className="intro-line" />
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
