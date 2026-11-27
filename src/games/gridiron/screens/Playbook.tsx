import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Copy, Download, Pencil, Plus, Star, Trash2, Upload } from "lucide-react";
import {
  CALLABLE_TYPES, DEF_CATALOG, gapsForConcept as gapsForConceptOf, DEF_PACKAGES, FORMATIONS, OFF_CATALOG, PERSONNEL_LABEL, PERSONNELS, type DefPlayDef, type OffPlayDef,
} from "../gmPlayCatalog";
import {
  MAX_CUSTOM_PLAYS, NAME_MAX, TAGLINE_MAX, SIMULATION_FIELDS, callsFor, conceptsFor, createCustomPlay, customPlaysOf, customToDefDef, customToOffDef, deleteCustomPlay, draftFromBuiltIn,
  draftFromCustom, duplicateCustomPlay, exportCustomPlaysJson, importCustomPlaysJson, newCustomPlayDraft, patchDraft, personnelFor, setCustomPlayEnabled, shellsFor, typesFor,
  updateCustomPlay, validateCustomPlay,
  type CustomPlay, type CustomPlayDraft, type FieldErrors, type PlayUnit,
} from "../gmCustomPlays";
import type { Career } from "../gmTypes";
import { Panel, Seg, useDirtyGuard, useGm } from "./ui";
import "./playbook.css";

type Def = OffPlayDef | DefPlayDef;
type Source = "all" | "builtin" | "custom" | "fav";
type SortKey = "name" | "category" | "fav";
type Editor = { id?: string; base: string; draft: CustomPlayDraft };

const TYPE_LABEL: Record<string, string> = { run: "Run", short: "Short pass", medium: "Medium pass", deep: "Deep pass", screen: "Screen", playaction: "Play action" };
const GAP_LABEL: Record<string, string> = { A: "A gap (center)", B: "B gap (guard-tackle)", C: "C gap (tackle-end)", D: "D gap (outside)" };
const TAG_LABEL: Record<string, string> = { "short-yardage": "Short yardage", "goal-line": "Goal line", "red-zone": "Red zone", "two-minute": "Two-minute", "long-yardage": "Long yardage", neutral: "Any situation" };

type CareerX = Career & { customPlays?: CustomPlay[] };

const favKey = (slot: number) => `gridiron.playbook.favorites.${slot}`;
function readFavs(slot: number): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(favKey(slot)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeFavs(slot: number, ids: string[]) {
  try {
    window.localStorage.setItem(favKey(slot), JSON.stringify(ids));
  } catch {
    /* favorites are a per-device convenience; failing to store them is not fatal */
  }
}

function download(name: string, text: string): boolean {
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  } catch {
    return false;
  }
}

function facts(def: Def): Array<[string, string]> {
  const k = def.call as unknown as Record<string, string | number | undefined>;
  if ("formation" in def.call) {
    const rows: Array<[string, string]> = [
      ["Formation", String(k.formation)],
      ["Personnel", PERSONNEL_LABEL[k.personnel as keyof typeof PERSONNEL_LABEL] ?? String(k.personnel)],
      ["Play type", TYPE_LABEL[String(k.type)] ?? String(k.type)],
      ["Concept", String(k.concept)],
    ];
    if (k.gap) rows.push(["Run gap", GAP_LABEL[String(k.gap)] ?? String(k.gap)]);
    return rows;
  }
  return [["Package", String(k.pkg)], ["Call", String(k.call)], ["Coverage shell", String(k.shell)]];
}

