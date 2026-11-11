import { ArrowLeft, LogIn, Radio } from "lucide-react";
import { getEngine } from "../../games/registry";
import { useEscape } from "../navigation/spatialNav";
import { useAutoFocus } from "../ui/useAutoFocus";
import { GameImporter, type ImportSeed } from "./GameImporter";
import type { LoadedGame } from "./loadGame";

interface Props {
  gameType: string;
  seed?: ImportSeed;
  onBack: () => void;
  onHost: (game: LoadedGame) => void;
  onBuilder: () => void;
  onLoaded: (game: LoadedGame | null) => void;
  /** Headbands: open an online lobby where players write the identities. */
  onLobby?: () => void;
  /** Headbands: join someone else's lobby from this device. */
  onJoin?: () => void;
}

export function ImportScreen({ gameType, seed, onBack, onHost, onBuilder, onLoaded, onLobby, onJoin }: Props) {
  const engine = getEngine(gameType);
  const root = useAutoFocus<HTMLElement>();
  useEscape(onBack);
  return (
    <main className="screen" ref={root}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back to dashboard" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">{engine?.title}</span>
      </header>
      <div className="import-layout">
        <div className="import-intro">
          <h1 className="page-title">Load a game file</h1>
          <p className="page-lede">
            Every {engine?.title} session runs from a file. It holds {engine?.fileHolds ?? "the game content"}. Zuno checks it before you host.
          </p>
          {(onLobby || onJoin) && (
            <div className="import-online card" data-nav-row="5">
              <p className="import-online-title">No file needed</p>
              <p className="meta">Players join on their phones and write each other's identities.</p>
              <div className="import-online-actions">
                {onLobby && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onLobby}>
                    <Radio size={16} strokeWidth={1.5} />
                    Host an online lobby
                  </button>
                )}
                {onJoin && (
                  <button type="button" className="btn btn-quiet btn-sm" onClick={onJoin}>
                    <LogIn size={16} strokeWidth={1.5} />
                    Join a game
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <GameImporter gameType={gameType} seed={seed} onHost={onHost} onBuilder={onBuilder} onLoaded={onLoaded} />
      </div>
    </main>
  );
}
