import { useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, Eye, EyeOff, Minus, Play, Plus, Shuffle } from "lucide-react";
import {
  HEADBANDS_LIMITS,
  eligibleIdentities,
  exclusionReasons,
  type HeadbandsFile,
  type HeadbandsMode,
} from "../../game-files/schema/headbands";
import type { LoadedGame } from "../../components/import/loadGame";
import { useEscape } from "../../components/navigation/spatialNav";
import { useAutoFocus } from "../../components/ui/useAutoFocus";
import { IdentityCard } from "./IdentityCard";
import { deckOf, randomAssign, setupProblems, type PlayerSetup, type Rules } from "./headbandsEngine";
import "../jeopardy/jeopardy.css";
import "../jeopardy/setup.css";
import "./headbands.css";

export interface HeadbandsStart {
  players: PlayerSetup[];
  mode: HeadbandsMode;
  rules: Rules;
}

interface Props {
  game: LoadedGame<HeadbandsFile>;
  onBack: () => void;
  onStart: (start: HeadbandsStart) => void;
}

type Method = "random" | "manual";

const PLAYER_ROW_BASE = 20;

export function HeadbandsSetup({ game, onBack, onStart }: Props) {
  const { file } = game;
  const deck = useMemo(() => deckOf(file.content.identities), [file]);
  const textCount = eligibleIdentities(file, "text").length;
  const imageCount = eligibleIdentities(file, "image").length;
  const maxPlayers = Math.min(file.settings.maxPlayers, HEADBANDS_LIMITS.maxPlayers);
  const allowDuplicates = file.settings.allowDuplicateAssignments;

  const [mode, setMode] = useState<HeadbandsMode>(file.settings.defaultMode === "image" && imageCount >= 2 ? "image" : "text");
  const [names, setNames] = useState<string[]>(["Player 1", "Player 2", "Player 3"].slice(0, Math.max(2, Math.min(3, maxPlayers))));
  const [method, setMethod] = useState<Method>("random");
  const [showDeal, setShowDeal] = useState(false);
  const [rules, setRules] = useState<Rules>({ continueAfterYes: file.settings.continueAfterYes, unlimitedGuesses: file.settings.unlimitedGuesses });
  const deal = (count: number, m: HeadbandsMode) => randomAssign(count, eligibleIdentities(file, m), allowDuplicates) ?? Array.from({ length: count }, () => "");
  const [assigned, setAssigned] = useState<string[]>(() => deal(names.length, mode));
  const root = useAutoFocus<HTMLElement>();
  useEscape(onBack);

  const eligible = eligibleIdentities(file, mode);
  const excluded = exclusionReasons(file, mode);
  const players: PlayerSetup[] = names.map((name, i) => ({ name, identityId: assigned[i] ?? "" }));
  const problems = setupProblems({ players, mode, deck, allowDuplicates, maxPlayers });

  const changeMode = (m: HeadbandsMode) => {
    setMode(m);
    if (method === "random") setAssigned(deal(names.length, m));
    else setAssigned((list) => list.map((id) => (id && eligibleIdentities(file, m).some((i) => i.id === id) ? id : "")));
  };
  const setCount = (count: number) => {
    const n = Math.max(HEADBANDS_LIMITS.minPlayers, Math.min(maxPlayers, count));
    setNames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? `Player ${i + 1}`));
    if (method === "random") setAssigned(deal(n, mode));
    else setAssigned((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ""));
  };
  const changeMethod = (m: Method) => {
    setMethod(m);
    if (m === "random") setAssigned(deal(names.length, mode));
  };
  const takenBy = (id: string, except: number) => assigned.some((a, j) => j !== except && a === id);

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
          if (problems.length === 0) onStart({ players: players.map((p) => ({ ...p, name: p.name.trim() })), mode, rules });
        }}
      >
        <div className="setup-intro">
          <p className="meta">You are about to host</p>
          <h1 className="page-title setup-title">{file.metadata.title}</h1>
          {file.metadata.description && <p className="page-lede">{file.metadata.description}</p>}
          <p className="meta">
            {textCount} text and {imageCount} image {imageCount + textCount === 1 ? "identity" : "identities"}. Loaded from {game.filename}
          </p>
          <div className="hb-howto">
            <p>Each player gets an identity everyone else can see. On your turn, ask the group one yes-or-no question, or make a guess.</p>
            <p>This screen shows the deal to the host. Keep it away from the players.</p>
          </div>
        </div>

        <div className="setup-panel card">
          <div className="setup-field">
            <span className="setup-label" id="hb-mode">
              Identities
            </span>
            <div className="hb-modes" role="radiogroup" aria-labelledby="hb-mode" data-nav-row="1">
              <button type="button" role="radio" aria-checked={mode === "text"} className={`hb-mode${mode === "text" ? " is-on" : ""}`} onClick={() => changeMode("text")}>
                <span className="hb-mode-title">Text</span>
                <span className="hb-mode-text">Guess a word or phrase</span>
                <span className="meta">{textCount} in this deck</span>
              </button>
              <button type="button" role="radio" aria-checked={mode === "image"} className={`hb-mode${mode === "image" ? " is-on" : ""}`} onClick={() => changeMode("image")}>
                <span className="hb-mode-title">Images</span>
                <span className="hb-mode-text">Guess from a picture with its answer underneath</span>
                <span className="meta">{imageCount} in this deck</span>
              </button>
            </div>
            {excluded.length > 0 && (
              <div className="notice">
                <CircleAlert size={18} strokeWidth={1.5} />
                <div>
                  <p className="notice-title">
                    {excluded.length} {excluded.length === 1 ? "identity is" : "identities are"} left out of Image Mode
                  </p>
                  <ul className="error-list">
                    {excluded.slice(0, 4).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                    {excluded.length > 4 && <li>And {excluded.length - 4} more</li>}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="setup-row">
            <span className="setup-label" id="hb-count">
              Players
            </span>
            <div className="stepper" role="group" aria-labelledby="hb-count" data-nav-row="2">
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Remove a player" disabled={names.length <= HEADBANDS_LIMITS.minPlayers} onClick={() => setCount(names.length - 1)}>
                <Minus size={18} strokeWidth={1.5} />
              </button>
              <output className="stepper-value" aria-live="polite">
                {names.length}
              </output>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Add a player" disabled={names.length >= maxPlayers} onClick={() => setCount(names.length + 1)}>
                <Plus size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
          <p className="field-hint hb-tight">From 2 to {maxPlayers}. The host can play too, or only run the game. Turns follow this order.</p>

          <div className="setup-field">
            <span className="setup-label" id="hb-method">
              Deal
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="hb-method" data-nav-row="3">
              <button type="button" role="radio" aria-checked={method === "random"} className={`segment${method === "random" ? " is-active" : ""}`} onClick={() => changeMethod("random")}>
                Shuffle
              </button>
              <button type="button" role="radio" aria-checked={method === "manual"} className={`segment${method === "manual" ? " is-active" : ""}`} onClick={() => changeMethod("manual")}>
                Pick for each player
              </button>
            </div>
            {method === "random" && (
              <div className="hb-deal-tools" data-nav-row="4">
                <button type="button" className="btn btn-secondary btn-sm" disabled={eligible.length === 0} onClick={() => setAssigned(deal(names.length, mode))}>
                  <Shuffle size={16} strokeWidth={1.5} />
                  Shuffle again
                </button>
                <button type="button" className="btn btn-quiet btn-sm" aria-pressed={showDeal} onClick={() => setShowDeal((v) => !v)}>
                  {showDeal ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  {showDeal ? "Hide the deal" : "Show the deal"}
                </button>
                <span className="field-hint">Hidden by default, so the host can play too.</span>
              </div>
            )}
          </div>

          <ol className="hb-players">
            {names.map((name, i) => {
              const id = assigned[i] ?? "";
              const identity = id ? deck.get(id) : undefined;
              return (
                <li key={i} className="hb-player-row" data-nav-row={PLAYER_ROW_BASE + i}>
                  <span className="team-index">{i + 1}</span>
                  <label className="hb-player-name">
                    <span className="sr-only">Player {i + 1} name</span>
                    <input
                      className="input"
                      value={name}
                      maxLength={24}
                      placeholder={`Player ${i + 1}`}
                      aria-invalid={name.trim() === ""}
                      onChange={(e) => setNames((list) => list.map((n, j) => (j === i ? e.target.value : n)))}
                    />
                  </label>
                  {method === "manual" ? (
                    <label className="hb-player-pick">
                      <span className="sr-only">Identity for player {i + 1}</span>
                      <select className="select" value={id} onChange={(e) => setAssigned((list) => list.map((a, j) => (j === i ? e.target.value : a)))}>
                        <option value="">Choose an identity</option>
                        {eligible.map((opt) => {
                          const taken = takenBy(opt.id, i) && !(allowDuplicates && opt.allowDuplicate);
                          return (
                            <option key={opt.id} value={opt.id} disabled={taken}>
                              {mode === "image" ? opt.subtext : opt.text}
                              {taken ? " (taken)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  ) : identity && showDeal ? (
                    <span className="hb-player-card">
                      <IdentityCard identity={identity} mode={mode} size="sm" />
                    </span>
                  ) : (
                    <span className="hb-player-deal meta">{identity ? "Dealt" : "Not dealt"}</span>
                  )}
                  {method === "manual" && identity && mode === "image" && (
                    <span className="hb-player-card is-below">
                      <IdentityCard identity={identity} mode={mode} size="sm" />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="setup-field">
            <span className="setup-label">Rules</span>
            <label className="switch" data-nav-row="40">
              <span>
                Continue after Yes
                <span className="field-hint switch-hint">When the group answers Yes, the same player asks again. Off: every question ends the turn.</span>
              </span>
              <input type="checkbox" checked={rules.continueAfterYes} onChange={(e) => setRules((r) => ({ ...r, continueAfterYes: e.target.checked }))} />
              <span className="switch-track" />
            </label>
            <label className="switch" data-nav-row="41">
              <span>
                Unlimited guesses
                <span className="field-hint switch-hint">A wrong guess keeps the turn. Off: a wrong guess ends it.</span>
              </span>
              <input type="checkbox" checked={rules.unlimitedGuesses} onChange={(e) => setRules((r) => ({ ...r, unlimitedGuesses: e.target.checked }))} />
              <span className="switch-track" />
            </label>
          </div>

          <div aria-live="polite">
            {problems.length === 0 ? (
              <div className="notice notice-ok">
                <CircleCheck size={18} strokeWidth={1.5} />
                <p>
                  {names.length} players, each with their own identity. Ready to start.
                </p>
              </div>
            ) : (
              <div className="notice notice-error">
                <CircleAlert size={18} strokeWidth={1.5} />
                <ul className="error-list">
                  {problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="setup-actions" data-nav-row="50">
            <button type="submit" className="btn btn-primary" data-autofocus disabled={problems.length > 0}>
              <Play size={18} strokeWidth={1.5} />
              Start game
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
