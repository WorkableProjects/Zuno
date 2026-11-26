/**
 * Turns a resolved play (PlaySpec) into a PlayScript: 22 player paths and the ball, sampled at 10 Hz.
 * Offense players follow formations, routes and run lanes; defenders steer (man, zone, pursuit, rush).
 * The ball carrier's path ends exactly on the spot the engine recorded, so the animation is the play.
 * Generation is deterministic from the spec's seed.
 */
import { mulberry32, type Rng } from "./gmRandom";
import { CONCEPTS, ROUTES, routeForDepth, scaledRoute, type RouteName } from "./gmRoutes";
import { alongPath, lerp, lerpV, moverFor, pathLength, seek, type Mover, type Vec } from "./gmSteering";
import type { PlayScript, PlaySpec } from "./gmTypes";

const DT = 0.1;
const W = 53.33;
const N = 22;
const BALL = 22;

type Ev = PlayScript["events"][number];

interface Plan {
  /** Scripted position at time t, or null to steer. */
  fixed?: (t: number) => Vec;
  /** Steering target at time t (given everyone's current positions). */
  target?: (t: number, pos: Vec[]) => Vec;
  scale?: (t: number) => number;
}

const clampY = (y: number) => Math.min(W - 0.6, Math.max(0.6, y));
const clampX = (x: number) => Math.min(109.5, Math.max(-9.5, x));

function timedPath(points: Vec[], t0: number, speed: number): (t: number) => Vec {
  return (t) => alongPath(points, Math.max(0, t - t0) * speed);
}

/** Path that takes exactly `dur` seconds from t0, easing in. */
function timedPathDur(points: Vec[], t0: number, dur: number): (t: number) => Vec {
  const len = pathLength(points);
  return (t) => {
    const u = Math.min(1, Math.max(0, (t - t0) / Math.max(0.05, dur)));
    const eased = u < 0.15 ? (u * u) / 0.3 : u - 0.075 + 0 * u;
    return alongPath(points, Math.min(len, (eased / 0.925) * len));
  };
}

export function buildPlayScript(spec: PlaySpec): PlayScript {
  const r = mulberry32(spec.seed);
  if (spec.special && spec.special !== "twopoint") return buildSpecial(spec, r);
  return buildScrimmage(spec, r);
}

// ---------------------------------------------------------------------------

function speedOf(spec: PlaySpec, idx: number): number {
  const p = idx < 11 ? spec.offPlayers[idx] : spec.defPlayers[idx - 11];
  return moverFor(p?.spd ?? 60, [0, 0]).max;
}

