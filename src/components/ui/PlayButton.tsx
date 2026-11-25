import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import "./playButton.css";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Called once the radiation burst has covered the screen (or at once with reduced motion). */
  onOpen: () => void;
  /** Overrides the inherited --game accent. */
  accent?: string;
}

/** Delay between the press and navigation, while the burst grows. */
const OPEN_AFTER_MS = 400;
const CLEAN_UP_MS = 1100;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Play button with a radiation effect: concentric rings and a conic burst leave
 * the button, then a full-screen flash in the game's accent covers the change
 * of screen. Everything animates transform and opacity only.
 */
export function PlayButton({ onOpen, accent, className = "", children, disabled, style, ...rest }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  const [burst, setBurst] = useState<{ id: number; x: number; y: number; color: string } | null>(null);
  const [fired, setFired] = useState(0);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const click = useCallback(
    (_e: MouseEvent<HTMLButtonElement>) => {
      if (busy.current) return;
      if (reduced() || !btn.current) {
        open.current();
        return;
      }
      busy.current = true;
      const r = btn.current.getBoundingClientRect();
      const color = accent ?? (getComputedStyle(btn.current).getPropertyValue("--game").trim() || "#79b8ff");
      setFired((n) => n + 1);
      setBurst({ id: Date.now(), x: r.left + r.width / 2, y: r.top + r.height / 2, color });
      timers.current.push(
        window.setTimeout(() => open.current(), OPEN_AFTER_MS),
        window.setTimeout(() => {
          setBurst(null);
          busy.current = false;
        }, CLEAN_UP_MS),
      );
    },
    [accent],
  );

  const wrapStyle = accent ? ({ "--game": accent } as CSSProperties) : undefined;

  return (
    <span className="pb" style={wrapStyle}>
      <span className="pb-fx" aria-hidden="true" key={fired} data-on={fired ? "" : undefined}>
        <i className="pb-ring" />
        <i className="pb-ring" />
        <i className="pb-ring" />
        <i className="pb-rays" />
      </span>
      <button ref={btn} type="button" className={`${className} pb-btn`} disabled={disabled} style={style} onClick={click} {...rest}>
        {children}
      </button>
      {burst &&
        createPortal(
          <div className="pb-flash" key={burst.id} aria-hidden="true" style={{ "--fx": `${burst.x}px`, "--fy": `${burst.y}px`, "--game": burst.color } as CSSProperties}>
            <i className="pb-flash-disc" />
            <i className="pb-flash-rays" />
          </div>,
          document.body,
        )}
    </span>
  );
}
