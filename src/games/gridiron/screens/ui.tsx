import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Dialog } from "../../../components/ui/Dialog";
import { ovr } from "../gmPlayers";
import type { Career, LogoSpec, Player, Team } from "../gmTypes";
import "./manage.css";

export interface GmCtx {
  c: Career;
  /** Call after mutating the career. */
  update: (message?: string) => void;
  openPlayer: (id: number) => void;
  go: (screen: string) => void;
}
export const Ctx = createContext<GmCtx | null>(null);
export const useGm = () => useContext(Ctx)!;

/**
 * Screens with work in progress (a trade being built, a play being edited) report it here so the shell can
 * ask before the user navigates away. The shell provides the setter; outside it the setter does nothing.
 */
export const DirtyCtx = createContext<(dirty: boolean) => void>(() => undefined);
export function useDirtyGuard(dirty: boolean) {
  const set = useContext(DirtyCtx);
  useEffect(() => {
    set(dirty);
    return () => set(false);
  }, [dirty, set]);
}

/** Wide tables scroll sideways inside this region instead of stretching the page. Keyboard reachable. */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gr-xscroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export const money = (m: number) => `${m < 0 ? "-" : ""}$${Math.abs(m).toFixed(1)}M`;

const SHAPES: Record<LogoSpec["shape"], string> = {
  shield: "M12 2 L21 5 V12 C21 17 17 21 12 22 C7 21 3 17 3 12 V5 Z",
  circle: "M12 2 A10 10 0 1 1 11.99 2 Z",
  diamond: "M12 1.5 L22.5 12 L12 22.5 L1.5 12 Z",
  hex: "M12 2 L21 7 V17 L12 22 L3 17 V7 Z",
  star: "M12 1.8 L14.9 8.6 L22.2 9.2 L16.6 14 L18.3 21.2 L12 17.4 L5.7 21.2 L7.4 14 L1.8 9.2 L9.1 8.6 Z",
  bolt: "M4 3 H20 L16 12 L20 21 H4 L8 12 Z",
};

export function TeamLogo({ team, size = 24 }: { team: Team; size?: number }) {
  return (
    <svg className="gr-logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={SHAPES[team.logo.shape]} fill={team.colors[0]} stroke={team.colors[1]} strokeWidth="1.4" />
      <text x="12" y="12.8" textAnchor="middle" dominantBaseline="middle" fontSize={team.logo.glyph.length > 1 ? 7.5 : 10} fontWeight="700" fill={team.colors[1]}>
        {team.logo.glyph}
      </text>
    </svg>
  );
}

export function TeamTag({ team, full }: { team: Team; full?: boolean }) {
  return (
    <span className="gr-teamtag">
      <TeamLogo team={team} size={20} />
      {full ? `${team.city} ${team.name}` : team.abbr}
    </span>
  );
}

export function Ovr({ p, value }: { p?: Player; value?: number }) {
  const v = value ?? (p ? ovr(p) : 0);
  return <span className={`gr-ovr${v >= 85 ? " is-elite" : v >= 75 ? " is-good" : v < 60 ? " is-low" : ""}`}>{v}</span>;
}

export function PlayerLink({ p }: { p: Player }) {
  const { openPlayer } = useGm();
  return (
    <button type="button" className="gr-link" onClick={() => openPlayer(p.id)}>
      {p.first} {p.last}
    </button>
  );
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`gr-panel${className ? ` ${className}` : ""}`}>
      {(title || actions) && (
        <header className="gr-panel-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="gr-panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="gr-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} className={v === value ? "is-on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function injuryTag(p: Player): string {
  if (!p.injury) return "";
  if (p.injury.ir) return "IR";
  return p.injury.weeks >= 3 ? "Out" : p.injury.weeks === 2 ? "Doubtful" : "Questionable";
}

/** Zuno's dialog with a heading and a close button. */
export function GDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog title={title} onClose={onClose} wide>
      {(close) => (
        <div className="gr-dialog">
          <header className="gr-dialog-head">
            <h2>{title}</h2>
            <button type="button" className="btn btn-quiet btn-sm" onClick={close}>Close</button>
          </header>
          {children}
        </div>
      )}
    </Dialog>
  );
}
