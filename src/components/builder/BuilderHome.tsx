import { ArrowLeft, ArrowRight, ClipboardList, PencilRuler } from "lucide-react";
import { getEngine, listEngines } from "../../games/registry";
import { useEscape } from "../navigation/spatialNav";
import { useAutoFocus } from "../ui/useAutoFocus";
import "./builder.css";

interface Props {
  gameType: string;
  onGameType: (gameType: string) => void;
  onBack: () => void;
  onEditor: () => void;
  onAiBuilder: () => void;
}

export function BuilderHome({ gameType, onGameType, onBack, onEditor, onAiBuilder }: Props) {
  const engines = listEngines().filter((e) => e.hasBuilder);
  const engine = getEngine(gameType) ?? engines[0];
  const root = useAutoFocus<HTMLElement>();
  useEscape(onBack);
  return (
    <main className="screen" ref={root}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back to dashboard" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Build</span>
      </header>
      <div className="builder-home">
        <h1 className="page-title">{engine.buildTitle}</h1>
        <p className="page-lede">Both routes end in the same .zuno.json file, ready to load and host.</p>
        <div className="builder-game">
          <span className="field-label" id="builder-game">
            Game
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="builder-game" data-nav-row="1">
            {engines.map((e) => (
              <button key={e.gameType} type="button" role="radio" aria-checked={e.gameType === engine.gameType} className={`segment${e.gameType === engine.gameType ? " is-active" : ""}`} onClick={() => onGameType(e.gameType)}>
                {e.title}
              </button>
            ))}
          </div>
        </div>
        <div className="builder-options" data-nav-row="2">
          <button type="button" className="option card" data-autofocus onClick={onEditor}>
            <PencilRuler size={24} strokeWidth={1.5} className="option-icon" />
            <span className="option-title">Visual Editor</span>
            <span className="option-text">Build your game manually with the built-in editor.</span>
            <span className="option-go">
              Open the editor <ArrowRight size={16} strokeWidth={1.5} />
            </span>
          </button>
          <button type="button" className="option card" onClick={onAiBuilder}>
            <ClipboardList size={24} strokeWidth={1.5} className="option-icon" />
            <span className="option-title">AI Builder</span>
            <span className="option-text">Use ChatGPT, Gemini, or another AI assistant to generate your game file.</span>
            <span className="option-go">
              Get the guide <ArrowRight size={16} strokeWidth={1.5} />
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}