function buildScrimmage(spec: PlaySpec, r: Rng): PlayScript {
  const out = spec.outcome;
  const los = spec.los;
  const cy = W / 2 + (r() - 0.5) * 8;
  const off = spec.off;
  const def = spec.def;
  const shotgun = !off || off.formation === "Shotgun" || off.formation === "Empty" || off.formation === "Pistol";
  const offPos = spec.offPlayers.map((p) => p.pos);
  const defPos = spec.defPlayers.map((p) => p.pos);
  const events: Ev[] = [];
  const snapT = 0.5;
  events.push({ t: snapT, kind: "snap", text: "Snap" });

  // ----- Alignment
  const start: Vec[] = new Array(N);
  start[0] = [los - (shotgun ? 5 : 1.2), cy];
  const olY = [-2.6, -1.3, 0, 1.3, 2.6];
  for (let i = 1; i <= 5; i++) start[i] = [los - (i === 3 ? 0.4 : 0.9), cy + olY[i - 1]];
  const iForm = off?.formation === "I-Form" || off?.formation === "Goal Line";
  start[6] = off?.formation === "Empty" ? [los - 1, clampY(cy - 14)] : shotgun ? [los - 5, cy + 1.6] : iForm ? [los - 7, cy] : [los - 6.5, cy];
  // Skill players: WRs wide, TEs inline, FB in the backfield.
  const skill: number[] = [];
  let wrN = 0;
  let teN = 0;
  for (let i = 7; i < spec.offPlayers.length; i++) {
    skill.push(i);
    const pos = offPos[i];
    if (pos === "FB") start[i] = [los - 4.3, cy];
    else if (pos === "TE") {
      const s = teN++ % 2 === 0 ? 1 : -1;
      start[i] = [los - 0.9, cy + s * 4];
    } else {
      const slots = [-1, 1, 1, -1];
      const s = slots[wrN % 4];
      const wide = wrN < 2;
      const y = wide ? (s < 0 ? 4.5 + r() * 2 : W - 4.5 - r() * 2) : cy + s * (8.5 + r() * 2);
      start[i] = [los - (wrN === 0 ? 0.7 : 1.4), clampY(y)];
      wrN++;
    }
  }
  for (let i = spec.offPlayers.length; i < 11; i++) start[i] = [los - 3, cy];

  const receivers = skill.filter((i) => offPos[i] !== "FB" || out.targetIdx === i);
  const defRole = (j: number) => (j < 4 ? "DL" : defPos[j] === "CB" ? "CB" : defPos[j] === "FS" || defPos[j] === "SS" ? "S" : "LB");
  const man = !!def && (def.call === "Man" || def.shell === "Cover 1" || def.shell === "Man Blitz");
  const blitz = def?.call === "Blitz";
  const dlY = [-3.6, -1, 1, 3.6];
  // Defensive alignment and assignments.
  const manTarget: Record<number, number> = {};
  const zoneSpot: Record<number, Vec> = {};
  const outside = receivers.filter((i) => offPos[i] === "WR").sort((a, b) => start[a][1] - start[b][1]);
  const cbs: number[] = [];
  const lbs: number[] = [];
  const safeties: number[] = [];
  for (let j = 0; j < 11; j++) {
    const role = defRole(j);
    const k = 11 + j;
    if (role === "DL") start[k] = [los + 1, cy + dlY[j]];
    else if (role === "CB") cbs.push(j);
    else if (role === "S") safeties.push(j);
    else lbs.push(j);
  }
  // CBs line up over receivers from the outside in.
  const byWidth = [...outside].sort((a, b) => Math.abs(start[b][1] - cy) - Math.abs(start[a][1] - cy));
  cbs.forEach((j, n) => {
    const rec = byWidth[n];
    const y = rec !== undefined ? start[rec][1] : n % 2 === 0 ? 6 : W - 6;
    start[11 + j] = [los + (man ? 1.5 : 6), y];
    if (rec !== undefined) manTarget[j] = rec;
  });
  lbs.forEach((j, n) => {
    const spread = lbs.length === 1 ? [0] : lbs.length === 2 ? [-2.5, 2.5] : [-4, 0, 4];
    start[11 + j] = [los + 4.5, cy + spread[n % spread.length]];
  });
  const shell = def?.shell ?? "Cover 3";
  safeties.forEach((j, n) => {
    const deep = shell === "Cover 2" ? 13 : n === 0 ? 13 : def?.call === "Run D" || shell === "Cover 1" || shell === "Man Blitz" ? 7 : 11;
    const y = shell === "Cover 2" ? cy + (n === 0 ? -9 : 9) : n === 0 ? cy : cy + 7;
    start[11 + j] = [los + deep, clampY(y)];
  });
  // Unassigned man targets: TE / RB to LBs and the second safety.
  const leftovers = receivers.filter((i) => !Object.values(manTarget).includes(i));
  [...lbs, ...safeties.slice(1)].forEach((j, n) => {
    if (leftovers[n] !== undefined && man) manTarget[j] = leftovers[n];
  });
  // Zone landmarks.
  for (let j = 4; j < 11; j++) {
    const role = defRole(j);
    const s = start[11 + j];
    if (role === "CB") zoneSpot[j] = shell === "Cover 2" ? [los + 5, s[1]] : [los + 14, s[1] < cy ? 9 : W - 9];
    else if (role === "S") zoneSpot[j] = shell === "Cover 2" ? [los + 18, s[1]] : [los + (j === safeties[0] + 0 ? 18 : 9), s[1]];
    else zoneSpot[j] = [los + 7, s[1]];
  }
  // Blitzers.
  const rushers = new Set<number>([0, 1, 2, 3]);
  if (blitz) {
    lbs.slice(0, 2).forEach((j) => rushers.add(j));
    if (def?.shell === "Man Blitz" && safeties[1] !== undefined) rushers.add(safeties[1]);
  }

  // ----- Offense plans
  const plans: Plan[] = new Array(N).fill(null).map(() => ({}));
  const routes: PlayScript["routes"] = [];
  const kind = out.kind;
  const isRunPlay = !!off && (off.type === "run" || off.type === "kneel");
  const isPassPlay = !!off && !isRunPlay && off.type !== "spike";
  const qbSpd = speedOf(spec, 0);
  let carrierIdx = -1;
  let whistleT = 3;
  let carrierStart = 0; // time the carrier gets the ball
  let carrierPlan: ((t: number) => Vec) | null = null;
  const ballPlan: { throwT: number; catchT: number; from: Vec; to: Vec; holder: number; afterCatch: number; peak: number } = { throwT: -1, catchT: -1, from: [0, 0], to: [0, 0], holder: 0, afterCatch: -1, peak: 3 };
  let finalSpot: Vec = [los, cy];
  const reads: number[] = [];

  const finalY = (fromY: number, yards: number) => clampY(fromY + (r() - 0.5) * Math.min(18, 4 + Math.abs(yards) * 0.5));
  const runPath = (from: Vec, to: Vec): Vec[] => {
    const mid: Vec = [lerp(from[0], to[0], 0.5), clampY(lerp(from[1], to[1], 0.5) + (r() - 0.5) * 5)];
    return [from, mid, to];
  };

  if (kind === "penalty" && out.penalty && (out.penalty.name === "False start" || out.penalty.name === "Offside")) {
    // Pre-snap flag: one player flinches, whistle.
    const who = out.penalty.on === "off" ? 1 + Math.floor(r() * 5) : 11 + Math.floor(r() * 4);
    const s = start[who];
    plans[who].fixed = (t) => (t < 0.3 ? s : [s[0] + (who < 11 ? 0.9 : -0.9) * Math.min(1, (t - 0.3) * 3), s[1]]);
    events.length = 0;
    events.push({ t: 0.6, kind: "whistle", text: `Flag: ${out.penalty.name}` });
    whistleT = 0.6;
    finalSpot = [los, cy];
  } else if (off?.type === "kneel") {
    carrierIdx = 0;
    carrierStart = 0;
    const end: Vec = [los + out.yards, cy];
    carrierPlan = (t) => lerpV(start[0], end, Math.min(1, Math.max(0, (t - snapT) / 0.6)));
    plans[0].fixed = carrierPlan;
    whistleT = snapT + 1;
    finalSpot = end;
    events.push({ t: whistleT, kind: "whistle", text: "Kneel down" });
  } else if (off?.type === "spike") {
    carrierIdx = 0;
    plans[0].fixed = (t) => (t < snapT + 0.3 ? start[0] : [start[0][0] - 0.8, start[0][1]]);
    ballPlan.throwT = snapT + 0.5;
    ballPlan.catchT = snapT + 0.8;
    ballPlan.from = [los - 1.5, cy];
    ballPlan.to = [los - 1, cy + 0.5];
    ballPlan.peak = 0.3;
    whistleT = snapT + 1;
    finalSpot = [los, cy];
    events.push({ t: snapT + 0.5, kind: "incomplete", text: "Spike" });
  } else if (isRunPlay && (kind === "run" || kind === "fumble" || kind === "twopoint" || (kind === "penalty"))) {
    const side = off!.side ?? 1;
    const gapOff = { A: 0.7, B: 2, C: 3.6, D: 7 }[off!.gap ?? "A"] * side;
    const rbIdx = out.carrierIdx ?? 6;
    carrierIdx = rbIdx;
    const yards = kind === "penalty" ? 2 : out.yards;
    const end: Vec = [los + yards, finalY(cy + gapOff, yards)];
    finalSpot = kind === "penalty" ? [los, cy] : end;
    if (rbIdx === 0) {
      carrierStart = snapT;
      const path = runPath(start[0], end);
      carrierPlan = timedPath(path, snapT, qbSpd * 0.6);
      whistleT = snapT + pathLength(path) / (qbSpd * 0.6);
      plans[0].fixed = carrierPlan;
    } else {
      const handT = snapT + (shotgun ? 0.5 : 0.8);
      const H: Vec = [los - (shotgun ? 3.8 : 2.8), cy + side * 0.8];
      const qbPath: Vec[] = [start[0], H, [H[0] - 1.5, H[1] - side * 2]];
      plans[0].fixed = (t) => (t < snapT ? start[0] : t < handT ? lerpV(start[0], H, (t - snapT) / (handT - snapT)) : alongPath(qbPath.slice(1), (t - handT) * 2));
      carrierStart = handT;
      const gap: Vec = [los + 0.6, cy + gapOff];
      const sp = speedOf(spec, rbIdx) * 0.85;
      const pathPts: Vec[] = yards < 0 ? [H, end] : yards <= 2 ? [H, [los - 0.2, gap[1]], end] : [H, gap, ...runPath(gap, end).slice(1)];
      const afterLen = pathLength(pathPts);
      const toH = (t: number) => lerpV(start[rbIdx], H, Math.min(1, Math.max(0, (t - snapT) / (handT - snapT))));
      carrierPlan = (t) => (t < snapT ? start[rbIdx] : t < handT ? toH(t) : alongPath(pathPts, (t - handT) * sp));
      plans[rbIdx].fixed = carrierPlan;
      whistleT = handT + afterLen / sp;
      events.push({ t: handT, kind: "handoff", text: `Handoff to ${spec.offPlayers[rbIdx]?.name ?? "the back"}` });
    }
    if (kind === "penalty") events.push({ t: whistleT, kind: "whistle", text: `Flag: ${out.penalty?.name ?? "Penalty"}` });
    // Receivers block downfield.
    for (const i of skill) if (i !== carrierIdx) {
      const s = start[i];
      const pts: Vec[] = [s, [s[0] + 4 + r() * 3, s[1] + (s[1] < cy ? 2 : -2)]];
      plans[i].fixed = timedPath(pts, snapT, speedOf(spec, i) * 0.5);
    }
  } else if (isPassPlay || kind === "twopoint" || kind === "penalty") {
    // Routes.
    const order = receivers.slice().sort((a, b) => (offPos[a] === "WR" ? 0 : 1) - (offPos[b] === "WR" ? 0 : 1));
    const concept = CONCEPTS[off?.concept ?? ""] ?? CONCEPTS["Curl-Flat"];
    const tIdx = out.targetIdx ?? order[0] ?? 7;
    const air = out.airYards ?? (kind === "twopoint" ? 2 : 6);
    const routeEnd: Record<number, Vec> = {};
    const routeSpeed: Record<number, number> = {};
    const routePts: Record<number, Vec[]> = {};
    order.concat(6).forEach((i, n) => {
      if (i === 6 && order.includes(6)) return;
      const s = start[i];
      const inside = s[1] < cy ? 1 : -1;
      let name: RouteName = i === 6 ? (out.targetIdx === 6 ? (air <= 0 ? "screen" : "flat") : "block") : concept[Math.min(n, concept.length - 1)];
      let pts: Array<[number, number]>;
      if (i === tIdx) {
        const base = ROUTES[name];
        const lastF = base[base.length - 1][0];
        if (lastF < 2 || Math.abs(lastF - air) > 10 || air <= 0) name = routeForDepth(air);
        pts = scaledRoute(name, air + (los - s[0]));
      } else pts = ROUTES[name];
      const abs: Vec[] = pts.map(([f, ins]) => [s[0] + f, clampY(s[1] + ins * inside)]);
      if (i === tIdx) abs[abs.length - 1] = [los + air, abs[abs.length - 1][1]];
      routePts[i] = abs;
      routeEnd[i] = abs[abs.length - 1];
      routeSpeed[i] = speedOf(spec, i) * (name === "block" ? 0.4 : 0.9);
      if (name !== "block") routes.push({ idx: i, points: abs });
      if (name !== "block" && i !== tIdx && reads.length < 2) reads.push(i);
    });
    reads.push(tIdx);
    // QB drop.
    const pa = off?.type === "playaction";
    const dropDepth = off?.type === "screen" ? 3 : off?.type === "short" ? (shotgun ? 1.5 : 5) : shotgun ? 2.5 : 7;
    const D: Vec = [los - (shotgun ? 5 + dropDepth * 0.4 : dropDepth), cy + (pa && off?.concept === "Bootleg" ? -6 : 0)];
    const dropT = snapT + (shotgun ? 0.6 : 1.1) + (pa ? 0.5 : 0);
    const thp = speedOf(spec, 0);
    const ballSpeed = 15 + thp * 0.9;
    for (const i of Object.keys(routePts).map(Number)) {
      plans[i].fixed = timedPath(routePts[i], snapT, routeSpeed[i]);
    }
    const tLen = pathLength(routePts[tIdx] ?? [start[tIdx], [los + air, start[tIdx][1]]]);
    let catchT = snapT + tLen / (routeSpeed[tIdx] ?? 7);
    const catchPt: Vec = routeEnd[tIdx] ?? [los + air, start[tIdx][1]];
    const flight = Math.hypot(catchPt[0] - D[0], catchPt[1] - D[1]) / ballSpeed;
    let throwT = catchT - flight;
    const minThrow = dropT + (off?.type === "screen" ? 0.2 : off?.type === "deep" ? 1.0 : 0.4);
    if (throwT < minThrow) {
      throwT = minThrow;
      catchT = throwT + flight;
    }
    if (pa) events.push({ t: snapT + 0.5, kind: "handoff", text: "Play-action fake" });

    if (kind === "sack" || (kind === "fumble" && out.carrierIdx === 0)) {
      const sackT = snapT + 2 + r() * 0.8;
      const S: Vec = [los + out.yards, clampY(cy + (r() - 0.5) * 4)];
      plans[0].fixed = (t) => (t < snapT ? start[0] : t < dropT ? lerpV(start[0], D, (t - snapT) / (dropT - snapT)) : lerpV(D, S, Math.min(1, (t - dropT) / (sackT - dropT))));
      carrierIdx = 0;
      carrierPlan = plans[0].fixed;
      whistleT = sackT + 0.2;
      finalSpot = S;
      const sacker = out.defenderIdx ?? 0;
      const sk = 11 + sacker;
      const sStart = start[sk];
      plans[sk].fixed = (t) => (t < snapT ? sStart : lerpV(sStart, [S[0] + 0.6, S[1] + 0.3], Math.min(1, Math.pow((t - snapT) / (sackT - snapT), 1.2))));
      events.push({ t: sackT, kind: "sack", text: `SACK by ${spec.defPlayers[sacker]?.name ?? "the defense"}`, at: S });
    } else if (kind === "scramble") {
      const runT = snapT + 2.2;
      const end: Vec = [los + out.yards, finalY(cy, out.yards)];
      const path = runPath(D, end);
      const sp = qbSpd * 0.85;
      plans[0].fixed = (t) => (t < snapT ? start[0] : t < dropT ? lerpV(start[0], D, (t - snapT) / (dropT - snapT)) : t < runT ? D : alongPath(path, (t - runT) * sp));
      carrierIdx = 0;
      carrierPlan = plans[0].fixed;
      whistleT = runT + pathLength(path) / sp;
      finalSpot = end;
    } else {
      // A throw.
      plans[0].fixed = (t) => (t < snapT ? start[0] : t < dropT ? lerpV(start[0], D, (t - snapT) / (dropT - snapT)) : D);
      ballPlan.throwT = throwT;
      ballPlan.catchT = catchT;
      ballPlan.from = [D[0] + 0.3, D[1]];
      ballPlan.peak = Math.min(9, 1 + flight * 3.2);
      events.push({ t: throwT, kind: "throw", text: `Pass to ${spec.offPlayers[tIdx]?.name ?? "a receiver"}` });
      // The target waits at his catch point if he gets there early.
      const tPts = routePts[tIdx] ?? [start[tIdx], catchPt];
      const tSp = routeSpeed[tIdx] ?? 7;
      if (kind === "complete" || kind === "twopoint" || kind === "fumble") {
        const yards = kind === "twopoint" ? (out.good ? 2.5 : 0.5) : out.yards;
        const end: Vec = [los + yards, finalY(catchPt[1], yards - air)];
        finalSpot = kind === "twopoint" ? [los, cy] : end;
        const yac = runPath(catchPt, end);
        const sp = speedOf(spec, tIdx) * 0.88;
        carrierIdx = tIdx;
        carrierStart = catchT;
        carrierPlan = (t) => (t < catchT ? alongPath(tPts, Math.min(tLen, Math.max(0, t - snapT) * tSp)) : alongPath(yac, (t - catchT) * sp));
        plans[tIdx].fixed = carrierPlan;
        ballPlan.to = catchPt;
        whistleT = catchT + pathLength(yac) / sp;
        events.push({ t: catchT, kind: "catch", text: `Caught by ${spec.offPlayers[tIdx]?.name ?? "the receiver"}`, at: catchPt });
      } else if (kind === "interception") {
        const dIdx = out.defenderIdx ?? 4;
        const k = 11 + dIdx;
        const retEnd: Vec = [out.defTouchdown ? -4 : los + air - (out.returnYards ?? 0), finalY(catchPt[1], out.returnYards ?? 0)];
        const retPath = runPath([catchPt[0] + 0.5, catchPt[1]], retEnd);
        const sp = speedOf(spec, k) * 0.85;
        const dStart = start[k];
        ballPlan.to = [catchPt[0] + 0.5, catchPt[1]];
        plans[k].fixed = (t) => (t < snapT ? dStart : t < catchT ? lerpV(dStart, ballPlan.to, Math.pow((t - snapT) / (catchT - snapT), 1.3)) : alongPath(retPath, (t - catchT) * sp));
        carrierIdx = k;
        carrierStart = catchT;
        carrierPlan = plans[k].fixed!;
        plans[tIdx].fixed = (t) => alongPath(tPts, Math.min(tLen, Math.max(0, t - snapT) * tSp));
        whistleT = catchT + pathLength(retPath) / sp;
        finalSpot = retEnd;
        events.push({ t: catchT, kind: "interception", text: `INTERCEPTED by ${spec.defPlayers[dIdx]?.name ?? "the defense"}`, at: catchPt });
      } else {
        // Incomplete (or a flag on a pass).
        plans[tIdx].fixed = (t) => alongPath(tPts, Math.min(tLen + 2, Math.max(0, t - snapT) * tSp));
        ballPlan.to = [catchPt[0] + 1.5 + r() * 2, clampY(catchPt[1] + (r() - 0.5) * 3)];
        whistleT = catchT + 0.5;
        finalSpot = [los, cy];
        events.push({ t: catchT, kind: "incomplete", text: kind === "penalty" ? `Flag: ${out.penalty?.name ?? "Penalty"}` : "Incomplete", at: catchPt });
      }
    }
    // Backs not running a route stay in to block.
    if (!plans[6].fixed) {
      const s = start[6];
      plans[6].fixed = timedPath([s, [los - 2.5, cy - 2]], snapT, 3);
    }
  }

  // Unplanned offense: block (OL handled below), others stand.
  for (let i = 0; i < 11; i++) if (!plans[i].fixed && (i < 1 || i > 5)) {
    const s = start[i];
    plans[i].fixed = () => s;
  }

  // OL / DL engagement and blocks.
  const blocks: Array<[number, number]> = [];
  for (let i = 1; i <= 5; i++) {
    let best = 11;
    let bd = 1e9;
    for (const j of rushers) {
      const d = Math.abs(start[11 + j][1] - start[i][1]);
      if (d < bd) {
        bd = d;
        best = 11 + j;
      }
    }
    blocks.push([i, best]);
    const pairDl = best;
    plans[i].target = (_t, pos) => {
      const qb = pos[0];
      const dl = pos[pairDl];
      const dx = qb[0] - dl[0];
      const dy = qb[1] - dl[1];
      const d = Math.hypot(dx, dy) || 1;
      return isRunPlay ? [dl[0] - 0.7, dl[1] + (dy / d) * 0.4] : [dl[0] + (dx / d) * 0.9, dl[1] + (dy / d) * 0.9];
    };
    plans[i].scale = (t) => (t < snapT ? 0 : 0.55);
  }
  const tacklerK = out.tacklerIdx !== undefined ? 11 + out.tacklerIdx : -1;
  const sackerK = kind === "sack" ? 11 + (out.defenderIdx ?? 0) : -1;
  const reactT = isRunPlay ? carrierStart + 0.3 : ballPlan.throwT > 0 ? ballPlan.throwT + 0.25 : snapT + 1.5;
  const ballSpot = (t: number, pos: Vec[]): Vec => {
    if (carrierIdx >= 0 && t >= carrierStart) return pos[carrierIdx];
    if (ballPlan.throwT > 0 && t >= ballPlan.throwT) return ballPlan.to;
    return pos[0];
  };
  for (let j = 0; j < 11; j++) {
    const k = 11 + j;
    if (plans[k].fixed) continue;
    const role = defRole(j);
    const isRusher = rushers.has(j);
    plans[k].target = (t, pos) => {
      if (t < snapT) return start[k];
      if (t >= reactT || (isRunPlay && t > carrierStart && role !== "CB")) {
        const b = ballSpot(t, pos);
        return [b[0] + 0.5, b[1]];
      }
      if (isRusher) return isRunPlay ? [los + 0.3, start[k][1]] : [pos[0][0], pos[0][1]];
      if (man && manTarget[j] !== undefined) {
        const rp = pos[manTarget[j]];
        return [rp[0] + 1.2, rp[1] + (rp[1] < cy ? 0.6 : -0.6)];
      }
      return zoneSpot[j] ?? start[k];
    };
    plans[k].scale = (t) => (t < snapT ? 0 : isRusher && t < reactT ? (j < 4 ? 0.45 : 0.8) : 0.95);
  }

  return simulate(spec, start, plans, {
    carrierIdx, carrierStart, whistleT, ballPlan, finalSpot, tacklerK: tacklerK === sackerK ? -1 : tacklerK, events, reads, routes, blocks,
    zones: Object.entries(zoneSpot).filter(() => !man).map(([j, at]) => ({ idx: 11 + Number(j), at })),
    loose: kind === "fumble",
    pancake: isRunPlay && out.yards >= 6 ? blocks[Math.floor(r() * blocks.length)]?.[0] ?? -1 : -1,
    td: !!out.touchdown || !!out.defTouchdown,
  });
}

