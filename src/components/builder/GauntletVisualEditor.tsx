import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, Download, FilePlus, Plus, Trash2 } from "lucide-react";
import { BACKGROUND_PRESETS, type BackgroundPreset } from "../../game-files/schema/common";
import { GAUNTLET_TYPE, WILD_EFFECTS, blankGauntletFile, blankGauntletQuestion, type GauntletContent, type GauntletFile, type GauntletQuestion, type WildEffect } from "../../game-files/schema/gauntlet";
import { validateGameFile } from "../../game-files/schema/validateGameFile";
import { useEscape } from "../navigation/spatialNav";
import { ConfirmDialog } from "../ui/Dialog";
import { ExportDialog } from "./ExportDialog";
import "./builder.css";
import "../../games/gauntlet/gauntlet.css";

interface Props {
  onBack: () => void;
  onHost: (text: string, filename: string) => void;
  onAppearance: (a: { accentColor: string; backgroundPreset: BackgroundPreset; coverImage: string | null }) => void;
}

const DRAFT_KEY = "zuno.draft.gauntlet";
type SimpleDeck = "warmup" | "quickfire" | "puzzle" | "wild" | "chaos" | "climb" | "crossroads" | "summit";
const SIMPLE: Array<{ key: SimpleDeck; title: string; hint: string }> = [
  { key: "warmup", title: "Warm-Up Sprint", hint: "Easy openers every team can answer." },
  { key: "quickfire", title: "Quickfire lane", hint: "Short, fast questions. Streaks multiply." },
  { key: "puzzle", title: "Puzzle lane", hint: "Harder puzzles with up to two hints." },
  { key: "wild", title: "Wild lane", hint: "Each card carries a twist effect." },
  { key: "chaos", title: "Chaos round", hint: "Open to every team at once." },
  { key: "climb", title: "Final: Climb", hint: "Medium questions for finalists." },
  { key: "crossroads", title: "Final: Crossroads", hint: "High stakes with a category." },
  { key: "summit", title: "Final: Summit", hint: "Hard tie-breakers." },
];

function getDeck(c: GauntletContent, k: SimpleDeck): GauntletQuestion[] {
  if (k === "quickfire" || k === "puzzle" || k === "wild") return c.lanes[k];
  if (k === "climb" || k === "crossroads" || k === "summit") return c.final[k];
  return c[k];
}
function setDeck(c: GauntletContent, k: SimpleDeck, list: GauntletQuestion[]): GauntletContent {
  if (k === "quickfire" || k === "puzzle" || k === "wild") return { ...c, lanes: { ...c.lanes, [k]: list } };
  if (k === "climb" || k === "crossroads" || k === "summit") return { ...c, final: { ...c.final, [k]: list } };
  return { ...c, [k]: list };
}
function blankFor(k: SimpleDeck): GauntletQuestion {
  const q = blankGauntletQuestion(k.slice(0, 2));
  if (k === "puzzle") return { ...q, hints: ["", ""] } as GauntletQuestion;
  if (k === "wild") return { ...q, effect: "double" } as GauntletQuestion;
  if (k === "crossroads") return { ...q, category: "" } as GauntletQuestion;
  return q;
}

/** Strips empty optional bits so the exported file validates. */
function toFile(d: GauntletFile): GauntletFile {
  const c = d.content;
  return { ...d, content: { ...c, lanes: { ...c.lanes, puzzle: c.lanes.puzzle.map((p) => ({ ...p, hints: p.hints.filter((h) => h.trim()) })) } } };
}
function loadDraft(): GauntletFile | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as GauntletFile | null;
    return d && d.gameType === GAUNTLET_TYPE && d.content?.lanes ? d : null;
  } catch {
    return null;
  }
}

