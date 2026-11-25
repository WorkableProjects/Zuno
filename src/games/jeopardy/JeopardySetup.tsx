import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, GripVertical, Minus, Play, Plus, UserPlus, X } from "lucide-react";
import { JEOPARDY_LIMITS, countClues, type JeopardyFile } from "../../game-files/schema/jeopardy";
import type { LoadedGame } from "../../components/import/loadGame";
import { useEscape } from "../../components/navigation/spatialNav";
import { useAutoFocus } from "../../components/ui/useAutoFocus";
import { boardProblems, type TeamSetup } from "./jeopardyEngine";
import "./jeopardy.css";
import "./setup.css";
import { gameFontStyle } from "../gameFont";
import { GameScene } from "../scenes/GameScene";

interface Props {
  game: LoadedGame<JeopardyFile>;
  onBack: () => void;
  onStart: (teams: TeamSetup[], allowNegativeScores: boolean, timeLimitSeconds: number) => void;
}

type Preset = "classic" | "quick" | "tournament" | "custom";
const PRESETS: Array<{ id: Preset; title: string; text: string; time?: number; negative?: boolean }> = [
  { id: "classic", title: "Classic", text: "6 categories, 5 clues each, 30-second response timer.", time: 30 },
  { id: "quick", title: "Quick", text: "5 categories, 4 clues each, 20-second timer.", time: 20 },
  { id: "tournament", title: "Tournament", text: "Strict scoring with negative scores and the final question.", time: 30, negative: true },
  { id: "custom", title: "Custom", text: "Set every option yourself." },
];
const COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777"];
const initialsOf = (name: string) => name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "T";
const newTeam = (i: number): TeamSetup => ({ name: `Team ${i + 1}`, members: [], color: COLORS[i % COLORS.length] });

const TIME_OPTIONS = [0, 15, 30, 45, 60, 90, 120];
const timeLabel = (s: number) => (s === 0 ? "Off" : `${s}s`);
const ROWS_PER_TEAM = 20;
const TEAM_ROW_BASE = 10;
const SETTINGS_ROW_BASE = TEAM_ROW_BASE + ROWS_PER_TEAM * JEOPARDY_LIMITS.maxTeams;