// ---------------------------------------------------------------------------

interface SimOpts {
  carrierIdx: number;
  carrierStart: number;
  whistleT: number;
  ballPlan: { throwT: number; catchT: number; from: Vec; to: Vec; holder: number; afterCatch: number; peak: number };
  finalSpot: Vec;
  tacklerK: number;
  events: Ev[];
  reads: number[];
  routes: PlayScript["routes"];
  blocks: Array<[number, number]>;
  zones: Array<{ idx: number; at: Vec }>;
  loose?: boolean;
  pancake?: number;
  td?: boolean;
  initialHolder?: number;
}

function simulate(spec: PlaySpec, start: Vec[], plans: Plan[], o: SimOpts): PlayScript {
  const movers: Mover[] = start.map((s, i) => moverFor(i < 11 ? spec.offPlayers[i]?.spd ?? 60 : spec.defPlayers[i - 11]?.spd ?? 60, s));
  const total = o.whistleT + 0.9;
  const frames: Float32Array[] = [];
  const heights: number[] = [];
  const carriers: number[] = [];
  const pos: Vec[] = start.map((s) => [s[0], s[1]]);
  const toAbsX = (x: number) => (spec.dir > 0 ? 10 + x : 110 - x);
  const toAbsY = (y: number) => (spec.dir > 0 ? y : W - y);
  let tackleLogged = false;
  const holder0 = o.initialHolder ?? 0;
  for (let step = 0; step * DT <= total + 1e-6; step++) {
    const t = step * DT;
    const after = t > o.whistleT;
    // Scripted first.
    for (let i = 0; i < N; i++) {
      const f = plans[i].fixed;
      if (f) {
        const tt = Math.min(t, o.whistleT);
        const raw = f(tt);
        const p: Vec = [clampX(raw[0]), clampY(raw[1])];
        pos[i] = [p[0], p[1]];
        movers[i].p = [p[0], p[1]];
      }
    }
    for (let i = 0; i < N; i++) {
      if (plans[i].fixed) continue;
      const m = movers[i];
      if (after) {
        seek(m, m.p, DT, 0.3);
      } else if (i === o.tacklerK && o.carrierIdx >= 0 && t > o.whistleT - 1.2 && t >= o.carrierStart) {
        // Tackler converges on the carrier at the whistle.
        const c = pos[o.carrierIdx];
        const left = Math.max(DT, o.whistleT - t);
        const goal: Vec = [c[0] + 0.7 * (i >= 11 ? 1 : -1), c[1] + 0.3];
        m.p = lerpV(m.p, goal, Math.min(1, DT / left));
      } else {
        const tgt = plans[i].target?.(t, pos) ?? m.p;
        seek(m, tgt, DT, plans[i].scale?.(t) ?? 1);
      }
      m.p = [clampX(m.p[0]), clampY(m.p[1])];
      pos[i] = [m.p[0], m.p[1]];
    }
    // Keep everyone apart a little (not the carrier and tackler).
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = pos[j][0] - pos[i][0];
        const dy = pos[j][1] - pos[i][1];
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 0.8) {
          const push = (0.8 - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          if (!plans[i].fixed && i !== o.tacklerK) { pos[i][0] -= ux * push; pos[i][1] -= uy * push; movers[i].p = [pos[i][0], pos[i][1]]; }
          if (!plans[j].fixed && j !== o.tacklerK) { pos[j][0] += ux * push; pos[j][1] += uy * push; movers[j].p = [pos[j][0], pos[j][1]]; }
        }
      }
    }
    // Ball.
    let ball: Vec;
    let h = 0;
    let carrier = -1;
    const bp = o.ballPlan;
    const tt = Math.min(t, o.whistleT);
    if (o.carrierIdx >= 0 && tt >= o.carrierStart && (bp.catchT < 0 || tt >= bp.catchT)) {
      carrier = o.carrierIdx;
      ball = [pos[carrier][0] + 0.25, pos[carrier][1]];
      if (after || Math.abs(t - o.whistleT) < 1e-6) ball = [o.finalSpot[0], o.finalSpot[1]];
      if (o.loose && after) {
        const u = Math.min(1, (t - o.whistleT) / 0.5);
        ball = [o.finalSpot[0] + 1.5 * u, o.finalSpot[1] + 2 * u];
        h = Math.sin(u * Math.PI) * 0.6;
        carrier = -1;
      }
    } else if (bp.throwT >= 0 && tt >= bp.throwT) {
      const u = Math.min(1, (tt - bp.throwT) / Math.max(0.1, bp.catchT - bp.throwT));
      ball = lerpV(bp.from, bp.to, u);
      h = Math.sin(u * Math.PI) * bp.peak + (1 - u) * 1.8;
      if (u >= 1) h = o.carrierIdx >= 0 ? 0 : 0.1;
    } else {
      carrier = holder0;
      ball = [pos[holder0][0] + 0.3, pos[holder0][1]];
    }
    const f = new Float32Array((N + 1) * 2);
    for (let i = 0; i < N; i++) {
      f[i * 2] = toAbsX(pos[i][0]);
      f[i * 2 + 1] = toAbsY(pos[i][1]);
    }
    f[BALL * 2] = toAbsX(clampX(ball[0]));
    f[BALL * 2 + 1] = toAbsY(clampY(ball[1]));
    frames.push(f);
    heights.push(h);
    carriers.push(carrier);
    if (!tackleLogged && t >= o.whistleT) tackleLogged = true;
  }
  const events: Ev[] = o.events.map((e) => (e.at ? { ...e, at: [toAbsX(e.at[0]), toAbsY(e.at[1])] as [number, number] } : { ...e }));
  if (o.pancake !== undefined && o.pancake >= 0) events.push({ t: Math.max(0.8, o.carrierStart + 0.4), kind: "pancake", text: `Pancake by ${spec.offPlayers[o.pancake]?.name ?? "the line"}` });
  const endAbs: [number, number] = [toAbsX(o.finalSpot[0]), toAbsY(o.finalSpot[1])];
  if (o.td) events.push({ t: o.whistleT, kind: "touchdown", text: "TOUCHDOWN", at: endAbs });
  else if (o.carrierIdx >= 0 && !events.some((e) => e.kind === "whistle")) events.push({ t: o.whistleT, kind: o.tacklerK >= 0 ? "tackle" : "whistle", text: o.tacklerK >= 0 ? `Tackle by ${(o.tacklerK >= 11 ? spec.defPlayers[o.tacklerK - 11] : spec.offPlayers[o.tacklerK])?.name ?? ""}` : "Whistle", at: endAbs });
  else if (!events.some((e) => e.kind === "whistle")) events.push({ t: o.whistleT, kind: "whistle", text: "Whistle" });
  events.sort((a, b) => a.t - b.t);
  const all = [...spec.offPlayers, ...spec.defPlayers];
  return {
    dt: DT,
    frames,
    ballHeight: heights,
    carrier: carriers,
    events,
    reads: o.reads,
    routes: o.routes.map((rt) => ({ idx: rt.idx, points: rt.points.map((p) => [toAbsX(p[0]), toAbsY(p[1])] as [number, number]) })),
    blocks: o.blocks,
    zones: o.zones.map((z) => ({ idx: z.idx, at: [toAbsX(z.at[0]), toAbsY(z.at[1])] as [number, number] })),
    labels: Array.from({ length: N }, (_, i) => String(all[i]?.num ?? "")),
    names: Array.from({ length: N }, (_, i) => all[i]?.name ?? ""),
    positions: Array.from({ length: N }, (_, i) => all[i]?.pos ?? ""),
    finalX: toAbsX(o.finalSpot[0]),
  };
}