/** The card a play shows in the library and in the editor preview. */
function PlayCard({ def, custom, badge }: { def: Def; custom?: boolean; badge?: ReactNode }) {
  return (
    <div className="gr-pb-card">
      <div className="gr-pb-card-top">
        <span className="gr-pb-tag">{custom ? "Custom" : "Built-in"}</span>
        <span className="gr-pb-tag is-quiet">{def.group}</span>
        {badge}
      </div>
      <strong className="gr-pb-name">{def.name}</strong>
      <p className="gr-pb-tagline">{def.tagline}</p>
      <dl className="gr-pb-facts">
        {facts(def).map(([l, v]) => (
          <div key={l}><dt>{l}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {def.tags.length > 0 && <p className="gr-pb-tags">Fits: {def.tags.map((t) => TAG_LABEL[t] ?? t).join(", ")}</p>}
    </div>
  );
}

export function Playbook() {
  const { c, update } = useGm();
  const cx = c as CareerX;
  const customs = useMemo(() => customPlaysOf(cx), [cx.customPlays]); // eslint-disable-line react-hooks/exhaustive-deps
  const [unit, setUnit] = useState<PlayUnit>("offense");
  const [source, setSource] = useState<Source>("all");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [formation, setFormation] = useState("all");
  const [personnel, setPersonnel] = useState("all");
  const [sort, setSort] = useState<SortKey>("category");
  const [selected, setSelected] = useState<string | null>(null);
  const [favs, setFavs] = useState<string[]>(() => readFavs(c.slot));
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = !!editor && JSON.stringify(editor.draft) !== editor.base;
  useDirtyGuard(dirty);

  const commit = (plays: CustomPlay[], text: string) => {
    cx.customPlays = plays;
    update();
    setMsg({ text });
  };

  const items = useMemo(() => {
    const all: Array<{ def: Def; custom?: CustomPlay }> = [
      ...(unit === "offense" ? OFF_CATALOG : DEF_CATALOG).map((def) => ({ def: def as Def })),
      ...customs.filter((p) => p.unit === unit).map((p) => ({ def: (p.unit === "offense" ? customToOffDef(p) : customToDefDef(p)) as Def, custom: p })),
    ];
    const needle = q.trim().toLowerCase();
    const out = all.filter(({ def, custom }) => {
      if (source === "builtin" && custom) return false;
      if (source === "custom" && !custom) return false;
      if (source === "fav" && !favs.includes(def.id)) return false;
      if (group !== "all" && def.group !== group) return false;
      if (unit === "offense") {
        const k = def.call as OffPlayDef["call"];
        if (formation !== "all" && k.formation !== formation) return false;
        if (personnel !== "all" && k.personnel !== personnel) return false;
      }
      if (needle && !`${def.name} ${def.tagline} ${def.group}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const fav = (d: Def) => (favs.includes(d.id) ? 0 : 1);
    return out.sort((a, b) =>
      sort === "name" ? a.def.name.localeCompare(b.def.name)
      : sort === "fav" ? fav(a.def) - fav(b.def) || a.def.name.localeCompare(b.def.name)
      : a.def.group.localeCompare(b.def.group) || a.def.name.localeCompare(b.def.name));
  }, [unit, source, q, group, formation, personnel, sort, customs, favs]);

  const groups = useMemo(() => Array.from(new Set((unit === "offense" ? OFF_CATALOG : DEF_CATALOG).map((d) => d.group))), [unit]);
  const customCount = customs.filter((p) => p.unit === unit).length;
  const preview = items.find((i) => i.def.id === selected) ?? null;
  const filtersOn = source !== "all" || q !== "" || group !== "all" || formation !== "all" || personnel !== "all";

  const switchUnit = (u: PlayUnit) => {
    setUnit(u);
    setGroup("all");
    setFormation("all");
    setPersonnel("all");
    setSelected(null);
    setConfirmDel(null);
  };
  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    writeFavs(c.slot, next);
  };
  const clearFilters = () => {
    setSource("all");
    setQ("");
    setGroup("all");
    setFormation("all");
    setPersonnel("all");
  };

  const open = (e: Editor) => {
    setConfirmDel(null);
    setMsg(null);
    setEditor(e);
  };
  const startNew = () => {
    const draft = newCustomPlayDraft(unit, customs);
    open({ base: JSON.stringify(draft), draft });
  };
  const copyBuiltIn = (id: string) => {
    const draft = draftFromBuiltIn(id, customs);
    if (draft) open({ base: JSON.stringify(draft) + "#new", draft });
  };
  const edit = (p: CustomPlay) => {
    const draft = draftFromCustom(p);
    open({ id: p.id, base: JSON.stringify(draft), draft });
  };
  const duplicate = (p: CustomPlay) => {
    const r = duplicateCustomPlay(customs, p.id);
    if (r.ok) {
      commit(r.plays, `Duplicated as ${r.play.name}.`);
      setSelected(r.play.id);
    } else setMsg({ text: Object.values(r.errors)[0] ?? "Couldn't duplicate that play.", bad: true });
  };
  const remove = (p: CustomPlay) => {
    commit(deleteCustomPlay(customs, p.id), `Deleted ${p.name}.`);
    setConfirmDel(null);
    if (selected === p.id) setSelected(null);
    headRef.current?.focus();
  };

  const exportAll = () => {
    if (!customs.length) return;
    setMsg(download("gridiron-custom-plays.json", exportCustomPlaysJson(customs)) ? { text: `Exported ${customs.length} custom play${customs.length === 1 ? "" : "s"}.` } : { text: "Couldn't create the export file.", bad: true });
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const rep = importCustomPlaysJson(await f.text(), customs);
      const added = rep.merged.length - customs.length;
      if (added > 0) commit(rep.merged, `Imported ${added} play${added === 1 ? "" : "s"}${rep.dropped.length ? `; ${rep.dropped.length} couldn't be used (${rep.dropped[0].reason})` : ""}.`);
      else setMsg({ text: rep.dropped.length ? `Nothing imported: ${rep.dropped[0].reason}` : "That file has no plays in it.", bad: true });
    } catch {
      setMsg({ text: "Couldn't read that file.", bad: true });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  if (editor) {
    return (
      <EditorForm
        key={editor.id ?? editor.base}
        editor={editor}
        customs={customs}
        onChange={(draft) => setEditor({ ...editor, draft })}
        onCancel={() => setEditor(null)}
        onSaved={(plays, play) => {
          setEditor(null);
          setUnit(play.unit);
          setSelected(play.id);
          commit(plays, editor.id ? `Saved ${play.name}.` : `Created ${play.name}.`);
        }}
      />
    );
  }

  return (
    <div className="gr-stack gr-pb">
      <Panel
        title={<span ref={headRef} tabIndex={-1}>Playbook library</span>}
        actions={
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={startNew} disabled={customs.length >= MAX_CUSTOM_PLAYS}><Plus size={16} aria-hidden="true" /> New {unit} play</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Upload size={16} aria-hidden="true" /> Import plays</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportAll} disabled={!customs.length} title={customs.length ? "Download your custom plays as a file" : "Create a custom play first"}><Download size={16} aria-hidden="true" /> Export plays</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Import custom plays file" onChange={(e) => void importFile(e.target.files?.[0])} />
          </>
        }
      >
        <p className="meta gr-pb-note">
          Custom plays are calls you can pick on game day, built from the play types the engine understands. They are saved with this career. You choose a template concept; routes are not drawn or edited, and your coordinators never call a custom play.
        </p>
        <div className="gr-pb-bar">
          <Seg label="Side of the ball" value={unit} options={[["offense", "Offense"], ["defense", "Defense"]]} onChange={switchUnit} />
          <Seg label="Source" value={source} options={[["all", "All"], ["builtin", "Built-in"], ["custom", `Custom (${customCount})`], ["fav", "Favorites"]]} onChange={setSource} />
        </div>
        <div className="gr-pb-filters">
          <label>Search<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Play name or idea" /></label>
          <label>Category
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">All categories</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          {unit === "offense" && (
            <>
              <label>Formation
                <select value={formation} onChange={(e) => setFormation(e.target.value)}>
                  <option value="all">All formations</option>
                  {FORMATIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label>Personnel
                <select value={personnel} onChange={(e) => setPersonnel(e.target.value)}>
                  <option value="all">All personnel</option>
                  {PERSONNELS.map((p) => <option key={p} value={p}>{PERSONNEL_LABEL[p]}</option>)}
                </select>
              </label>
            </>
          )}
          <label>Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="category">Category</option>
              <option value="name">Name</option>
              <option value="fav">Favorites first</option>
            </select>
          </label>
        </div>
        {msg && <p className={`gr-msg${msg.bad ? " is-bad" : ""}`} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
        <p className="meta" aria-live="polite">{items.length} play{items.length === 1 ? "" : "s"} shown</p>
      </Panel>

      <div className="gr-pb-layout">
        <div className="gr-pb-list">
          {items.length === 0 && (
            <p className="gr-empty">
              {source === "custom" && !filtersOn ? "No custom plays yet. Make one from scratch or copy a built-in play." : source === "custom" && customCount === 0 ? `No custom ${unit} plays yet.` : source === "fav" && !favs.length ? "No favorites yet. Star a play to pin it here." : "No plays match these filters."}
              {filtersOn && <> <button type="button" className="btn btn-quiet btn-sm" onClick={clearFilters}>Clear filters</button></>}
            </p>
          )}
          <ul className="gr-pb-grid">
            {items.map(({ def, custom }) => {
              const fav = favs.includes(def.id);
              const asking = confirmDel === def.id && custom;
              return (
                <li key={def.id} className={selected === def.id ? "is-sel" : ""}>
                  <PlayCard def={def} custom={!!custom} badge={custom && !custom.enabled ? <span className="gr-pb-tag is-off">Hidden in game</span> : undefined} />
                  <div className="gr-pb-actions">
                    <button type="button" className="btn btn-quiet btn-sm" aria-pressed={fav} aria-label={`${fav ? "Unpin" : "Pin"} ${def.name}`} onClick={() => toggleFav(def.id)}>
                      <Star size={16} aria-hidden="true" fill={fav ? "currentColor" : "none"} /> {fav ? "Pinned" : "Pin"}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" aria-pressed={selected === def.id} onClick={() => setSelected(selected === def.id ? null : def.id)}>Preview</button>
                    {custom ? (
                      <>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => edit(custom)} aria-label={`Edit ${def.name}`}><Pencil size={16} aria-hidden="true" /> Edit</button>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => duplicate(custom)} aria-label={`Duplicate ${def.name}`}><Copy size={16} aria-hidden="true" /> Duplicate</button>
                        <button type="button" className="btn btn-quiet btn-sm gr-danger" onClick={() => setConfirmDel(def.id)} aria-label={`Delete ${def.name}`}><Trash2 size={16} aria-hidden="true" /> Delete</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => copyBuiltIn(def.id)} aria-label={`Copy ${def.name} to a custom play`}><Copy size={16} aria-hidden="true" /> Copy to custom</button>
                    )}
                  </div>
                  {custom && (
                    <label className="gr-pb-check">
                      <input type="checkbox" checked={custom.enabled} onChange={(e) => commit(setCustomPlayEnabled(customs, custom.id, e.target.checked), `${custom.name} ${e.target.checked ? "is available in live games" : "is hidden from live games"}.`)} />
                      Available in live games
                    </label>
                  )}
                  {asking && custom && (
                    <div className="gr-confirm" role="alertdialog" aria-label={`Delete ${def.name}`}>
                      <p>Delete {custom.name}? This can't be undone. Games already played keep their results.</p>
                      <div className="gr-call-row">
                        <button type="button" autoFocus className="btn btn-secondary btn-sm gr-danger" onClick={() => remove(custom)}>Delete play</button>
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmDel(null)}>Keep it</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <aside className="gr-pb-side" aria-label="Play preview">
          <Panel title="Preview">
            {preview ? (
              <>
                <PlayCard def={preview.def} custom={!!preview.custom} />
                <p className="meta">
                  {preview.custom
                    ? preview.custom.enabled ? `Shows in the ${preview.custom.unit} play picker during live games.` : "Hidden from the live-game picker until you turn it on."
                    : "Built-in plays are always in the live-game picker. Copy it to make your own version."}
                </p>
              </>
            ) : <p className="gr-empty">Pick Preview on a play to see its card and details here.</p>}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({ label, error, hint, children, id, sim }: { label: string; error?: string; hint?: string; children: ReactNode; id: string; sim?: boolean }) {
  return (
    <div className={`gr-pb-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label} {sim !== undefined && <span className={`gr-pb-tag is-quiet${sim ? "" : " is-info"}`}>{sim ? "Changes the game" : "Label only"}</span>}</label>
      {children}
      {hint && !error && <span className="meta">{hint}</span>}
      {error && <span className="gr-pb-err" id={`${id}-err`} role="alert">{error}</span>}
    </div>
  );
}

function EditorForm({ editor, customs, onChange, onCancel, onSaved }: {
  editor: Editor;
  customs: CustomPlay[];
  onChange: (d: CustomPlayDraft) => void;
  onCancel: () => void;
  onSaved: (plays: CustomPlay[], play: CustomPlay) => void;
}) {
  const uid = useId();
  const d = editor.draft;
  const isOff = d.unit === "offense";
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [discard, setDiscard] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); nameRef.current?.select(); }, []);

  const dirty = JSON.stringify(d) !== editor.base;
  const result = validateCustomPlay(d, customs, editor.id);
  const errors: FieldErrors = result.ok ? {} : result.errors;
  const shown = (f: string) => (submitted || touched[f] ? errors[f] : undefined);
  const set = (patch: Partial<CustomPlayDraft>) => onChange(patchDraft(d, patch));
  const sim = (f: string) => (SIMULATION_FIELDS[d.unit] as readonly string[]).includes(f);
  const id = (f: string) => `${uid}-${f}`;
  const err = (f: string) => (shown(f) ? { "aria-invalid": true, "aria-describedby": `${id(f)}-err` } as const : {});

  const save = () => {
    setSubmitted(true);
    const r = editor.id ? updateCustomPlay(customs, editor.id, d) : createCustomPlay(customs, d);
    if (r.ok) onSaved(r.plays, r.play);
  };
  const cancel = () => (dirty ? setDiscard(true) : onCancel());

  const previewDef = result.ok ? (result.play.unit === "offense" ? customToOffDef(result.play) : customToDefDef(result.play)) : null;
  const sel = (f: string, value: string | undefined, options: Array<[string, string]>, onSet: (v: string) => void) => (
    <select id={id(f)} value={value ?? ""} onChange={(e) => onSet(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, [f]: true }))} {...err(f)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div className="gr-stack gr-pb">
      <Panel title={`${editor.id ? "Edit" : "New"} ${d.unit} play${d.basedOn && !editor.id ? " (copied from a built-in)" : ""}`}>
        <p className="meta gr-pb-note">
          Pick the template this play runs. Fields marked "Changes the game" are what the engine reads when you call it. Routes come from the concept; you can't draw or edit them.
        </p>
        <form className="gr-pb-form" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <Field label="Name" id={id("name")} error={shown("name")} hint={`${NAME_MAX} characters max. Shown on the play card and in live games.`} sim={false}>
            <input ref={nameRef} id={id("name")} value={d.name ?? ""} maxLength={NAME_MAX + 8} autoComplete="off" onChange={(e) => set({ name: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, name: true }))} {...err("name")} />
          </Field>
          <Field label="Description" id={id("tagline")} error={shown("tagline")} hint={`Optional, ${TAGLINE_MAX} characters max.`} sim={false}>
            <input id={id("tagline")} value={d.tagline ?? ""} maxLength={TAGLINE_MAX + 20} autoComplete="off" onChange={(e) => set({ tagline: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, tagline: true }))} {...err("tagline")} />
          </Field>
          {isOff ? (
            <>
              <Field label="Formation" id={id("formation")} error={shown("formation")} sim={sim("formation")} hint="Sets the pre-snap alignment.">
                {sel("formation", d.formation, FORMATIONS.map((f) => [f, f]), (v) => set({ formation: v as CustomPlayDraft["formation"] }))}
              </Field>
              <Field label="Personnel" id={id("personnel")} error={shown("personnel")} sim={sim("personnel")} hint="Only groupings that fit the formation are listed.">
                {sel("personnel", d.personnel, personnelFor(d.formation!).map((p) => [p, PERSONNEL_LABEL[p]]), (v) => set({ personnel: v as CustomPlayDraft["personnel"] }))}
              </Field>
              <Field label="Play type" id={id("type")} error={shown("type")} sim={sim("type")}>
                {sel("type", d.type, typesFor(d.formation!, d.personnel!).filter((t) => CALLABLE_TYPES.includes(t)).map((t) => [t, TYPE_LABEL[t] ?? t]), (v) => set({ type: v as CustomPlayDraft["type"] }))}
              </Field>
              <Field label="Concept" id={id("concept")} error={shown("concept")} sim={sim("concept")} hint="The template the play runs, including its routes or blocking.">
                {sel("concept", d.concept, conceptsFor(d.formation!, d.personnel!, d.type!).map((x) => [x, x]), (v) => set({ concept: v }))}
              </Field>
              {d.type === "run" && (
                <Field label="Run gap" id={id("gap")} error={shown("gap")} sim={sim("gap")}>
                  {sel("gap", d.gap, gapsForConceptOf(d.concept!).map((g) => [g, GAP_LABEL[g]]), (v) => set({ gap: v as CustomPlayDraft["gap"] }))}
                </Field>
              )}
              <Field label="Direction" id={id("side")} sim={sim("side")} hint="Mirrors which way the play breaks.">
                {sel("side", String(d.side ?? 1), [["1", "Standard"], ["-1", "Mirrored"]], (v) => set({ side: v === "-1" ? -1 : 1 }))}
              </Field>
            </>
          ) : (
            <>
              <Field label="Defensive package" id={id("pkg")} error={shown("pkg")} sim={sim("pkg")}>
                {sel("pkg", d.pkg, DEF_PACKAGES.map((p) => [p, p]), (v) => set({ pkg: v as CustomPlayDraft["pkg"] }))}
              </Field>
              <Field label="Call" id={id("call")} error={shown("call")} sim={sim("call")} hint="Only calls the package can run are listed.">
                {sel("call", d.call, callsFor(d.pkg!).map((x) => [x, x]), (v) => set({ call: v as CustomPlayDraft["call"] }))}
              </Field>
              <Field label="Coverage shell" id={id("shell")} error={shown("shell")} sim={sim("shell")}>
                {sel("shell", d.shell, shellsFor(d.call!).map((x) => [x, x]), (v) => set({ shell: v as CustomPlayDraft["shell"] }))}
              </Field>
            </>
          )}
          <label className="gr-pb-check">
            <input type="checkbox" checked={d.enabled !== false} onChange={(e) => set({ enabled: e.target.checked })} />
            Available in live games. Turn off to keep it in the library without showing it on game day.
          </label>
          {shown("id") || shown("unit") ? <p className="gr-pb-err" role="alert">{shown("id") ?? shown("unit")}</p> : null}
          {submitted && !result.ok && <p className="gr-pb-err" role="alert">Fix the highlighted fields to save.</p>}
          <div className="gr-call-row">
            <button type="submit" className="btn btn-primary">{editor.id ? "Save changes" : "Create play"}</button>
            <button type="button" className="btn btn-quiet" onClick={cancel}>Cancel</button>
            {dirty && <span className="meta" role="status">Unsaved changes</span>}
          </div>
          {discard && (
            <div className="gr-confirm" role="alertdialog" aria-label="Discard changes">
              <p>Discard your changes to this play?</p>
              <div className="gr-call-row">
                <button type="button" autoFocus className="btn btn-secondary btn-sm gr-danger" onClick={onCancel}>Discard changes</button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDiscard(false)}>Keep editing</button>
              </div>
            </div>
          )}
        </form>
      </Panel>
      <Panel title="Card preview">
        {previewDef ? <PlayCard def={previewDef} custom /> : <p className="gr-empty">The card appears here once the play is valid.</p>}
      </Panel>
    </div>
  );
}
