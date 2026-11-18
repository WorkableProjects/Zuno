import type { ReactNode } from "react";
import { CircleAlert, Pause, Timer, WifiOff } from "lucide-react";

/** Loading, error, empty and offline states with one look across games. */
export function StatusView({ kind, title, text, action }: { kind: "loading" | "error" | "empty" | "offline"; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className={`status-view is-${kind}`} role={kind === "error" ? "alert" : "status"} aria-live="polite">
      {kind === "loading" && <span className="status-spinner" aria-hidden />}
      {kind === "error" && <CircleAlert size={28} strokeWidth={1.5} aria-hidden />}
      {kind === "offline" && <WifiOff size={28} strokeWidth={1.5} aria-hidden />}
      <h2 className="page-title">{title}</h2>
      {text && <p className="page-lede">{text}</p>}
      {action}
    </div>
  );
}

/** Inline notice: info, success, warning or error. */
export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warning" | "error"; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <CircleAlert size={18} strokeWidth={1.5} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** Countdown pill. Announces only at low time so screen readers are not flooded. */
export function TimerBadge({ seconds, paused, low = 5 }: { seconds: number; paused?: boolean; low?: number }) {
  const isLow = !paused && seconds <= low;
  return (
    <span className={`timer-badge${isLow ? " is-low" : ""}${paused ? " is-paused" : ""}`} role="timer" aria-live={isLow ? "assertive" : "off"} aria-label={paused ? `Paused, ${seconds} seconds left` : `${seconds} seconds left`}>
      {paused ? <Pause size={14} strokeWidth={2} aria-hidden /> : <Timer size={14} strokeWidth={2} aria-hidden />}
      {seconds}s
    </span>
  );
}

/** A player's name with a ready/online/away dot. */
export function PlayerChip({ name, state, extra }: { name: string; state?: "ready" | "online" | "away" | "waiting"; extra?: ReactNode }) {
  return (
    <span className={`player-chip${state ? ` is-${state}` : ""}`}>
      <span className="dot" aria-hidden />
      {name}
      {state && <span className="sr-only">, {state}</span>}
      {extra}
    </span>
  );
}
