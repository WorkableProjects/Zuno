import { RotateCcw, Home, Trophy } from "lucide-react";
import { standings, type GauntletState } from "./gauntletEngine";

export function GauntletResults({ state, onAgain, onExit }: { state: GauntletState; onAgain: () => void; onExit: () => void }) {
  const ladder = standings(state);
  const names = state.winners.map((id) => state.teams.find((t) => t.id === id)?.name ?? "");
  return (
    <section className="card gl-panel" aria-labelledby="gl-results">
      <div>
        <p className="meta">{names.length > 1 ? "Co-winners" : "Winner"}</p>
        <h2 id="gl-results" className="page-title">
          <Trophy size={28} strokeWidth={1.5} aria-hidden /> {names.join(" & ") || "No winner"}
        </h2>
      </div>
      <ol className="gl-ladder" aria-label="Final standings">
        {ladder.map(({ team, score, rank }) => (
          <li key={team.id} className={state.winners.includes(team.id) ? "is-winner" : undefined}>
            <span className="gl-rank">{rank}</span>
            <span className="gl-grow">
              {team.name}
              {team.eliminated && <span className="meta"> · eliminated</span>}
            </span>
            <span className="meta">best streak {state.bestStreaks[team.id]}</span>
            <strong>{score}</strong>
          </li>
        ))}
      </ol>
      <div className="gl-actions">
        <button type="button" className="btn btn-primary" onClick={onAgain}>
          <RotateCcw size={18} strokeWidth={1.5} /> Rematch
        </button>
        <button type="button" className="btn btn-secondary" onClick={onExit}>
          <Home size={18} strokeWidth={1.5} /> Exit
        </button>
      </div>
    </section>
  );
}
