import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Copy } from "lucide-react";
import { DEFAULT_GUIDE_OPTIONS, JEOPARDY_TYPE, buildJeopardyGuide, type GuideOptions } from "../../game-files/schema/jeopardy";
import { GameImporter } from "../import/GameImporter";
import type { LoadedGame } from "../import/loadGame";
import { useEscape } from "../navigation/spatialNav";
import { useAutoFocus } from "../ui/useAutoFocus";
import "./builder.css";

interface Props {
  onBack: () => void;
  onHost: (game: LoadedGame) => void;
  onLoaded: (game: LoadedGame | null) => void;
}

const STEPS = [
  "Pick the game options below, then copy the guide into ChatGPT, Gemini or another AI assistant",
  "Add your topic, difficulty and any special requests at the end",
  "Save the reply as a file ending in .zuno.json, or copy the JSON",
  "Import it here. Zuno checks it and shows a preview before you host",
];

const DAILY_DOUBLES: Array<[string, number | null]> = [
  ["Auto", null],
  ["None", 0],
  ["1", 1],
  ["2", 2],
  ["3", 3],
];
const CLUE_TIMES = [0, 15, 30, 45, 60, 90, 120];
const FINAL_TIMES = [0, 30, 60, 90, 120];
const FINAL_MODES: Array<[string, GuideOptions["finalMode"]]> = [
  ["Off", "off"],
  ["At the end", "always"],
  ["Tiebreaker only", "tiebreaker"],
];
const secondsLabel = (n: number) => (n === 0 ? "Off" : `${n}s`);

function Segmented<T>({ label, hint, options, value, onChange, row }: { label: string; hint?: string; options: Array<[string, T]>; value: T; onChange: (v: T) => void; row: number }) {
  return (
    <div className="ai-option">
      <span className="field-label" id={`ai-opt-${row}`}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={`ai-opt-${row}`} data-nav-row={row}>
        {options.map(([text, v]) => (
          <button key={text} type="button" role="radio" aria-checked={v === value} className={`segment${v === value ? " is-active" : ""}`} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function JeopardyAIGuide({ onBack, onHost, onLoaded }: Props) {
  const [options, setOptions] = useState<GuideOptions>(DEFAULT_GUIDE_OPTIONS);
  const [linksText, setLinksText] = useState("");
  const set = <K extends keyof GuideOptions>(key: K, value: GuideOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));
  const links = useMemo(() => linksText.split("\n").map((l) => l.trim()).filter(Boolean), [linksText]);
  const badLinks = links.filter((l) => !/^https:\/\/\S+$/i.test(l)).length;
  const guide = useMemo(() => buildJeopardyGuide({ ...options, imageLinks: links }), [options, links]);
  const [copied, setCopied] = useState(false);
  const [denied, setDenied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef(0);
  const root = useAutoFocus<HTMLElement>();
  useEscape(onBack);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(guide);
      setDenied(false);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2600);
    } catch {
      // No clipboard access: show the guide so it can be copied by hand.
      setDenied(true);
      setShowGuide(true);
      requestAnimationFrame(() => {
        area.current?.focus();
        area.current?.select();
      });
    }
  };

  return (
    <main className="screen" ref={root}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">AI Builder</span>
      </header>

      <div className="ai-layout">
        <section className="ai-guide">
          <h1 className="page-title">Let an assistant draft the file</h1>
          <p className="page-lede">
            Zuno has no built-in AI. You copy a guide, an assistant you already use writes the game file, and you bring it back here.
          </p>

          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={i}>
                <span className="step-n">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>

          <section className="ai-options card" aria-label="Game options">
            <Segmented
              row={2}
              label="Daily doubles"
              hint="Auto lets the assistant place 1 or 2."
              options={DAILY_DOUBLES}
              value={options.dailyDoubles}
              onChange={(v) => set("dailyDoubles", v)}
            />
            <Segmented row={3} label="Time per clue" options={CLUE_TIMES.map((n) => [secondsLabel(n), n])} value={options.timeLimitSeconds} onChange={(v) => set("timeLimitSeconds", v)} />
            <Segmented
              row={4}
              label="Final question"
              hint={options.finalMode === "tiebreaker" ? "Only played when teams tie for first. A right answer adds 1 point." : undefined}
              options={FINAL_MODES}
              value={options.finalMode}
              onChange={(v) => set("finalMode", v)}
            />
            {options.finalMode !== "off" && (
              <Segmented row={5} label="Final question time" options={FINAL_TIMES.map((n) => [secondsLabel(n), n])} value={options.finalTimeLimitSeconds} onChange={(v) => set("finalTimeLimitSeconds", v)} />
            )}
            <label className="switch" data-nav-row="6">
              <span>
                Use math notation
                <span className="field-hint switch-hint">Formulas and fractions written in LaTeX, shown as real math during play</span>
              </span>
              <input type="checkbox" checked={options.useMath} onChange={(e) => set("useMath", e.target.checked)} />
              <span className="switch-track" />
            </label>
            <label className="ai-option" data-nav-row="7">
              <span className="field-label">Image links</span>
              <textarea
                className="textarea ai-links"
                rows={3}
                value={linksText}
                placeholder="https://example.com/diagram.png"
                onChange={(e) => setLinksText(e.target.value)}
              />
              <span className="field-hint">
                {badLinks > 0
                  ? `${badLinks} ${badLinks === 1 ? "line is" : "lines are"} not an https link and will be skipped.`
                  : "One https link per line. The assistant attaches each to the clue or answer it fits. You can also add or upload images later in the visual editor."}
              </span>
            </label>
          </section>

          <div className="ai-actions" data-nav-row="10">
            <button type="button" className="btn btn-primary" data-autofocus onClick={() => void copy()}>
              {copied ? <Check size={18} strokeWidth={1.5} /> : <Copy size={18} strokeWidth={1.5} />}
              {copied ? "Guide copied" : "Copy Guide"}
            </button>
            <button type="button" className="btn btn-quiet" aria-expanded={showGuide} onClick={() => setShowGuide((v) => !v)}>
              {showGuide ? "Hide the guide" : "Read the guide"}
            </button>
          </div>
          <p className="sr-only" role="status">
            {copied ? "Guide copied to the clipboard" : ""}
          </p>

          {denied && (
            <div className="notice" role="alert">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>Your browser blocked clipboard access. The guide is selected below, so you can copy it yourself.</p>
            </div>
          )}
          {showGuide && (
            <textarea ref={area} className="textarea guide-text" readOnly aria-label="Guide for the AI assistant" value={guide} onFocus={(e) => e.currentTarget.select()} />
          )}

          <p className="meta ai-note">
            Assistants sometimes return JSON with mistakes. If Zuno reports a problem, send its message back to the assistant and ask for a corrected file.
          </p>
        </section>

        <section className="ai-import" aria-label="Import the generated file">
          <GameImporter gameType={JEOPARDY_TYPE} allowPaste onHost={onHost} onLoaded={onLoaded} />
        </section>
      </div>
    </main>
  );
}
