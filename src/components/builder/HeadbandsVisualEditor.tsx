import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CircleAlert, CircleCheck, Copy, Download, FilePlus2, FolderOpen, Plus, Trash2 } from "lucide-react";
import { clearDraft, loadDraft, saveDraft } from "../../app/storage";
import { BACKGROUND_PRESETS, CURRENT_SCHEMA_VERSION, LIMITS, formatBytes, isRecord, type BackgroundPreset } from "../../game-files/schema/common";
import {
  DEFAULT_HEADBANDS_SETTINGS,
  HEADBANDS_LIMITS,
  HEADBANDS_TYPE,
  isEligible,
  type HeadbandsFile,
  type HeadbandsIdentity,
  type HeadbandsMode,
} from "../../game-files/schema/headbands";
import { validateGameFile } from "../../game-files/schema/validateGameFile";
import { IdentityCard } from "../../games/headbands/IdentityCard";
import { loadGameFile } from "../import/loadGame";
import { useEscape } from "../navigation/spatialNav";
import { ConfirmDialog } from "../ui/Dialog";
import { move, slugify } from "./editorModel";
import { ExportDialog } from "./ExportDialog";
import { IdentityImageField } from "./IdentityImageField";
import "../../games/headbands/headbands.css";
import "./builder.css";

interface Props {
  onBack: () => void;
  onHost: (text: string, filename: string) => void;
  onAppearance: (appearance: { accentColor: string; backgroundPreset: BackgroundPreset; coverImage: string | null }) => void;
}

type Draft = HeadbandsFile;

const SWATCHES = ["#FFB454", "#79B8FF", "#6FD3C1", "#9BD772", "#FFD166", "#F06A9A", "#C58BFF", "#8266E8"];
const PRESET_LABELS: Record<BackgroundPreset, string> = { aurora: "Aurora", horizon: "Horizon", tide: "Tide", spotlight: "Spotlight" };

let counter = 0;
const tempId = () => `i-${Date.now().toString(36)}-${(counter++).toString(36)}`;
const newIdentity = (): HeadbandsIdentity => ({ id: tempId(), text: "", image: null, subtext: null });

function newDraft(): Draft {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType: HEADBANDS_TYPE,
    metadata: { title: "", description: "", author: "", coverImage: null },
    appearance: { accentColor: "#FFB454", backgroundPreset: "horizon" },
    content: { identities: [newIdentity(), newIdentity(), newIdentity()] },
    settings: { ...DEFAULT_HEADBANDS_SETTINGS },
  };
}

function reviveDraft(saved: unknown): Draft | null {
  if (!isRecord(saved) || saved.gameType !== HEADBANDS_TYPE || !isRecord(saved.metadata) || !isRecord(saved.appearance) || !isRecord(saved.settings)) return null;
  if (!isRecord(saved.content) || !Array.isArray(saved.content.identities)) return null;
  if (!saved.content.identities.every((i) => isRecord(i) && typeof i.id === "string" && typeof i.text === "string")) return null;
  const draft = saved as unknown as Draft;
  return { ...draft, settings: { ...DEFAULT_HEADBANDS_SETTINGS, ...draft.settings } };
}

