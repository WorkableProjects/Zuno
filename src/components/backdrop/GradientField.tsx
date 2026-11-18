import { useMemo, type CSSProperties } from "react";
import type { BackgroundPreset } from "../../game-files/schema/common";
import { hexToHsl, hslToHex } from "../../lib/color";
import "./gradient3d.css";

/** The three scene colors derived from a game's accent. */
export function scenePalette(accent: string): CSSProperties {
  const { h, s, l } = hexToHsl(accent);
  const sat = Math.max(s, 55);
  const light = Math.min(Math.max(l, 52), 70);
  return {
    "--c1": hslToHex(h, sat, light),
    "--c2": hslToHex((h + 38) % 360, sat, light),
    "--c3": hslToHex((h + 314) % 360, sat, Math.max(light - 6, 40)),
  } as CSSProperties;
}

/**
 * Gradient 3D system: the accent-colored lights of a preset, placed in a
 * perspective space across the right side of the screen. The space turns and
 * each light orbits at its own depth.
 */
export function GradientField({ accent, preset }: { accent: string; preset: BackgroundPreset }) {
  const style = useMemo(() => scenePalette(accent), [accent]);
  return (
    <div className="g3d">
      <div className="g3d-space">
        <div className={`scene scene-${preset}`} style={style}>
          <span className="g3d-sheen" />
          <span className="light light-a" />
          <span className="light light-b" />
          <span className="light light-c" />
          {preset === "horizon" && <span className="sun" />}
        </div>
      </div>
    </div>
  );
}
