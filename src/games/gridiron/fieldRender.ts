/**
 * Canvas drawing for the live field. The static field is painted once per team pair onto an offscreen canvas
 * and drawn under a camera transform; players and the ball are drawn on top, interpolated between 10 Hz frames.
 */
import type { PlayScript } from "./gmTypes";

export const FIELD_W = 120;
export const FIELD_H = 53.33;
const PPY = 12; // cached field resolution, px per yard

export type CameraMode = "follow" | "all22" | "broadcast";

export interface FieldTeams {
  left: { abbr: string; colors: [string, string] }; // end zone at x 0-10
  right: { abbr: string; colors: [string, string] }; // end zone at x 110-120
}

const fieldCache = new Map<string, HTMLCanvasElement>();

export function paintField(teams: FieldTeams): HTMLCanvasElement {
  const key = `${teams.left.abbr}${teams.left.colors.join()}${teams.right.abbr}${teams.right.colors.join()}`;
  const hit = fieldCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = FIELD_W * PPY;
  c.height = Math.round(FIELD_H * PPY);
  const g = c.getContext("2d")!;
  g.scale(PPY, PPY);
  // Turf with mowing stripes every 5 yards.
  for (let x = 0; x < FIELD_W; x += 5) {
    g.fillStyle = Math.floor(x / 5) % 2 === 0 ? "#2f6b3a" : "#2a6134";
    g.fillRect(x, 0, 5, FIELD_H);
  }
  // End zones.
  const zone = (x: number, t: FieldTeams["left"], flip: boolean) => {
    g.fillStyle = t.colors[0];
    g.globalAlpha = 0.85;
    g.fillRect(x, 0, 10, FIELD_H);
    g.globalAlpha = 1;
    g.save();
    g.translate(x + 5, FIELD_H / 2);
    g.rotate(flip ? Math.PI / 2 : -Math.PI / 2);
    g.fillStyle = t.colors[1];
    g.font = "600 6px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.globalAlpha = 0.9;
    g.fillText(t.abbr, 0, 0.3);
    g.restore();
  };
  zone(0, teams.left, false);
  zone(110, teams.right, true);
  // Lines.
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 0.18;
  for (let x = 10; x <= 110; x += 5) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, FIELD_H);
    g.stroke();
  }
  g.lineWidth = 0.3;
  g.strokeRect(0.15, 0.15, FIELD_W - 0.3, FIELD_H - 0.3);
  // Hash marks.
  g.lineWidth = 0.12;
  for (let x = 11; x < 110; x++) {
    for (const y of [0.4, 23.58, 29.75, FIELD_H - 1.4]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 0.9);
      g.stroke();
    }
  }
  // Numbers.
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.font = "500 2.4px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let x = 20; x <= 100; x += 10) {
    const n = String(x <= 60 ? x - 10 : 110 - x);
    for (const [y, rot] of [[8, 0], [FIELD_H - 8, Math.PI]] as const) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillText(n, 0, 0);
      g.restore();
    }
  }
  // Goal posts.
  g.strokeStyle = "#f5d042";
  g.lineWidth = 0.35;
  for (const x of [0.4, FIELD_W - 0.4]) {
    g.beginPath();
    g.moveTo(x, FIELD_H / 2 - 3.1);
    g.lineTo(x, FIELD_H / 2 + 3.1);
    g.stroke();
  }
  fieldCache.set(key, c);
  return c;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number; // px per yard
}

export interface DrawOpts {
  mode: CameraMode;
  vertical: boolean;
  losX: number | null;
  firstX: number | null;
  offColors: [string, string];
  defColors: [string, string];
  overlays: { routes: boolean; coverage: boolean; blocks: boolean; names: boolean };
  hover: number;
  flash: { text: string; at: [number, number]; age: number } | null;
}

/** World (yards) to screen (px). */
export function project(cam: Camera, w: number, h: number, mode: CameraMode, vertical: boolean, wx: number, wy: number): [number, number] {
  const k = mode === "broadcast" ? 0.6 : 1;
  if (vertical) return [w / 2 + (wy - cam.y) * cam.zoom, h / 2 - (wx - cam.x) * cam.zoom];
  return [w / 2 + (wx - cam.x) * cam.zoom, h / 2 + (wy - cam.y) * cam.zoom * k];
}

