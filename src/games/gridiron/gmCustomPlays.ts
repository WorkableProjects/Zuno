/**
 * Custom plays: a user-authored play-call library that the live game can use exactly like a built-in play.
 *
 * Design decisions (see report T2):
 *  - Custom plays are metadata-only: every simulation field maps onto something the engine reads
 *    (see the header of gmPlayCatalog.ts). There is NO route drawing. Pass routes come from a template
 *    concept (gmRoutes CONCEPTS), chosen from the concept list. Do not describe this as route drawing in the UI.
 *  - Storage is a plain JSON array: `career.customPlays?: CustomPlay[]`. Every function here is pure
 *    (list in, list out) so the career save can store the result directly.
 *  - Custom plays are user-only unless the author sets `aiEligible` AND the caller passes them to the
 *    coordinator (aiOffCall/aiDefCall `opts.custom`). The engine does not do that today, so the AI never uses them.
 *  - Parsing is defensive: invalid entries are dropped one by one and reported, never thrown.
 */
import {
  CALLABLE_TYPES,
  DEF_CALLS,
  DEF_CATALOG,
  DEF_PACKAGES,
  FORMATIONS,
  GAPS,
  OFF_CATALOG,
  PERSONNELS,
  SHELLS,
  conceptsForType,
  defGroup,
  defTags,
  findBuiltinDef,
  findBuiltinOff,
  gapsForConcept,
  isBuiltinDefName,
  isBuiltinOffName,
  nameKey,
  offGroup,
  offTags,
  validateDefensivePlay,
  validateOffensivePlay,
  type DefPlayDef,
  type OffPlayDef,
  type ValidationIssue,
} from "./gmPlayCatalog";
import type { Coverage, DefCall, DefPackage, Formation, Personnel, PlayType } from "./gmTypes";

export const CUSTOM_PLAY_SCHEMA_VERSION = 1;
export const MAX_CUSTOM_PLAYS = 80;
export const NAME_MIN = 2;
export const NAME_MAX = 32;
export const TAGLINE_MAX = 80;

export type PlayUnit = "offense" | "defense";

interface CustomBase {
  /** Stable, namespaced id: "custom-off-<slug>" / "custom-def-<slug>". Never collides with a built-in id. */
  id: string;
  unit: PlayUnit;
  name: string;
  /** Informational only (shown on the card, no simulation effect). */
  tagline: string;
  /** Disabled plays are kept in the library but hidden from the live-game picker. */
  enabled: boolean;
  /** Coordinator may call this play. Honoured only when the caller passes custom plays to the AI. */
  aiEligible: boolean;
  /** Schema version this entry was written with. */
  schema: number;
  /** Edit counter (informational). */
  rev: number;
  /** Id of the built-in play it was copied from, if any (informational). */
  basedOn?: string;
}

export interface CustomOffPlay extends CustomBase {
  unit: "offense";
  formation: Formation;
  personnel: Personnel;
  type: PlayType;
  concept: string;
  gap?: "A" | "B" | "C" | "D";
  side: -1 | 1;
}

export interface CustomDefPlay extends CustomBase {
  unit: "defense";
  pkg: DefPackage;
  call: DefCall;
  shell: Coverage;
}

export type CustomPlay = CustomOffPlay | CustomDefPlay;

/** Editable shape used by forms. Everything optional so a half-filled form is representable. */
export interface CustomPlayDraft {
  unit: PlayUnit;
  name?: string;
  tagline?: string;
  enabled?: boolean;
  aiEligible?: boolean;
  basedOn?: string;
  formation?: Formation;
  personnel?: Personnel;
  type?: PlayType;
  concept?: string;
  gap?: "A" | "B" | "C" | "D";
  side?: -1 | 1;
  pkg?: DefPackage;
  call?: DefCall;
  shell?: Coverage;
}

