import { useEffect, useRef, useState } from "react";
import { drawFrame, duration, frameAt, hitTest, paintField, targetCamera, type Camera, type CameraMode, type FieldTeams } from "./fieldRender";
import type { PlayScript } from "./gmTypes";

export interface FieldViewProps {
  script: PlayScript | null;
  teams: FieldTeams;
  offColors: [string, string];
  defColors: [string, string];
  losX: number | null;
  firstX: number | null;
  speed: number;
  paused: boolean;
  mode: CameraMode;
  overlays: { routes: boolean; coverage: boolean; blocks: boolean; names: boolean };
  /** Change `seek.key` to jump the playhead to `seek.t`. */
  seek?: { key: number; t: number };
  onTime?: (t: number, len: number) => void;
  onEvent?: (e: PlayScript["events"][number]) => void;
  onEnd?: () => void;
  /** Rest position for the ball between plays (field coords). */
  idleBall?: [number, number];
  label?: string;
}

/** The live 2D field: ~60 fps canvas, interpolating the 10 Hz PlayScript, with a camera that follows the ball. */
export function FieldView(p: FieldViewProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const t = useRef(0);
  const cam = useRef<Camera>({ x: 60, y: 26.6, zoom: 8 });
  const ended = useRef(false);
  const fired = useRef(new Set<number>());
  const flash = useRef<{ text: string; at: [number, number]; age: number } | null>(null);
  const hover = useRef(-1);
  const props = useRef(p);
  props.current = p;
  const [size, setSize] = useState({ w: 800, h: 400 });

  useEffect(() => {
    t.current = 0;
    ended.current = false;
    fired.current = new Set();
    flash.current = null;
  }, [p.script]);

  useEffect(() => {
    if (p.seek) {
      t.current = p.seek.t;
      ended.current = false;
      fired.current = new Set(p.script?.events.map((e, i) => (e.t < p.seek!.t ? i : -1)).filter((i) => i >= 0));
    }
  }, [p.seek?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    const field = paintField(p.teams);
    let raf = 0;
    let last = performance.now();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const loop = (now: number) => {
      const q = props.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = q.script;
      const vertical = size.h > size.w * 1.15;
      if (s) {
        const len = duration(s);
        if (!q.paused && !ended.current) {
          t.current = Math.min(len, t.current + dt * q.speed);
          s.events.forEach((e, i) => {
            if (!fired.current.has(i) && e.t <= t.current) {
              fired.current.add(i);
              q.onEvent?.(e);
              if (["sack", "touchdown", "interception", "pancake"].includes(e.kind)) flash.current = { text: e.kind === "touchdown" ? "TOUCHDOWN" : e.kind === "sack" ? "SACK" : e.kind === "pancake" ? "PANCAKE" : "PICKED OFF", at: e.at ?? [frameAt(s, e.t).pos[44], frameAt(s, e.t).pos[45]], age: 0 };
            }
          });
          if (t.current >= len) {
            ended.current = true;
            q.onEnd?.();
          }
        }
        q.onTime?.(t.current, len);
      }
      if (flash.current) flash.current.age += dt * Math.max(1, q.speed * 0.6);
      const ball: [number, number] = s ? [frameAt(s, t.current).pos[44], frameAt(s, t.current).pos[45]] : q.idleBall ?? [60, 26.6];
      const target = targetCamera(q.mode, size.w, size.h, vertical, ball[0], ball[1]);
      const k = reduce ? 1 : Math.min(1, dt * 4);
      cam.current = { x: cam.current.x + (target.x - cam.current.x) * k, y: cam.current.y + (target.y - cam.current.y) * k, zoom: cam.current.zoom + (target.zoom - cam.current.zoom) * Math.min(1, k * 1.5) };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame(ctx, size.w, size.h, cam.current, field, s, t.current, {
        mode: q.mode, vertical, losX: q.losX, firstX: q.firstX, offColors: q.offColors, defColors: q.defColors, overlays: q.overlays, hover: hover.current, flash: flash.current,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, p.teams]);

  const onMove = (e: React.PointerEvent) => {
    const s = props.current.script;
    if (!s || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    hover.current = hitTest(s, t.current, cam.current, size.w, size.h, props.current.mode, size.h > size.w * 1.15, e.clientX - rect.left, e.clientY - rect.top);
  };

  return (
    <div className="gr-field" ref={wrap}>
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} onPointerMove={onMove} onPointerLeave={() => (hover.current = -1)} role="img" aria-label={p.label ?? "Live field view"} />
    </div>
  );
}
