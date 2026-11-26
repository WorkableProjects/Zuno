import { useCallback, useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { playSfx, type Sfx } from "../../lib/sfx";
import "./playButton.css";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title"> {
  /** Called when the effect lands: open the game here (push + withScreenTransition, like hosting). */
  onOpen: () => void;
  /** Overrides the inherited --game accent. */
  accent?: string;
  /** Kept for existing callers; the effect no longer shows a title card. */
  title?: string;
  /** Picks the game's own launch effect and sound; unknown or missing uses the default energy charge. */
  gameType?: string;
}

interface Style { sfx: Sfx; fx: number; openAt: number }
/** Each game's launch: its sound, effect length and when the screen changes. Visuals live in playButton.css under [data-fx]. */
const STYLES: Record<string, Style> = {
  blackjack: { sfx: "launchBlackjack", fx: 820, openAt: 760 },
  drawit: { sfx: "launchDrawit", fx: 720, openAt: 660 },
  jeopardy: { sfx: "launchJeopardy", fx: 760, openAt: 700 },
  headbands: { sfx: "launchHeadbands", fx: 720, openAt: 660 },
  liar: { sfx: "launchLiar", fx: 760, openAt: 700 },
  rpg: { sfx: "launchRpg", fx: 720, openAt: 660 },
  feud: { sfx: "launchFeud", fx: 720, openAt: 660 },
  gridiron: { sfx: "launchGridiron", fx: 820, openAt: 760 },
};

/** Whole effect, and the moment the screen changes. */
const FX_MS = 700;
const OPEN_AT_MS = 640;
/** Reduced motion: press only. */
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
 * Energy-charge PLAY button. Shockwave rings and a spark burst spread out from behind it (never over its face),
 * and a squash-and-pop press. Then onOpen runs.
 * Animates transform and opacity only.
 */
export function PlayButton({ onOpen, accent, title: _title, gameType, className = "", children, disabled, style, ...rest }: Props) {
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
    const st = (gameType && STYLES[gameType]) || null;
    playSfx(st?.sfx ?? "launch");
    timers.current.push(
      window.setTimeout(() => open.current(), calm ? CALM_MS : (st?.openAt ?? OPEN_AT_MS)),
      window.setTimeout(() => {
        el?.removeAttribute("data-firing");
        busy.current = false;
      }, calm ? CALM_MS + 40 : (st?.fx ?? FX_MS) + 40),
    );
  }, [gameType]);

  const wrapStyle = accent ? ({ "--game": accent } as CSSProperties) : undefined;

  return (
    <span className="pb" style={wrapStyle} data-fx={gameType && STYLES[gameType] ? gameType : undefined}>
      <button ref={btn} type="button" className={`${className} pb-btn`} disabled={disabled} style={style} onClick={click} {...rest}>
        <i className="pb-invert" aria-hidden="true" />
        {children}
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