export function frameAt(script: PlayScript, t: number): { pos: Float32Array; height: number; carrier: number } {
  const n = script.frames.length;
  const f = Math.max(0, Math.min(n - 1, t / script.dt));
  const i = Math.floor(f);
  const j = Math.min(n - 1, i + 1);
  const u = f - i;
  const a = script.frames[i];
  const b = script.frames[j];
  const out = new Float32Array(a.length);
  for (let k = 0; k < a.length; k++) out[k] = a[k] + (b[k] - a[k]) * u;
  return { pos: out, height: script.ballHeight[i] + (script.ballHeight[j] - script.ballHeight[i]) * u, carrier: script.carrier[i] };
}

export const duration = (s: PlayScript) => (s.frames.length - 1) * s.dt;

export function targetCamera(mode: CameraMode, w: number, h: number, vertical: boolean, ballX: number, ballY: number): Camera {
  const along = vertical ? h : w;
  const across = vertical ? w : h;
  if (mode === "all22") {
    const zoom = Math.min(along / 124, across / ((FIELD_H + 4) * (mode === "all22" ? 1 : 0.6)));
    return { x: FIELD_W / 2, y: FIELD_H / 2, zoom };
  }
  const k = mode === "broadcast" ? 0.6 : 1;
  const zoom = Math.max(across / ((FIELD_H + 2) * k), along / (mode === "broadcast" ? 70 : 52));
  const halfAlong = along / 2 / zoom;
  const halfAcross = across / 2 / (zoom * (vertical ? 1 : k));
  const x = Math.min(FIELD_W + 1 - halfAlong, Math.max(-1 + halfAlong, ballX));
  const y = halfAcross * 2 >= FIELD_H ? FIELD_H / 2 : Math.min(FIELD_H - halfAcross + 1, Math.max(halfAcross - 1, ballY));
  return { x, y, zoom };
}