export function GauntletVisualEditor({ onBack, onHost, onAppearance }: Props) {
  const [draft, setDraft] = useState<GauntletFile>(() => loadDraft() ?? blankGauntletFile());
  const [tab, setTab] = useState<SimpleDeck | "choice" | "lock" | "deck">("deck");
  const [dialog, setDialog] = useState<"export" | "new" | null>(null);
  useEscape(onBack, dialog === null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* too large; export to keep it */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [draft]);
  const { accentColor, backgroundPreset } = draft.appearance;
  useEffect(() => onAppearance({ accentColor, backgroundPreset, coverImage: null }), [accentColor, backgroundPreset, onAppearance]);

  const file = useMemo(() => toFile(draft), [draft]);
  const validation = useMemo(() => validateGameFile(file, GAUNTLET_TYPE), [file]);
  const errors = validation.ok ? [] : validation.errors;
  const content = (f: (c: GauntletContent) => GauntletContent) => setDraft((d) => ({ ...d, content: f(d.content) }));
  const meta = (m: Partial<GauntletFile["metadata"]>) => setDraft((d) => ({ ...d, metadata: { ...d.metadata, ...m } }));

  const qFields = (q: GauntletQuestion, set: (q: GauntletQuestion) => void, label: string) => (
    <div className="gl-grid2">
      <label className="field">
        <span className="field-label">{label} prompt</span>
        <textarea className="textarea" rows={2} value={q.prompt} maxLength={400} onChange={(e) => set({ ...q, prompt: e.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">Answer</span>
        <input className="input" value={q.answer} maxLength={200} onChange={(e) => set({ ...q, answer: e.target.value })} />
      </label>
    </div>
  );

  const simple = SIMPLE.find((s) => s.key === tab);
  return (
    <main className="screen">
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Gauntlet editor</span>
        <span className="gl-actions" style={{ marginLeft: "auto" }}>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDialog("new")}>
            <FilePlus size={16} strokeWidth={1.5} /> New
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!validation.ok} onClick={() => setDialog("export")}>
            <Download size={16} strokeWidth={1.5} /> Export
          </button>
        </span>
      </header>
      <div className="gl-wrap">
        <nav className="segmented gl-tabs" aria-label="Sections" data-nav-row="1">
          {[{ key: "deck", title: "Deck" }, ...SIMPLE, { key: "choice", title: "Choice round" }, { key: "lock", title: "Final: Lock" }].map((s) => (
            <button key={s.key} type="button" className={`segment${tab === s.key ? " is-active" : ""}`} aria-current={tab === s.key ? "page" : undefined} onClick={() => setTab(s.key as typeof tab)}>
              {s.title}
            </button>
          ))}
        </nav>

        {tab === "deck" && (
          <section className="card gl-panel">
            <label className="field">
              <span className="field-label">Title</span>
              <input className="input" value={draft.metadata.title} maxLength={80} onChange={(e) => meta({ title: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Description</span>
              <textarea className="textarea" rows={2} value={draft.metadata.description} onChange={(e) => meta({ description: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Author</span>
              <input className="input" value={draft.metadata.author} maxLength={80} onChange={(e) => meta({ author: e.target.value })} />
            </label>
            <div className="gl-grid2">
              <label className="field">
                <span className="field-label">Accent color</span>
                <input className="input" type="color" value={accentColor} onChange={(e) => setDraft((d) => ({ ...d, appearance: { ...d.appearance, accentColor: e.target.value.toUpperCase() } }))} />
              </label>
              <label className="field">
                <span className="field-label">Background</span>
                <select className="select" value={backgroundPreset} onChange={(e) => setDraft((d) => ({ ...d, appearance: { ...d.appearance, backgroundPreset: e.target.value as BackgroundPreset } }))}>
                  {BACKGROUND_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <label className="field">
              <span className="field-label">Seconds per round</span>
              <input className="input" type="number" min={5} max={300} value={draft.settings.defaultRoundSeconds} onChange={(e) => setDraft((d) => ({ ...d, settings: { ...d.settings, defaultRoundSeconds: Math.max(5, Math.min(300, Number(e.target.value) || 15)) } }))} />
            </label>
            <label className="switch">
              <span>Survival by default</span>
              <input type="checkbox" checked={draft.settings.elimination} onChange={(e) => setDraft((d) => ({ ...d, settings: { ...d.settings, elimination: e.target.checked } }))} />
              <span className="switch-track" />
            </label>
          </section>
        )}

        {simple && (
          <section className="card gl-panel" aria-labelledby="gl-ed-h">
            <div className="gl-row">
              <h2 id="gl-ed-h" className="page-title">{simple.title}</h2>
              <span className="meta">{simple.hint}</span>
            </div>
            {getDeck(draft.content, simple.key).map((q, i, list) => {
              const set = (next: GauntletQuestion) => content((c) => setDeck(c, simple.key, list.map((x, k) => (k === i ? next : x))));
              const ext = q as GauntletQuestion & { hints?: string[]; effect?: WildEffect; category?: string };
              return (
                <div key={q.id} className="gl-team-edit">
                  <div className="gl-row">
                    <strong>#{i + 1}</strong>
                    <button type="button" className="icon-btn icon-btn-sm" aria-label={`Delete question ${i + 1}`} onClick={() => content((c) => setDeck(c, simple.key, list.filter((_, k) => k !== i)))}>
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                  {qFields(q, set, "Question")}
                  {ext.hints && (
                    <div className="gl-grid2">
                      {[0, 1].map((h) => (
                        <label key={h} className="field">
                          <span className="field-label">Hint {h + 1}</span>
                          <input className="input" value={ext.hints![h] ?? ""} onChange={(e) => set({ ...ext, hints: [0, 1].map((k) => (k === h ? e.target.value : (ext.hints![k] ?? ""))) } as GauntletQuestion)} />
                        </label>
                      ))}
                    </div>
                  )}
                  {ext.effect !== undefined && (
                    <label className="field">
                      <span className="field-label">Wild effect</span>
                      <select className="select" value={ext.effect} onChange={(e) => set({ ...ext, effect: e.target.value as WildEffect } as GauntletQuestion)}>
                        {WILD_EFFECTS.map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </label>
                  )}
                  {ext.category !== undefined && (
                    <label className="field">
                      <span className="field-label">Category</span>
                      <input className="input" value={ext.category} maxLength={80} onChange={(e) => set({ ...ext, category: e.target.value } as GauntletQuestion)} />
                    </label>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => content((c) => setDeck(c, simple.key, [...getDeck(c, simple.key), blankFor(simple.key)]))}>
              <Plus size={16} strokeWidth={1.5} /> Add question
            </button>
          </section>
        )}

        {tab === "choice" && (
          <section className="card gl-panel">
            <h2 className="page-title">Choice round</h2>
            {draft.content.choice.map((ch, i) => (
              <div key={ch.id} className="gl-team-edit">
                <div className="gl-row">
                  <strong>Challenge {i + 1}</strong>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Delete challenge ${i + 1}`} onClick={() => content((c) => ({ ...c, choice: c.choice.filter((_, k) => k !== i) }))}>
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </div>
                {(["safe", "bold", "unknown"] as const).map((tier) => (
                  <div key={tier}>{qFields(ch[tier], (q) => content((c) => ({ ...c, choice: c.choice.map((x, k) => (k === i ? { ...x, [tier]: q } : x)) })), tier[0].toUpperCase() + tier.slice(1))}</div>
                ))}
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => content((c) => ({ ...c, choice: [...c.choice, { id: blankGauntletQuestion("ch").id, safe: blankGauntletQuestion("s"), bold: blankGauntletQuestion("b"), unknown: blankGauntletQuestion("u") }] }))}>
              <Plus size={16} strokeWidth={1.5} /> Add challenge
            </button>
          </section>
        )}

        {tab === "lock" && (
          <section className="card gl-panel">
            <h2 className="page-title">Final: Lock</h2>
            {draft.content.final.lock.map((l, i) => {
              const set = (next: typeof l) => content((c) => ({ ...c, final: { ...c.final, lock: c.final.lock.map((x, k) => (k === i ? next : x)) } }));
              return (
                <fieldset key={l.id} className="gl-team-edit" style={{ border: 0 }}>
                  <legend className="setup-label">Lock {i + 1}: four statements, one false</legend>
                  <input className="input" aria-label="Prompt" value={l.prompt} onChange={(e) => set({ ...l, prompt: e.target.value })} />
                  {l.statements.map((st, k) => (
                    <div key={k} className="gl-actions">
                      <input type="radio" name={`lock-${l.id}`} aria-label={`Statement ${k + 1} is false`} checked={l.falseIndex === k} onChange={() => set({ ...l, falseIndex: k })} />
                      <input className="input gl-grow" aria-label={`Statement ${k + 1}`} value={st} onChange={(e) => set({ ...l, statements: l.statements.map((x, j) => (j === k ? e.target.value : x)) })} />
                    </div>
                  ))}
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => content((c) => ({ ...c, final: { ...c.final, lock: c.final.lock.filter((_, k) => k !== i) } }))}>
                    <Trash2 size={16} strokeWidth={1.5} /> Delete
                  </button>
                </fieldset>
              );
            })}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => content((c) => ({ ...c, final: { ...c.final, lock: [...c.final.lock, { id: blankGauntletQuestion("lk").id, prompt: "Which statement is false?", statements: ["", "", "", ""], falseIndex: 0 }] } }))}>
              <Plus size={16} strokeWidth={1.5} /> Add lock
            </button>
          </section>
        )}

        <section className="card gl-panel" aria-live="polite">
          {validation.ok ? (
            <div className="notice notice-ok">
              <CircleCheck size={18} strokeWidth={1.5} />
              <p>Everything required is filled in. Export to save and host.</p>
            </div>
          ) : (
            <div className="notice notice-error">
              <CircleAlert size={18} strokeWidth={1.5} />
              <div>
                <p className="notice-title">{errors.length} {errors.length === 1 ? "thing" : "things"} left to fill in</p>
                <ul className="error-list">
                  {errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  {errors.length > 5 && <li>And {errors.length - 5} more</li>}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>
      {dialog === "export" && <ExportDialog file={file} gameType={GAUNTLET_TYPE} onHost={onHost} onClose={() => setDialog(null)} />}
      {dialog === "new" && (
        <ConfirmDialog
          title="Start a new deck"
          text="The current draft will be cleared. Export it first if you want to keep it."
          confirmLabel="Clear draft"
          danger
          onConfirm={() => {
            setDraft(blankGauntletFile());
            setTab("deck");
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}
