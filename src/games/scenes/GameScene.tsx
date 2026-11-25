import type { CSSProperties, ReactNode } from "react";
import "./scenes.css";

/**
 * A full-bleed themed scene for the game info page (GameDetail mounts it in .lx-stage). Not used on play screens.
 * It paints above the global 3D backdrop and below the content. Colour comes from the inherited `--game`. At most three layers per scene move
 * (transform and opacity only, see scenes.css); everything else is a static composition.
 */
export type SceneId = "jeopardy" | "headbands" | "liar" | "rpg" | "blackjack" | "drawit" | "feud" | "generic";

const KNOWN: SceneId[] = ["jeopardy", "headbands", "liar", "rpg", "blackjack", "drawit", "feud"];

/** Deterministic pseudo-random so a scene looks the same on every render. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Soft bokeh discs as one multi-background value (no extra elements). Radii are in vmax. */
function bokeh(n: number, seed: number, colors: string[], rMin: number, rMax: number, alpha = 1): string {
  const r = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = colors[Math.floor(r() * colors.length)];
    const rad = rMin + r() * (rMax - rMin);
    const a = Math.round((0.35 + r() * 0.65) * alpha * 100);
    out.push(
      `radial-gradient(circle at ${(r() * 100).toFixed(1)}% ${(r() * 100).toFixed(1)}%, color-mix(in oklab, ${c} ${a}%, transparent) 0, color-mix(in oklab, ${c} ${Math.round(a * 0.7)}%, transparent) ${(rad * 0.62).toFixed(2)}vmax, transparent ${rad.toFixed(2)}vmax)`,
    );
  }
  return out.join(",");
}

const G1 = "var(--g1)";
const G2 = "var(--g2)";
const G3 = "var(--g3)";

/** A positioned, rotated item sized in viewport units so it scales from phone to desktop. */
function Item({ x, y, w, r = 0, ratio = 1, blur, op, children }: { x: number; y: number; w: string; r?: number; ratio?: number; blur?: number; op?: number; children: ReactNode }) {
  const st: CSSProperties = { left: `${x}%`, top: `${y}%`, width: w, aspectRatio: String(ratio), transform: `translate(-50%,-50%) rotate(${r}deg)` };
  if (blur) st.filter = `blur(${blur}px)`;
  if (op != null) st.opacity = op;
  return (
    <div className="gs-item" style={st}>
      {children}
    </div>
  );
}
const sz = (vmax: number, vw: number) => `min(${vmax}vmax, ${vw}vw)`;

/* ------------------------------------------------------------------ shared glyphs */

