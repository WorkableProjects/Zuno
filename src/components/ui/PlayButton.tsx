import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { playSfx } from "../../lib/sfx";
import "./playButton.css";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title"> {
  /** Called once the wipe has covered the screen (or at once with reduced motion). */
  onOpen: () => void;
  /** Overrides the inherited --game accent. */
  accent?: string;
  /** Game name shown on the title card during the launch. */
  title?: string;
}

/** Wipe duration: onOpen fires when the screen is covered. */
const OPEN_AFTER_MS = 450;
/** Total time before the overlay is removed (hold + fade out). */
const CLEAN_UP_MS = 1350;
const PARTICLES = 110;
const SPARK_MS = 1200;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const LAUNCH_FLAG = "data-launching";
/** While the launch overlay plays, the ambient backdrop holds still (see backdrop.css) and screen changes skip their view transition. */
function setLaunching(on: boolean) {
  document.documentElement.toggleAttribute(LAUNCH_FLAG, on);
  if (!on) window.dispatchEvent(new Event("zuno:launch-end"));
}

/** Camera shake: a short transform animation on the app root. */
function shakeRoot() {
  const root = document.querySelector<HTMLElement>(".app-stage") ?? document.getElementById("root");
  if (!root) return;
  root.classList.remove("pb-camshake");
  void root.offsetWidth;
  root.classList.add("pb-camshake");
  window.setTimeout(() => root.classList.remove("pb-camshake"), 280);
}

interface Burst {
  id: number;
  font: string;
  x: number;
  y: number;
  color: string;
}

/** One self-terminating rAF loop of ~110 sparks and embers on a viewport-sized canvas. */
function runSparks(canvas: HTMLCanvasElement, x: number, y: number, color: string): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sparks = Array.from({ length: PARTICLES }, (_, i) => {
    const a = (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.3;
    const ember = i % 3 === 0;
    const v = ember ? 120 + Math.random() * 520 : 400 + Math.random() * 1500;
    return {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (ember ? 80 : 0),
      life: ember ? 0.9 + Math.random() * 0.9 : 0.45 + Math.random() * 0.7,
      r: ember ? 2 + Math.random() * 3.5 : 1 + Math.random() * 2.4,
      ember, tone: Math.random(),
    };
  });
  let raf = 0;
  let prev = performance.now();
  const start = prev;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    let alive = 0;
    for (const p of sparks) {
      p.life -= dt;
      if (p.life <= 0) continue;
      alive++;
      const drag = Math.pow(p.ember ? 0.12 : 0.03, dt);
      p.vx *= drag;
      p.vy = p.vy * drag + (p.ember ? -60 : 260) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = Math.min(1, p.life * 2);
      ctx.globalAlpha = a;
      ctx.lineCap = "round";
      ctx.lineWidth = p.r;
      if (p.ember) {
        ctx.fillStyle = p.tone < 0.5 ? color : "#fff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.strokeStyle = p.tone < 0.35 ? "#fff" : color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.07, p.y - p.vy * 0.07);
      ctx.stroke();
    }
    if (alive > 0 && now - start < SPARK_MS) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/**
 * Cinematic play button: press charges (fill sweep, squash, shake), release
 * fires shockwave rings, light rays and sparks, then an iris wipe in the game's
 * accent with a title card covers the change of screen and fades away.
 */
export function PlayButton({ onOpen, accent, title, className = "", children, disabled, style, ...rest }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [burst, setBurst] = useState<Burst | null>(null);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      setLaunching(false);
    },
    [],
  );

  // Sparks start once the portal canvas exists; the loop ends itself and cleans up on unmount.
  useEffect(() => {
    if (!burst || !canvas.current) return;
    return runSparks(canvas.current, burst.x, burst.y, burst.color);
  }, [burst]);

  const charge = (on: boolean) => {
    if (busy.current) return;
    if (on) btn.current?.setAttribute("data-charging", "");
    else btn.current?.removeAttribute("data-charging");
  };

  const click = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const el = btn.current;
    el?.removeAttribute("data-charging");
    if (reduced() || !el) {
      if (el) {
        setBurst({ id: Date.now(), x: 0, y: 0, color: "transparent", font: "" });
        timers.current.push(
          window.setTimeout(() => open.current(), 0),
          window.setTimeout(() => {
            setBurst(null);
            busy.current = false;
          }, 260),
        );
      } else {
        open.current();
        busy.current = false;
      }
      return;
    }
    const r = el.getBoundingClientRect();
    const color = accent ?? (getComputedStyle(el).getPropertyValue("--game").trim() || "#79b8ff");
    // The overlay is portaled to <body>, outside the game scope, so carry the game's display face over by hand.
    const font = getComputedStyle(el).getPropertyValue("--game-font").trim();
    setBurst({ id: Date.now(), x: r.left + r.width / 2, y: r.top + r.height / 2, color, font });
    playSfx("launch");
    setLaunching(true);
    shakeRoot();
    timers.current.push(window.setTimeout(shakeRoot, OPEN_AFTER_MS - 30));
    timers.current.push(
      window.setTimeout(() => open.current(), OPEN_AFTER_MS),
      window.setTimeout(() => {
        setBurst(null);
        setLaunching(false);
        busy.current = false;
      }, CLEAN_UP_MS),
    );
  }, [accent]);

  const wrapStyle = accent ? ({ "--game": accent } as CSSProperties) : undefined;

  return (
    <span className="pb" style={wrapStyle}>
      <button
        ref={btn}
        type="button"
        className={`${className} pb-btn`}
        disabled={disabled}
        style={style}
        onClick={click}
        onPointerDown={() => charge(true)}
        onPointerUp={() => charge(false)}
        onPointerLeave={() => charge(false)}
        onPointerCancel={() => charge(false)}
        onBlur={() => charge(false)}
        {...rest}
      >
        {children}
      </button>
      {burst &&
        createPortal(
          <div
            className={`pb-ov${burst.color === "transparent" ? " pb-ov-calm" : ""}`}
            key={burst.id}
            aria-hidden="true"
            style={{ "--fx": `${burst.x}px`, "--fy": `${burst.y}px`, ...(burst.color === "transparent" ? {} : { "--game": burst.color }), ...(burst.font ? { "--game-font": burst.font } : {}) } as CSSProperties}
          >
            <i className="pb-wipe" />
            <i className="pb-shine" />
            <i className="pb-rays" />
            <i className="pb-rays pb-rays2" />
            <i className="pb-ring" />
            <i className="pb-ring" />
            <i className="pb-ring" />
            <i className="pb-ring" />
            <canvas ref={canvas} className="pb-sparks" />
            <i className="pb-flash" />
            {title && <div className="pb-card">{title}</div>}
          </div>,
          document.body,
        )}
    </span>
  );
}
