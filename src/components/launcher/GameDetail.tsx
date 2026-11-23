import { useEffect } from "react";
import { ArrowLeft, ChevronDown, Clock, FolderOpen, LogIn, Monitor, PencilRuler, Play, Radio, Users } from "lucide-react";
import { getEngine } from "../../games/registry";
import { holdMusic, isSoundTheme, releaseMusic } from "../../lib/audio";
import { useEscape } from "../navigation/spatialNav";
import { GAME_INFO } from "./gameInfo";

interface Props {
  gameType: string;
  onBack: () => void;
  onLoad: (gameType: string) => void;
  onBuild: (gameType: string) => void;
  onHostOnline?: (gameType: string) => void;
  onJoinOnline?: (gameType: string) => void;
  /** Join a Headbands or LIAR room. */
  onJoin?: () => void;
}

/** One game's page: big title over its moving backdrop, soft music, play buttons, and how to play below. */
export function GameDetail({ gameType, onBack, onLoad, onBuild, onHostOnline, onJoinOnline, onJoin }: Props) {
  const engine = getEngine(gameType);
  const info = GAME_INFO[gameType];
  useEscape(onBack);

  // Its music plays the whole time this page is open, quieter than on the tiles.
  useEffect(() => {
    window.scrollTo(0, 0);
    if (isSoundTheme(gameType)) holdMusic(gameType);
    return () => releaseMusic();
  }, [gameType]);

  if (!engine) return null;
  const online = !!engine.onlineOnly;

  return (
    <main className="lx-detail" key={gameType}>
      <section className="lx-hero" data-morph={`game:${gameType}`}>
        <button type="button" className="lx-back" onClick={onBack} data-nav-row="1">
          <ArrowLeft size={16} strokeWidth={2} />
          Back
        </button>
        <div className="lx-hero-body">
          {info && (
            <p className="lx-chips">
              <span className="lx-chip">{info.mode}</span>
              <span className="lx-chip">
                <Users size={14} strokeWidth={2} /> {info.players}
              </span>
              <span className="lx-chip">
                <Clock size={14} strokeWidth={2} /> {info.length}
              </span>
            </p>
          )}
          <h1 className="lx-big" aria-label={engine.title} style={{ "--len": Math.max(4, ...engine.title.split(" ").map((w) => w.length)) } as React.CSSProperties}>
            {engine.title.split(" ").map((w, i) => (
              <span key={i} className="lx-big-word" style={{ "--i": i } as React.CSSProperties}>
                {w}
              </span>
            ))}
          </h1>
          <p className="lx-desc">{engine.description}</p>
          <div className="lx-actions" data-nav-row="2">
            {online ? (
              <>
                <button type="button" className="btn btn-primary lx-play" data-nav-default="" disabled={!onHostOnline} onClick={() => onHostOnline?.(gameType)}>
                  <Play size={20} strokeWidth={2} fill="currentColor" />
                  Play
                </button>
                <button type="button" className="btn btn-secondary" disabled={!onJoinOnline} onClick={() => onJoinOnline?.(gameType)}>
                  <LogIn size={18} strokeWidth={1.75} />
                  Join a game
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary lx-play" data-nav-default="" onClick={() => onLoad(gameType)}>
                  <Play size={20} strokeWidth={2} fill="currentColor" />
                  Play
                </button>
                {engine.hasBuilder && (
                  <button type="button" className="btn btn-secondary" onClick={() => onBuild(gameType)}>
                    <PencilRuler size={18} strokeWidth={1.75} />
                    Build a game
                  </button>
                )}
                {onJoin && (gameType === "headbands" || gameType === "liar") && (
                  <button type="button" className="btn btn-quiet" onClick={onJoin}>
                    <LogIn size={18} strokeWidth={1.75} />
                    Join a game
                  </button>
                )}
              </>
            )}
          </div>
          <p className="lx-note meta">
            {online ? (
              <>
                <Radio size={14} strokeWidth={2} /> Play hosts a room. Everyone joins on their own phone with the room code.
              </>
            ) : (
              <>
                {gameType === "jeopardy" ? <Monitor size={14} strokeWidth={2} /> : <FolderOpen size={14} strokeWidth={2} />} Play loads a game file that holds {engine.fileHolds}.
              </>
            )}
            {online && !onHostOnline && " Online rooms are not set up for this site."}
          </p>
        </div>
        {info && (
          <button type="button" className="lx-scroll" onClick={() => document.getElementById("how-to-play")?.scrollIntoView({ behavior: "smooth" })}>
            How to play
            <ChevronDown size={18} strokeWidth={2} />
          </button>
        )}
      </section>

      {info && (
        <section className="lx-rules" id="how-to-play" aria-labelledby="how-to-play-title">
          <h2 className="lx-rules-title" id="how-to-play-title">
            How {engine.title} works
          </h2>
          <div className="lx-rule-grid">
            {info.rules.map((r, i) => (
              <article key={r.heading} className="lx-rule" style={{ "--i": i } as React.CSSProperties}>
                <span className="lx-rule-num">{i + 1}</span>
                <h3>{r.heading}</h3>
                <ul>
                  {r.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="lx-actions lx-actions-end">
            <button type="button" className="btn btn-primary lx-play" onClick={() => (online ? onHostOnline?.(gameType) : onLoad(gameType))} disabled={online && !onHostOnline}>
              <Play size={20} strokeWidth={2} fill="currentColor" />
              Play {engine.title}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
