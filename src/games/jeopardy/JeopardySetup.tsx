import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Minus, Play, Plus, UserPlus, X } from "lucide-react";
import { JEOPARDY_LIMITS, countClues, type JeopardyFile } from "../../game-files/schema/jeopardy";
import type { LoadedGame } from "../../components/import/loadGame";
import { useEscape } from "../../components/navigation/spatialNav";
import { useAutoFocus } from "../../components/ui/useAutoFocus";
import type { TeamSetup } from "./jeopardyEngine";
import "./jeopardy.css";
import "./setup.css";

interface Props {
  game: LoadedGame<JeopardyFile>;
  onBack: () => void;
  onStart: (teams: TeamSetup[], allowNegativeScores: boolean, timeLimitSeconds: number) => void;
}

const TIME_OPTIONS = [0, 15, 30, 45, 60, 90, 120];
const timeLabel = (s: number) => (s === 0 ? "Off" : `${s}s`);
const ROWS_PER_TEAM = 20;
const TEAM_ROW_BASE = 10;
const SETTINGS_ROW_BASE = TEAM_ROW_BASE + ROWS_PER_TEAM * JEOPARDY_LIMITS.maxTeams;

export function JeopardySetup({ game, onBack, onStart }: Props) {
  const { file } = game;
  const [teams, setTeams] = useState<TeamSetup[]>([
    { name: "Team 1", members: [] },
    { name: "Team 2", members: [] },
  ]);
  const [allowNegative, setAllowNegative] = useState(file.settings.allowNegativeScores);
  const [timeLimit, setTimeLimit] = useState(file.settings.timeLimitSeconds);
  const root = useAutoFocus<HTMLElement>();
  const memberRefs = useRef(new Map<string, HTMLInputElement>());
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  useEscape(onBack);

  useEffect(() => {
    if (!pendingFocus) return;
    memberRefs.current.get(pendingFocus)?.focus();
    setPendingFocus(null);
  }, [pendingFocus, teams]);

  const timeOptions = TIME_OPTIONS.includes(timeLimit) ? TIME_OPTIONS : [...TIME_OPTIONS, timeLimit].sort((a, b) => a - b);
  const dailyDoubles = file.content.categories.reduce((n, c) => n + c.questions.filter((q) => q.dailyDouble).length, 0);

  const setCount = (count: number) => {
    const n = Math.max(JEOPARDY_LIMITS.minTeams, Math.min(JEOPARDY_LIMITS.maxTeams, count));
    setTeams((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? { name: `Team ${i + 1}`, members: [] }));
  };
  const updateTeam = (i: number, fn: (t: TeamSetup) => TeamSetup) => setTeams((prev) => prev.map((t, j) => (j === i ? fn(t) : t)));
  const addMember = (i: number, at?: number) => {
    const t = teams[i];
    if (t.members.length >= JEOPARDY_LIMITS.maxMembersPerTeam) return;
    const index = at ?? t.members.length;
    updateTeam(i, (team) => ({ ...team, members: [...team.members.slice(0, index), "", ...team.members.slice(index)] }));
    setPendingFocus(`${i}:${index}`);
  };
  const removeMember = (i: number, m: number) => updateTeam(i, (t) => ({ ...t, members: t.members.filter((_, k) => k !== m) }));

  const intro = `${file.content.categories.length} ${file.content.categories.length === 1 ? "category" : "categories"}, ${countClues(file)} clues`;
  const extras = [
    dailyDoubles > 0 ? `${dailyDoubles} daily ${dailyDoubles === 1 ? "double" : "doubles"}` : "",
    file.content.finalJeopardy.enabled ? "with a final question" : "",
  ].filter(Boolean);

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
          onStart(
            teams.map((t) => ({ name: t.name, members: t.members.map((m) => m.trim()).filter(Boolean) })),
            allowNegative,
            timeLimit,
          );
        }}
      >
        <div className="setup-intro">
          <p className="meta">You are about to host</p>
          <h1 className="page-title setup-title">{file.metadata.title}</h1>
          <p className="page-lede">
            {[intro, ...extras].join(", ")}. Loaded from {game.filename}
          </p>
        </div>

        <div className="setup-panel card">
          <div className="setup-row">
            <span className="setup-label" id="team-count">
              Teams
            </span>
            <div className="stepper" role="group" aria-labelledby="team-count" data-nav-row="1">
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Remove a team" disabled={teams.length <= JEOPARDY_LIMITS.minTeams} onClick={() => setCount(teams.length - 1)}>
                <Minus size={18} strokeWidth={1.5} />
              </button>
              <output className="stepper-value" aria-live="polite">
                {teams.length}
              </output>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Add a team" disabled={teams.length >= JEOPARDY_LIMITS.maxTeams} onClick={() => setCount(teams.length + 1)}>
                <Plus size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <div className="team-cards">
            {teams.map((team, i) => {
              const base = TEAM_ROW_BASE + i * ROWS_PER_TEAM;
              return (
                <div key={i} className="team-card">
                  <label className="team-field" data-nav-row={base}>
                    <span className="team-index">{i + 1}</span>
                    <span className="sr-only">Team {i + 1} name</span>
                    <input
                      className="input"
                      value={team.name}
                      maxLength={24}
                      placeholder={`Team ${i + 1}`}
                      onChange={(e) => updateTeam(i, (t) => ({ ...t, name: e.target.value }))}
                    />
                  </label>
                  <div className="member-list">
                    {team.members.map((member, m) => (
                      <div key={m} className="member-row" data-nav-row={base + 1 + m}>
                        <span className="sr-only">
                          Team {i + 1} member {m + 1}
                        </span>
                        <input
                          className="input"
                          value={member}
                          maxLength={24}
                          placeholder={`Member ${m + 1}`}
                          ref={(el) => {
                            if (el) memberRefs.current.set(`${i}:${m}`, el);
                            else memberRefs.current.delete(`${i}:${m}`);
                          }}
                          onChange={(e) => updateTeam(i, (t) => ({ ...t, members: t.members.map((x, k) => (k === m ? e.target.value : x)) }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addMember(i, m + 1);
                            }
                          }}
                        />
                        <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove team ${i + 1} member ${m + 1}`} onClick={() => removeMember(i, m)}>
                          <X size={16} strokeWidth={1.5} />
                        </button>
                      </div>
                    ))}
                    <div className="member-add" data-nav-row={base + 1 + team.members.length}>
                      <button type="button" className="btn btn-quiet btn-sm" disabled={team.members.length >= JEOPARDY_LIMITS.maxMembersPerTeam} onClick={() => addMember(i)}>
                        <UserPlus size={16} strokeWidth={1.5} />
                        Add member
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="setup-field">
            <span className="setup-label" id="time-limit">
              Time per clue
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="time-limit" data-nav-row={SETTINGS_ROW_BASE}>
              {timeOptions.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={timeLimit === s} className={`segment${timeLimit === s ? " is-active" : ""}`} onClick={() => setTimeLimit(s)}>
                  {timeLabel(s)}
                </button>
              ))}
            </div>
            <span className="field-hint">Clues with their own time limit keep it.</span>
          </div>

          <label className="switch" data-nav-row={SETTINGS_ROW_BASE + 1}>
            <span>
              Allow negative scores
              <span className="field-hint switch-hint">Wrong answers can take a team below zero</span>
            </span>
            <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
            <span className="switch-track" />
          </label>

          <div className="setup-actions" data-nav-row={SETTINGS_ROW_BASE + 2}>
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
