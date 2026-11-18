import { useState } from "react";
import { ArrowLeft, Play, Plus, X } from "lucide-react";
import type { LoadedGame } from "../../components/import/loadGame";
import { useEscape } from "../../components/navigation/spatialNav";
import { useAutoFocus } from "../../components/ui/useAutoFocus";
import type { GauntletFile } from "../../game-files/schema/gauntlet";
import { validateTeams, type GauntletMode, type Options, type TeamSetup } from "./gauntletEngine";
import "./gauntlet.css";

interface Props {
  game: LoadedGame<GauntletFile>;
  onBack: () => void;
  onStart: (teams: TeamSetup[], options: Options) => void;
}

export function GauntletSetup({ game, onBack, onStart }: Props) {
  const { file } = game;
  const s = file.settings;
  const [teams, setTeams] = useState<TeamSetup[]>(() => Array.from({ length: Math.max(3, s.minTeams) }, (_, i) => ({ name: `Team ${i + 1}`, players: ["", ""] })).slice(0, s.maxTeams));
  const [mode, setMode] = useState<GauntletMode>(s.elimination ? "survival" : "standard");
  const [safeMode, setSafeMode] = useState(false);
  const [negative, setNegative] = useState(s.allowNegativeScores);
  const [tried, setTried] = useState(false);
  const root = useAutoFocus<HTMLElement>();
  useEscape(onBack);
  const errors = validateTeams(teams, file);
  const edit = (i: number, f: (t: TeamSetup) => TeamSetup) => setTeams((p) => p.map((t, k) => (k === i ? f(t) : t)));

  return (
    <main className="screen game-scope" ref={root} style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back to file" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Session setup</span>
      </header>
      <form
        className="gl-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (errors.length === 0) onStart(teams.map((t) => ({ name: t.name.trim(), players: t.players.map((p) => p.trim()).filter(Boolean) })), { mode, safeMode, allowNegativeScores: negative, roundSeconds: s.defaultRoundSeconds });
        }}
      >
        <div>
          <p className="meta">You are about to host</p>
          <h1 className="page-title">{file.metadata.title}</h1>
          <p className="page-lede">Teams race through three lanes, gamble in the Choice round, survive Chaos and climb the Final Gauntlet. {s.minTeams} to {s.maxTeams} teams, {s.playersPerTeam[0]} to {s.playersPerTeam[1]} players each.</p>
        </div>
        <div className="card gl-panel">
          <div className="gl-row">
            <span className="setup-label" id="gl-teams">Teams</span>
            <span className="meta">{teams.length} of {s.maxTeams}</span>
          </div>
          <ol className="gl-teams" aria-labelledby="gl-teams">
            {teams.map((t, i) => (
              <li key={i} className="gl-team-edit" data-nav-row={10 + i}>
                <div className="gl-row">
                  <label className="gl-grow">
                    <span className="sr-only">Team {i + 1} name</span>
                    <input className="input" value={t.name} maxLength={24} data-autofocus={i === 0 ? "" : undefined} aria-invalid={tried && !t.name.trim()} onChange={(e) => edit(i, (x) => ({ ...x, name: e.target.value }))} />
                  </label>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove team ${i + 1}`} disabled={teams.length <= 1} onClick={() => setTeams((p) => p.filter((_, k) => k !== i))}>
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="gl-actions">
                  {t.players.map((p, k) => (
                    <label key={k}>
                      <span className="sr-only">Team {i + 1} player {k + 1}</span>
                      <input className="input" value={p} maxLength={24} placeholder={`Player ${k + 1}`} onChange={(e) => edit(i, (x) => ({ ...x, players: x.players.map((y, j) => (j === k ? e.target.value : y)) }))} />
                    </label>
                  ))}
                  <button type="button" className="btn btn-quiet btn-sm" disabled={t.players.length >= s.playersPerTeam[1]} onClick={() => edit(i, (x) => ({ ...x, players: [...x.players, ""] }))}>
                    <Plus size={16} strokeWidth={1.5} /> Player
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div data-nav-row={40}>
            <button type="button" className="btn btn-quiet btn-sm" disabled={teams.length >= s.maxTeams} onClick={() => setTeams((p) => [...p, { name: `Team ${p.length + 1}`, players: ["", ""] }])}>
              <Plus size={16} strokeWidth={1.5} /> Add team
            </button>
          </div>
          <fieldset className="gl-actions" data-nav-row={41} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="setup-label">Mode</legend>
            {(["standard", "survival"] as const).map((m) => (
              <button key={m} type="button" className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-secondary"}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === "standard" ? "Standard" : "Survival"}
              </button>
            ))}
          </fieldset>
          <label className="switch" data-nav-row={42}>
            <span>
              Safe mode
              <span className="field-hint switch-hint">No team is ever eliminated. Good for classrooms.</span>
            </span>
            <input type="checkbox" checked={safeMode} onChange={(e) => setSafeMode(e.target.checked)} />
            <span className="switch-track" />
          </label>
          <label className="switch" data-nav-row={43}>
            <span>
              Allow negative scores
              <span className="field-hint switch-hint">Bold and Crossroads misses can push a team below zero</span>
            </span>
            <input type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} />
            <span className="switch-track" />
          </label>
          {tried && errors.length > 0 && (
            <div className="notice" role="alert">
              <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          <div className="setup-actions" data-nav-row={44}>
            <button type="submit" className="btn btn-primary">
              <Play size={18} strokeWidth={1.5} /> Open lobby
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
