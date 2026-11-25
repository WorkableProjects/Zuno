import { useCallback, useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Clock, LayoutGrid, LogIn, Play, Plus, Shuffle, Smartphone, Tv, Users, X } from "lucide-react";
import { useProfile } from "../../lib/profile";
import { cachedRect, writeNextFrame } from "../../lib/pointerFrame";
import { Avatar } from "../avatar/AvatarView";
import { gameFontStyle } from "../../games/gameFont";
import { TileCover } from "../dashboard/GameTile";
import type { RailItem } from "../dashboard/railItems";
import { GAME_INFO } from "./gameInfo";
import type { Section } from "./Launcher";
import "./home.css";
import { PlayButton } from "../ui/PlayButton";

interface Props {
  items: RailItem[];
  engines: RailItem[];
  files: RailItem[];
  build?: RailItem;
  selectedId: string;
  onSelect: (id: string) => void;
  onOpen: (item: RailItem) => void;
  onJoin?: () => void;
  onForget: (item: RailItem) => void;
  onSection: (s: Section) => void;
  gridRef: RefObject<HTMLDivElement | null>;
}

const CTA_KEY = "zuno.accountPromptDismissed";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Same game all day, a different one tomorrow. */
function dailyIndex(n: number): number {
  const d = new Date();
  return (d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % Math.max(n, 1);
}

const ROTATE_MS = 7000;

/** Auto-rotation is off for people who asked for less motion (OS setting or the in-app Still mode). */
function useReducedMotion(): boolean {
  const query = () => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";
    } catch {
      return false;
    }
  };
  const [reduced, setReduced] = useState(query);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query());
    mq.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => {
      mq.removeEventListener("change", update);
      mo.disconnect();
    };
  }, []);
  return reduced;
}

/** Pointer-driven parallax for the stage art: writes two CSS vars, once per frame, with no layout read in the handler. */
function stageParallax(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = cachedRect(el);
  const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
  const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  writeNextFrame(el, () => {
    el.style.setProperty("--px", x.toFixed(3));
    el.style.setProperty("--py", y.toFixed(3));
  });
}

/**
 * Home is a starting point, not a second library: who you are, tonight's pick,
 * the fastest ways in, what you played last, and games grouped by the room you're in.
 */
