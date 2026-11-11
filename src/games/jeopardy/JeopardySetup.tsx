import { useState } from "react";
import { ArrowLeft, Minus, Play, Plus } from "lucide-react";
import { JEOPARDY_LIMITS, countClues, type JeopardyFile } from "../../game-files/schema/jeopardy";
import type { LoadedGame } from "../../components/import/loadGame";
import { useEscape } from "../../components/navigation/spatialNav";
import { useAutoFocus } from "../../components/ui/useAutoFocus";
import "./jeopardy.css";

interface Props {
  game: LoadedGame<JeopardyFile>;
  onBack: () => void;
  onStart: (teamNames: string[], allowNegativeScores: boolean) => void;
}

export function JeopardySetup({ game, onBack, onStart }: Props) {
  const { file } = game;
  const [names, setNames] = useState(["Team 1", "Team 2"]);
  const [allowNegative, setAllowNegative] = useState(file.settings.allowNegativeScores);
  const root = useAutoFocus<HTMLElement>();
  useEscape(onBack);

  const setCount = (count: number) => {
    const n = Math.max(JEOPARDY_LIMITS.minTeams, Math.min(JEOPARDY_LIMITS.maxTeams, count));
    setNames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? `Team ${i + 1}`));
  };

  return (
    <main className="screen game-scope" ref={root} style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back to file" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Session setup</span>
      </header>

      <form
        className="setup"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(names, allowNegative);
        }}
      >
        <div className="setup-intro">
          <p className="meta">You are about to host</p>
          <h1 className="page-title setup-title">{file.metadata.title}</h1>
          <p className="page-lede">
            {file.content.categories.length} {file.content.categories.length === 1 ? "category" : "categories"}, {countClues(file)} clues
            {file.content.finalJeopardy.enabled ? ", with a final round" : ""}. Loaded from {game.filename}
          </p>
        </div>

        <div className="setup-panel card">
          <div className="setup-row">
            <span className="setup-label" id="team-count">
              Teams
            </span>
            <div className="stepper" role="group" aria-labelledby="team-count" data-nav-row="1">
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Remove a team" disabled={names.length <= JEOPARDY_LIMITS.minTeams} onClick={() => setCount(names.length - 1)}>
                <Minus size={18} strokeWidth={1.5} />
              </button>
              <output className="stepper-value" aria-live="polite">
                {names.length}
              </output>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Add a team" disabled={names.length >= JEOPARDY_LIMITS.maxTeams} onClick={() => setCount(names.length + 1)}>
                <Plus size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <div className="team-fields">
            {names.map((name, i) => (
              <label key={i} className="team-field" data-nav-row={2 + i}>
                <span className="team-index">{i + 1}</span>
                <span className="sr-only">Team {i + 1} name</span>
                <input
                  className="input"
                  value={name}
                  maxLength={24}
                  placeholder={`Team ${i + 1}`}
                  onChange={(e) => setNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))}
                />
              </label>
            ))}
          </div>

          <label className="switch" data-nav-row="20">
            <span>
              Allow negative scores
              <span className="field-hint switch-hint">Wrong answers can take a team below zero</span>
            </span>
            <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
            <span className="switch-track" />
          </label>

          <div className="setup-actions" data-nav-row="21">
            <button type="submit" className="btn btn-primary" data-autofocus>
              <Play size={18} strokeWidth={1.5} />
              Start game
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
