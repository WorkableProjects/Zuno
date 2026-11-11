import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CircleAlert, CircleCheck, Download, Eye, FilePlus2, FolderOpen, ImagePlus, Play, Plus, Trash2 } from "lucide-react";
import { clearDraft, loadDraft, saveDraft } from "../../app/storage";
import { ALLOWED_IMAGE_MIME, BACKGROUND_PRESETS, LIMITS, formatBytes, type BackgroundPreset } from "../../game-files/schema/common";
import { JEOPARDY_LIMITS, JEOPARDY_TYPE, type JeopardyFile, type JeopardyQuestion } from "../../game-files/schema/jeopardy";
import { validateGameFile, validateGameFileText } from "../../game-files/schema/validateGameFile";
import { loadGameFile } from "../import/loadGame";
import { useEscape } from "../navigation/spatialNav";
import { ConfirmDialog, Dialog } from "../ui/Dialog";
import { DEFAULT_VALUES, draftFromFile, draftToFile, isQuestionComplete, move, newCategory, newDraft, newQuestion, reviveDraft, slugify, type Draft } from "./editorModel";
import "./builder.css";

interface Props {
  onBack: () => void;
  /** Sends the exported text through the normal import and validation path. */
  onHost: (text: string, filename: string) => void;
  onAppearance: (appearance: { accentColor: string; backgroundPreset: BackgroundPreset; coverImage: string | null }) => void;
}

const SWATCHES = ["#79B8FF", "#6FD3C1", "#9BD772", "#FFD166", "#FFB36B", "#F06A9A", "#C58BFF", "#8266E8"];
const PRESET_LABELS: Record<BackgroundPreset, string> = { aurora: "Aurora", horizon: "Horizon", tide: "Tide", spotlight: "Spotlight" };
const FINAL = "final";