function QCard({ tone = 1 }: { tone?: 1 | 2 | 3 }) {
  const t = tone === 1 ? G1 : tone === 2 ? G2 : G3;
  return (
    <svg viewBox="0 0 100 140" width="100%" height="100%">
      <defs>
        <linearGradient id={`qc${tone}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${t} 78%, #fff)` }} />
          <stop offset="1" style={{ stopColor: `color-mix(in oklab, ${t} 82%, #000)` }} />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="94" height="134" rx="12" fill={`url(#qc${tone})`} stroke="rgb(255 255 255 / .65)" strokeWidth="2.4" />
      <rect x="10" y="10" width="80" height="120" rx="8" fill="none" stroke="rgb(255 255 255 / .35)" strokeWidth="1.4" strokeDasharray="3 3" />
      <text x="50" y="97" textAnchor="middle" fontSize="92" fontWeight="900" fill="rgb(255 255 255 / .94)" style={{ fontFamily: "system-ui, sans-serif" }}>
        ?
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ Jeopardy */

function JeopardyScene() {
  const beam = (x: number, w: number, lean: number, key: string, o = 1) => (
    <polygon key={key} points={`${x - 14},-10 ${x + 14},-10 ${x + lean + w},940 ${x + lean - w},940`} fill="url(#jbeam)" opacity={o} />
  );
  return (
    <>
      <div className="gs-base" />
      <svg className="gs-fill" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="jfloor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: G1, stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: G1, stopOpacity: 0.55 }} />
          </linearGradient>
          <linearGradient id="jbeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".9" />
            <stop offset=".55" style={{ stopColor: G1, stopOpacity: 0.28 }} />
            <stop offset="1" style={{ stopColor: G1, stopOpacity: 0 }} />
          </linearGradient>
          <linearGradient id="jarch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${G1} 70%, #1d4ed8)`, stopOpacity: 0.95 }} />
            <stop offset="1" style={{ stopColor: `color-mix(in oklab, ${G1} 40%, #0b1b4d)`, stopOpacity: 0.85 }} />
          </linearGradient>
        </defs>
        {/* floor + reflection */}
        <rect x="0" y="690" width="1600" height="210" fill="url(#jfloor)" />
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={800 + (i - 5) * 60} y1="690" x2={800 + (i - 5) * 260} y2="900" stroke={G1} strokeOpacity=".4" strokeWidth="2" />
        ))}
        {/* a soft stage glow where the floating 3D board hangs; the board itself is the 3D part */}
        <ellipse cx="1000" cy="470" rx="560" ry="300" fill={G1} fillOpacity=".34" className="gs-blur-lg" />
        {/* proscenium: columns, header, edge light */}
        <path d="M0 0H1600V120Q800 235 0 120Z" fill="url(#jarch)" />
        <path d="M0 120Q800 235 1600 120" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="5" />
        <path d="M0 132Q800 247 1600 132" fill="none" stroke={G1} strokeOpacity=".9" strokeWidth="10" className="gs-blur-sm" />
        <rect x="0" y="0" width="86" height="900" fill="url(#jarch)" />
        <rect x="1514" y="0" width="86" height="900" fill="url(#jarch)" />
        <rect x="80" y="0" width="7" height="900" fill="#fff" fillOpacity=".5" />
        <rect x="1513" y="0" width="7" height="900" fill="#fff" fillOpacity=".5" />
        {Array.from({ length: 15 }, (_, i) => (
          <circle key={i} cx={60 + i * 106.5} cy={62 + Math.sin((i / 14) * Math.PI) * 68} r="9" fill="#fff" fillOpacity=".95" />
        ))}
      </svg>
      <div className="gs-layer gs-a">
        <svg className="gs-fill" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
          {beam(180, 120, 150, "a")}
          {beam(1420, 120, -150, "b")}
        </svg>
      </div>
      <div className="gs-layer gs-b">
        <svg className="gs-fill" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
          {beam(520, 90, -60, "c", 0.85)}
          {beam(1080, 90, 60, "d", 0.85)}
        </svg>
      </div>
      <div className="gs-layer gs-c" style={{ background: bokeh(26, 11, ["#fff", G1, G2], 1.2, 4.2, 0.7) }} />
      <div className="gs-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ Headbands */

