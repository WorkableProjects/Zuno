/** Simple steering for the play animation: seek with a speed cap and an acceleration limit, plus path following. */
export type Vec = [number, number];

export interface Mover {
  p: Vec;
  v: Vec;
  max: number; // top speed, yards/s
  acc: number; // acceleration, yards/s^2
}

/** Top speed and acceleration from the Speed attribute, so fast players visibly outrun slow ones. */
export function moverFor(spd: number, p: Vec): Mover {
  return { p: [p[0], p[1]], v: [0, 0], max: 4.8 + (spd / 99) * 4.6, acc: 6 + (spd / 99) * 5 };
}

export function seek(m: Mover, target: Vec, dt: number, speedScale = 1, arrive = 1.5) {
  const dx = target[0] - m.p[0];
  const dy = target[1] - m.p[1];
  const d = Math.hypot(dx, dy);
  const maxV = m.max * speedScale * (d < arrive ? d / arrive : 1);
  const want: Vec = d > 1e-6 ? [(dx / d) * maxV, (dy / d) * maxV] : [0, 0];
  let ax = (want[0] - m.v[0]) / dt;
  let ay = (want[1] - m.v[1]) / dt;
  const a = Math.hypot(ax, ay);
  if (a > m.acc) {
    ax = (ax / a) * m.acc;
    ay = (ay / a) * m.acc;
  }
  m.v[0] += ax * dt;
  m.v[1] += ay * dt;
  m.p[0] += m.v[0] * dt;
  m.p[1] += m.v[1] * dt;
}

/** Position along a polyline after travelling `dist` yards. */
export function alongPath(path: Vec[], dist: number): Vec {
  if (path.length === 1 || dist <= 0) return [path[0][0], path[0][1]];
  let left = dist;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= seg) {
      const t = seg === 0 ? 1 : left / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= seg;
  }
  const end = path[path.length - 1];
  return [end[0], end[1]];
}

export function pathLength(path: Vec[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return s;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: Vec, b: Vec, t: number): Vec => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
