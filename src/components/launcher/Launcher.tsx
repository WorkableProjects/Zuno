import { ZunoMark } from "../brand/Logo";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, House, LayoutGrid, Plus, Search, Settings, X } from "lucide-react";
import { loadRecent, loadSidebarCollapsed, saveSidebarCollapsed } from "../../app/storage";
import { playSfx } from "../../lib/sfx";
import { gameFontStyle } from "../../games/gameFont";
import { getEngine } from "../../games/registry";
import { TileCover } from "../dashboard/GameTile";
import type { RailItem } from "../dashboard/railItems";
import { GAME_INFO } from "./gameInfo";
import { HomeView } from "./HomeView";
import "../dashboard/dashboard.css";
import "./launcher.css";
import "./library.css";
import "./rail.css";

export type Section = "home" | "library" | "settings";

/** Hover/focus tooltip that sits to the right of a rail control. */
function Tip({ children, keys }: { children: ReactNode; keys?: string }) {
  return (
    <span className="lx-tip" aria-hidden="true">
      {children}
      {keys ? <kbd>{keys}</kbd> : null}
    </span>
  );
}

/** The command rail shared by the home, library and game pages. */
export function LauncherShell({ section, onSection, onSettings, onOpenGame, children, accent }: { section: Section | null; onSection: (s: Section) => void; onSettings: () => void; onOpenGame: (gameType: string) => void; children: ReactNode; accent: string }) {
  const nav: Array<{ id: Section; label: string; Icon: typeof House }> = [
    { id: "home", label: "Home", Icon: House },
    { id: "library", label: "Library", Icon: LayoutGrid },
  ];
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
  const [recent, setRecent] = useState(() => loadRecent().slice(0, 3));
  useEffect(() => setRecent(loadRecent().slice(0, 3)), [section]);

  // Phones keep the bottom bar, where collapsing does not apply.
  const [desktop, setDesktop] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = () => setDesktop(!mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const toggle = useCallback((sound = false) => {
    setCollapsed((c) => {
      saveSidebarCollapsed(!c);
      if (sound) playSfx(c ? "toggleOn" : "toggleOff");
      return !c;
    });
  }, []);
  // '[' toggles the rail, except while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      toggle(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const Chevron = collapsed ? ChevronRight : ChevronLeft;
  const idx = section === "home" ? 0 : section === "library" ? 1 : section === "settings" ? 2 : -1;
  return (
    <div className={`launcher game-scope${collapsed ? " is-collapsed" : ""}`} style={{ "--game": accent } as React.CSSProperties}>
      <aside className="lx-side" aria-label="Zuno">
        <span className="lx-shadow lx-shadow-full" aria-hidden="true" />
        <span className="lx-shadow lx-shadow-mini" aria-hidden="true" />
        <span className="lx-plate" aria-hidden="true" />
        <button type="button" className="lx-mark" aria-label="Zuno home" onClick={() => onSection("home")}>
          <ZunoMark size={40} />
          <Tip>Home</Tip>
        </button>
        <button type="button" className="lx-collapse" aria-expanded={!collapsed} aria-controls="lx-nav" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => toggle()}>
          <Chevron size={16} strokeWidth={2} />
          <Tip keys="[">{collapsed ? "Expand" : "Collapse"}</Tip>
        </button>
        <div className="lx-body" inert={collapsed && desktop}>
          <nav id="lx-nav" className="lx-nav" data-nav-row="0" aria-label="Sections" style={{ "--idx": idx } as React.CSSProperties}>
            <span className={`lx-nav-pill${section ? "" : " is-hidden"}`} aria-hidden="true" />
            {nav.map(({ id, label, Icon }) => (
              <button key={id} type="button" className={`lx-nav-btn${section === id ? " is-on" : ""}`} aria-current={section === id ? "page" : undefined} aria-label={label} onClick={() => onSection(id)}>
                <Icon size={20} strokeWidth={1.75} />
                <Tip>{label}</Tip>
              </button>
            ))}
            <button type="button" className={`lx-nav-btn${section === "settings" ? " is-on" : ""}`} aria-current={section === "settings" ? "page" : undefined} aria-label="Settings" onClick={onSettings}>
              <Settings size={20} strokeWidth={1.75} />
              <Tip>Settings</Tip>
            </button>
          </nav>
          {recent.length > 0 ? (
            <div className="lx-recent" role="group" aria-label="Recently played">
              {recent.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  className="lx-recent-ico"
                  aria-label={`Open ${r.title}`}
                  style={{ "--i": i, "--c": r.accentColor } as React.CSSProperties}
                  onClick={() => onOpenGame(r.gameType)}
                >
                  {r.coverImage ? <img src={r.coverImage} alt="" loading="lazy" /> : <b>{(r.title.trim()[0] ?? "?").toUpperCase()}</b>}
                </button>
              ))}
              <Tip>{`Recent: ${recent[0].title}`}</Tip>
            </div>
          ) : null}
          {/* The multi-action button (soundboard, chat, volume) docks here. */}
          <span className="lx-dock" aria-hidden="true" />
        </div>
      </aside>
      <div className="lx-main">{children}</div>
    </div>
  );
}

