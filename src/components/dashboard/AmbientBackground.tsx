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
  artwork: "board" | null;
}

const BOARD_VALUES = [100, 200, 300, 400, 500];

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
          Array.from({ length: 5 }, (_, c) => (
            <div key={`${r}-${c}`} className={`art-cell${r === 2 && c === 2 ? " is-lit" : ""}${(r === 0 && c < 2) || (r === 1 && c === 0) ? " is-used" : ""}`}>
              {v}
            </div>
          )),
        )}
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
