import { onChildAdded, onChildChanged, onChildRemoved, onValue, push, ref, remove, set } from "firebase/database";
import { database } from "../headbands/lobby";
import { partyPath } from "../party/partyRoom";

/**
 * Strokes stream straight from the drawer's device to /draw/{code}/canvas/{turn},
 * so every viewer sees them as they are drawn. The host clears old turns.
 */

export type Tool = "pen" | "eraser" | "fill";
export interface Stroke {
  t: Tool;
  /** #rrggbb */
  c: string;
  /** Brush width in canvas units. */
  w: number;
  /** Flat x, y pairs in a 800 by 600 canvas. */
  p: number[];
}

export interface ToolState {
  tool: Tool;
  color: string;
  size: number;
}

export const CANVAS_W = 800;
export const CANVAS_H = 600;
export const MAX_POINTS = 600;

const base = (code: string, turn: number, ...rest: string[]) => partyPath("draw", code, "canvas", String(turn), ...rest);

const encode = (s: Stroke) => ({ t: s.t, c: s.c, w: s.w, p: s.p.join(",") });

export function decodeStroke(raw: unknown): Stroke | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t = r.t === "pen" || r.t === "eraser" || r.t === "fill" ? r.t : null;
  if (!t || typeof r.c !== "string" || !/^#[0-9a-f]{6}$/i.test(r.c) || typeof r.p !== "string") return null;
  const p = r.p
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return { t, c: r.c, w: Math.max(1, Math.min(60, Number(r.w) || 4)), p: p.length % 2 ? p.slice(0, -1) : p };
}

/** Streams the turn's strokes in key order (push keys sort by time). */
export function watchStrokes(code: string, turn: number, onChange: (strokes: Array<[string, Stroke]>) => void): () => void {
  const map = new Map<string, Stroke>();
  const emit = () => onChange([...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const r = ref(database(), base(code, turn, "s"));
  const put = (key: string | null, v: unknown) => {
    const s = decodeStroke(v);
    if (key && s) {
      map.set(key, s);
      emit();
    }
  };
  const a = onChildAdded(r, (snap) => put(snap.key, snap.val()));
  const c = onChildChanged(r, (snap) => put(snap.key, snap.val()));
  const d = onChildRemoved(r, (snap) => {
    if (snap.key && map.delete(snap.key)) emit();
  });
  return () => {
    a();
    c();
    d();
  };
}

export function newStroke(code: string, turn: number): string {
  return push(ref(database(), base(code, turn, "s"))).key as string;
}

export function writeStroke(code: string, turn: number, id: string, s: Stroke): Promise<void> {
  return set(ref(database(), base(code, turn, "s", id)), encode(s));
}

export const removeStroke = (code: string, turn: number, id: string) => remove(ref(database(), base(code, turn, "s", id)));
export const clearStrokes = (code: string, turn: number) => remove(ref(database(), base(code, turn, "s")));
export const dropTurnCanvas = (code: string, turn: number) => remove(ref(database(), base(code, turn)));

export const setToolState = (code: string, turn: number, t: ToolState) => set(ref(database(), base(code, turn, "tool")), JSON.stringify(t));

export function watchToolState(code: string, turn: number, onChange: (t: ToolState | null) => void): () => void {
  return onValue(
    ref(database(), base(code, turn, "tool")),
    (snap) => {
      try {
        const v = JSON.parse(String(snap.val())) as ToolState;
        onChange(v && typeof v.color === "string" ? v : null);
      } catch {
        onChange(null);
      }
    },
    () => undefined,
  );
}

/** Paints strokes in order onto a 2D context of CANVAS_W by CANVAS_H. */
export function paint(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[]): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
  for (const s of strokes) paintStroke(ctx, s);
}

export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  if (s.t === "fill") {
    if (s.p.length >= 2) floodFill(ctx, Math.round(s.p[0]), Math.round(s.p[1]), s.c);
    return;
  }
  ctx.strokeStyle = s.t === "eraser" ? "#ffffff" : s.c;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = s.w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const p = s.p;
  if (p.length < 2) return;
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], s.w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  // Smooth through midpoints.
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
  }
  ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  ctx.stroke();
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Scanline flood fill with a little tolerance so antialiased edges fill cleanly. */
export function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  const W = CANVAS_W;
  const H = CANVAS_H;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const at = (x * 1 + y * W) * 4;
  const target = [d[at], d[at + 1], d[at + 2]];
  const [r, g, b] = hexToRgb(color);
  if (Math.abs(target[0] - r) + Math.abs(target[1] - g) + Math.abs(target[2] - b) < 6) return;
  const tol = 90;
  const match = (i: number) => Math.abs(d[i] - target[0]) + Math.abs(d[i + 1] - target[1]) + Math.abs(d[i + 2] - target[2]) <= tol;
  const seen = new Uint8Array(W * H);
  const stack = [x, y];
  while (stack.length) {
    const sy = stack.pop()!;
    let sx = stack.pop()!;
    let i = sy * W + sx;
    while (sx >= 0 && !seen[i] && match(i * 4)) {
      sx--;
      i--;
    }
    sx++;
    i++;
    let up = false;
    let down = false;
    while (sx < W && !seen[i] && match(i * 4)) {
      seen[i] = 1;
      const o = i * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
      if (sy > 0) {
        const u = i - W;
        if (!seen[u] && match(u * 4)) {
          if (!up) {
            stack.push(sx, sy - 1);
            up = true;
          }
        } else up = false;
      }
      if (sy < H - 1) {
        const dn = i + W;
        if (!seen[dn] && match(dn * 4)) {
          if (!down) {
            stack.push(sx, sy + 1);
            down = true;
          }
        } else down = false;
      }
      sx++;
      i++;
    }
  }
  ctx.putImageData(img, 0, 0);
}
