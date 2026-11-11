import { useId } from "react";

/**
 * The Zuno mark: a setting sun whose light slits form a Z.
 * Master artwork lives in /public as SVG; this component draws the same shapes.
 */

const Z_POINTS = "12,13 36,13 36,18.5 21.5,29.5 36,29.5 36,35 12,35 12,29.5 26.5,18.5 12,18.5";

export function ZunoMark({ size = 28, flat = false, title }: { size?: number; flat?: boolean; title?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB36B" />
          <stop offset="0.55" stopColor="#F06A9A" />
          <stop offset="1" stopColor="#8266E8" />
        </linearGradient>
        <mask id={`${id}m`}>
          <circle cx="24" cy="24" r="22" fill="#fff" />
          <polygon points={Z_POINTS} fill="#000" />
          <rect x="0" y="38.5" width="48" height="2.5" fill="#000" />
        </mask>
      </defs>
      <rect width="48" height="48" fill={flat ? "currentColor" : `url(#${id}g)`} mask={`url(#${id}m)`} />
    </svg>
  );
}

export function ZunoWordmark({ height = 20 }: { height?: number }) {
  return (
    <svg height={height} viewBox="0 4 79 24" fill="none" aria-hidden="true" style={{ width: "auto" }}>
      <path d="M0 6H17V10.6L6.9 21H17V26H0V21.4L10.1 11H0Z" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="4.6">
        <path d="M24.75 11V18.45a5.25 5.25 0 0 0 10.5 0V11M35.25 11V26" />
        <path d="M45.75 26V11M45.75 26V18.55a5.25 5.25 0 0 1 10.5 0V26" />
        <circle cx="71.5" cy="18.5" r="5.2" />
      </g>
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