function HeadbandsScene() {
  const ring = (n: number, seed: number, rMin: number, rMax: number, wBase: number, wVar: number, vw: number, blur?: number) => {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => {
      const th = ((i + r() * 0.5) / n) * Math.PI * 2;
      const rad = rMin + r() * (rMax - rMin);
      const w = wBase + r() * wVar;
      return (
        <Item key={i} x={50 + Math.cos(th) * rad} y={50 + Math.sin(th) * rad} w={sz(w, w * vw)} ratio={100 / 140} r={r() * 360} blur={blur}>
          <QCard tone={(1 + (i % 3)) as 1 | 2 | 3} />
        </Item>
      );
    });
  };
  return (
    <>
      <div className="gs-base" />
      <div className="gs-layer gs-a" style={{ background: bokeh(22, 5, [G1, G2, "#fff", G3], 4, 13, 0.6) }} />
      <div className="gs-ring gs-b">{ring(7, 21, 26, 47, 13, 4, 2)}</div>
      <div className="gs-ring gs-c">{ring(3, 77, 36, 48, 20, 6, 2.6, 2.5)}</div>
      <div className="gs-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ LIAR */

function liarWave(): string {
  // One period of a polygraph trace across 1000 units, repeated twice for a seamless loop.
  const pts: string[] = [];
  const r = rng(9);
  for (let rep = 0; rep < 2; rep++) {
    for (let x = 0; x <= 1000; x += 8) {
      const t = x / 1000;
      let y = 100 + Math.sin(t * Math.PI * 14) * 10 + Math.sin(t * Math.PI * 41) * 5 + (r() - 0.5) * 4;
      if (t > 0.28 && t < 0.34) y += Math.sin(((t - 0.28) / 0.06) * Math.PI * 6) * -70;
      if (t > 0.66 && t < 0.72) y += Math.sin(((t - 0.66) / 0.06) * Math.PI * 5) * 85;
      pts.push(`${(x + rep * 1000).toFixed(0)},${y.toFixed(1)}`);
    }
  }
  return pts.join(" ");
}
const LIAR_WAVE = liarWave();

function LiarScene() {
  return (
    <>
      <div className="gs-base" />
      <svg className="gs-fill" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={i * 200 + 6} y="0" width="188" height="780" fill={G1} fillOpacity=".05" stroke="#fff" strokeOpacity=".08" strokeWidth="2" />
        ))}
        <rect x="30" y="60" width="400" height="240" rx="6" fill="#000" fillOpacity=".35" stroke="#fff" strokeOpacity=".35" strokeWidth="5" />
        <rect x="42" y="72" width="376" height="216" fill={G1} fillOpacity=".1" />
        <polygon points="42,72 160,72 42,200" fill="#fff" fillOpacity=".12" />
        <ellipse cx="800" cy="860" rx="980" ry="170" fill="#000" fillOpacity=".5" />
        <ellipse cx="800" cy="800" rx="760" ry="120" fill={G1} fillOpacity=".22" className="gs-blur-lg" />
        <ellipse cx="800" cy="786" rx="640" ry="82" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="3" />
      </svg>
      <div className="gs-layer gs-a" style={{ background: bokeh(9, 31, ["rgb(255 255 255)", G1], 22, 38, 0.2) }} />
      <div className="gs-lampwrap gs-b">
        <div className="gs-cone" />
        <svg className="gs-lamp" viewBox="0 0 200 260">
          <rect x="97" y="0" width="6" height="110" fill="#000" fillOpacity=".7" />
          <path d="M30 210 Q100 70 170 210Z" fill="#14161c" stroke="#fff" strokeOpacity=".35" strokeWidth="2.5" />
          <ellipse cx="100" cy="210" rx="70" ry="13" fill="#fff6dc" />
          <ellipse cx="100" cy="216" rx="46" ry="8" fill="#fff" className="gs-blur-sm" />
        </svg>
      </div>
      <div className="gs-wave">
        <svg className="gs-fill gs-blur-sm" viewBox="0 0 1000 200" preserveAspectRatio="none" style={{ position: "absolute", opacity: 0.9 }} aria-hidden>
          <line x1="0" y1="100" x2="1000" y2="100" stroke="#ff3b57" strokeOpacity=".5" strokeWidth="2" />
        </svg>
        <div className="gs-wavemove gs-c">
          <svg viewBox="0 0 2000 200" preserveAspectRatio="none" width="100%" height="100%">
            <polyline points={LIAR_WAVE} fill="none" stroke="#ff3b57" strokeWidth="9" strokeLinejoin="round" className="gs-blur-sm" />
            <polyline points={LIAR_WAVE} fill="none" stroke="#ff8aa0" strokeWidth="3.4" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div className="gs-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ Rock Paper Gamble */

/** One scissor blade drawn pointing up from the pivot at the origin: a tapered blade, a shank and its own finger loop. */
function Blade({ rot }: { rot: number }) {
  return (
    <g transform={`translate(100 92) rotate(${rot})`}>
      <path d="M0 -68 L11 -16 L7 8 L-7 8 L-11 -16Z" />
      <path d="M0 8 V38" />
      <circle cx="0" cy="56" r="17" />
    </g>
  );
}