/** Which draft fields change the simulation, and which are display-only. For the editor UI. */
export const SIMULATION_FIELDS: Record<PlayUnit, readonly string[]> = {
  offense: ["formation", "personnel", "type", "concept", "gap", "side"],
  defense: ["pkg", "call", "shell"],
};
export const INFORMATIONAL_FIELDS: readonly string[] = ["name", "tagline", "enabled", "aiEligible"];

export type FieldErrors = Record<string, string>;
export type CustomResult = { ok: true; plays: CustomPlay[]; play: CustomPlay } | { ok: false; errors: FieldErrors };
export type ValidateResult = { ok: true; play: CustomPlay; errors: FieldErrors } | { ok: false; errors: FieldErrors };

// ---------------------------------------------------------------------------
// Names and ids

export const cleanName = (s: unknown): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 '.\-/&()+]*$/;

export function slugify(name: string): string {
  const s = nameKey(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "play";
}

const prefix = (unit: PlayUnit) => (unit === "offense" ? "custom-off-" : "custom-def-");

/** Deterministic id: slug of the name, suffixed -2, -3... until unused. */
export function makeCustomId(unit: PlayUnit, name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = prefix(unit) + slugify(name);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

function nameTaken(unit: PlayUnit, name: string, plays: readonly CustomPlay[], ignoreId?: string): boolean {
  const key = nameKey(name);
  if (unit === "offense" ? isBuiltinOffName(name) : isBuiltinDefName(name)) return true;
  return plays.some((p) => p.unit === unit && p.id !== ignoreId && nameKey(p.name) === key);
}

/** First free name of the form "Base", "Base 2", "Base 3"... */
export function uniqueName(unit: PlayUnit, base: string, plays: readonly CustomPlay[], ignoreId?: string): string {
  const root = cleanName(base).slice(0, NAME_MAX - 3) || "Custom Play";
  let name = cleanName(base).slice(0, NAME_MAX) || "Custom Play";
  for (let n = 2; nameTaken(unit, name, plays, ignoreId); n++) name = `${root} ${n}`;
  return name;
}

// ---------------------------------------------------------------------------
// Validation

function issuesToErrors(issues: ValidationIssue[]): FieldErrors {
  const e: FieldErrors = {};
  for (const i of issues) if (!e[i.field]) e[i.field] = i.message;
  return e;
}

/**
 * Validate a draft against the engine rules and the existing library.
 * `editingId` excludes that play from the name-uniqueness check. On success `play` is fully normalised;
 * its id is taken from `editingId` when given, else generated.
 */
export function validateCustomPlay(draft: CustomPlayDraft, existing: readonly CustomPlay[] = [], editingId?: string): ValidateResult {
  const errors: FieldErrors = {};
  const unit = draft.unit;
  if (unit !== "offense" && unit !== "defense") return { ok: false, errors: { unit: "Choose offense or defense." } };
  const name = cleanName(draft.name);
  if (name.length < NAME_MIN) errors.name = `Name must be at least ${NAME_MIN} characters.`;
  else if (name.length > NAME_MAX) errors.name = `Name must be ${NAME_MAX} characters or fewer.`;
  else if (!NAME_RE.test(name)) errors.name = "Use letters, numbers, spaces and - ' . / & ( ) + only.";
  else if (nameTaken(unit, name, existing, editingId)) errors.name = isBuiltinNameFor(unit, name) ? "That name is used by a built-in play." : "You already have a play with that name.";
  const tagline = typeof draft.tagline === "string" ? draft.tagline.replace(/\s+/g, " ").trim() : "";
  if (tagline.length > TAGLINE_MAX) errors.tagline = `Description must be ${TAGLINE_MAX} characters or fewer.`;
  if (!editingId && existing.length >= MAX_CUSTOM_PLAYS) errors.name = `Library is full (${MAX_CUSTOM_PLAYS} custom plays). Delete one first.`;

  const prior = editingId ? existing.find((p) => p.id === editingId) : undefined;
  const base = { name, tagline, enabled: draft.enabled !== false, aiEligible: draft.aiEligible === true, schema: CUSTOM_PLAY_SCHEMA_VERSION, rev: (prior?.rev ?? 0) + (prior ? 1 : 1) };
  const basedOn = draft.basedOn ?? prior?.basedOn;
  const id = prior?.id ?? makeCustomId(unit, name || "play", [...existing.map((p) => p.id), ...OFF_CATALOG.map((p) => p.id), ...DEF_CATALOG.map((p) => p.id)]);

  if (unit === "offense") {
    const call = { formation: draft.formation, personnel: draft.personnel, type: draft.type, concept: draft.concept, gap: draft.gap, side: draft.side ?? 1 };
    Object.assign(errors, { ...issuesToErrors(validateOffensivePlay(call)), ...errors });
    if (Object.keys(errors).length) return { ok: false, errors };
    const play: CustomOffPlay = { ...base, id, unit, ...(basedOn ? { basedOn } : {}), formation: call.formation!, personnel: call.personnel!, type: call.type!, concept: call.concept!, ...(call.gap && call.type === "run" ? { gap: call.gap } : {}), side: call.side };
    return { ok: true, play, errors };
  }
  const call = { pkg: draft.pkg, call: draft.call, shell: draft.shell };
  Object.assign(errors, { ...issuesToErrors(validateDefensivePlay(call)), ...errors });
  if (Object.keys(errors).length) return { ok: false, errors };
  const play: CustomDefPlay = { ...base, id, unit, ...(basedOn ? { basedOn } : {}), pkg: call.pkg!, call: call.call!, shell: call.shell! };
  return { ok: true, play, errors };
}

const isBuiltinNameFor = (unit: PlayUnit, name: string) => (unit === "offense" ? isBuiltinOffName(name) : isBuiltinDefName(name));

// ---------------------------------------------------------------------------
// Drafts

/** A valid starting draft for a new play, with a unique name. */
export function newCustomPlayDraft(unit: PlayUnit, existing: readonly CustomPlay[] = []): CustomPlayDraft {
  const name = uniqueName(unit, unit === "offense" ? "Custom Pass" : "Custom Call", existing);
  if (unit === "offense") return { unit, name, tagline: "", enabled: true, aiEligible: false, formation: "Shotgun", personnel: "11", type: "short", concept: "Slant-Flat", side: 1 };
  return { unit, name, tagline: "", enabled: true, aiEligible: false, pkg: "Nickel", call: "Zone", shell: "Cover 3" };
}

/** Draft from an existing custom play (for editing). */
export function draftFromCustom(play: CustomPlay): CustomPlayDraft {
  const { id: _id, schema: _s, rev: _r, ...rest } = play;
  return { ...rest };
}

/** Copy a built-in play into an editable draft with a unique name. */
export function draftFromBuiltIn(builtInId: string, existing: readonly CustomPlay[] = []): CustomPlayDraft | null {
  const o = OFF_CATALOG.find((p) => p.id === builtInId);
  if (o) return { unit: "offense", name: uniqueName("offense", `My ${o.name}`, existing), tagline: o.tagline.slice(0, TAGLINE_MAX), enabled: true, aiEligible: false, basedOn: o.id, formation: o.call.formation, personnel: o.call.personnel, type: o.call.type, concept: o.call.concept, gap: o.call.gap, side: 1 };
  const d = DEF_CATALOG.find((p) => p.id === builtInId);
  if (d) return { unit: "defense", name: uniqueName("defense", `My ${d.name}`, existing), tagline: d.tagline.slice(0, TAGLINE_MAX), enabled: true, aiEligible: false, basedOn: d.id, pkg: d.call.pkg, call: d.call.call, shell: d.call.shell };
  return null;
}

/**
 * Apply a field change to a draft and repair dependent fields so the draft stays valid
 * (e.g. changing type picks a concept of that type; changing concept picks a legal gap;
 * changing formation picks legal personnel). Intended for controlled forms.
 */
export function patchDraft(draft: CustomPlayDraft, patch: Partial<CustomPlayDraft>): CustomPlayDraft {
  const d: CustomPlayDraft = { ...draft, ...patch };
  if (d.unit === "offense") {
    const f = d.formation ?? "Shotgun";
    const allowedP = personnelFor(f);
    if (!d.personnel || !allowedP.includes(d.personnel)) d.personnel = allowedP[0];
    const types = typesFor(f, d.personnel);
    if (!d.type || !types.includes(d.type)) d.type = types[0];
    const concepts = conceptsFor(f, d.personnel, d.type);
    if (!d.concept || !concepts.includes(d.concept)) d.concept = concepts[0];
    if (d.type === "run") {
      const gaps = gapsForConcept(d.concept);
      if (!d.gap || !gaps.includes(d.gap)) d.gap = gaps[0];
    } else delete d.gap;
    if (d.side !== -1 && d.side !== 1) d.side = 1;
  } else {
    const pkgCalls = DEF_PACKAGES.includes(d.pkg as DefPackage) ? (d.pkg as DefPackage) : "Base";
    d.pkg = pkgCalls;
    const calls = callsFor(d.pkg);
    if (!d.call || !calls.includes(d.call)) d.call = calls[0];
    const shells = shellsFor(d.call);
    if (!d.shell || !shells.includes(d.shell)) d.shell = shells[0];
  }
  return d;
}

/** Option lists for dependent dropdowns (only legal values are offered). */
export function personnelFor(f: Formation): Personnel[] {
  return PERSONNELS.filter((p) => validateOffensivePlay({ formation: f, personnel: p, type: firstType(f, p), concept: "x" }).every((i) => i.field !== "personnel"));
}
export function typesFor(f: Formation, p: Personnel): PlayType[] {
  return CALLABLE_TYPES.filter((t) => !validateOffensivePlay({ formation: f, personnel: p, type: t, concept: "x" }).some((i) => i.field === "type"));
}
export function conceptsFor(f: Formation, p: Personnel, t: PlayType): string[] {
  return conceptsForType(t).filter((c) => !validateOffensivePlay({ formation: f, personnel: p, type: t, concept: c, gap: t === "run" ? gapsForConcept(c)[0] : undefined }).length);
}
function firstType(f: Formation, p: Personnel): PlayType {
  return CALLABLE_TYPES.find((t) => !validateOffensivePlay({ formation: f, personnel: p, type: t, concept: "x" }).some((i) => i.field === "type")) ?? "short";
}
export function callsFor(pkg: DefPackage): DefCall[] {
  return DEF_CALLS.filter((c) => !validateDefensivePlay({ pkg, call: c, shell: "Cover 3" }).some((i) => i.field === "call"));
}
export function shellsFor(call: DefCall): Coverage[] {
  return SHELLS.filter((s) => !validateDefensivePlay({ pkg: "Base", call, shell: s }).some((i) => i.field === "shell"));
}
export { GAPS, FORMATIONS, PERSONNELS, CALLABLE_TYPES, DEF_PACKAGES, DEF_CALLS, SHELLS };

// ---------------------------------------------------------------------------
// Library operations (pure: list in, new list out)

export function createCustomPlay(list: readonly CustomPlay[], draft: CustomPlayDraft): CustomResult {
  const r = validateCustomPlay(draft, list);
  if (!r.ok) return r;
  return { ok: true, plays: [...list, r.play], play: r.play };
}

export function updateCustomPlay(list: readonly CustomPlay[], id: string, draft: CustomPlayDraft): CustomResult {
  const prior = list.find((p) => p.id === id);
  if (!prior) return { ok: false, errors: { id: "That play no longer exists." } };
  if (prior.unit !== draft.unit) return { ok: false, errors: { unit: "A play cannot switch between offense and defense." } };
  const r = validateCustomPlay(draft, list, id);
  if (!r.ok) return r;
  return { ok: true, plays: list.map((p) => (p.id === id ? r.play : p)), play: r.play };
}

export function deleteCustomPlay(list: readonly CustomPlay[], id: string): CustomPlay[] {
  return list.filter((p) => p.id !== id);
}

export function setCustomPlayEnabled(list: readonly CustomPlay[], id: string, enabled: boolean): CustomPlay[] {
  return list.map((p) => (p.id === id ? { ...p, enabled } : p));
}

/** Duplicate a custom play. The copy gets a unique "<name> 2" style name, a new id, and is not AI-eligible. */
export function duplicateCustomPlay(list: readonly CustomPlay[], id: string): CustomResult {
  const src = list.find((p) => p.id === id);
  if (!src) return { ok: false, errors: { id: "That play no longer exists." } };
  const draft = { ...draftFromCustom(src), name: uniqueName(src.unit, `${src.name} Copy`, list), aiEligible: false };
  return createCustomPlay(list, draft);
}

// ---------------------------------------------------------------------------
// Catalog entries

export function customToOffDef(p: CustomOffPlay): OffPlayDef {
  const call = { formation: p.formation, personnel: p.personnel, type: p.type, concept: p.concept, ...(p.gap ? { gap: p.gap } : {}), side: p.side, playId: p.id, label: p.name };
  return { id: p.id, origin: "custom", name: p.name, tagline: p.tagline || `${p.formation} ${p.personnel}, ${p.concept}`, call, group: offGroup(call), tags: offTags(call), ai: p.enabled && p.aiEligible };
}

export function customToDefDef(p: CustomDefPlay): DefPlayDef {
  const call = { pkg: p.pkg, call: p.call, shell: p.shell, playId: p.id, label: p.name };
  return { id: p.id, origin: "custom", name: p.name, tagline: p.tagline || `${p.pkg} ${p.call}, ${p.shell}`, call, group: defGroup(call), tags: defTags(call), ai: p.enabled && p.aiEligible };
}

/** What a built-in play is, for UI badges. */
export const builtinFor = { off: findBuiltinOff, def: findBuiltinDef };

// ---------------------------------------------------------------------------
// Serialization, migration, corruption handling

export interface CustomPlaysBlob {
  version: number;
  plays: CustomPlay[];
}

export interface ParseReport {
  plays: CustomPlay[];
  /** Entries that could not be kept, with why. Show to the player as "N custom plays could not be loaded". */
  dropped: Array<{ index: number; reason: string }>;
  /** True if anything was repaired/renamed/upgraded. */
  changed: boolean;
}

export function serializeCustomPlays(plays: readonly CustomPlay[]): CustomPlaysBlob {
  return { version: CUSTOM_PLAY_SCHEMA_VERSION, plays: plays.map((p) => ({ ...p })) };
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/**
 * Read custom plays from anything a save might contain: undefined (old saves), the legacy bare array,
 * a `{version, plays}` blob, or garbage. Never throws. Unknown fields are discarded so nothing the engine
 * ignores can persist; invalid entries are dropped; duplicate ids/names are repaired deterministically.
 */
export function parseCustomPlays(raw: unknown): ParseReport {
  const out: CustomPlay[] = [];
  const dropped: ParseReport["dropped"] = [];
  let changed = false;
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object" && Array.isArray((raw as { plays?: unknown }).plays)) {
    list = (raw as { plays: unknown[] }).plays;
    const v = (raw as { version?: unknown }).version;
    if (v !== CUSTOM_PLAY_SCHEMA_VERSION) changed = true;
  } else if (raw !== undefined && raw !== null) dropped.push({ index: -1, reason: "Custom plays data was not a list." });
  const takenIds = new Set<string>([...OFF_CATALOG.map((p) => p.id), ...DEF_CATALOG.map((p) => p.id)]);
  list.forEach((entry, index) => {
    if (out.length >= MAX_CUSTOM_PLAYS) {
      dropped.push({ index, reason: "Library limit reached." });
      return;
    }
    if (!entry || typeof entry !== "object") {
      dropped.push({ index, reason: "Not an object." });
      return;
    }
    const e = entry as Record<string, unknown>;
    const unit = e.unit === "offense" || e.unit === "defense" ? e.unit : undefined;
    if (!unit) {
      dropped.push({ index, reason: "Unknown play unit." });
      return;
    }
    // Repair the name first so a duplicate does not discard an otherwise valid play.
    let name = cleanName(str(e.name));
    if (name.length < NAME_MIN || !NAME_RE.test(name.slice(0, NAME_MAX))) {
      dropped.push({ index, reason: "Missing or invalid name." });
      return;
    }
    name = name.slice(0, NAME_MAX).trim();
    if (nameTaken(unit, name, out)) {
      name = uniqueName(unit, name, out);
      changed = true;
    }
    const draft: CustomPlayDraft = {
      unit,
      name,
      tagline: (str(e.tagline) ?? "").slice(0, TAGLINE_MAX),
      enabled: e.enabled !== false,
      aiEligible: e.aiEligible === true,
      basedOn: str(e.basedOn),
      formation: str(e.formation) as Formation | undefined,
      personnel: str(e.personnel) as Personnel | undefined,
      type: str(e.type) as PlayType | undefined,
      concept: str(e.concept),
      gap: str(e.gap) as CustomPlayDraft["gap"],
      side: e.side === -1 ? -1 : 1,
      pkg: str(e.pkg) as DefPackage | undefined,
      call: str(e.call) as DefCall | undefined,
      shell: str(e.shell) as Coverage | undefined,
    };
    const v = validateCustomPlay(draft, out);
    if (!v.ok) {
      dropped.push({ index, reason: Object.values(v.errors)[0] ?? "Invalid play." });
      return;
    }
    let id = str(e.id);
    if (!id || !id.startsWith(prefix(unit)) || takenIds.has(id)) {
      id = makeCustomId(unit, name, takenIds);
      changed = true;
    }
    takenIds.add(id);
    const rev = typeof e.rev === "number" && Number.isFinite(e.rev) && e.rev >= 1 ? Math.floor(e.rev) : 1;
    const play = { ...v.play, id, rev } as CustomPlay;
    if (e.schema !== CUSTOM_PLAY_SCHEMA_VERSION) changed = true;
    out.push(play);
  });
  if (dropped.length) changed = true;
  return { plays: out, dropped, changed };
}

/** Read `career.customPlays` safely (old careers return []). */
export const customPlaysOf = (career: { customPlays?: unknown } | null | undefined): CustomPlay[] => parseCustomPlays(career?.customPlays).plays;

/** Return a copy of the career with the library replaced. Pure; T4 decides when to persist. */
export function withCustomPlays<C extends { customPlays?: unknown }>(career: C, plays: readonly CustomPlay[]): C {
  return { ...career, customPlays: serializeCustomPlays(plays).plays };
}

/** Export-friendly JSON string of the library (for sharing plays outside a career file). */
export const exportCustomPlaysJson = (plays: readonly CustomPlay[]): string => JSON.stringify(serializeCustomPlays(plays), null, 2);

/** Import from a JSON string. Imported plays are merged into `existing`; conflicts are renamed, ids regenerated. */
export function importCustomPlaysJson(json: string, existing: readonly CustomPlay[] = []): ParseReport & { merged: CustomPlay[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { plays: [], dropped: [{ index: -1, reason: "File is not valid JSON." }], changed: true, merged: [...existing] };
  }
  const rep = parseCustomPlays(raw);
  const merged = [...existing];
  for (const p of rep.plays) {
    if (merged.length >= MAX_CUSTOM_PLAYS) {
      rep.dropped.push({ index: -1, reason: "Library limit reached." });
      break;
    }
    const name = uniqueName(p.unit, p.name, merged);
    const id = makeCustomId(p.unit, name, [...merged.map((m) => m.id), ...OFF_CATALOG.map((b) => b.id), ...DEF_CATALOG.map((b) => b.id)]);
    merged.push({ ...p, name, id });
  }
  return { ...rep, merged };
}