/** Pointer-tracked tilt and sheen: writes CSS vars straight to the tile, once per frame, no re-render. */
function tilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  cancelAnimationFrame(Number(el.dataset.raf ?? 0));
  el.dataset.raf = String(
    requestAnimationFrame(() => {
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      el.style.setProperty("--rx", `${((0.5 - y) * 10).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((x - 0.5) * 12).toFixed(2)}deg`);
      el.style.setProperty("--py-x", ((0.5 - x) * 2).toFixed(3));
      el.style.setProperty("--py-y", ((0.5 - y) * 2).toFixed(3));
    }),
  );
}
function untilt(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  cancelAnimationFrame(Number(el.dataset.raf ?? 0));
  el.style.removeProperty("--rx");
  el.style.removeProperty("--ry");
  el.style.removeProperty("--py-x");
  el.style.removeProperty("--py-y");
}

/** A large library tile: the game's art and its name, nothing else. */
export function LibTile({ item, active, onSelect, onOpen, index }: { item: RailItem; active: boolean; onSelect: () => void; onOpen: () => void; index: number }) {
  return (
    <button
      type="button"
      className={`lib-tile${active ? " is-active" : ""}${item.kind === "build" ? " is-build" : ""}`}
      style={{ "--game": item.backdrop.accent, "--i": index } as React.CSSProperties}
      data-tile-id={item.id}
      data-nav-default={active ? "" : undefined}
      onFocus={onSelect}
      onPointerEnter={(e) => e.pointerType === "mouse" && onSelect()}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      onClick={onOpen}
    >
      <span className="lib-art" data-morph={item.kind === "engine" ? `game:${item.gameType}` : undefined}>
        {item.kind === "build" ? (
          <span className="lib-build">
            <Plus size={40} strokeWidth={1.5} />
          </span>
        ) : item.kind === "file" && item.backdrop.cover ? (
          <img className="lib-img" src={item.backdrop.cover} alt="" loading="lazy" decoding="async" />
        ) : (
          <TileCover gameType={item.gameType} />
        )}
      </span>
      <span className="lib-name" style={item.kind === "build" ? undefined : gameFontStyle(item.gameType)}>{item.kind === "build" ? "Build a game" : item.title}</span>
    </button>
  );
}

interface HomeProps {
  section: Section;
  items: RailItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (item: RailItem) => void;
  onJoin?: () => void;
  onForget: (item: RailItem) => void;
  onSection: (s: Section) => void;
}

type Filter = "all" | "online" | "local" | "files";

/** Home and Library: a grid of big tiles. Hover previews the game's music and backdrop; a click opens its page. */
export function LauncherHome({ section, items, selectedId, onSelect, onOpen, onJoin, onForget, onSection }: HomeProps) {
  const grid = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
    grid.current?.querySelector<HTMLElement>(".lib-tile.is-active")?.focus({ preventScroll: true });
  }, [section]);

  const engines = items.filter((i) => i.kind === "engine");
  const files = items.filter((i) => i.kind === "file");
  const build = items.find((i) => i.kind === "build");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: RailItem[] = filter === "files" ? files : engines;
    if (filter === "online") list = engines.filter((e) => GAME_INFO[e.gameType]?.mode !== "One screen");
    if (filter === "local") list = engines.filter((e) => GAME_INFO[e.gameType]?.mode !== "Online");
    return q ? list.filter((i) => i.title.toLowerCase().includes(q) || getEngine(i.gameType)?.title.toLowerCase().includes(q)) : list;
  }, [filter, query, engines, files]);

  const tiles = (list: RailItem[], row: number, extra?: RailItem) => (
    <div className="lib-grid" data-nav-row={row} role="group" key={`${filter}:${query.trim() ? "q" : ""}`}>
      {[...list, ...(extra ? [extra] : [])].map((item, i) => (
        <span key={item.id} className="lib-slot">
          <LibTile item={item} index={i} active={item.id === selectedId} onSelect={() => onSelect(item.id)} onOpen={() => onOpen(item)} />
          {item.kind === "file" && (
            <button type="button" className="lib-forget" aria-label={`Remove ${item.title} from your files`} title="Remove" onClick={() => onForget(item)}>
              <X size={14} strokeWidth={2.5} />
            </button>
          )}
        </span>
      ))}
    </div>
  );

  if (section === "library") {
    return (
      <main className="lx-page" ref={grid}>
        <header className="lx-head">
          <h1 className="lx-title">Library</h1>
          <label className="lx-search">
            <Search size={18} strokeWidth={1.75} />
            <input value={query} placeholder="Search" aria-label="Search games" onChange={(e) => setQuery(e.target.value)} />
          </label>
        </header>
        <div className="lx-tabs" role="tablist" aria-label="Filter" data-nav-row="1">
          {(
            [
              ["all", "All games"],
              ["online", "Online"],
              ["local", "One screen"],
              ["files", "Your files"],
            ] as Array<[Filter, string]>
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={`lx-tab${filter === id ? " is-on" : ""}`} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? <p className="meta lx-empty">{filter === "files" ? "Games you load or build show up here." : "No games match."}</p> : tiles(shown, 2)}
      </main>
    );
  }

  return <HomeView items={items} engines={engines} files={files} build={build} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} onJoin={onJoin} onForget={onForget} onSection={onSection} gridRef={grid} />;
}