function Signs({ glow }: { glow?: boolean }) {
  const sw = glow ? 9 : 4.6;
  const common = { fill: "none", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const sign = (x: number, y: number, w: string, r: number, color: string, label: string, children: ReactNode) => (
    <Item x={x} y={y} w={w} r={r}>
      <svg viewBox="0 0 200 200" width="100%" height="100%">
        <rect x="6" y="6" width="188" height="188" rx="30" stroke={color} {...common} strokeWidth={sw * 0.75} />
        <g stroke={color} {...common} transform="translate(12 2) scale(.88)">
          {children}
        </g>
        <text x="100" y="180" textAnchor="middle" fontSize="22" fontWeight="900" letterSpacing="5" fill={glow ? "none" : color} stroke="none" style={{ fontFamily: "Anton, Impact, system-ui, sans-serif" }}>
          {label}
        </text>
      </svg>
    </Item>
  );
  const w = sz(17, 26);
  return (
    <>
      {sign(
        38,
        25,
        w,
        -5,
        "var(--g2)",
        "ROCK",
        <>
          {/* a faceted boulder resting on the ground */}
          <path d="M34 134 L28 96 L54 56 L100 42 L146 58 L170 98 L162 134 L100 148Z" />
          <path d="M54 56 L78 88 L100 42 M78 88 L72 130 M146 58 L120 90 L78 88 M120 90 L170 98 M120 90 L128 140" />
        </>,
      )}
      {sign(
        61,
        31,
        w,
        3,
        "var(--g1)",
        "PAPER",
        <>
          {/* a sheet with a folded corner and lines of text */}
          <path d="M56 28 H116 L148 60 V146 H56Z" />
          <path d="M116 28 V60 H148" />
          <path d="M72 84 H132 M72 104 H132 M72 124 H112" />
        </>,
      )}
      {sign(
        84,
        23,
        w,
        6,
        "var(--g3)",
        "SCISSORS",
        <>
          {/* two blades crossing at a pivot screw, each with its own finger loop, opened like an X */}
          <Blade rot={32} />
          <Blade rot={-32} />
          <circle cx="100" cy="84" r="5.5" />
        </>,
      )}
    </>
  );
}

function RpgScene() {
  const windows: ReactNode[] = [];
  const r = rng(4);
  const bld: Array<[number, number, number]> = [];
  let x = -20;
  while (x < 1620) {
    const w = 60 + r() * 90;
    const h = 120 + r() * 250;
    bld.push([x, w, h]);
    x += w + 4;
  }
  bld.forEach(([bx, bw, bh], i) => {
    windows.push(<rect key={`b${i}`} x={bx} y={900 - 150 - bh + 150} width={bw} height={bh} fill="#07070f" fillOpacity=".92" stroke={i % 2 ? G1 : G2} strokeOpacity=".75" strokeWidth="2.5" />);
    for (let wy = 900 - bh + 14; wy < 880; wy += 22)
      for (let wx = bx + 8; wx < bx + bw - 10; wx += 16) if (r() > 0.55) windows.push(<rect key={`w${i}-${wx}-${wy}`} x={wx} y={wy} width="7" height="9" fill={r() > 0.5 ? G3 : "#ffe9a8"} fillOpacity={0.35 + r() * 0.55} />);
  });
  return (
    <>
      <div className="gs-base" />
      <svg className="gs-fill" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="rroad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: G1, stopOpacity: 0.1 }} />
            <stop offset="1" style={{ stopColor: G1, stopOpacity: 0.55 }} />
          </linearGradient>
        </defs>
        <g className="gs-blur-sm" opacity=".55">
          {windows}
        </g>
        {windows}
        <polygon points="760,720 840,720 1700,900 -100,900" fill="url(#rroad)" />
        <polygon points="780,720 820,720 880,900 720,900" fill="#fff" fillOpacity=".25" />
        <line x1="-100" y1="900" x2="780" y2="720" stroke={G2} strokeWidth="5" strokeOpacity=".9" />
        <line x1="1700" y1="900" x2="820" y2="720" stroke={G3} strokeWidth="5" strokeOpacity=".9" />
      </svg>
      <div className="gs-layer gs-c" style={{ background: bokeh(18, 41, [G1, G2, G3, "#fff"], 2.5, 8, 0.55) }} />
      <div className="gs-signs">
        <Signs />
      </div>
      <div className="gs-signs gs-a gs-glow">
        <Signs glow />
      </div>
      <div className="gs-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ Blackjack */

function BlackjackScene() {
  return (
    <>
      <div className="gs-base" />
      <div className="gs-felt" />
      <svg className="gs-fill" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <path id="bjarc" d="M560 330 Q980 590 1400 330" />
        </defs>
        <ellipse cx="800" cy="40" rx="720" ry="560" fill="none" stroke="#f5d78a" strokeOpacity=".5" strokeWidth="3" strokeDasharray="4 12" />
        <ellipse cx="800" cy="40" rx="600" ry="450" fill="none" stroke="#f5d78a" strokeOpacity=".35" strokeWidth="2" />
        <text fontSize="34" fontWeight="800" letterSpacing="8" fill="#f5d78a" fillOpacity=".7" style={{ fontFamily: "Georgia, serif" }}>
          <textPath href="#bjarc" startOffset="50%" textAnchor="middle">
            BLACKJACK PAYS 3 TO 2
          </textPath>
        </text>
        {[260, 530, 800, 1070, 1340].map((cx, i) => (
          <ellipse key={cx} cx={cx} cy={560 + Math.abs(i - 2) * -30 + 20} rx="88" ry="70" fill="none" stroke="#f5d78a" strokeOpacity=".55" strokeWidth="3" />
        ))}
      </svg>
      <div className="gs-railwrap">
        <div className="gs-rail" />
        <div className="gs-railsweep gs-c" />
      </div>
      <div className="gs-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ Draw It */

function DrawScene() {
  const splats: Array<[number, number, number, 1 | 2 | 3]> = [
    [68, 84, 12, 2],
    [95, 36, 11, 3],
    [54, 12, 9, 1],
  ];
  return (
    <>
      <div className="gs-base" />
      <div className="gs-page">
        <svg className="gs-fill" viewBox="0 0 100 100" preserveAspectRatio="none">
          {Array.from({ length: 16 }, (_, i) => (
            <line key={i} x1="0" x2="100" y1={14 + i * 5.3} y2={14 + i * 5.3} stroke={G2} strokeOpacity=".5" strokeWidth=".12" />
          ))}
          <line x1="9" x2="9" y1="0" y2="100" stroke="#e5484d" strokeOpacity=".55" strokeWidth=".25" />
        </svg>
        <div className="gs-spiral" />
      </div>
      <div className="gs-layer gs-c gs-splats">
        {splats.map(([x, y, w, t], i) => (
          <Item key={i} x={x} y={y} w={sz(w, w * 2.4)} r={i * 70} blur={2}>
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              <path d="M50 8 C62 6 66 24 78 22 C94 20 92 42 86 50 C98 60 92 80 74 78 C66 94 52 86 48 92 C36 98 30 82 22 80 C6 78 10 60 14 52 C2 40 14 24 28 28 C30 14 40 10 50 8Z" fill={t === 1 ? G1 : t === 2 ? G2 : G3} fillOpacity=".75" />
              <circle cx="92" cy="14" r="5" fill={t === 1 ? G1 : t === 2 ? G2 : G3} fillOpacity=".75" />
              <circle cx="6" cy="92" r="3.4" fill={t === 1 ? G1 : t === 2 ? G2 : G3} fillOpacity=".75" />
            </svg>
          </Item>
        ))}
      </div>
      <div className="gs-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ Survey Feud */

function FeudScene() {
  const r = rng(12);
  const pieces = Array.from({ length: 34 }, (_, i) => {
    const w = 0.7 + r() * 0.9;
    return {
      left: (r() * 100).toFixed(1),
      top: (i / 34) * 50 + r() * 1.4,
      w,
      h: w * (1.4 + r()),
      c: [G1, G2, G3, "#fff", "#ffd54a"][Math.floor(r() * 5)],
      rot: Math.floor(r() * 180),
    };
  });
  // The second half repeats the first so the fall loops without a seam.
  const confetti = [0, 50].flatMap((off) =>
    pieces.map((p, i) => <i key={`${off}-${i}`} style={{ left: `${p.left}%`, top: `${(p.top + off).toFixed(2)}%`, width: `${p.w}vmax`, height: `${p.h.toFixed(2)}vmax`, background: p.c, transform: `rotate(${p.rot}deg)` }} />),
  );
  const rowsN = 6;
  return (
    <>
      <div className="gs-base" />
      <svg className="gs-fill" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="fbeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".5" />
            <stop offset="1" style={{ stopColor: G1, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <polygon points="700,-10 900,-10 1380,900 220,900" fill="url(#fbeam)" opacity=".55" />
        <g className="gs-blur-lg">
          <rect x="260" y="190" width="1080" height="560" rx="26" fill={G1} fillOpacity=".7" />
        </g>
        <rect x="260" y="190" width="1080" height="560" rx="26" fill="#05102e" fillOpacity=".4" stroke="#fff" strokeOpacity=".55" strokeWidth="6" />
        <rect x="278" y="208" width="1044" height="524" rx="16" fill="none" stroke={G1} strokeWidth="5" />
        {Array.from({ length: rowsN }, (_, i) => (
          <g key={i}>
            <rect x="330" y={230 + i * 84} width={940 - (i % 3) * 120} height="68" rx="10" fill="#fff" fillOpacity={0.05} stroke="#fff" strokeOpacity=".18" strokeWidth="3" />
          </g>
        ))}
        <ellipse cx="800" cy="860" rx="900" ry="120" fill={G1} fillOpacity=".4" />
      </svg>
      <div className="gs-layer gs-c gs-boardglow" />
      <div className="gs-confetti gs-b">
        {confetti}
      </div>
      <div className="gs-bulbs-dim" />
      <div className="gs-bulbs gs-a" />
      <div className="gs-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ Generic */

function GenericScene() {
  return (
    <>
      <div className="gs-base" />
      <div className="gs-layer gs-a" style={{ background: bokeh(14, 3, [G1, G2, G3], 10, 26, 0.5) }} />
      <div className="gs-ring gs-b">
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          {[44, 36, 28, 20].map((r, i) => (
            <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={i % 2 ? G2 : G1} strokeWidth=".28" strokeDasharray={i % 2 ? "2 3" : "7 3"} />
          ))}
          <polygon points="50,8 86,29 86,71 50,92 14,71 14,29" fill="none" stroke={G1} strokeWidth=".35" />
          <polygon points="50,20 76,35 76,65 50,80 24,65 24,35" fill={G1} fillOpacity=".07" stroke={G3} strokeWidth=".3" />
        </svg>
      </div>
      <div className="gs-vig" />
    </>
  );
}

const SCENES: Record<SceneId, () => ReactNode> = {
  jeopardy: JeopardyScene,
  headbands: HeadbandsScene,
  liar: LiarScene,
  rpg: RpgScene,
  blackjack: BlackjackScene,
  drawit: DrawScene,
  feud: FeudScene,
  generic: GenericScene,
};

export function GameScene({ game }: { game: string }) {
  const id: SceneId = (KNOWN as string[]).includes(game) ? (game as SceneId) : "generic";
  const Scene = SCENES[id];
  return (
    <div className={`gscene gs-${id}`} data-scene={id} aria-hidden="true">
      <Scene />
    </div>
  );
}