export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, field: HTMLCanvasElement, script: PlayScript | null, t: number, o: DrawOpts) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1d3b24";
  ctx.fillRect(0, 0, w, h);
  const k = o.mode === "broadcast" ? 0.6 : 1;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  if (o.vertical) ctx.rotate(-Math.PI / 2);
  ctx.scale(cam.zoom, cam.zoom * (o.vertical ? 1 : k));
  ctx.translate(-cam.x, -cam.y);
  ctx.drawImage(field, 0, 0, FIELD_W, FIELD_H);
  // Line of scrimmage (blue) and first down (yellow).
  ctx.lineWidth = 0.35;
  if (o.losX !== null) {
    ctx.strokeStyle = "rgba(80,150,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(o.losX, 0);
    ctx.lineTo(o.losX, FIELD_H);
    ctx.stroke();
  }
  if (o.firstX !== null && o.firstX > 10 && o.firstX < 110) {
    ctx.strokeStyle = "rgba(250,214,60,0.95)";
    ctx.beginPath();
    ctx.moveTo(o.firstX, 0);
    ctx.lineTo(o.firstX, FIELD_H);
    ctx.stroke();
  }
  if (script) {
    const { pos } = frameAt(script, t);
    // Overlays in world space.
    if (o.overlays.routes) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 0.22;
      ctx.setLineDash([0.8, 0.5]);
      for (const r of script.routes) {
        ctx.beginPath();
        r.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (o.overlays.coverage) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 0.12;
      for (const z of script.zones) {
        ctx.beginPath();
        ctx.ellipse(z.at[0], z.at[1], 4.5, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (o.overlays.blocks) {
      ctx.strokeStyle = "rgba(255,190,90,0.8)";
      ctx.lineWidth = 0.2;
      for (const [a, b] of script.blocks) {
        ctx.beginPath();
        ctx.moveTo(pos[a * 2], pos[a * 2 + 1]);
        ctx.lineTo(pos[b * 2], pos[b * 2 + 1]);
        ctx.stroke();
      }
    }
    // The QB's reads, before the throw.
    const throwT = script.events.find((e) => e.kind === "throw")?.t ?? -1;
    if (throwT > 0 && t < throwT && t > 0.5) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 0.12;
      for (const r of script.reads) {
        ctx.beginPath();
        ctx.moveTo(pos[0], pos[1]);
        ctx.lineTo(pos[r * 2], pos[r * 2 + 1]);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  if (!script) return;
  // Tokens in screen space so numbers stay upright.
  const { pos, height, carrier } = frameAt(script, t);
  const r = Math.max(5, Math.min(11, cam.zoom * 0.62));
  const P = (i: number) => project(cam, w, h, o.mode, o.vertical, pos[i * 2], pos[i * 2 + 1]);
  // Ball trail while in the air.
  const throwEv = script.events.find((e) => e.kind === "throw" || e.kind === "kick");
  if (throwEv && height > 0.2) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let tt = throwEv.t; tt <= t; tt += 0.1) {
      const f = frameAt(script, tt);
      const [x, y] = project(cam, w, h, o.mode, o.vertical, f.pos[44], f.pos[45]);
      const lift = f.height * cam.zoom * 0.35;
      if (tt === throwEv.t) ctx.moveTo(x, y - lift);
      else ctx.lineTo(x, y - lift);
    }
    ctx.stroke();
  }
  const order = Array.from({ length: 22 }, (_, i) => i).sort((a, b) => pos[a * 2 + 1] - pos[b * 2 + 1]);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
  for (const i of order) {
    const [x, y] = P(i);
    const off = i < 11;
    const [fill, ink] = off ? o.offColors : o.defColors;
    // Facing: from the previous frame.
    const prev = frameAt(script, Math.max(0, t - 0.15)).pos;
    const dx = pos[i * 2] - prev[i * 2];
    const dy = pos[i * 2 + 1] - prev[i * 2 + 1];
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 2, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = i === carrier ? 2.5 : 1.25;
    ctx.strokeStyle = i === carrier ? "#fad63c" : off ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)";
    ctx.stroke();
    if (Math.hypot(dx, dy) > 0.02) {
      const [fx, fy] = project(cam, w, h, o.mode, o.vertical, pos[i * 2] + dx * 8, pos[i * 2 + 1] + dy * 8);
      const a = Math.atan2(fy - y, fx - x);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78, Math.max(1.5, r * 0.18), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = ink;
    ctx.fillText(script.labels[i], x, y + 0.5);
    if (o.overlays.names || o.hover === i) {
      ctx.font = `500 11px system-ui, sans-serif`;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const label = `${script.positions[i]} ${script.names[i]}`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(x - tw / 2 - 4, y - r - 18, tw + 8, 15);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x, y - r - 10);
      ctx.font = `600 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
    }
  }
  // Ball.
  const [bx, by] = project(cam, w, h, o.mode, o.vertical, pos[44], pos[45]);
  const lift = height * cam.zoom * 0.35;
  ctx.fillStyle = "#7a4a22";
  ctx.strokeStyle = "#f3e7d3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(bx, by - lift, Math.max(3, r * 0.45), Math.max(2, r * 0.3), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Flash text.
  if (o.flash && o.flash.age < 1.4) {
    const [fx, fy] = project(cam, w, h, o.mode, o.vertical, o.flash.at[0], o.flash.at[1]);
    const a = 1 - o.flash.age / 1.4;
    ctx.globalAlpha = a;
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(o.flash.text, fx, fy - 30 - o.flash.age * 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(o.flash.text, fx, fy - 30 - o.flash.age * 18);
    ctx.globalAlpha = 1;
  }
}

/** Index of the player nearest a screen point, or -1. */
export function hitTest(script: PlayScript, t: number, cam: Camera, w: number, h: number, mode: CameraMode, vertical: boolean, sx: number, sy: number): number {
  const { pos } = frameAt(script, t);
  let best = -1;
  let bd = 18;
  for (let i = 0; i < 22; i++) {
    const [x, y] = project(cam, w, h, mode, vertical, pos[i * 2], pos[i * 2 + 1]);
    const d = Math.hypot(x - sx, y - sy);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
