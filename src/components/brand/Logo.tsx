/**
 * The Zuno mark (v2): a circle split by a Z-shaped cut into two interlocking halves.
 * Master artwork lives in /public/ZunoLogosv2; these components draw the same paths.
 * Colours follow the theme through --mark-a / --mark-b (see tokens.css).
 */

const HALF_A = "M5.561 12H36v6L21.5 30h23.666A22 22 0 0 0 5.561 12z";
const HALF_B = "M42.439 36H12v-6l14.5-12H2.834A22 22 0 0 0 42.439 36z";

export function ZunoMark({ size = 28, flat = false, title }: { size?: number; flat?: boolean; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d={HALF_A} fill={flat ? "currentColor" : "var(--mark-a, #FF8A66)"} />
      <path d={HALF_B} fill={flat ? "currentColor" : "var(--mark-b, #A893FF)"} />
    </svg>
  );
}

/** Lowercase "zuno" in the v2 geometric letterforms. */
export function ZunoWordmark({ height = 20 }: { height?: number }) {
  return (
    <svg height={height} viewBox="62 12 105 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" style={{ width: "auto" }}>
      <path transform="translate(62 0)" d="M0 12h20v6L8.36 30H20v6H0v-6l11.64-12H0z" />
      <path transform="translate(87 0)" d="M24 12v12a12 12 0 0 1-24 0V12h6v12a6 6 0 0 0 12 0V12z" />
      <path transform="translate(115 0)" d="M0 36V24a12 12 0 0 1 24 0v12h-6V24a6 6 0 0 0-12 0v12z" />
      <path transform="translate(143 0)" d="M12 12a12 12 0 1 1 0 24a12 12 0 1 1 0-24zm0 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12z" />
    </svg>
  );
}

/** Full lockup when there is room, the mark alone when narrow (handled in CSS). */
export function ZunoLogo() {
  return (
    <span className="logo" role="img" aria-label="Zuno">
      <ZunoMark size={28} />
      <span className="logo-word">
        <ZunoWordmark height={18} />
      </span>
    </span>
  );
}
