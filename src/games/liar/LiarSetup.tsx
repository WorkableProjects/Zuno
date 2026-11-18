import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Minus, Play, Plus, Radio, UserPlus, X } from "lucide-react";
import type { LoadedGame } from "../../components/import/loadGame";
import { useEscape } from "../../components/navigation/spatialNav";
import { useAutoFocus } from "../../components/ui/useAutoFocus";
import type { LiarFile } from "../../game-files/schema/liar";
import { LIAR_LIMITS } from "../../game-files/schema/liar";
import { LIAR_PRESETS, estimateMinutes, scoreRulesFor, validateSetup, type Options } from "./liarEngine";
import "./liar.css";

interface Props {
  game: LoadedGame<LiarFile>;
  onBack: () => void;
  onStart: (names: string[], options: Options) => void;
  /** Host this game online, with players on their own phones. */
  onLobby?: (options: Options) => void;
}

export function LiarSetup({ game, onBack, onStart, onLobby }: Props) {
  const { file } = game;
  const { minPlayers, maxPlayers } = file.settings;
  const [names, setNames] = useState<string[]>(() => Array.from({ length: minPlayers }, () => ""));
  const [rounds, setRounds] = useState(file.settings.defaultRounds);
  const [scoring, setScoring] = useState(file.settings.scoringEnabled);
  const [abstain, setAbstain] = useState(file.settings.allowAbstain);
  const [tried, setTried] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);
  const [discuss, setDiscuss] = useState(60);
  const [hideHints, setHideHints] = useState(false);
  const [liveResults, setLiveResults] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [streak, setStreak] = useState(false);
  const applyPreset = (id: string) => {
    const p = LIAR_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPreset(id);
    setRounds(Math.min(LIAR_LIMITS.maxRounds, p.options.rounds));
    setScoring(p.options.scoring);
    setAbstain(p.options.allowAbstain);
    setDiscuss(p.options.discussSeconds ?? 60);
    setHideHints(!!p.options.hideHints);
  };
  const root = useAutoFocus<HTMLElement>();
  useEscape(onBack);

  const options: Options = { rounds, scoring, allowAbstain: abstain, discussSeconds: discuss, hideHints, liveResults, anonymousVotes: anonymous, streakBonus: streak };
  const minutes = estimateMinutes(Math.max(names.length, minPlayers), rounds, discuss);
  const errors = validateSetup(names, options, minPlayers, maxPlayers);
  const move = (i: number, d: number) =>
    setNames((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const q = [...p];
      [q[i], q[j]] = [q[j], q[i]];
      return q;
    });

  return (
    <main className="screen game-scope" ref={root} style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back to file" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Session setup</span>
      </header>
      <form
        className="liar-setup"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (errors.length === 0) onStart(names.map((n) => n.trim()), options);
        }}
      >
        <div>
          <p className="meta">You are about to host</p>
          <h1 className="page-title">{file.metadata.title}</h1>
          <p className="page-lede">
            Each player shares two truths and a lie, with a follow-up question for every statement. The group asks questions, then votes on the lie. {minPlayers} to {maxPlayers} players.
          </p>
        </div>
        <fieldset className="liar-presets" data-nav-row={5}>
          <legend className="setup-label">Mode</legend>
          {LIAR_PRESETS.map((p) => (
            <button key={p.id} type="button" className={`card liar-preset${preset === p.id ? " is-active" : ""}`} aria-pressed={preset === p.id} onClick={() => applyPreset(p.id)}>
              <strong>{p.label}</strong>
              <span className="field-hint">{p.description}</span>
            </button>
          ))}
        </fieldset>
        <p className="meta" aria-live="polite">
          About {minutes} minutes for {Math.max(names.length, minPlayers)} players and {rounds} {rounds === 1 ? "round" : "rounds"}. The storyteller is always known: players take turns in the order below.
        </p>
        <div className="card liar-panel">
          <div className="liar-row">
            <span className="setup-label" id="liar-players">Players, in turn order</span>
            <span className="meta">{names.length} of {maxPlayers}</span>
          </div>
          <ol className="liar-names" aria-labelledby="liar-players">
            {names.map((n, i) => (
              <li key={i} className="liar-name" data-nav-row={10 + i}>
                <span className="team-index">{i + 1}</span>
                <label className="liar-grow">
                  <span className="sr-only">Player {i + 1} name</span>
                  <input className="input" value={n} maxLength={24} placeholder={`Player ${i + 1}`} data-autofocus={i === 0 ? "" : undefined} aria-invalid={tried && n.trim() === ""} onChange={(e) => setNames((p) => p.map((x, k) => (k === i ? e.target.value : x)))} />
                </label>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move player ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={16} strokeWidth={1.5} />
                </button>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move player ${i + 1} down`} disabled={i === names.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={16} strokeWidth={1.5} />
                </button>
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove player ${i + 1}`} disabled={names.length <= 1} onClick={() => setNames((p) => p.filter((_, k) => k !== i))}>
                  <X size={16} strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ol>
          <div data-nav-row={30}>
            <button type="button" className="btn btn-quiet btn-sm" disabled={names.length >= maxPlayers} onClick={() => setNames((p) => [...p, ""])}>
              <UserPlus size={16} strokeWidth={1.5} />
              Add player
            </button>
          </div>

          <div className="liar-row">
            <span className="setup-label" id="liar-rounds">Rounds</span>
            <div className="stepper" role="group" aria-labelledby="liar-rounds" data-nav-row={31}>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Fewer rounds" disabled={rounds <= LIAR_LIMITS.minRounds} onClick={() => setRounds(rounds - 1)}>
                <Minus size={18} strokeWidth={1.5} />
              </button>
              <output className="stepper-value" aria-live="polite">{rounds}</output>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="More rounds" disabled={rounds >= LIAR_LIMITS.maxRounds} onClick={() => setRounds(rounds + 1)}>
                <Plus size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <label className="switch" data-nav-row={32}>
            <span>
              Keep score
              <span className="field-hint switch-hint">Off for casual play: you finish with a recap instead of a winner</span>
            </span>
            <input type="checkbox" checked={scoring} onChange={(e) => setScoring(e.target.checked)} />
            <span className="switch-track" />
          </label>
          <label className="switch" data-nav-row={33}>
            <span>
              Allow abstaining
              <span className="field-hint switch-hint">Voters may skip when they have no idea</span>
            </span>
            <input type="checkbox" checked={abstain} onChange={(e) => setAbstain(e.target.checked)} />
            <span className="switch-track" />
          </label>

          <details className="liar-optional">
            <summary>More options</summary>
            <label className="liar-row">
              <span className="setup-label">Discussion seconds</span>
              <select className="input" value={discuss} onChange={(e) => setDiscuss(Number(e.target.value))}>
                {[30, 60, 90, 120].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            {([
              ["Hide follow-up hints", "Hardcore: the group asks its own questions", hideHints, setHideHints],
              ["Live vote totals", "Show totals while voting is open instead of at reveal", liveResults, setLiveResults],
              ["Anonymous votes", "The reveal shows totals but not who voted for what", anonymous, setAnonymous],
              ["Streak bonus", "+1 for a second correct pick in a row", streak, setStreak],
            ] as const).map(([label, hint, value, set]) => (
              <label key={label} className="switch">
                <span>
                  {label}
                  <span className="field-hint switch-hint">{hint}</span>
                </span>
                <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
                <span className="switch-track" />
              </label>
            ))}
          </details>
          <div className="liar-rules">
            <span className="setup-label">How points work</span>
            <ul>{scoreRulesFor(options).map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
          <details className="liar-optional">
            <summary>First time? How a turn works</summary>
            <ol>
              <li>The storyteller privately writes three statements and marks the lie.</li>
              <li>Statements are read out; the group asks questions.</li>
              <li>Everyone else votes for the lie. You can change your vote until the host closes voting.</li>
              <li>The reveal shows each statement, who voted for what, and the points.</li>
            </ol>
          </details>

          {tried && errors.length > 0 && (
            <div className="notice" role="alert" ref={(el) => el?.scrollIntoView({ block: "nearest" })}>
              <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          <div className="setup-actions" data-nav-row={34}>
            <button type="submit" className="btn btn-primary" aria-disabled={errors.length > 0 && names.length < minPlayers}>
              <Play size={18} strokeWidth={1.5} />
              Start game
            </button>
            {onLobby && (
              <button type="button" className="btn btn-secondary" onClick={() => onLobby(options)}>
                <Radio size={18} strokeWidth={1.5} />
                Play online instead
              </button>
            )}
          </div>
          {errors.length > 0 && <p className="field-hint">Can't start yet: {errors[0]}</p>}
        </div>
      </form>
    </main>
  );
}
