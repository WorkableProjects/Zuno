/**
 * Route library. Points are [forward yards, inside yards] from the receiver's alignment;
 * "inside" means toward the middle of the field, so the same route works from either side.
 */
export type RouteName = "slant" | "go" | "out" | "curl" | "post" | "flat" | "wheel" | "dig" | "corner" | "drag" | "bubble" | "screen" | "seam" | "hitch" | "block";

export const ROUTES: Record<RouteName, Array<[number, number]>> = {
  slant: [[0, 0], [2.5, 0], [8, 5]],
  go: [[0, 0], [8, -0.5], [32, -1]],
  out: [[0, 0], [9, 0], [9.5, -7]],
  curl: [[0, 0], [12, 0], [10.5, 1.5]],
  post: [[0, 0], [11, 0], [26, 9]],
  flat: [[0, 0], [1.5, -2], [3, -9]],
  wheel: [[0, 0], [2, -5], [6, -9], [28, -10]],
  dig: [[0, 0], [12, 0], [13, 12]],
  corner: [[0, 0], [11, 0], [22, -8]],
  drag: [[0, 0], [3, 0], [5, 15]],
  bubble: [[0, 0], [-1, -2.5], [0.5, -6]],
  screen: [[0, 0], [-2, -2], [-2.5, -3]],
  seam: [[0, 0], [25, 0.5]],
  hitch: [[0, 0], [6, 0], [5, 0.5]],
  block: [[0, 0], [1.5, 0.5]],
};

/** Routes each receiver runs in a concept, by receiver order (outside WR, other WR, slot / TE, back). */
export const CONCEPTS: Record<string, RouteName[]> = {
  "Slant-Flat": ["slant", "slant", "flat", "flat"],
  "Quick Out": ["out", "out", "hitch", "flat"],
  Mesh: ["drag", "curl", "drag", "flat"],
  "Curl-Flat": ["curl", "curl", "flat", "flat"],
  Dig: ["dig", "go", "seam", "flat"],
  Smash: ["hitch", "corner", "hitch", "flat"],
  Verticals: ["go", "go", "seam", "seam"],
  "Post-Wheel": ["post", "dig", "seam", "wheel"],
  Bootleg: ["corner", "dig", "flat", "flat"],
  "Deep Shot": ["post", "go", "seam", "flat"],
  "RB Screen": ["go", "go", "block", "screen"],
  Bubble: ["bubble", "block", "block", "block"],
  Stick: ["hitch", "slant", "hitch", "flat"],
  "Hitch-Seam": ["hitch", "seam", "hitch", "flat"],
  Levels: ["dig", "drag", "dig", "flat"],
  Flood: ["corner", "out", "flat", "flat"],
  "Y-Cross": ["go", "corner", "dig", "flat"],
  "Deep Cross": ["dig", "post", "go", "flat"],
  "PA Cross": ["drag", "post", "dig", "flat"],
};

/** The route that best fits a target's depth: short, medium, deep, or a screen. */
export function routeForDepth(depth: number): RouteName {
  if (depth <= 0) return "screen";
  if (depth <= 4) return "flat";
  if (depth <= 8) return "slant";
  if (depth <= 15) return "dig";
  return "post";
}

/** Scale a route so its last point is `depth` yards downfield. */
export function scaledRoute(name: RouteName, depth: number): Array<[number, number]> {
  const pts = ROUTES[name];
  const last = pts[pts.length - 1][0];
  if (Math.abs(last) < 0.5) return pts.map(([f, i]) => [f + depth * 0, i] as [number, number]).concat([[depth, pts[pts.length - 1][1]]]);
  const k = depth / last;
  return pts.map(([f, i]) => [f * k, i * Math.min(1.4, Math.max(0.6, k))] as [number, number]);
}
