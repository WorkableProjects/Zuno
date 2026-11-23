import { useEffect, useRef, useState } from "react";
import { Brush, Eraser, PaintBucket, Trash2, Undo2 } from "lucide-react";
import { CANVAS_H, CANVAS_W, MAX_POINTS, clearStrokes, newStroke, paint, paintStroke, removeStroke, setToolState, watchStrokes, watchToolState, writeStroke, type Stroke, type Tool, type ToolState } from "./canvasSync";

export const PALETTE = ["#111827", "#ffffff", "#9ca3af", "#ef4444", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#92400e"];
export const SIZES = [4, 10, 20, 36];
const TOOLS: Array<{ id: Tool; label: string; Icon: typeof Brush }> = [
  { id: "pen", label: "Brush", Icon: Brush },
  { id: "eraser", label: "Eraser", Icon: Eraser },
  { id: "fill", label: "Fill", Icon: PaintBucket },
];
const DEFAULT_TOOL: ToolState = { tool: "pen", color: "#111827", size: 10 };

/**
 * The shared canvas. The drawer paints; everyone else watches the strokes
 * stream in and sees the drawer's tools, colour and size light up on their own
 * toolbar as they change.
 */
export function DrawBoard({ code, turnKey, canDraw, drawerName }: { code: string; turnKey: number; canDraw: boolean; drawerName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Array<[string, Stroke]>>([]);
  const [mine, setMine] = useState<ToolState>(DEFAULT_TOOL);
  const [theirs, setTheirs] = useState<ToolState | null>(null);
  const active = useRef<{ id: string; stroke: Stroke; lastSent: number } | null>(null);
  const dirty = useRef(true);
  const layerKeys = useRef("");

  const tool = canDraw ? mine : (theirs ?? DEFAULT_TOOL);

  useEffect(() => {
    setStrokes([]);
    layerKeys.current = "";
    dirty.current = true;
    return watchStrokes(code, turnKey, (list) => {
      setStrokes(list);
      dirty.current = true;
    });
  }, [code, turnKey]);

  useEffect(() => (canDraw ? undefined : watchToolState(code, turnKey, setTheirs)), [code, turnKey, canDraw]);
  useEffect(() => {
    if (canDraw) void setToolState(code, turnKey, mine).catch(() => undefined);
  }, [canDraw, code, turnKey, mine]);

  // Paint loop: a cached layer of finished strokes, plus the one being drawn on top.
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!dirty.current) return;
      dirty.current = false;
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const activeId = active.current?.id;
      const done = strokesRef.current.filter(([id]) => id !== activeId);
      const keys = done.map(([id, s]) => `${id}:${s.p.length}`).join("|");
      if (!layer.current) {
        layer.current = document.createElement("canvas");
        layer.current.width = CANVAS_W;
        layer.current.height = CANVAS_H;
      }
      const lctx = layer.current.getContext("2d", { willReadFrequently: true })!;
      if (keys !== layerKeys.current) {
        layerKeys.current = keys;
        paint(lctx, done.map(([, s]) => s));
      }
      ctx.drawImage(layer.current, 0, 0);
      if (active.current) paintStroke(ctx, active.current.stroke);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const point = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * CANVAS_W), Math.round(((e.clientY - r.top) / r.height) * CANVAS_H)];
  };

  const flush = (force = false) => {
    const a = active.current;
    if (!a) return;
    const now = performance.now();
    if (!force && now - a.lastSent < 60) return;
    a.lastSent = now;
    void writeStroke(code, turnKey, a.id, a.stroke).catch(() => undefined);
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    e.preventDefault();
    const [x, y] = point(e);
    const id = newStroke(code, turnKey);
    if (tool.tool === "fill") {
      const s: Stroke = { t: "fill", c: tool.color, w: 1, p: [x, y] };
      active.current = null;
      setStrokes((list) => [...list, [id, s]]);
      dirty.current = true;
      void writeStroke(code, turnKey, id, s).catch(() => undefined);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = { id, stroke: { t: tool.tool, c: tool.color, w: tool.tool === "eraser" ? tool.size * 2 : tool.size, p: [x, y] }, lastSent: 0 };
    dirty.current = true;
    flush(true);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a) return;
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y] = point(ev as unknown as React.PointerEvent);
      const p = a.stroke.p;
      if (Math.abs(p[p.length - 2] - x) + Math.abs(p[p.length - 1] - y) < 2) continue;
      a.stroke = { ...a.stroke, p: [...p, x, y] };
    }
    dirty.current = true;
    // Long strokes are split so no single record grows too large.
    if (a.stroke.p.length / 2 >= MAX_POINTS) {
      flush(true);
      const last = a.stroke.p.slice(-2);
      const keep = a.stroke;
      setStrokes((list) => [...list, [a.id, keep]]);
      active.current = { id: newStroke(code, turnKey), stroke: { ...keep, p: last }, lastSent: 0 };
    }
    flush();
  };

  const up = () => {
    const a = active.current;
    if (!a) return;
    flush(true);
    setStrokes((list) => (list.some(([id]) => id === a.id) ? list.map((x) => (x[0] === a.id ? [a.id, a.stroke] : x)) : [...list, [a.id, a.stroke]]));
    active.current = null;
    dirty.current = true;
  };

  const undo = () => {
    const last = strokes[strokes.length - 1];
    if (last) void removeStroke(code, turnKey, last[0]).catch(() => undefined);
  };

  return (
    <div className={`draw-board${canDraw ? " is-drawer" : ""}`}>
      <div className="draw-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`draw-canvas is-${tool.tool}`}
          width={CANVAS_W}
          height={CANVAS_H}
          aria-label={canDraw ? "Your drawing canvas" : `${drawerName}'s drawing`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={(e) => e.buttons === 0 && up()}
        />
        {!canDraw && <span className="draw-watching">{drawerName} is drawing</span>}
      </div>
      <div className="draw-tools" role="toolbar" aria-label={canDraw ? "Drawing tools" : `${drawerName}'s tools`} aria-disabled={!canDraw}>
        <div className="draw-group" role="group" aria-label="Tool">
          {TOOLS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={`draw-tool${tool.tool === id ? " is-on" : ""}`} aria-pressed={tool.tool === id} aria-label={label} title={label} disabled={!canDraw} onClick={() => setMine({ ...mine, tool: id })}>
              <Icon size={20} strokeWidth={1.75} />
            </button>
          ))}
        </div>
        <div className="draw-group draw-palette" role="group" aria-label="Colour">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`draw-swatch${tool.color === c && tool.tool !== "eraser" ? " is-on" : ""}`}
              style={{ "--sw": c } as React.CSSProperties}
              aria-pressed={tool.color === c}
              aria-label={`Colour ${c}`}
              disabled={!canDraw}
              onClick={() => setMine({ ...mine, color: c, tool: mine.tool === "eraser" ? "pen" : mine.tool })}
            />
          ))}
        </div>
        <div className="draw-group" role="group" aria-label="Brush size">
          {SIZES.map((s) => (
            <button key={s} type="button" className={`draw-size${tool.size === s ? " is-on" : ""}`} aria-pressed={tool.size === s} aria-label={`Size ${s}`} disabled={!canDraw} onClick={() => setMine({ ...mine, size: s })}>
              <span style={{ width: Math.max(4, s * 0.7), height: Math.max(4, s * 0.7), background: tool.tool === "eraser" ? "var(--text-3)" : tool.color }} />
            </button>
          ))}
        </div>
        {canDraw && (
          <div className="draw-group" role="group" aria-label="Edit">
            <button type="button" className="draw-tool" aria-label="Undo" title="Undo" disabled={strokes.length === 0} onClick={undo}>
              <Undo2 size={20} strokeWidth={1.75} />
            </button>
            <button type="button" className="draw-tool" aria-label="Clear the canvas" title="Clear" disabled={strokes.length === 0} onClick={() => void clearStrokes(code, turnKey).then(() => setStrokes([]))}>
              <Trash2 size={20} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
