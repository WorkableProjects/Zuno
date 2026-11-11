import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Copy } from "lucide-react";
import { JEOPARDY_TYPE, buildJeopardyGuide } from "../../game-files/schema/jeopardy";
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
  "Copy the guide and paste it into ChatGPT, Gemini or another AI assistant",
  "Add your topic, difficulty and any special requests at the end",
  "Save the reply as a file ending in .zuno.json, or copy the JSON",
  "Import it here. Zuno checks it and shows a preview before you host",
];

export function JeopardyAIGuide({ onBack, onHost, onLoaded }: Props) {
  const guide = useMemo(buildJeopardyGuide, []);
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

          <div className="ai-actions" data-nav-row="1">
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
