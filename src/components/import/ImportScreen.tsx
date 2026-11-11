import { ArrowLeft } from "lucide-react";
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
}

export function ImportScreen({ gameType, seed, onBack, onHost, onBuilder, onLoaded }: Props) {
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
        </div>
        <GameImporter gameType={gameType} seed={seed} onHost={onHost} onBuilder={onBuilder} onLoaded={onLoaded} />
      </div>
    </main>
  );
}