/** The shared Zuno shape with clean, unique IDs and nulls for empty image fields. */
function draftToFile(draft: Draft): HeadbandsFile {
  const used = new Set<string>();
  const unique = (base: string) => {
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
  return {
    ...draft,
    metadata: { ...draft.metadata, title: draft.metadata.title.trim(), description: draft.metadata.description.trim(), author: draft.metadata.author.trim() },
    content: {
      identities: draft.content.identities.map((i, n) => {
        const out: HeadbandsIdentity = {
          id: unique(`identity-${slugify(i.text) || n + 1}`),
          text: i.text.trim(),
          image: i.image?.trim() ? i.image.trim() : null,
          subtext: i.subtext?.trim() ? i.subtext.trim() : null,
        };
        if (i.allowDuplicate) out.allowDuplicate = true;
        return out;
      }),
    },
  };
}

export function HeadbandsVisualEditor({ onBack, onHost, onAppearance }: Props) {
  const [draft, setDraft] = useState<Draft>(() => reviveDraft(loadDraft("headbands")) ?? newDraft());
  const [selected, setSelected] = useState<string>(() => draft.content.identities[0]?.id ?? "");
  const [dialog, setDialog] = useState<"export" | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageFull, setStorageFull] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEscape(onBack, dialog === null);

  useEffect(() => {
    const t = window.setTimeout(() => setStorageFull(!saveDraft(draft, "headbands")), 400);
    return () => window.clearTimeout(t);
  }, [draft]);

  const { accentColor, backgroundPreset } = draft.appearance;
  useEffect(() => {
    onAppearance({ accentColor, backgroundPreset, coverImage: null });
  }, [accentColor, backgroundPreset, onAppearance]);

  const file = useMemo(() => draftToFile(draft), [draft]);
  const validation = useMemo(() => validateGameFile(file, HEADBANDS_TYPE), [file]);
  const errors = validation.ok ? [] : validation.errors;
  const bytes = useMemo(() => new Blob([JSON.stringify(file)]).size, [file]);

  const identities = draft.content.identities;
  const index = identities.findIndex((i) => i.id === selected);
  const identity = index === -1 ? null : identities[index];
  const textCount = identities.filter((i) => isEligible(i, "text")).length;
  const imageCount = identities.filter((i) => isEligible(i, "image")).length;

  const patch = (fn: (d: Draft) => Draft) => setDraft(fn);
  const setIdentities = (fn: (list: HeadbandsIdentity[]) => HeadbandsIdentity[]) => patch((d) => ({ ...d, content: { identities: fn(d.content.identities) } }));
  const setIdentity = (id: string, change: Partial<HeadbandsIdentity>) => setIdentities((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));
  const setSettings = (change: Partial<Draft["settings"]>) => patch((d) => ({ ...d, settings: { ...d.settings, ...change } }));

  const add = () => {
    const next = newIdentity();
    setIdentities((list) => [...list, next]);
    setSelected(next.id);
  };
  const duplicate = () => {
    if (!identity) return;
    const copy = { ...identity, id: tempId() };
    setIdentities((list) => [...list.slice(0, index + 1), copy, ...list.slice(index + 1)]);
    setSelected(copy.id);
  };
  const remove = () => {
    if (!identity) return;
    const next = identities[index + 1] ?? identities[index - 1];
    setIdentities((list) => list.filter((i) => i.id !== identity.id));
    setSelected(next?.id ?? "");
  };

  const onOpenFile = async (picked: File | undefined) => {
    if (!picked) return;
    const result = await loadGameFile(picked, HEADBANDS_TYPE);
    if (!result.ok) {
      setNotice(`${picked.name} could not be opened. ${result.errors[0]}`);
      return;
    }
    const opened = result.game.file as HeadbandsFile;
    setNotice(null);
    setDraft(opened);
    setSelected(opened.content.identities[0]?.id ?? "");
  };

  const status = (i: HeadbandsIdentity) => {
    if (!i.text.trim()) return "Needs text";
    if (isEligible(i, "image")) return "Text + image";
    if (i.image || i.subtext?.trim()) return "Image unfinished";
    return "Text";
  };

  return (
    <main className="screen editor game-scope" style={{ "--game": accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Visual Editor · Headbands</span>
        <span className="screen-bar-spacer" />
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog("new")}>
          <FilePlus2 size={18} strokeWidth={1.5} />
          <span className="bar-label">New</span>
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => fileInput.current?.click()}>
          <FolderOpen size={18} strokeWidth={1.5} />
          <span className="bar-label">Open file</span>
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
        <nav className="editor-side card" aria-label="Deck">
          <p className="side-label">Identities</p>
          <ul className="cat-list">
            {identities.map((i, n) => (
              <li key={i.id}>
                <button type="button" className={`cat-row${i.id === selected ? " is-on" : ""}`} aria-current={i.id === selected ? "true" : undefined} onClick={() => setSelected(i.id)}>
                  <span className="cat-n">{n + 1}</span>
                  <span className={`cat-name${i.text.trim() ? "" : " is-empty"}`}>{i.text.trim() || "Untitled identity"}</span>
                  <span className="cat-count">{status(i)}</span>
                </button>
              </li>
            ))}
          </ul>
          {identities.length === 0 && <p className="meta side-empty">No identities yet. Add one to start the deck.</p>}
          <button type="button" className="btn btn-quiet btn-sm side-add" disabled={identities.length >= HEADBANDS_LIMITS.maxIdentities} onClick={add}>
            <Plus size={18} strokeWidth={1.5} />
            Add identity
          </button>
          <p className="meta side-empty">
            {textCount} usable in Text Mode, {imageCount} in Image Mode
          </p>
        </nav>

        <section className="editor-main" aria-label="Editor">
          {identity ? (
            <>
              <div className="main-head">
                <label className="field main-title">
                  <span className="field-label">Identity {index + 1}: the word or name to guess</span>
                  <input
                    className="input input-lg"
                    value={identity.text}
                    placeholder="Eiffel Tower"
                    maxLength={HEADBANDS_LIMITS.maxLabelLength}
                    onChange={(e) => setIdentity(identity.id, { text: e.target.value })}
                  />
                </label>
                <div className="tool-group">
                  <button type="button" className="icon-btn icon-btn-sm" aria-label="Move identity earlier" disabled={index === 0} onClick={() => setIdentities((list) => move(list, index, index - 1))}>
                    <ArrowUp size={18} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label="Move identity later" disabled={index === identities.length - 1} onClick={() => setIdentities((list) => move(list, index, index + 1))}>
                    <ArrowDown size={18} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label="Duplicate identity" disabled={identities.length >= HEADBANDS_LIMITS.maxIdentities} onClick={duplicate}>
                    <Copy size={18} strokeWidth={1.5} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label="Delete identity" onClick={remove}>
                    <Trash2 size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <p className="field-hint">Text Mode shows this on the card, and it is the answer players type.</p>

              <div className="clue-card card">
                <h2 className="main-heading">Image card, for Image Mode</h2>
                <p className="field-hint">Image Mode needs both a picture and the answer printed under it. Leave both empty for a text-only identity.</p>
                <div className="clue-card-row">
                  <IdentityImageField value={identity.image} onChange={(image) => setIdentity(identity.id, { image })} />
                  <label className="field">
                    <span className="field-label">Answer under the image</span>
                    <input
                      className="input"
                      value={identity.subtext ?? ""}
                      placeholder={identity.text || "iPhone"}
                      maxLength={HEADBANDS_LIMITS.maxLabelLength}
                      onChange={(e) => setIdentity(identity.id, { subtext: e.target.value })}
                    />
                    <span className="field-hint">This is what the player must guess in Image Mode, not a caption.</span>
                    {identity.text.trim() && identity.subtext?.trim() !== identity.text.trim() && (
                      <button type="button" className="btn btn-quiet btn-sm hb-copy-text" onClick={() => setIdentity(identity.id, { subtext: identity.text.trim() })}>
                        Use “{identity.text.trim()}”
                      </button>
                    )}
                  </label>
                </div>
                {(identity.image || identity.subtext?.trim()) && !isEligible(identity, "image") && (
                  <p className="field-hint image-problem">{identity.image ? "Add the answer text to use this card in Image Mode." : "Add an image to use this card in Image Mode."}</p>
                )}
                <label className="switch">
                  <span>
                    Can be dealt to more than one player
                    <span className="field-hint switch-hint">Only when the game allows duplicate assignments</span>
                  </span>
                  <input type="checkbox" checked={identity.allowDuplicate === true} onChange={(e) => setIdentity(identity.id, { allowDuplicate: e.target.checked || undefined })} />
                  <span className="switch-track" />
                </label>
              </div>

              <div className="hb-preview">
                <div className="hb-preview-item">
                  <p className="field-label">Text card preview</p>
                  {identity.text.trim() ? <IdentityCard key={`t-${identity.id}`} identity={identity} mode="text" size="md" /> : <p className="meta">Type the identity to see the card.</p>}
                </div>
                <div className="hb-preview-item">
                  <p className="field-label">Image card preview</p>
                  {identity.image || identity.subtext?.trim() ? (
                    <IdentityCard key={`i-${identity.id}-${identity.image?.length ?? 0}`} identity={identity} mode="image" size="md" />
                  ) : (
                    <p className="meta">Add an image and its answer to see the card.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="meta main-empty">Add an identity to start the deck.</p>
          )}
        </section>

        <aside className="editor-aside" aria-label="Game details">
          <section className="aside-block card">
            <h2 className="aside-title">Game</h2>
            <label className="field">
              <span className="field-label">Title</span>
              <input className="input" value={draft.metadata.title} maxLength={LIMITS.maxTitleLength} placeholder="Everyday things" onChange={(e) => patch((d) => ({ ...d, metadata: { ...d.metadata, title: e.target.value } }))} />
            </label>
            <label className="field">
              <span className="field-label">Description</span>
              <textarea className="textarea" rows={2} value={draft.metadata.description} maxLength={400} onChange={(e) => patch((d) => ({ ...d, metadata: { ...d.metadata, description: e.target.value } }))} />
            </label>
            <label className="field">
              <span className="field-label">Author</span>
              <input className="input" value={draft.metadata.author} maxLength={80} onChange={(e) => patch((d) => ({ ...d, metadata: { ...d.metadata, author: e.target.value } }))} />
            </label>
          </section>

          <section className="aside-block card">
            <h2 className="aside-title">Appearance</h2>
            <div className="field">
              <span className="field-label" id="hb-accent-label">
                Accent color
              </span>
              <div className="swatches" role="radiogroup" aria-labelledby="hb-accent-label">
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
          </section>

          <section className="aside-block card">
            <h2 className="aside-title">Default rules</h2>
            <label className="field">
              <span className="field-label">Default mode</span>
              <select className="select" value={draft.settings.defaultMode} onChange={(e) => setSettings({ defaultMode: e.target.value as HeadbandsMode })}>
                <option value="text">Text</option>
                <option value="image">Images</option>
              </select>
            </label>
            <label className="switch">
              <span>
                Continue after Yes
                <span className="field-hint switch-hint">A Yes answer keeps the turn</span>
              </span>
              <input type="checkbox" checked={draft.settings.continueAfterYes} onChange={(e) => setSettings({ continueAfterYes: e.target.checked })} />
              <span className="switch-track" />
            </label>
            <label className="switch">
              <span>
                Unlimited guesses
                <span className="field-hint switch-hint">A wrong guess keeps the turn</span>
              </span>
              <input type="checkbox" checked={draft.settings.unlimitedGuesses} onChange={(e) => setSettings({ unlimitedGuesses: e.target.checked })} />
              <span className="switch-track" />
            </label>
            <label className="switch">
              <span>
                Allow duplicate assignments
                <span className="field-hint switch-hint">Marked identities can go to more than one player</span>
              </span>
              <input type="checkbox" checked={draft.settings.allowDuplicateAssignments} onChange={(e) => setSettings({ allowDuplicateAssignments: e.target.checked })} />
              <span className="switch-track" />
            </label>
            <label className="field">
              <span className="field-label">Most players</span>
              <select className="select" value={draft.settings.maxPlayers} onChange={(e) => setSettings({ maxPlayers: Number(e.target.value) })}>
                {Array.from({ length: HEADBANDS_LIMITS.maxPlayers - HEADBANDS_LIMITS.minPlayers + 1 }, (_, k) => k + HEADBANDS_LIMITS.minPlayers).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
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
            <p className="meta">
              File size {formatBytes(bytes)} of {formatBytes(LIMITS.maxFileBytes)}
              {storageFull ? ". The draft is too large to keep in this browser; export it to save your work." : ""}
            </p>
          </section>
        </aside>
      </div>

      {dialog === "export" && <ExportDialog file={file} gameType={HEADBANDS_TYPE} onHost={onHost} onClose={() => setDialog(null)} />}
      {dialog === "new" && (
        <ConfirmDialog
          title="Start a new deck"
          text="The current draft will be cleared. Export it first if you want to keep it."
          confirmLabel="Clear draft"
          danger
          onConfirm={() => {
            clearDraft("headbands");
            const fresh = newDraft();
            setDraft(fresh);
            setSelected(fresh.content.identities[0].id);
            setNotice(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}
