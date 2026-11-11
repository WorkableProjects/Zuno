import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, FileJson, Play, Upload } from "lucide-react";
import { LIMITS, formatBytes } from "../../game-files/schema/common";
import { countClues, type JeopardyFile } from "../../game-files/schema/jeopardy";
import { loadGameFile, loadGameText, type LoadResult, type LoadedGame } from "./loadGame";
import "./import.css";

export interface ImportSeed {
  filename: string;
  /** Text to validate straight away, or null when the file must be picked again. */
  text: string | null;
}

interface Props {
  gameType: string;
  seed?: ImportSeed;
  allowPaste?: boolean;
  onHost: (game: LoadedGame) => void;
  onBuilder?: () => void;
  /** Lets the shell follow the loaded game, for example to change the backdrop. */
  onLoaded?: (game: LoadedGame | null) => void;
}

type State = { status: "idle" } | { status: "checking"; filename: string } | { status: "error"; filename: string; errors: string[] } | { status: "ready"; game: LoadedGame };

export function GameImporter({ gameType, seed, allowPaste, onHost, onBuilder, onLoaded }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const hostButton = useRef<HTMLButtonElement>(null);
  const run = useRef(0);

  const settle = useCallback(
    async (filename: string, work: Promise<LoadResult>) => {
      const id = ++run.current;
      setState({ status: "checking", filename });
      const result = await work;
      if (id !== run.current) return; // A newer file won.
      if (result.ok) {
        setState({ status: "ready", game: result.game });
        onLoaded?.(result.game);
      } else {
        setState({ status: "error", filename, errors: result.errors });
        onLoaded?.(null);
      }
    },
    [onLoaded],
  );

  useEffect(() => {
    if (seed?.text) void settle(seed.filename, loadGameText(seed.text, seed.filename, gameType));
    // Seed is read once, when the importer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.status === "ready") hostButton.current?.focus({ preventScroll: true });
  }, [state.status]);

  const pick = () => input.current?.click();
  const reset = () => {
    run.current++;
    setState({ status: "idle" });
    onLoaded?.(null);
    setPasteOpen(false);
  };

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void settle(file.name, loadGameFile(file, gameType));
  };

  const loadSample = async () => {
    const filename = "science-review.zuno.json";
    const work = fetch(`${import.meta.env.BASE_URL}samples/${filename}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then((text) => loadGameText(text, filename, gameType))
      .catch((): LoadResult => ({ ok: false, errors: ["The sample file could not be downloaded. Check your connection and try again."] }));
    await settle(filename, work);
  };

  return (
    <div
      className={`importer${dragging ? " is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {(state.status === "idle" || state.status === "checking") && (
        <div className="dropzone card">
          <FileJson size={32} strokeWidth={1.5} className="dropzone-icon" />
          {state.status === "checking" ? (
            <p className="dropzone-title" role="status">
              Checking {state.filename}
            </p>
          ) : (
            <>
              <p className="dropzone-title">{seed && !seed.text ? `Choose ${seed.filename} again` : "No game file loaded yet"}</p>
              <p className="dropzone-text">
                {seed && !seed.text
                  ? "Zuno remembers this game but did not keep the file. Pick it from your device to host it."
                  : "Drop a .zuno.json file here, or choose one from your device."}
              </p>
              <div className="dropzone-actions" data-nav-row="1">
                <button type="button" className="btn btn-primary" data-autofocus onClick={pick}>
                  <Upload size={18} strokeWidth={1.5} />
                  Import game file
                </button>
                {onBuilder && (
                  <button type="button" className="btn btn-secondary" onClick={onBuilder}>
                    Build a game
                  </button>
                )}
              </div>
              <p className="meta">JSON, up to {formatBytes(LIMITS.maxFileBytes)}. The file stays on this device.</p>
              <div className="dropzone-more" data-nav-row="2">
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => void loadSample()}>
                  Load the sample game
                </button>
                {allowPaste && (
                  <button type="button" className="btn btn-quiet btn-sm" aria-expanded={pasteOpen} onClick={() => setPasteOpen((v) => !v)}>
                    Paste JSON instead
                  </button>
                )}
              </div>
              {allowPaste && pasteOpen && (
                <div className="paste">
                  <label className="sr-only" htmlFor="paste-json">
                    Game file JSON
                  </label>
                  <textarea
                    id="paste-json"
                    className="textarea paste-area"
                    spellCheck={false}
                    placeholder="Paste the JSON from your assistant"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={pasted.trim() === ""}
                    onClick={() => void settle("pasted-game.zuno.json", loadGameText(pasted, "pasted-game.zuno.json", gameType))}
                  >
                    Check this JSON
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {state.status === "error" && (
        <div className="import-result">
          <div className="notice notice-error" role="alert">
            <CircleAlert size={18} strokeWidth={1.5} />
            <div>
              <p className="notice-title">
                {state.filename} cannot be hosted yet. {state.errors.length === 1 ? "One thing needs fixing" : `${state.errors.length} things need fixing`}
              </p>
              <ul className="error-list">
                {state.errors.slice(0, 12).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {state.errors.length > 12 && <li>And {state.errors.length - 12} more</li>}
              </ul>
            </div>
          </div>
          <div className="import-actions" data-nav-row="1">
            <button type="button" className="btn btn-primary" data-autofocus onClick={reset}>
              Choose another file
            </button>
            {onBuilder && (
              <button type="button" className="btn btn-secondary" onClick={onBuilder}>
                Return to builder
              </button>
            )}
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <div className="import-result">
          <GamePreview game={state.game} />
          <div className="import-actions" data-nav-row="1">
            <button ref={hostButton} type="button" className="btn btn-primary" onClick={() => onHost(state.game)}>
              <Play size={18} strokeWidth={1.5} />
              Host game
            </button>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              Choose another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Title, counts and cover of a validated file. All text renders as plain text. */
export function GamePreview({ game }: { game: LoadedGame }) {
  const file = game.file as JeopardyFile;
  const [coverFailed, setCoverFailed] = useState(false);
  const cover = file.metadata.coverImage;
  const categories = file.content.categories;
  return (
    <div className="preview card game-scope" style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <div className="preview-head">
        <div className="preview-thumb">
          {cover && !coverFailed ? <img src={cover} alt="" onError={() => setCoverFailed(true)} /> : <span className="preview-thumb-generated" />}
        </div>
        <div className="preview-titles">
          <p className="preview-valid">
            <CircleCheck size={16} strokeWidth={1.5} />
            Valid game file
          </p>
          <h2 className="preview-title">{file.metadata.title}</h2>
          <p className="meta">
            {game.filename}
            {file.metadata.author ? ` · by ${file.metadata.author}` : ""}
          </p>
        </div>
      </div>
      {file.metadata.description && <p className="preview-desc">{file.metadata.description}</p>}
      <dl className="preview-stats">
        <div>
          <dt>Categories</dt>
          <dd>{categories.length}</dd>
        </div>
        <div>
          <dt>Clues</dt>
          <dd>{countClues(file)}</dd>
        </div>
        <div>
          <dt>Final round</dt>
          <dd>{file.content.finalJeopardy.enabled ? "Yes" : "No"}</dd>
        </div>
      </dl>
      <ul className="preview-cats" aria-label="Categories">
        {categories.map((c) => (
          <li key={c.id}>{c.title}</li>
        ))}
      </ul>
      {cover && coverFailed && <p className="meta">The cover image could not be loaded, so Zuno will use a generated background.</p>}
      {game.warnings.length > 0 && (
        <div className="notice">
          <CircleAlert size={18} strokeWidth={1.5} />
          <ul>
            {game.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
