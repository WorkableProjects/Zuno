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

function Chip({ tone = 1 }: { tone?: 1 | 2 | 3 }) {
  const t = tone === 1 ? G1 : tone === 2 ? G2 : G3;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <circle cx="50" cy="50" r="48" fill={`color-mix(in oklab, ${t} 82%, #000)`} />
      <circle cx="50" cy="50" r="42" fill="none" stroke="rgb(255 255 255 / .92)" strokeWidth="11" strokeDasharray="13 12.2" />
      <circle cx="50" cy="50" r="36" fill={t} stroke="rgb(255 255 255 / .55)" strokeWidth="2" />
      <circle cx="50" cy="50" r="24" fill="none" stroke="rgb(255 255 255 / .8)" strokeWidth="2.5" />
      <path d="M50 30l4.6 12.4 13.2.4-10.4 8.2 3.6 12.8L50 56l-11 7.8 3.6-12.8-10.4-8.2 13.2-.4z" fill="rgb(255 255 255 / .9)" transform="translate(0 -2) scale(1)" />
    </svg>
  );
}

function PlayCard({ suit, rank }: { suit: "S" | "H" | "D" | "C"; rank: string }) {
  const red = suit === "H" || suit === "D";
  const col = red ? "#d6284a" : "#14181f";
  const glyph = { S: "♠", H: "♥", D: "♦", C: "♣" }[suit];
  return (
    <svg viewBox="0 0 100 140" width="100%" height="100%">
      <rect x="2" y="2" width="96" height="136" rx="9" fill="#fbf7ee" stroke="rgb(0 0 0 / .25)" strokeWidth="1.5" />
      <rect x="2" y="2" width="96" height="136" rx="9" fill="none" stroke="rgb(215 170 70 / .65)" strokeWidth="1.2" transform="translate(0 0)" />
      <text x="14" y="26" fontSize="22" fontWeight="800" fill={col} style={{ fontFamily: "Georgia, serif" }}>
        {rank}
      </text>
      <text x="14" y="46" fontSize="20" fill={col} style={{ fontFamily: "system-ui, sans-serif" }}>
        {glyph}
      </text>
      <text x="50" y="94" textAnchor="middle" fontSize="62" fill={col} style={{ fontFamily: "system-ui, sans-serif" }}>
        {glyph}
      </text>
      <text x="86" y="124" textAnchor="end" fontSize="22" fontWeight="800" fill={col} transform="rotate(180 86 114)" style={{ fontFamily: "Georgia, serif" }}>
        {rank}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ Jeopardy */

function JeopardyScene() {
  const cols = 6;
  const rows = 5;
  const cells: ReactNode[] = [];
  for (let c = 0; c < cols; c++)
    for (let rr = 0; rr < rows + 1; rr++) {
      const x = 330 + c * 156;
      const y = 250 + rr * 74 + (rr > 0 ? 8 : 0);
      cells.push(
        <rect key={`${c}-${rr}`} x={x} y={y} width="146" height={rr === 0 ? 70 : 66} rx="5" fill={rr === 0 ? G1 : "none"} fillOpacity={rr === 0 ? 0.55 : 0} stroke={G1} strokeOpacity={rr === 0 ? 0.95 : 0.6} strokeWidth="2.5" />,
      );
    }
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
        {/* board glow + silhouette */}
        <g className="gs-blur-lg">
          <rect x="310" y="230" width="980" height="480" rx="14" fill={G1} fillOpacity=".7" />
        </g>
        <rect x="310" y="230" width="980" height="480" rx="14" fill={G1} fillOpacity=".12" stroke={G1} strokeWidth="5" />
        {cells}
        <text x="800" y="217" textAnchor="middle" fontSize="40" fontWeight="900" letterSpacing="14" fill={G1} fillOpacity=".85" style={{ fontFamily: "Anton, Impact, sans-serif" }}>
          {"★  JEOPARDY  ★"}
        </text>
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
      <div className="gs-ring gs-b">{ring(9, 21, 14, 44, 15, 6, 2.2)}</div>
      <div className="gs-ring gs-c">{ring(5, 77, 22, 46, 30, 10, 3.4, 2.5)}</div>
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

function Signs({ glow }: { glow?: boolean }) {
  const sw = glow ? 9 : 4.6;
  const common = { fill: "none", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const frame = (color: string) => <rect x="6" y="6" width="188" height="188" rx="30" stroke={color} {...common} strokeWidth={sw * 0.75} />;
  const sign = (x: number, y: number, w: string, r: number, color: string, children: ReactNode) => (
    <Item x={x} y={y} w={w} r={r}>
      <svg viewBox="0 0 200 200" width="100%" height="100%">
        {frame(color)}
        <g stroke={color} {...common}>
          {children}
        </g>
      </svg>
    </Item>
  );
  return (
    <>
      {sign(
        15,
        27,
        sz(30, 44),
        -7,
        "var(--g2)",
        <>
          <path d="M45 140 L38 98 L66 62 L112 50 L152 76 L162 120 L132 152 L84 156Z" />
          <path d="M66 62 L84 100 L112 50 M84 100 L132 152 M152 76 L112 104 L162 120" />
        </>,
      )}
      {sign(
        50,
        14,
        sz(30, 44),
        2,
        "var(--g1)",
        <>
          <path d="M56 40 H116 L146 70 V160 H56Z" />
          <path d="M116 40 V70 H146 M72 94 H130 M72 114 H130 M72 134 H112" />
        </>,
      )}
      {sign(
        85,
        29,
        sz(30, 44),
        8,
        "var(--g3)",
        <>
          <circle cx="62" cy="144" r="18" />
          <circle cx="104" cy="152" r="18" />
          <path d="M72 128 L142 52 M96 136 L150 100 M142 52 L150 100" />
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
      <div className="gs-ring gs-b">
        {(
          [
            [18, 30, 17, 1],
            [74, 24, 21, 2],
            [86, 62, 13, 3],
            [30, 74, 24, 3],
            [58, 52, 15, 1],
            [44, 16, 12, 2],
          ] as const
        ).map(([cx, cy, w, tone], i) => (
          <Item key={i} x={cx} y={cy} w={sz(w, w * 2.2)} r={i * 41} blur={i === 1 || i === 3 ? 2 : undefined}>
            <Chip tone={tone as 1 | 2 | 3} />
          </Item>
        ))}
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
          <path id="bjarc" d="M200 330 Q800 600 1400 330" />
        </defs>
        <ellipse cx="800" cy="40" rx="720" ry="560" fill="none" stroke="#f5d78a" strokeOpacity=".5" strokeWidth="3" strokeDasharray="4 12" />
        <ellipse cx="800" cy="40" rx="600" ry="450" fill="none" stroke="#f5d78a" strokeOpacity=".35" strokeWidth="2" />
        <text fontSize="40" fontWeight="800" letterSpacing="9" fill="#f5d78a" fillOpacity=".7" style={{ fontFamily: "Georgia, serif" }}>
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
      <div className="gs-ring gs-a gs-far">
        {(
          [
            [14, 24, 20, -18, "H", "K"],
            [84, 20, 22, 22, "S", "A"],
            [66, 70, 18, 12, "D", "Q"],
            [24, 76, 19, -28, "C", "J"],
          ] as const
        ).map(([cx, cy, w, rot, s, rk], i) => (
          <Item key={i} x={cx} y={cy} w={sz(w, w * 2.1)} ratio={100 / 140} r={rot} blur={3} op={0.9}>
            <PlayCard suit={s} rank={rk} />
          </Item>
        ))}
      </div>
      <div className="gs-ring gs-b gs-near">
        {(
          [
            [50, 18, 17, 6, "S", "10"],
            [6, 52, 26, -22, "D", "A"],
            [93, 46, 24, 28, "H", "9"],
          ] as const
        ).map(([cx, cy, w, rot, s, rk], i) => (
          <Item key={i} x={cx} y={cy} w={sz(w, w * 2.3)} ratio={100 / 140} r={rot}>
            <PlayCard suit={s} rank={rk} />
          </Item>
        ))}
        {(
          [
            [32, 56, 17, 1],
            [76, 34, 20, 2],
            [60, 86, 24, 3],
            [14, 88, 15, 2],
            [92, 84, 20, 1],
          ] as const
        ).map(([cx, cy, w, tone], i) => (
          <Item key={`c${i}`} x={cx} y={cy} w={sz(w, w * 2.2)} r={i * 53}>
            <Chip tone={tone as 1 | 2 | 3} />
          </Item>
        ))}
      </div>
      <div className="gs-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ Draw It */

const DOODLES: Array<{ d: string; x: number; y: number; s: number; r: number; delay: number; c: 1 | 2 | 3 }> = [
  { d: "M50 6 L61 38 L95 38 L68 58 L78 92 L50 72 L22 92 L32 58 L5 38 L39 38Z", x: 15, y: 22, s: 20, r: -10, delay: 0, c: 1 },
  { d: "M8 90 Q8 50 50 50 Q92 50 92 90 M50 50 V20 M28 20 H72 L50 6Z", x: 80, y: 18, s: 15, r: 8, delay: 1.6, c: 2 },
  { d: "M50 50 m0 0 q18 -18 30 0 q12 24 -22 34 q-40 8 -46 -28 q-4 -46 42 -50 q56 -4 62 52", x: 84, y: 66, s: 22, r: 0, delay: 3.2, c: 3 },
  { d: "M10 80 L10 40 L50 8 L90 40 L90 80Z M38 80 V54 H62 V80 M70 40 V22 H80 V40", x: 20, y: 72, s: 22, r: 5, delay: 4.8, c: 2 },
  { d: "M20 60 Q50 -10 80 60 Q50 100 20 60Z M50 20 V80 M10 90 Q50 110 90 90", x: 50, y: 88, s: 14, r: -6, delay: 6.4, c: 1 },
  { d: "M10 70 Q20 10 40 40 Q50 0 60 40 Q80 10 90 70 Q50 100 10 70Z M36 62 h.1 M64 62 h.1 M44 74 Q50 80 56 74", x: 62, y: 38, s: 17, r: 12, delay: 8, c: 3 },
];

function DrawScene() {
  const splats: Array<[number, number, number, 1 | 2 | 3]> = [
    [10, 52, 22, 2],
    [90, 40, 20, 3],
    [58, 14, 15, 1],
    [42, 80, 18, 1],
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
      <div className="gs-layer gs-a gs-doodles">
        {DOODLES.map((d, i) => (
          <Item key={i} x={d.x} y={d.y} w={sz(d.s, d.s * 2.5)} r={d.r}>
            <svg viewBox="0 0 100 100" width="100%" height="100%" overflow="visible">
              <path
                d={d.d}
                pathLength={1}
                className="gs-ink"
                style={{ stroke: d.c === 1 ? G1 : d.c === 2 ? G2 : G3, animationDelay: `${d.delay}s` }}
              />
            </svg>
          </Item>
        ))}
      </div>
      <div className="gs-layer gs-b gs-tools">
        {(
          [
            [86, 86, 46, 38, 1],
            [8, 14, 40, -52, 2],
            [96, 8, 34, 64, 3],
          ] as const
        ).map(([x, y, w, r, t], i) => (
          <Item key={i} x={x} y={y} w={sz(w, w * 3.6)} ratio={8} r={r}>
            <svg viewBox="0 0 400 50" width="100%" height="100%">
              <rect x="0" y="6" width="34" height="38" rx="6" fill="#f0a3a3" />
              <rect x="30" y="6" width="26" height="38" fill="#c9ccd4" />
              <rect x="56" y="6" width="234" height="38" fill={t === 1 ? G1 : t === 2 ? G2 : G3} />
              <rect x="56" y="12" width="234" height="5" fill="#fff" fillOpacity=".3" />
              <polygon points="290,6 362,22 362,28 290,44" fill="#f2d6a8" />
              <polygon points="344,17 362,22 362,28 344,33" fill="#2b2f3a" />
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
            <rect x="310" y={230 + i * 84} width="86" height="68" rx="10" fill={G1} fillOpacity=".6" />
            <text x="353" y={278 + i * 84} textAnchor="middle" fontSize="44" fontWeight="900" fill="#fff" fillOpacity=".6" style={{ fontFamily: "system-ui, sans-serif" }}>
              {i + 1}
            </text>
            <rect x="412" y={230 + i * 84} width={820 - (i % 3) * 120} height="68" rx="10" fill="#fff" fillOpacity={0.07} stroke="#fff" strokeOpacity=".25" strokeWidth="3" />
            <rect x="1250" y={230 + i * 84} width="50" height="68" rx="10" fill="#ffd54a" fillOpacity={0.5 - i * 0.05} />
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