// ---------------------------------------------------------------------------
// Special teams

function buildSpecial(spec: PlaySpec, r: Rng): PlayScript {
  const out = spec.outcome;
  const los = spec.los;
  const cy = W / 2;
  const start: Vec[] = new Array(N);
  const plans: Plan[] = new Array(N).fill(null).map(() => ({}));
  const events: Ev[] = [];
  const kind = spec.special!;
  if (kind === "fg" || kind === "pat") {
    // Line, holder, kicker.
    for (let i = 1; i < 11; i++) start[i] = [los - 0.6, cy + (i - 5.5) * 1.15];
    start[0] = [los - 9.5, cy - 1.8];
    const holderIdx = 1;
    start[holderIdx] = [los - 7, cy];
    for (let j = 0; j < 11; j++) start[11 + j] = j < 9 ? [los + 1, cy + (j - 4) * 1.3] : [los + 8 + j, cy + (j === 9 ? -6 : 6)];
    const kickT = 1.35;
    plans[0].fixed = (t) => (t < 0.9 ? start[0] : lerpV(start[0], [los - 7.6, cy - 0.3], Math.min(1, (t - 0.9) / 0.45)));
    plans[holderIdx].fixed = () => start[holderIdx];
    for (let i = 2; i < 11; i++) { const s = start[i]; plans[i].fixed = (t) => (t < 0.5 ? s : [s[0] - 0.4, s[1]]); }
    for (let j = 0; j < 11; j++) { const k = 11 + j; plans[k].target = (t) => (t < 0.5 ? start[k] : [los - 3, start[k][1] * 0.8 + cy * 0.2]); plans[k].scale = () => 0.5; }
    const dist = Math.max(1, 110 - (los - 7));
    const flight = 0.9 + dist / 35;
    const endY = cy + (out.good ? (r() - 0.5) * 2.5 : (r() < 0.5 ? -1 : 1) * (3.4 + r() * 2));
    events.push({ t: 0.4, kind: "snap", text: "Snap" });
    events.push({ t: kickT, kind: "kick", text: kind === "pat" ? "Extra point attempt" : `${out.kickDistance}-yard attempt` });
    events.push({ t: kickT + flight, kind: "whistle", text: out.good ? "It's GOOD" : "No good" });
    return simulate(spec, start, plans, {
      carrierIdx: -1, carrierStart: 0, whistleT: kickT + flight, finalSpot: [110, endY], tacklerK: -1, events, reads: [], routes: [], blocks: [], zones: [],
      initialHolder: holderIdx,
      ballPlan: { throwT: kickT, catchT: kickT + flight, from: [los - 7, cy], to: [111, endY], holder: holderIdx, afterCatch: -1, peak: 9 + dist / 6 },
    });
  }
  if (kind === "punt") {
    for (let i = 2; i < 11; i++) start[i] = [los - 0.6, cy + (i - 6) * 1.6];
    start[1] = [los - 0.4, cy]; // snapper
    start[0] = [los - 14, cy];
    const land = Math.min(109, los + (out.kickDistance ?? 40));
    const catchAt: Vec = [land, cy + (r() - 0.5) * 10];
    const retEndX = out.touchback ? 100 : out.touchdown ? 105 : 100 - ((100 - land) + (out.returnYards ?? 0)) * 1;
    // In the kicking team's frame the returner runs back toward smaller x.
    const retEnd: Vec = [out.touchdown ? -4 : out.touchback ? 100 : land - (out.returnYards ?? 0), clampY(catchAt[1] + (r() - 0.5) * 12)];
    void retEndX;
    for (let j = 0; j < 11; j++) start[11 + j] = j === 0 ? [Math.min(108, land + 2), catchAt[1]] : j < 7 ? [los + 1.2, cy + (j - 3.5) * 2] : [los + 12 + j * 2, cy + (j % 2 ? -8 : 8)];
    const kickT = 1.8;
    const hang = 3.6 + r() * 0.8;
    const catchT = kickT + hang;
    const fair = !out.touchback && (out.returnYards ?? 0) === 0 && !out.touchdown;
    const sp = speedOf(spec, 11) * 0.85;
    const retPath: Vec[] = [catchAt, [lerp(catchAt[0], retEnd[0], 0.5), clampY(catchAt[1] + (r() - 0.5) * 10)], retEnd];
    const whistleT = out.touchback ? catchT + 1 : fair ? catchT + 0.2 : catchT + pathLength(retPath) / sp;
    plans[0].fixed = (t) => (t < 1.2 ? start[0] : lerpV(start[0], [los - 12.5, cy], Math.min(1, (t - 1.2) / 0.6)));
    plans[11].fixed = (t) => (t < catchT ? lerpV(start[11], catchAt, Math.min(1, t / Math.max(0.5, catchT - 0.3))) : out.touchback || fair ? catchAt : alongPath(retPath, (t - catchT) * sp));
    for (let i = 1; i < 11; i++) { const k = i; plans[k].target = (t, pos) => (t < kickT ? start[k] : [pos[11][0] + 1, pos[11][1]]); plans[k].scale = (t) => (t < 0.4 ? 0 : 0.95); }
    for (let j = 1; j < 11; j++) { const k = 11 + j; plans[k].target = (t, pos) => (t < 0.4 ? start[k] : t < catchT ? [los + 10 + j * 3, start[k][1]] : [pos[11][0] - 3, pos[11][1] + (j % 2 ? -3 : 3)]); plans[k].scale = () => 0.8; }
    events.push({ t: 0.4, kind: "snap", text: "Snap" });
    events.push({ t: kickT, kind: "kick", text: `Punt, ${out.kickDistance} yards` });
    events.push({ t: catchT, kind: fair ? "whistle" : "catch", text: out.touchback ? "Touchback" : fair ? "Fair catch" : "Fielded", at: catchAt });
    const tacklerK = fair || out.touchback || out.touchdown ? -1 : 2 + Math.floor(r() * 9);
    return simulate(spec, start, plans, {
      carrierIdx: out.touchback ? -1 : 11, carrierStart: catchT, whistleT, finalSpot: out.touchback ? catchAt : fair ? catchAt : retEnd, tacklerK, events, reads: [], routes: [], blocks: [], zones: [], td: out.touchdown,
      ballPlan: { throwT: kickT, catchT, from: [los - 12.5, cy], to: catchAt, holder: 0, afterCatch: -1, peak: 14 + r() * 4 },
    });
  }
  // Kickoff / onside: offense = kicking team, kicks toward +x from `los`.
  const onside = kind === "onside";
  for (let i = 1; i < 11; i++) start[i] = [los - 1, 3 + ((i - 1) * (W - 6)) / 9];
  start[0] = [los - 7, cy];
  const land = onside ? los + 11 : Math.min(108, los + (out.kickDistance ?? 60));
  const catchAt: Vec = [land, onside ? cy + 8 : cy + (r() - 0.5) * 8];
  for (let j = 0; j < 11; j++) start[11 + j] = j === 0 ? [Math.min(107, land + 1), catchAt[1]] : j < 6 ? [los + 12, 5 + j * 8] : [los + 25 + (j - 6) * 3, cy + (j - 8) * 7];
  const kickT = 1.2;
  const hang = onside ? 1.2 : 3.9;
  const catchT = kickT + hang;
  const retEnd: Vec = [out.touchdown ? -4 : land - (out.returnYards ?? 0), clampY(catchAt[1] + (r() - 0.5) * 14)];
  const sp = speedOf(spec, 11) * 0.88;
  const retPath: Vec[] = [catchAt, [lerp(catchAt[0], retEnd[0], 0.45), clampY(catchAt[1] + (r() - 0.5) * 12)], retEnd];
  const returned = !onside && !out.touchback;
  const whistleT = returned ? catchT + pathLength(retPath) / sp : catchT + 0.6;
  plans[0].fixed = (t) => lerpV(start[0], [los, cy], Math.min(1, t / kickT));
  const recoverK = onside ? (out.recoveredByDefense ? 12 : 3) : 11;
  plans[recoverK].fixed = (t) => (t < catchT ? lerpV(start[recoverK], catchAt, Math.min(1, t / catchT)) : returned ? alongPath(retPath, (t - catchT) * sp) : catchAt);
  for (let i = 1; i < 11; i++) if (i !== recoverK) { const k = i; plans[k].target = (t, pos) => (t < kickT - 0.4 ? start[k] : [pos[recoverK][0] + 1, pos[recoverK][1] + (k - 5) * 0.4]); plans[k].scale = () => 0.95; }
  for (let j = 0; j < 11; j++) { const k = 11 + j; if (k === recoverK) continue; plans[k].target = (t, pos) => (t < kickT ? start[k] : [pos[recoverK][0] - 4, pos[recoverK][1] + (j - 5) * 1.5]); plans[k].scale = () => 0.7; }
  events.push({ t: kickT, kind: "kick", text: onside ? "Onside kick" : "Kickoff" });
  events.push({ t: catchT, kind: returned ? "catch" : "whistle", text: onside ? (out.recoveredByDefense ? "Recovered by the receiving team" : "Kicking team recovers!") : out.touchback ? "Touchback" : "Fielded", at: catchAt });
  const tacklerK = returned && !out.touchdown ? 1 + Math.floor(r() * 10) : -1;
  return simulate(spec, start, plans, {
    carrierIdx: returned ? recoverK : -1, carrierStart: catchT, whistleT, finalSpot: returned ? retEnd : catchAt, tacklerK: tacklerK === recoverK ? -1 : tacklerK, events, reads: [], routes: [], blocks: [], zones: [], td: out.touchdown,
    initialHolder: 0,
    ballPlan: { throwT: kickT, catchT, from: [los, cy], to: catchAt, holder: 0, afterCatch: -1, peak: onside ? 1.2 : 16 },
  });
}

void timedPathDur;