export function HomeView({ engines, files, build, selectedId, onSelect, onOpen, onJoin, onForget, onSection, gridRef }: Props) {
  const profile = useProfile();
  const [ctaGone, setCtaGone] = useState(() => {
    try {
      return localStorage.getItem(CTA_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [ctaLeaving, setCtaLeaving] = useState(false);
  const daily = dailyIndex(engines.length);
  const [stageIdx, setStageIdx] = useState(daily);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const count = engines.length;
  const featured = engines[stageIdx % Math.max(count, 1)];
  const feat = featured ? GAME_INFO[featured.gameType] : undefined;
  const step = useCallback((d: number) => setStageIdx((i) => (i + d + count) % Math.max(count, 1)), [count]);

  const groups = useMemo(() => {
    const info = (i: RailItem) => GAME_INFO[i.gameType];
    return [
      { id: "phones", title: "Everyone on their phone", Icon: Smartphone, list: engines.filter((e) => info(e)?.mode !== "One screen") },
      { id: "tv", title: "One screen, one room", Icon: Tv, list: engines.filter((e) => info(e)?.mode !== "Online") },
      { id: "quick", title: "Under 30 minutes", Icon: Clock, list: engines.filter((e) => /–(\d+)/.test(info(e)?.length ?? "") && Number(/–(\d+)/.exec(info(e)!.length)![1]) <= 30) },
    ].filter((g) => g.list.length > 0);
  }, [engines]);

  const surprise = () => {
    const pick = engines[Math.floor(Math.random() * engines.length)];
    if (pick) onOpen(pick);
  };

  return (
    <main className="lx-page hm" ref={gridRef}>
      <header className="hm-top">
        <div className="hm-hello">
          {profile ? <Avatar name={profile.username} avatar={profile.avatar} size={52} /> : null}
          <div>
            <p className="lx-eyebrow">{greeting()}</p>
            <h1 className="hm-name">{profile ? profile.username : "Welcome to Zuno"}</h1>
          </div>
        </div>
        {profile === null && ctaGone && (
          <button type="button" className="hm-signin" onClick={() => onSection("settings")} data-nav-row="0">
            <Users size={16} strokeWidth={2} />
            Make a profile
            <span className="hm-signin-sub">Keep your name and picture</span>
          </button>
        )}
      </header>

      {profile === null && !ctaGone && (
        <section className={`hm-cta${ctaLeaving ? " is-leaving" : ""}`} aria-label="Make an account" onAnimationEnd={(e) => e.animationName === "hm-cta-out" && setCtaGone(true)}>
          <span className="hm-cta-icon" aria-hidden="true">
            <Users size={22} strokeWidth={2} />
          </span>
          <div className="hm-cta-text">
            <h2 className="hm-cta-title">Want to make an account?</h2>
            <p className="hm-cta-sub">Keep your name and picture across games and devices.</p>
          </div>
          <div className="hm-cta-actions">
            <button type="button" className="btn btn-primary" onClick={() => onSection("settings")}>
              Yes, set it up
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                try {
                  localStorage.setItem(CTA_KEY, "1");
                } catch {
                  /* private mode: hide for this visit only */
                }
                setCtaLeaving(true);
              }}
            >
              No thanks
            </button>
          </div>
        </section>
      )}

      {featured && (
        <section
          className={`hm-stage game-scope${paused ? " is-paused" : ""}${reduced ? " is-still" : ""}`}
          style={{ "--game": featured.backdrop.accent, ...gameFontStyle(featured.gameType) } as CSSProperties}
          data-game={featured.gameType}
          aria-roledescription="carousel"
          aria-label="Featured games"
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onPointerMove={stageParallax}
          onFocus={() => setPaused(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setPaused(false)}
        >
          <div className="hm-stage-bg" aria-hidden="true" />
          <div className="hm-stage-art" aria-hidden="true" key={`art:${featured.id}`} data-morph={featured.kind === "engine" ? `game:${featured.gameType}` : undefined}>
            <TileCover gameType={featured.gameType} />
          </div>
          <div className="hm-stage-body" key={featured.id} aria-live={reduced || paused ? "polite" : "off"}>
            <p className="hm-kicker">{stageIdx % count === daily ? "Pick of the day" : "Featured"}</p>
            <h2 className="hm-stage-title">{featured.title}</h2>
            <p className="hm-stage-desc">{featured.description}</p>
            {feat && (
              <p className="hm-facts">
                <span>
                  <Users size={14} /> {feat.players}
                </span>
                <span>
                  <Clock size={14} /> {feat.length}
                </span>
                <span>{feat.mode}</span>
              </p>
            )}
            <div className="hm-feature-actions" data-nav-row="1">
              <PlayButton gameType={featured.gameType} className="btn btn-primary" data-nav-default="" onOpen={() => onOpen(featured)}>
                <Play size={18} strokeWidth={2} />
                Play {featured.title}
              </PlayButton>
              <button type="button" className="btn btn-glass" onClick={surprise}>
                <Shuffle size={18} strokeWidth={1.75} />
                Surprise me
              </button>
            </div>
          </div>
          {count > 1 && (
            <div className="hm-stage-nav">
              <button type="button" className="hm-stage-arrow" aria-label="Previous game" onClick={() => step(-1)}>
                <ChevronLeft size={18} strokeWidth={2} />
              </button>
              <ol className="hm-stage-dots">
                {engines.map((e, i) => (
                  <li key={e.id}>
                    <button type="button" className={`hm-stage-dot${i === stageIdx % count ? " is-on" : ""}`} aria-label={`Show ${e.title}`} aria-current={i === stageIdx % count ? "true" : undefined} onClick={() => setStageIdx(i)}>
                      {i === stageIdx % count && <span className="hm-stage-fill" key={`${stageIdx}`} onAnimationEnd={() => !reduced && step(1)} style={{ animationDuration: `${ROTATE_MS}ms` }} />}
                    </button>
                  </li>
                ))}
              </ol>
              <button type="button" className="hm-stage-arrow" aria-label="Next game" onClick={() => step(1)}>
                <ChevronRight size={18} strokeWidth={2} />
              </button>
            </div>
          )}
        </section>
      )}

      <div className="hm-actions" data-nav-row="2">
        {onJoin && (
          <button type="button" className="hm-action" onClick={onJoin}>
            <span className="hm-action-icon">
              <LogIn size={22} strokeWidth={1.75} />
            </span>
            <span>
              <strong>Join a room</strong>
              <small>Enter a 5-letter code</small>
            </span>
          </button>
        )}
        {build && (
          <button type="button" className="hm-action" onClick={() => onOpen(build)}>
            <span className="hm-action-icon">
              <Plus size={22} strokeWidth={1.75} />
            </span>
            <span>
              <strong>Build a game</strong>
              <small>Your own board or deck</small>
            </span>
          </button>
        )}
        <button type="button" className="hm-action" onClick={() => onSection("library")}>
          <span className="hm-action-icon">
            <LayoutGrid size={22} strokeWidth={1.75} />
          </span>
          <span>
            <strong>Browse library</strong>
            <small>{engines.length} games</small>
          </span>
        </button>
      </div>

      {files.length > 0 && (
        <section className="hm-block">
          <h2 className="lx-section">Jump back in</h2>
          <div className="hm-recent" data-nav-row="3">
            {files.slice(0, 6).map((f) => (
              <span key={f.id} className="hm-recent-slot">
                <button
                  type="button"
                  className={`hm-recent-card${f.id === selectedId ? " is-active" : ""}`}
                  style={{ "--game": f.backdrop.accent } as React.CSSProperties}
                  onFocus={() => onSelect(f.id)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && onSelect(f.id)}
                  onClick={() => onOpen(f)}
                >
                  <span className="hm-recent-art">{f.backdrop.cover ? <img src={f.backdrop.cover} alt="" loading="lazy" /> : <TileCover gameType={f.gameType} />}</span>
                  <span className="hm-recent-text">
                    <strong>{f.title}</strong>
                    <small>{f.recent?.summary || f.eyebrow}</small>
                  </span>
                  <ArrowRight size={18} className="hm-recent-go" />
                </button>
                <button type="button" className="lib-forget" aria-label={`Remove ${f.title}`} title="Remove" onClick={() => onForget(f)}>
                  <X size={14} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      {groups.map((g, gi) => (
        <section key={g.id} className="hm-block">
          <h2 className="lx-section hm-group-title">
            <g.Icon size={18} strokeWidth={1.75} />
            {g.title}
          </h2>
          <div className="hm-strip" data-nav-row={4 + gi}>
            {g.list.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`hm-chipcard${e.id === selectedId ? " is-active" : ""}`}
                style={{ "--game": e.backdrop.accent } as React.CSSProperties}
                onFocus={() => onSelect(e.id)}
                onPointerEnter={(ev) => ev.pointerType === "mouse" && onSelect(e.id)}
                onClick={() => onOpen(e)}
              >
                <span className="hm-chipcard-art" data-morph={`game:${e.gameType}`}>
                  <TileCover gameType={e.gameType} />
                </span>
                <strong>{e.title}</strong>
                <small>
                  {GAME_INFO[e.gameType]?.players} · {GAME_INFO[e.gameType]?.length}
                </small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
