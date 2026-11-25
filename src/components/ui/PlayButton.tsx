import { useCallback, useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { playSfx } from "../../lib/sfx";
import "./playButton.css";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title"> {
  /** Called when the effect lands: open the game here (push + withScreenTransition, like hosting). */
  onOpen: () => void;
  /** Overrides the inherited --game accent. */
  accent?: string;
  /** Kept for existing callers; the effect no longer shows a title card. */
  title?: string;
}

/** Whole effect, and the moment the screen changes. */
const FX_MS = 700;
const OPEN_AT_MS = 640;
/** Reduced motion: glow and press only. */
const CALM_MS = 280;
const SPARKS = 10;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fixed spark directions and reach, so a burst is always evenly spread (no per-click random layout). */
const SPARK_STYLES: CSSProperties[] = Array.from({ length: SPARKS }, (_, i) => {
  const a = (i / SPARKS) * Math.PI * 2 + (i % 2 ? 0.18 : -0.1);
  const d = 52 + (i % 3) * 14;
  return { "--dx": `${Math.round(Math.cos(a) * d * 1.5)}px`, "--dy": `${Math.round(Math.sin(a) * d)}px`, "--sd": `${(i % 4) * 18}ms` } as CSSProperties;
});

/**
 * Energy-charge PLAY button. Everything stays on the button: a conic shimmer and a building glow inside,
 * three shockwave rings and a short spark burst around it, and a squash-and-pop press. Then onOpen runs.
 * Animates transform and opacity only.
 */
export function PlayButton({ onOpen, accent, title: _title, className = "", children, disabled, style, ...rest }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
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

  const click = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const el = btn.current;
    const calm = reduced();
    if (el) {
      el.removeAttribute("data-firing");
      void el.offsetWidth; // restart the animations
      el.setAttribute("data-firing", "");
    }
    playSfx("launch");
    timers.current.push(
      window.setTimeout(() => open.current(), calm ? CALM_MS : OPEN_AT_MS),
      window.setTimeout(() => {
        el?.removeAttribute("data-firing");
        busy.current = false;
      }, calm ? CALM_MS + 40 : FX_MS + 40),
    );
  }, []);

  const wrapStyle = accent ? ({ "--game": accent } as CSSProperties) : undefined;

  return (
    <span className="pb" style={wrapStyle}>
      <button ref={btn} type="button" className={`${className} pb-btn`} disabled={disabled} style={style} onClick={click} {...rest}>
        <i className="pb-invert" aria-hidden="true" />
        {children}
        <i className="pb-glow" aria-hidden="true" />
        <i className="pb-sweep" aria-hidden="true" />
      </button>
      <span className="pb-fx" aria-hidden="true">
        <i className="pb-ring" />
        <i className="pb-ring" />
        <i className="pb-ring" />
        {SPARK_STYLES.map((s, i) => (
          <i key={i} className="pb-spark" style={s} />
        ))}
      </span>
    </span>
  );
}
