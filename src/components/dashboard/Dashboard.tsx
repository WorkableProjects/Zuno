import { useEffect, useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, CornerDownLeft, FolderOpen, LogIn, PencilRuler, Play, Settings, Sticker, Trash2 } from "lucide-react";
import { ZunoLogo } from "../brand/Logo";
import { getEngine } from "../../games/registry";
import { GameTile } from "./GameTile";
import type { RailItem } from "./railItems";
import "./dashboard.css";

interface Props {
  items: RailItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onLoad: (gameType: string) => void;
  /** Opens the builder, with a game type picked when the user came from an engine. */
  onBuild: (gameType?: string) => void;
  onOpenRecent: (item: RailItem) => void;
  /** Join an online Headbands lobby. Absent when lobbies are not set up. */
  onJoin?: () => void;
  onForgetRecent: (item: RailItem) => void;
  onSettings: () => void;
}

export function Dashboard(props: Props) {
  const { items, selectedId, onSelect } = props;
  const selected = items.find((i) => i.id === selectedId) ?? items[0];
  const rail = useRef<HTMLDivElement>(null);

  // A console always has a cursor: focus the selected tile when the dashboard opens.
  useEffect(() => {
    rail.current?.querySelector<HTMLElement>(".tile.is-active")?.focus({ preventScroll: true });
  }, []);

  const activate = (item: RailItem) => {
    if (item.kind === "engine") props.onLoad(item.gameType);
    else if (item.kind === "build") props.onBuild();
    else if (item.kind === "file") props.onOpenRecent(item);
    // "soon" tiles have no action yet.
  };

  const hasFiles = items.some((i) => i.kind === "file");

  return (
    <main className="dash game-scope" style={{ "--game": selected.backdrop.accent } as React.CSSProperties}>
      <header className="dash-header" data-nav-row="0">
        <ZunoLogo />
        <nav className="dash-nav" aria-label="Sections">
          <span className="dash-nav-item" aria-current="page">
            Games
          </span>
        </nav>
        <span className="dash-spacer" />
        <button type="button" className="icon-btn" aria-label="Settings" onClick={props.onSettings}>
          <Settings size={20} strokeWidth={1.5} />
        </button>
      </header>

      <div className={`rail${hasFiles ? " has-files" : ""}`} ref={rail} data-nav-row="1" role="group" aria-label="Games">
        {items
          .filter((item) => item.kind !== "file")
          .map((item) => {
            const files = item.kind === "engine" ? items.filter((f) => f.kind === "file" && f.gameType === item.gameType) : [];
            const open = files.length > 0 && (selected.id === item.id || (selected.kind === "file" && selected.gameType === item.gameType));
            return (
              <span key={item.id} className="rail-slot" style={{ "--i": items.indexOf(item) } as React.CSSProperties}>
                <GameTile item={item} active={item.id === selected.id || (open && selected.kind === "file")} onSelect={() => onSelect(item.id)} onActivate={() => activate(item)} />
                {open && (
                  <span className="rail-files" role="group" aria-label={`${item.title} game files`}>
                    {files.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`rail-file${f.id === selected.id ? " is-active" : ""}`}
                        style={{ "--game": f.backdrop.accent } as React.CSSProperties}
                        data-tile-id={f.id}
                        onFocus={() => onSelect(f.id)}
                        onPointerEnter={() => onSelect(f.id)}
                        onClick={() => activate(f)}
                      >
                        <span className="rail-file-title">{f.title}</span>
                        <span className="rail-file-meta">{f.eyebrow}</span>
                      </button>
                    ))}
                  </span>
                )}
              </span>
            );
          })}
      </div>

      <section className="hero" key={selected.id} aria-live="polite">
        <p className="hero-eyebrow">{selected.eyebrow}</p>
        <h1 className="hero-title">{selected.title}</h1>
        <p className="hero-desc">{selected.description}</p>
        <div className="hero-actions" data-nav-row="2">
          {selected.kind === "engine" && (
            <>
              <button type="button" className="btn btn-primary" data-nav-default="" onClick={() => props.onLoad(selected.gameType)}>
                <FolderOpen size={18} strokeWidth={1.5} />
                Load game file
              </button>
              {getEngine(selected.gameType)?.hasBuilder && (
                <button type="button" className="btn btn-secondary" onClick={() => props.onBuild(selected.gameType)}>
                  <PencilRuler size={18} strokeWidth={1.5} />
                  Build a game
                </button>
              )}
              {selected.gameType === "headbands" && props.onJoin && (
                <button type="button" className="btn btn-quiet" onClick={props.onJoin}>
                  <LogIn size={18} strokeWidth={1.5} />
                  Join a game
                </button>
              )}
            </>
          )}
          {selected.kind === "build" && (
            <button type="button" className="btn btn-primary" data-nav-default="" onClick={() => props.onBuild()}>
              <PencilRuler size={18} strokeWidth={1.5} />
              Start building
            </button>
          )}
          {selected.kind === "soon" && (
            <button type="button" className="btn btn-secondary" disabled>
              <Sticker size={18} strokeWidth={1.5} />
              Coming soon
            </button>
          )}
          {selected.kind === "file" && (
            <>
              <button type="button" className="btn btn-primary" data-nav-default="" onClick={() => props.onOpenRecent(selected)}>
                <Play size={18} strokeWidth={1.5} />
                Load and host
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => props.onForgetRecent(selected)}>
                <Trash2 size={18} strokeWidth={1.5} />
                Remove from recent
              </button>
            </>
          )}
        </div>
      </section>

      <footer className="dash-foot">
        <div className="hints" aria-hidden="true">
          <span className="hint">
            <span className="hint-keys">
              <kbd className="keycap">
                <ArrowLeft />
              </kbd>
              <kbd className="keycap">
                <ArrowRight />
              </kbd>
            </span>
            Browse
          </span>
          <span className="hint">
            <kbd className="keycap">
              <ArrowDown />
            </kbd>
            Actions
          </span>
          <span className="hint">
            <kbd className="keycap">
              <CornerDownLeft />
            </kbd>
            Select
          </span>
          <span className="hint">
            <span className="hint-keys">
              <kbd className="keycap">W</kbd>
              <kbd className="keycap">A</kbd>
              <kbd className="keycap">S</kbd>
              <kbd className="keycap">D</kbd>
            </span>
            Also move
          </span>
        </div>
        <p className="dash-tagline">Pick. Build. Play.</p>
      </footer>
    </main>
  );
}