export function JeopardyVisualEditor({ onBack, onHost, onAppearance }: Props) {
  const [draft, setDraft] = useState<Draft>(() => reviveDraft(loadDraft()) ?? newDraft());
  const [selected, setSelected] = useState<string>(() => draft.content.categories[0]?.id ?? FINAL);
  const [dialog, setDialog] = useState<"preview" | "export" | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEscape(onBack);

  // Keep the work safe between visits. A very large cover may not fit; the rest still saves.
  useEffect(() => {
    const t = window.setTimeout(() => saveDraft(draft), 400);
    return () => window.clearTimeout(t);
  }, [draft]);

  const { accentColor, backgroundPreset } = draft.appearance;
  const coverImage = draft.metadata.coverImage;
  useEffect(() => {
    onAppearance({ accentColor, backgroundPreset, coverImage });
  }, [accentColor, backgroundPreset, coverImage, onAppearance]);

  const file = useMemo(() => draftToFile(draft), [draft]);
  const validation = useMemo(() => validateGameFile(file, JEOPARDY_TYPE), [file]);
  const errors = validation.ok ? [] : validation.errors;

  const categories = draft.content.categories;
  const catIndex = categories.findIndex((c) => c.id === selected);
  const category = catIndex === -1 ? null : categories[catIndex];
  const final = draft.content.finalJeopardy;

  const patch = (fn: (d: Draft) => Draft) => setDraft(fn);
  const setMeta = (key: "title" | "description" | "author", value: string) => patch((d) => ({ ...d, metadata: { ...d.metadata, [key]: value } }));
  const setCategories = (fn: (list: Draft["content"]["categories"]) => Draft["content"]["categories"]) =>
    patch((d) => ({ ...d, content: { ...d.content, categories: fn(d.content.categories) } }));
  const setQuestions = (fn: (list: JeopardyQuestion[]) => JeopardyQuestion[]) =>
    setCategories((list) => list.map((c) => (c.id === selected ? { ...c, questions: fn(c.questions) } : c)));
  const setQuestion = (id: string, change: Partial<JeopardyQuestion>) => setQuestions((list) => list.map((q) => (q.id === id ? { ...q, ...change } : q)));
  const setFinal = (change: Partial<typeof final>) => patch((d) => ({ ...d, content: { ...d.content, finalJeopardy: { ...d.content.finalJeopardy, ...change } } }));

  const addCategory = () => {
    const c = newCategory();
    setCategories((list) => [...list, c]);
    setSelected(c.id);
  };
  const deleteCategory = () => {
    if (!category) return;
    const next = categories[catIndex + 1] ?? categories[catIndex - 1];
    setCategories((list) => list.filter((c) => c.id !== category.id));
    setSelected(next?.id ?? FINAL);
  };
  const addQuestion = () =>
    setQuestions((list) => {
      const last = list[list.length - 1]?.value;
      const value = Number.isFinite(last) && last > 0 ? last + 100 : DEFAULT_VALUES[Math.min(list.length, 4)];
      return [...list, newQuestion(value)];
    });

  const onCover = (picked: File | undefined) => {
    if (!picked) return;
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(picked.type)) {
      setNotice("That image format is not supported. Use PNG, JPEG, WebP or GIF.");
      return;
    }
    if (picked.size > LIMITS.maxImageBytes) {
      setNotice(`That image is ${formatBytes(picked.size)}. Cover images can be up to ${formatBytes(LIMITS.maxImageBytes)}.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNotice(null);
      patch((d) => ({ ...d, metadata: { ...d.metadata, coverImage: String(reader.result) } }));
    };
    reader.onerror = () => setNotice("Zuno could not read that image. Try another one.");
    reader.readAsDataURL(picked);
  };

  const onOpenFile = async (picked: File | undefined) => {
    if (!picked) return;
    const result = await loadGameFile(picked, JEOPARDY_TYPE);
    if (!result.ok) {
      setNotice(`${picked.name} could not be opened. ${result.errors[0]}`);
      return;
    }
    const opened = draftFromFile(result.game.file as JeopardyFile);
    setNotice(null);
    setDraft(opened);
    setSelected(opened.content.categories[0]?.id ?? FINAL);
  };

  return (
    <main className="screen editor game-scope" style={{ "--game": accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Visual Editor</span>
        <span className="screen-bar-spacer" />
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog("new")}>
          <FilePlus2 size={18} strokeWidth={1.5} />
          <span className="bar-label">New</span>
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => fileInput.current?.click()}>
          <FolderOpen size={18} strokeWidth={1.5} />
          <span className="bar-label">Open file</span>
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog("preview")}>
          <Eye size={18} strokeWidth={1.5} />
          <span className="bar-label">Preview board</span>
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!validation.ok} onClick={() => setDialog("export")}>
          <Download size={18} strokeWidth={1.5} />
          Export
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void onOpenFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </header>

      {notice && (
        <div className="notice notice-error editor-notice" role="alert">
          <CircleAlert size={18} strokeWidth={1.5} />
          <p>{notice}</p>
        </div>
      )}

      <div className="editor-grid">
        {/* Left: board structure */}
        <nav className="editor-side card" aria-label="Board structure">
          <p className="side-label">Categories</p>
          <ul className="cat-list">
            {categories.map((c, i) => {
              const done = c.questions.filter(isQuestionComplete).length;
              return (
                <li key={c.id}>
                  <button type="button" className={`cat-row${c.id === selected ? " is-on" : ""}`} aria-current={c.id === selected ? "true" : undefined} onClick={() => setSelected(c.id)}>
                    <span className="cat-n">{i + 1}</span>
                    <span className={`cat-name${c.title.trim() ? "" : " is-empty"}`}>{c.title.trim() || "Untitled category"}</span>
                    <span className="cat-count">
                      {done}/{c.questions.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {categories.length === 0 && <p className="meta side-empty">No categories yet. Add one to start the board.</p>}
          <button type="button" className="btn btn-quiet btn-sm side-add" disabled={categories.length >= JEOPARDY_LIMITS.maxCategories} onClick={addCategory}>
            <Plus size={18} strokeWidth={1.5} />
            Add category
          </button>

          <p className="side-label">Final round</p>
          <button type="button" className={`cat-row${selected === FINAL ? " is-on" : ""}`} aria-current={selected === FINAL ? "true" : undefined} onClick={() => setSelected(FINAL)}>
            <span className="cat-n">F</span>
            <span className="cat-name">Final Jeopardy</span>
            <span className="cat-count">{final.enabled ? "On" : "Off"}</span>
          </button>
        </nav>

        {/* Main: the selected category or the final round */}
        <section className="editor-main" aria-label="Editor">
          {category && (
            <>
              <div className="main-head">
                <label className="field main-title">
                  <span className="field-label">Category {catIndex + 1} title</span>
                  <input
                    className="input input-lg"
                    value={category.title}
                    placeholder="Atomic structure"
                    maxLength={80}
                    onChange={(e) => setCategories((list) => list.map((c) => (c.id === category.id ? { ...c, title: e.target.value } : c)))}
                  />
                </label>
                <div className="tool-group">
                  <button type="button" className="icon-btn icon-btn-sm" aria-label="Move category earlier" disabled={catIndex === 0} onClick={() => setCategories((list) => move(list, catIndex, catIndex - 1))}>
                    <ArrowUp size={18} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm"
                    aria-label="Move category later"
                    disabled={catIndex === categories.length - 1}
                    onClick={() => setCategories((list) => move(list, catIndex, catIndex + 1))}
                  >
                    <ArrowDown size={18} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label="Delete category" onClick={deleteCategory}>
                    <Trash2 size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <ul className="clue-list">
                {category.questions.map((q, qi) => (
                  <li key={q.id} className="clue-card card">
                    <div className="clue-card-head">
                      <label className="value-field">
                        <span className="sr-only">Point value for clue {qi + 1}</span>
                        <input
                          className="input value-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={100}
                          value={Number.isFinite(q.value) && q.value !== 0 ? q.value : ""}
                          placeholder="100"
                          aria-invalid={!(Number.isInteger(q.value) && q.value > 0)}
                          onChange={(e) => setQuestion(q.id, { value: e.target.value === "" ? 0 : Number(e.target.value) })}
                        />
                        <span className="meta">points</span>
                      </label>
                      <div className="tool-group">
                        <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move clue ${qi + 1} up`} disabled={qi === 0} onClick={() => setQuestions((list) => move(list, qi, qi - 1))}>
                          <ArrowUp size={18} strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          aria-label={`Move clue ${qi + 1} down`}
                          disabled={qi === category.questions.length - 1}
                          onClick={() => setQuestions((list) => move(list, qi, qi + 1))}
                        >
                          <ArrowDown size={18} strokeWidth={1.5} />
                        </button>
                        <button type="button" className="icon-btn icon-btn-sm" aria-label={`Delete clue ${qi + 1}`} onClick={() => setQuestions((list) => list.filter((x) => x.id !== q.id))}>
                          <Trash2 size={18} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                    <label className="field">
                      <span className="field-label">Clue</span>
                      <textarea className="textarea" rows={2} value={q.clue} maxLength={LIMITS.maxTextLength} placeholder={catIndex === 0 && qi === 0 ? "This negatively charged particle is found outside the nucleus" : undefined} onChange={(e) => setQuestion(q.id, { clue: e.target.value })} />
                    </label>
                    <div className="clue-card-row">
                      <label className="field">
                        <span className="field-label">Answer</span>
                        <input className="input" value={q.answer} maxLength={LIMITS.maxTextLength} placeholder={catIndex === 0 && qi === 0 ? "What is an electron?" : undefined} onChange={(e) => setQuestion(q.id, { answer: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="field-label">Explanation, optional</span>
                        <input className="input" value={q.explanation ?? ""} maxLength={LIMITS.maxTextLength} onChange={(e) => setQuestion(q.id, { explanation: e.target.value })} />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              {category.questions.length === 0 && <p className="meta main-empty">This category has no clues. Each category needs at least one.</p>}
              <button type="button" className="btn btn-secondary btn-sm" disabled={category.questions.length >= JEOPARDY_LIMITS.maxQuestionsPerCategory} onClick={addQuestion}>
                <Plus size={18} strokeWidth={1.5} />
                Add clue
              </button>
            </>
          )}

          {selected === FINAL && (
            <div className="final-editor">
              <h2 className="main-heading">Final Jeopardy</h2>
              <label className="switch">
                <span>
                  Include a final round
                  <span className="field-hint switch-hint">One last clue where teams wager their points</span>
                </span>
                <input type="checkbox" checked={final.enabled} onChange={(e) => setFinal({ enabled: e.target.checked })} />
                <span className="switch-track" />
              </label>
              {final.enabled && (
                <div className="final-fields">
                  <label className="field">
                    <span className="field-label">Category</span>
                    <input className="input" value={final.category} maxLength={80} onChange={(e) => setFinal({ category: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">Clue</span>
                    <textarea className="textarea" rows={3} value={final.clue} maxLength={LIMITS.maxTextLength} onChange={(e) => setFinal({ clue: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">Answer</span>
                    <input className="input" value={final.answer} maxLength={LIMITS.maxTextLength} onChange={(e) => setFinal({ answer: e.target.value })} />
                  </label>
                </div>
              )}
            </div>
          )}

          {!category && selected !== FINAL && <p className="meta main-empty">Add a category to start building the board.</p>}
        </section>

        {/* Right: game details, appearance and validation */}
        <aside className="editor-aside" aria-label="Game details">
          <section className="aside-block card">
            <h2 className="aside-title">Game</h2>
            <label className="field">
              <span className="field-label">Title</span>
              <input className="input" value={draft.metadata.title} maxLength={LIMITS.maxTitleLength} placeholder="Science review" onChange={(e) => setMeta("title", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Description</span>
              <textarea className="textarea" rows={2} value={draft.metadata.description} maxLength={400} onChange={(e) => setMeta("description", e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Author</span>
              <input className="input" value={draft.metadata.author} maxLength={80} onChange={(e) => setMeta("author", e.target.value)} />
            </label>
          </section>

          <section className="aside-block card">
            <h2 className="aside-title">Appearance</h2>
            <div className="field">
              <span className="field-label" id="accent-label">
                Accent color
              </span>
              <div className="swatches" role="radiogroup" aria-labelledby="accent-label">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={accentColor.toUpperCase() === c}
                    aria-label={c}
                    className={`swatch${accentColor.toUpperCase() === c ? " is-on" : ""}`}
                    style={{ "--swatch": c } as React.CSSProperties}
                    onClick={() => patch((d) => ({ ...d, appearance: { ...d.appearance, accentColor: c } }))}
                  />
                ))}
                <label className={`swatch swatch-custom${SWATCHES.includes(accentColor.toUpperCase()) ? "" : " is-on"}`} title="Custom color">
                  <span className="sr-only">Custom accent color</span>
                  <input type="color" value={accentColor} onChange={(e) => patch((d) => ({ ...d, appearance: { ...d.appearance, accentColor: e.target.value.toUpperCase() } }))} />
                </label>
              </div>
            </div>
            <label className="field">
              <span className="field-label">Background</span>
              <select className="select" value={backgroundPreset} onChange={(e) => patch((d) => ({ ...d, appearance: { ...d.appearance, backgroundPreset: e.target.value as BackgroundPreset } }))}>
                {BACKGROUND_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field-label">Cover image, optional</span>
              <div className="cover-row">
                {coverImage && <img className="cover-thumb" src={coverImage} alt="Cover preview" />}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => coverInput.current?.click()}>
                  <ImagePlus size={18} strokeWidth={1.5} />
                  {coverImage ? "Replace" : "Upload image"}
                </button>
                {coverImage && (
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => patch((d) => ({ ...d, metadata: { ...d.metadata, coverImage: null } }))}>
                    Remove
                  </button>
                )}
              </div>
              <p className="field-hint">Up to {formatBytes(LIMITS.maxImageBytes)}. Without one, Zuno draws the background from the accent color.</p>
              <input
                ref={coverInput}
                type="file"
                accept={ALLOWED_IMAGE_MIME.join(",")}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  onCover(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </section>

          <section className="aside-block card">
            <h2 className="aside-title">Rules</h2>
            <label className="switch">
              <span>Allow negative scores</span>
              <input type="checkbox" checked={draft.settings.allowNegativeScores} onChange={(e) => patch((d) => ({ ...d, settings: { ...d.settings, allowNegativeScores: e.target.checked } }))} />
              <span className="switch-track" />
            </label>
            <label className="switch">
              <span>Show explanations with answers</span>
              <input type="checkbox" checked={draft.settings.showExplanations} onChange={(e) => patch((d) => ({ ...d, settings: { ...d.settings, showExplanations: e.target.checked } }))} />
              <span className="switch-track" />
            </label>
          </section>

          <section className="aside-block card" aria-live="polite">
            <h2 className="aside-title">Ready to export</h2>
            {validation.ok ? (
              <div className="notice notice-ok">
                <CircleCheck size={18} strokeWidth={1.5} />
                <p>Everything required is filled in</p>
              </div>
            ) : (
              <div className="notice notice-error">
                <CircleAlert size={18} strokeWidth={1.5} />
                <div>
                  <p className="notice-title">
                    {errors.length} {errors.length === 1 ? "thing" : "things"} left to fill in
                  </p>
                  <ul className="error-list">
                    {errors.slice(0, 5).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {errors.length > 5 && <li>And {errors.length - 5} more</li>}
                  </ul>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      {dialog === "preview" && <PreviewDialog file={file} onClose={() => setDialog(null)} />}
      {dialog === "export" && <ExportDialog file={file} onHost={onHost} onClose={() => setDialog(null)} />}
      {dialog === "new" && (
        <ConfirmDialog
          title="Start a new game"
          text="The current draft will be cleared. Export it first if you want to keep it."
          confirmLabel="Clear draft"
          danger
          onConfirm={() => {
            clearDraft();
            const fresh = newDraft();
            setDraft(fresh);
            setSelected(fresh.content.categories[0].id);
            setNotice(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}

function PreviewDialog({ file, onClose }: { file: JeopardyFile; onClose: () => void }) {
  const categories = file.content.categories;
  const rows = Math.max(0, ...categories.map((c) => c.questions.length));
  return (
    <Dialog title="Board preview" onClose={onClose} wide>
      {(close) => (
        <div className="game-scope" style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
          <h2 className="dialog-title">{file.metadata.title || "Untitled game"}</h2>
          <p className="dialog-text">This is how the board will look to players. Clues open when you host.</p>
          {categories.length === 0 ? (
            <p className="meta preview-empty">There are no categories yet.</p>
          ) : (
            <div className="mini-board" style={{ "--cols": categories.length } as React.CSSProperties}>
              {categories.map((c) => (
                <div key={c.id} className="mini-head">
                  {c.title || "Untitled"}
                </div>
              ))}
              {Array.from({ length: rows }, (_, r) =>
                categories.map((c) => {
                  const q = c.questions[r];
                  return (
                    <div key={`${c.id}-${r}`} className={`mini-cell${q ? "" : " is-gap"}${q && !isQuestionComplete(q) ? " is-open" : ""}`} title={q && !isQuestionComplete(q) ? "This clue is not finished" : undefined}>
                      {q ? (Number.isFinite(q.value) && q.value > 0 ? q.value : "?") : ""}
                    </div>
                  );
                }),
              )}
            </div>
          )}
          {file.content.finalJeopardy.enabled && <p className="meta">Final round: {file.content.finalJeopardy.category || "no category yet"}</p>}
          <div className="dialog-actions" data-nav-row="0">
            <button type="button" className="btn btn-primary" data-autofocus onClick={close}>
              Close preview
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ExportDialog({ file, onHost, onClose }: { file: JeopardyFile; onHost: Props["onHost"]; onClose: () => void }) {
  const [name, setName] = useState(() => slugify(file.metadata.title) || "my-game");
  const [saved, setSaved] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const text = useMemo(() => JSON.stringify(file, null, 2), [file]);
  const filename = `${slugify(name) || "my-game"}.zuno.json`;

  const download = () => {
    // The exact text being saved is validated again before it leaves the editor.
    const check = validateGameFileText(text, JEOPARDY_TYPE);
    if (!check.ok) {
      setProblem(check.errors[0]);
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setProblem(null);
    setSaved(filename);
  };

  return (
    <Dialog title="Export game file" onClose={onClose}>
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            download();
          }}
        >
          <h2 className="dialog-title">Export game file</h2>
          <p className="dialog-text">The file downloads to this device. Keep it to host this game again later.</p>
          <label className="field export-name">
            <span className="field-label">File name</span>
            <span className="name-row">
              <input className="input" data-autofocus value={name} maxLength={48} onChange={(e) => setName(e.target.value)} />
              <span className="meta">.zuno.json</span>
            </span>
          </label>
          {problem && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>{problem}</p>
            </div>
          )}
          {saved && (
            <div className="notice notice-ok" role="status">
              <CircleCheck size={18} strokeWidth={1.5} />
              <p>Saved as {saved}</p>
            </div>
          )}
          <div className="dialog-actions" data-nav-row="1">
            <button type="button" className="btn btn-quiet" onClick={close}>
              {saved ? "Keep editing" : "Cancel"}
            </button>
            <button type="submit" className={`btn ${saved ? "btn-secondary" : "btn-primary"}`}>
              <Download size={18} strokeWidth={1.5} />
              {saved ? "Download again" : "Download file"}
            </button>
            {saved && (
              <button type="button" className="btn btn-primary" onClick={() => onHost(text, saved)}>
                <Play size={18} strokeWidth={1.5} />
                Load &amp; Host This Game
              </button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}