export function JeopardySetup({ game, onBack, onStart }: Props) {
  const { file } = game;
  const [teams, setTeams] = useState<TeamSetup[]>([newTeam(0), newTeam(1)]);
  const [preset, setPreset] = useState<Preset>("custom");
  const [showDD, setShowDD] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [triedStart, setTriedStart] = useState(false);
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
    setTeams((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? newTeam(i)));
  };
  const updateTeam = (i: number, fn: (t: TeamSetup) => TeamSetup) => setTeams((prev) => prev.map((t, j) => (j === i ? fn(t) : t)));
  const addMember = (i: number, at?: number) => {
    const t = teams[i];
    if (t.members.length >= JEOPARDY_LIMITS.maxMembersPerTeam) return;
    const index = at ?? t.members.length;
    updateTeam(i, (team) => ({ ...team, members: [...team.members.slice(0, index), "", ...team.members.slice(index)] }));
    setPendingFocus(`${i}:${index}`);
  };
  const moveTeam = (from: number, to: number) => {
    if (to < 0 || to >= teams.length || from === to) return;
    setTeams((prev) => {
      const next = [...prev];
      const [t] = next.splice(from, 1);
      next.splice(to, 0, t);
      return next;
    });
  };
  const duplicateTeam = (i: number) => {
    if (teams.length >= JEOPARDY_LIMITS.maxTeams) return;
    setTeams((prev) => [...prev.slice(0, i + 1), { ...prev[i], name: `${prev[i].name} 2`, color: COLORS[prev.length % COLORS.length] }, ...prev.slice(i + 1)]);
  };
  const applyPreset = (id: Preset) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id)!;
    if (p.time !== undefined) setTimeLimit(p.time);
    if (p.negative !== undefined) setAllowNegative(p.negative);
    else if (id !== "custom") setAllowNegative(file.settings.allowNegativeScores);
  };

  // Validation: duplicate or empty team names, and unplayable clue data.
  const nameKey = (t: TeamSetup, i: number) => (t.name.trim() || `Team ${i + 1}`).toLowerCase();
  const dupes = teams.map((t, i) => teams.some((o, j) => j !== i && nameKey(o, j) === nameKey(t, i)));
  const problems = boardProblems(file);
  const firstInvalid = dupes.indexOf(true);
  const blockReason = firstInvalid >= 0 ? `Two teams are named "${teams[firstInvalid].name.trim()}". Give each team a different name.` : problems.length > 0 ? `This game file has a problem: ${problems[0]}` : "";
  const categories = file.content.categories;
  const rows = Math.max(0, ...categories.map((c) => c.questions.length));
  const final = file.content.finalJeopardy;
  const removeMember = (i: number, m: number) => updateTeam(i, (t) => ({ ...t, members: t.members.filter((_, k) => k !== m) }));

  const intro = `${file.content.categories.length} ${file.content.categories.length === 1 ? "category" : "categories"}, ${countClues(file)} clues`;
  const extras = [
    dailyDoubles > 0 ? `${dailyDoubles} daily ${dailyDoubles === 1 ? "double" : "doubles"}` : "",
    file.content.finalJeopardy.enabled ? "with a final question" : "",
  ].filter(Boolean);

  return (
    <main className="screen game-scope" ref={root} style={{ "--game": file.appearance.accentColor, ...gameFontStyle("jeopardy") } as React.CSSProperties}>
      <GameScene game="jeopardy" />
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
          setTriedStart(true);
          if (blockReason) {
            if (firstInvalid >= 0) {
              const el = document.getElementById(`team-name-${firstInvalid}`);
              el?.scrollIntoView({ block: "center", behavior: "smooth" });
              el?.focus();
            }
            return;
          }
          onStart(
            teams.map((t) => ({ name: t.name, members: t.members.map((m) => m.trim()).filter(Boolean), color: t.color, initials: (t.initials?.trim() || initialsOf(t.name)).slice(0, 2).toUpperCase() })),
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
          <p className="meta">
            {JEOPARDY_LIMITS.minTeams}–{JEOPARDY_LIMITS.maxTeams} teams · about {Math.max(10, Math.round(countClues(file) * 1.2))} minutes · Teams pick clues from the board and score points for right answers.
          </p>
        </div>

        <div className="setup-panel card">
          <span className="setup-label" id="preset-label">
            Mode
          </span>
          <div className="preset-cards" role="radiogroup" aria-labelledby="preset-label" data-nav-row="2">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={`preset-card${preset === p.id ? " is-active" : ""}`} onClick={() => applyPreset(p.id)}>
                <strong>{p.title}</strong>
                <span className="field-hint">{p.text}</span>
              </button>
            ))}
          </div>
          {(preset === "classic" || preset === "quick") && (
            <p className="field-hint">The board comes from your game file ({categories.length} × {rows}). Presets set timing and scoring.</p>
          )}

          <div className="board-preview" aria-label={`Board preview: ${categories.length} categories, up to ${rows} clues each`} style={{ "--cols": categories.length } as React.CSSProperties}>
            {categories.map((c) => (
              <div key={c.id} className="preview-col">
                <span className="preview-head" title={c.title}>
                  {c.title}
                </span>
                {c.questions.map((q) => (
                  <span key={q.id} className={`preview-cell${showDD && q.dailyDouble ? " is-dd" : ""}`}>
                    {q.value}
                    {showDD && q.dailyDouble && <span className="sr-only"> Daily Double</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
          {dailyDoubles > 0 && (
            <label className="switch" data-nav-row="3">
              <span>Show Daily Double placement (host only)</span>
              <input type="checkbox" checked={showDD} onChange={(e) => setShowDD(e.target.checked)} />
              <span className="switch-track" />
            </label>
          )}
          <p className="field-hint">
            Final question:{" "}
            {final.enabled ? (final.mode === "always" ? `played by every team with wagers, category "${final.category}"` : `only to break a tie for first, category "${final.category}"`) : "off"}
            {final.enabled && file.settings.finalTimeLimitSeconds > 0 ? `, ${file.settings.finalTimeLimitSeconds}s timer` : ""}.
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
                <div
                  key={i}
                  className={`team-card${dragFrom === i ? " is-dragging" : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom !== null) moveTeam(dragFrom, i);
                    setDragFrom(null);
                  }}
                >
                  <div className="team-tools" data-nav-row={base - 1}>
                    <span className="drag-handle" draggable aria-hidden="true" title="Drag to reorder" onDragStart={() => setDragFrom(i)} onDragEnd={() => setDragFrom(null)}>
                      <GripVertical size={18} strokeWidth={1.5} />
                    </span>
                    <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move team ${i + 1} up`} title="Move up" disabled={i === 0} onClick={() => moveTeam(i, i - 1)}>
                      <ArrowUp size={16} strokeWidth={1.5} />
                    </button>
                    <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move team ${i + 1} down`} title="Move down" disabled={i === teams.length - 1} onClick={() => moveTeam(i, i + 1)}>
                      <ArrowDown size={16} strokeWidth={1.5} />
                    </button>
                    <button type="button" className="icon-btn icon-btn-sm" aria-label={`Duplicate team ${i + 1}`} title="Duplicate team" disabled={teams.length >= JEOPARDY_LIMITS.maxTeams} onClick={() => duplicateTeam(i)}>
                      <Copy size={16} strokeWidth={1.5} />
                    </button>
                    <label className="team-color" title="Team color">
                      <span className="sr-only">Team {i + 1} color</span>
                      <input type="color" value={team.color ?? COLORS[i % COLORS.length]} onChange={(e) => updateTeam(i, (t) => ({ ...t, color: e.target.value }))} />
                    </label>
                    <label className="team-initials">
                      <span className="sr-only">Team {i + 1} initials</span>
                      <input className="input" value={team.initials ?? ""} maxLength={2} placeholder={initialsOf(team.name)} onChange={(e) => updateTeam(i, (t) => ({ ...t, initials: e.target.value.toUpperCase() }))} />
                    </label>
                  </div>
                  <label className="team-field" data-nav-row={base}>
                    <span className="team-index" style={{ background: team.color }}>
                      {i + 1}
                    </span>
                    <span className="sr-only">Team {i + 1} name</span>
                    <input
                      id={`team-name-${i}`}
                      className="input"
                      aria-invalid={dupes[i] || undefined}
                      aria-describedby={dupes[i] ? `team-dupe-${i}` : undefined}
                      value={team.name}
                      maxLength={24}
                      placeholder={`Team ${i + 1}`}
                      onChange={(e) => updateTeam(i, (t) => ({ ...t, name: e.target.value }))}
                    />
                  </label>
                  {dupes[i] && (
                    <span id={`team-dupe-${i}`} className="field-error" role="alert">
                      Another team already uses this name
                    </span>
                  )}
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

          <details className="setup-optional">
          <summary data-nav-row={SETTINGS_ROW_BASE - 1}>More options (timer, scoring)</summary>
          <div className="setup-field">
            <span className="setup-label" id="time-limit">
              Time per clue
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="time-limit" data-nav-row={SETTINGS_ROW_BASE}>
              {timeOptions.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={timeLimit === s} className={`segment${timeLimit === s ? " is-active" : ""}`} onClick={() => {
                    setTimeLimit(s);
                    setPreset("custom");
                  }}>
                  {timeLabel(s)}
                </button>
              ))}
            </div>
            <span className="field-hint">Off means no timer, for informal play. Clues with their own time limit keep it. Running out of time never changes a score.</span>
          </div>

          <label className="switch" data-nav-row={SETTINGS_ROW_BASE + 1}>
            <span>
              Allow negative scores
              <span className="field-hint switch-hint">Wrong answers can take a team below zero</span>
            </span>
            <input type="checkbox" checked={allowNegative} onChange={(e) => {
                setAllowNegative(e.target.checked);
                setPreset("custom");
              }} />
            <span className="switch-track" />
          </label>
          </details>

          <div className="setup-actions" data-nav-row={SETTINGS_ROW_BASE + 2}>
            <button type="submit" className="btn btn-primary" data-autofocus aria-disabled={blockReason ? true : undefined} aria-describedby={blockReason ? "start-block" : undefined}>
              <Play size={18} strokeWidth={1.5} />
              Start game
            </button>
            {blockReason && (
              <p id="start-block" className={triedStart ? "field-error" : "field-hint"} role={triedStart ? "alert" : undefined}>
                {blockReason}
              </p>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}
