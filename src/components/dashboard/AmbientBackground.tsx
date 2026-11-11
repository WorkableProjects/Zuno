import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BackgroundPreset } from "../../game-files/schema/common";
import { hexToHsl, hslToHex } from "../../lib/color";
import "./backdrop.css";

export interface BackdropSpec {
  /** Changes whenever the picture should change. */
  key: string;
  cover: string | null;
  accent: string;
  preset: BackgroundPreset;
  /** Optional engine artwork drawn into the generated scene. */
  artwork: "board" | "cards" | null;
}

const BOARD_VALUES = [100, 200, 300, 400, 500];
/** Cells the host "picks" in turn, as [row, column]. One lights up every few seconds. */
const BOARD_PICKS: Array<[number, number]> = [
  [2, 2],
  [3, 0],
  [1, 3],
  [4, 4],
  [0, 2],
];

/** A tilted game board, drawn in code. Decorative: it holds no real clues. */
function BoardArt() {
  return (
    <div className="art-board" aria-hidden="true">
      <div className="art-board-grid">
        {Array.from({ length: 5 }, (_, c) => (
          <div key={`h${c}`} className="art-cell art-head">
            <span style={{ width: `${[58, 44, 66, 50, 60][c]}%` }} />
          </div>
        ))}
        {BOARD_VALUES.map((v, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const pick = BOARD_PICKS.findIndex(([pr, pc]) => pr === r && pc === c);
            const used = (r === 0 && c < 2) || (r === 1 && c === 0);
            return (
              <div
                key={`${r}-${c}`}
                className={`art-cell${pick >= 0 ? " is-pick" : ""}${pick === 0 ? " is-first" : ""}${used ? " is-used" : ""}`}
                style={pick >= 0 ? ({ "--pick": pick } as CSSProperties) : undefined}
              >
                {v}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

/** Identities the face-down card turns over to show. Generic, never from a loaded deck. */
const CARD_WORDS = ["Penguin", "Lighthouse", "Pizza", "Astronaut", "Volcano", "Violin"];

/** A fan of headband cards, drawn in code. The middle card turns over now and then. */
function CardsArt() {
  const [word, setWord] = useState(0);
  return (
    <div className="art-cards" aria-hidden="true">
      <div className="art-card art-card-back is-left">
        <span className="art-band" />
        <span className="art-line" />
        <span className="art-line is-short" />
      </div>
      <div className="art-card art-card-back is-right">
        <span className="art-band" />
        <span className="art-line" />
        <span className="art-line is-short" />
      </div>
      <div className="art-card-flip" onAnimationIteration={() => setWord((w) => (w + 1) % CARD_WORDS.length)}>
        <div className="art-card art-face is-mystery">
          <span className="art-band" />
          <span className="art-mark">?</span>
        </div>
        <div className="art-card art-face is-reveal">
          <span className="art-band" />
          <span className="art-word">{CARD_WORDS[word]}</span>
        </div>
      </div>
    </div>
  );
}

/** Abstract scene generated from a game's accent color and preset. */
function Scene({ accent, preset, artwork }: Pick<BackdropSpec, "accent" | "preset" | "artwork">) {
  const style = useMemo(() => {
    const { h, s, l } = hexToHsl(accent);
    const sat = Math.max(s, 55);
    const light = Math.min(Math.max(l, 52), 70);
    return {
      "--c1": hslToHex(h, sat, light),
      "--c2": hslToHex((h + 38) % 360, sat, light),
      "--c3": hslToHex((h + 314) % 360, sat, Math.max(light - 6, 40)),
    } as CSSProperties;
  }, [accent]);

  return (
    <div className={`scene scene-${preset}`} style={style}>
      <span className="light light-a" />
      <span className="light light-b" />
      <span className="light light-c" />
      {preset === "horizon" && <span className="sun" />}
      {artwork === "board" && <BoardArt />}
      {artwork === "cards" && <CardsArt />}
    </div>
  );
}

function Layer({ spec }: { spec: BackdropSpec }) {
  const [coverState, setCoverState] = useState<"loading" | "ready" | "failed">("loading");
  return (
    <div className="bg-layer">
      {/* The generated scene always sits underneath, so a slow or broken
          cover image never leaves an empty or broken frame. */}
      <Scene accent={spec.accent} preset={spec.preset} artwork={spec.cover && coverState === "ready" ? null : spec.artwork} />
      {spec.cover && coverState !== "failed" && (
        <img
          className={`bg-cover${coverState === "ready" ? " is-ready" : ""}`}
          src={spec.cover}
          alt=""
          decoding="async"
          onLoad={() => setCoverState("ready")}
          onError={() => setCoverState("failed")}
        />
      )}
    </div>
  );
}

const FADE_MS = 760;
const SETTLE_MS = 90;

/**
 * Full-screen artwork behind the whole app. Crossfades between games, keeps
 * at most two layers alive, and always lets the latest focused game win.
 */
export function AmbientBackground({ spec, dim }: { spec: BackdropSpec; dim: boolean }) {
  const [layers, setLayers] = useState<BackdropSpec[]>([spec]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Wait a beat so racing across the rail does not start a fade per tile.
    const settle = window.setTimeout(() => {
      setLayers((prev) => {
        const top = prev[prev.length - 1];
        return top.key === spec.key ? prev : [top, spec];
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [spec]);

  useEffect(() => {
    if (layers.length < 2) return;
    const done = window.setTimeout(() => setLayers((prev) => prev.slice(-1)), FADE_MS + 40);
    return () => window.clearTimeout(done);
  }, [layers]);

  // Very small pointer parallax. Purely decorative, so keyboard users miss nothing.
  useEffect(() => {
    const el = root.current;
    if (!el || dim || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--px", `${((e.clientX / window.innerWidth - 0.5) * -10).toFixed(1)}px`);
        el.style.setProperty("--py", `${((e.clientY / window.innerHeight - 0.5) * -6).toFixed(1)}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [dim]);

  return (
    <div ref={root} className={`backdrop${dim ? " is-dim" : ""}`} aria-hidden="true">
      <div className="bg-parallax">
        {layers.map((l) => (
          <Layer key={l.key} spec={l} />
        ))}
      </div>
      <div className="backdrop-grain" />
      <div className="backdrop-scrim" />
      <div className="backdrop-dim" />
    </div>
  );
}
