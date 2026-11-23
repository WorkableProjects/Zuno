import { useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundPreset } from "../../game-files/schema/common";
import { GradientField, scenePalette } from "../backdrop/GradientField";
import { Parts3D } from "../backdrop/Parts3D";
import "./backdrop.css";

export interface BackdropSpec {
  /** Changes whenever the picture should change. */
  key: string;
  cover: string | null;
  accent: string;
  preset: BackgroundPreset;
  /** Optional engine artwork drawn into the generated scene. */
  artwork: "board" | "cards" | "statements" | "hands" | "deck" | "sketch" | "survey" | null;
}

/** Generated scene: the 3D gradient field, with engine parts layered on top. */
function Scene({ accent, preset, artwork }: Pick<BackdropSpec, "accent" | "preset" | "artwork">) {
  const palette = useMemo(() => scenePalette(accent), [accent]);
  return (
    <>
      <GradientField accent={accent} preset={preset} />
      {artwork && <Parts3D kind={artwork} palette={palette} />}
    </>
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
  const [lingered, setLingered] = useState(false);

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

  // The scene grows richer the longer it stays on screen. Time only, never the pointer.
  useEffect(() => {
    setLingered(false);
    const t = window.setTimeout(() => setLingered(true), 12000);
    return () => window.clearTimeout(t);
  }, [spec.key]);

  useEffect(() => {
    if (layers.length < 2) return;
    const done = window.setTimeout(() => setLayers((prev) => prev.slice(-1)), FADE_MS + 40);
    return () => window.clearTimeout(done);
  }, [layers]);

  return (
    <div ref={root} className={`backdrop${dim ? " is-dim" : ""}${lingered ? " is-lingering" : ""}`} aria-hidden="true">
      <div className="bg-parallax">
        {layers.map((l) => (
          <Layer key={l.key} spec={l} />
        ))}
      </div>
      <div className="backdrop-drift" />
      <div className="backdrop-grain" />
      <div className="backdrop-scrim" />
      <div className="backdrop-dim" />
    </div>
  );
}
