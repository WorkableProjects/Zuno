import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, X } from "lucide-react";
import type { DefPlayDef, OffPlayDef, SitTag } from "../gmPlayCatalog";

/** The situation a call is being made in. All fields are in the calling team's frame (ballOn from its own goal). */
export interface PickSit {
  down: number;
  dist: number;
  ballOn: number;
  quarter: number;
  clock: number;
  /** Calling team's lead (negative when trailing). */
  diff: number;
}

export type PlayDef = OffPlayDef | DefPlayDef;
export type Unit = "offense" | "defense";

export const TAG_LABEL: Record<SitTag, string> = {
  "short-yardage": "Short yardage",
  "goal-line": "Goal line",
  "red-zone": "Red zone",
  "two-minute": "Two-minute",
  "long-yardage": "Long yardage",
  neutral: "Any situation",
};

/** Tags the current situation asks for, most specific first. */
export function wantedTags(s: PickSit): SitTag[] {
  const w: SitTag[] = [];
  const toGo = s.ballOn + s.dist >= 100;
  if (toGo && s.ballOn >= 95) w.push("goal-line");
  if (s.dist <= 2) w.push("short-yardage");
  if (s.ballOn >= 80) w.push("red-zone");
  if ((s.quarter === 2 || s.quarter === 4) && s.clock <= 120) w.push("two-minute");
  if (s.dist >= 8) w.push("long-yardage");
  return w;
}

export function situationText(s: PickSit): string {
  const w = wantedTags(s);
  return w.length ? w.map((t) => TAG_LABEL[t]).join(" · ") : "Balanced situation";
}

/** Plays that fit the situation best (never more than `max`), with the reasons. Deterministic, catalog order breaks ties. */
export function suggest<T extends PlayDef>(plays: T[], s: PickSit, max = 6): Array<{ play: T; why: SitTag[] }> {
  const want = wantedTags(s);
  const scored = plays.map((play, i) => {
    const why = want.filter((t) => play.tags.includes(t));
    // Built-ins first on ties: the user's customs are reachable through their own tab.
    return { play, why, score: why.length * 10 - (want.indexOf(why[0] ?? "neutral") + 1) * 0.1, i };
  });
  const hits = scored.filter((x) => x.why.length > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  const out = hits.slice(0, max).map(({ play, why }) => ({ play, why }));
  if (out.length < Math.min(max, 4)) {
    for (const x of scored) {
      if (out.length >= Math.min(max, 4)) break;
      if (!out.some((o) => o.play.id === x.play.id) && x.play.origin !== "custom" && x.play.tags.includes("neutral")) out.push({ play: x.play, why: [] });
    }
  }
  return out;
}

const isOff = (p: PlayDef): p is OffPlayDef => "formation" in p.call;
export function metaOf(p: PlayDef): string {
  if (isOff(p)) return `${p.call.formation} · ${p.call.personnel} personnel · ${p.call.type === "playaction" ? "play action" : p.call.type}`;
  const c = (p as DefPlayDef).call;
  return `${c.pkg} · ${c.call} · ${c.shell}`;
}
const formationOf = (p: PlayDef) => (isOff(p) ? p.call.formation : (p as DefPlayDef).call.pkg);
const personnelOf = (p: PlayDef) => (isOff(p) ? p.call.personnel : (p as DefPlayDef).call.call);

type Tab = "suggested" | "all" | "a" | "b" | "situational" | "starred" | "recent" | "custom";

const OFF_RUN = ["Inside Run", "Outside Run", "Gap Run", "Draw"];
const DEF_COVER = ["Zone", "Man", "Prevent"];

export interface PlayFilter {
  tab: Tab;
  query: string;
  formation: string;
  personnel: string;
}

/** Pure list filter, exported for tests. `starred`/`recent` are play ids. */
export function filterPlays<T extends PlayDef>(plays: T[], unit: Unit, f: PlayFilter, starred: string[], recent: string[]): T[] {
  const q = f.query.trim().toLowerCase();
  let list = plays;
  if (f.tab === "a") list = plays.filter((p) => (unit === "offense" ? OFF_RUN.includes(p.group) : DEF_COVER.includes(p.group) || p.group === "Zone"));
  else if (f.tab === "b") list = plays.filter((p) => (unit === "offense" ? !OFF_RUN.includes(p.group) : p.group === "Blitz" || p.group === "Run D"));
  else if (f.tab === "situational") list = plays.filter((p) => p.tags.some((t) => t !== "neutral") || (unit === "defense" && (p.group === "Prevent" || p.group === "Goal Line")));
  else if (f.tab === "starred") list = plays.filter((p) => starred.includes(p.id));
  else if (f.tab === "recent") list = recent.map((id) => plays.find((p) => p.id === id)).filter((p): p is T => !!p);
  else if (f.tab === "custom") list = plays.filter((p) => p.origin === "custom");
  if (f.formation) list = list.filter((p) => formationOf(p) === f.formation);
  if (f.personnel) list = list.filter((p) => personnelOf(p) === f.personnel);
  if (q) list = list.filter((p) => `${p.name} ${p.tagline} ${p.group} ${metaOf(p)}`.toLowerCase().includes(q));
  return list;
}

interface Prefs {
  starred: string[];
  recent: string[];
  tab: Partial<Record<Unit, Tab>>;
}
function readPrefs(key: string): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<Prefs> | null;
    return { starred: Array.isArray(raw?.starred) ? raw!.starred.filter((x) => typeof x === "string") : [], recent: Array.isArray(raw?.recent) ? raw!.recent.filter((x) => typeof x === "string") : [], tab: raw?.tab && typeof raw.tab === "object" ? raw.tab : {} };
  } catch {
    return { starred: [], recent: [], tab: {} };
  }
}

interface Props<T extends PlayDef> {
  unit: Unit;
  plays: T[];
  sit: PickSit;
  /** localStorage key for per-device favorites and recents. */
  storageKey: string;
  onPick: (p: T) => void;
  onCoordinator: () => void;
  coordinatorLabel: string;
}

export function PlayPicker<T extends PlayDef>({ unit, plays, sit, storageKey, onPick, onCoordinator, coordinatorLabel }: Props<T>) {
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs(storageKey));
  const [tab, setTab] = useState<Tab>(prefs.tab[unit] ?? "suggested");
  const [query, setQuery] = useState("");
  const [formation, setFormation] = useState("");
  const [personnel, setPersonnel] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const save = (next: Prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* storage can be unavailable: favorites then last for this session only */
    }
  };
  const pick = (p: T) => {
    save({ ...prefs, recent: [p.id, ...prefs.recent.filter((x) => x !== p.id)].slice(0, 8) });
    onPick(p);
  };
  const toggleStar = (id: string) => save({ ...prefs, starred: prefs.starred.includes(id) ? prefs.starred.filter((x) => x !== id) : [...prefs.starred, id] });

  const customCount = plays.filter((p) => p.origin === "custom").length;
  const tabs: Array<[Tab, string]> = [
    ["suggested", "Suggested"],
    ["all", "All"],
    ["a", unit === "offense" ? "Run" : "Coverage"],
    ["b", unit === "offense" ? "Pass" : "Pressure"],
    ["situational", "Situational"],
    ["starred", `Starred${prefs.starred.length ? ` (${prefs.starred.length})` : ""}`],
    ["recent", "Recent"],
    ["custom", `Custom${customCount ? ` (${customCount})` : ""}`],
  ];
  const changeTab = (t: Tab) => {
    setTab(t);
    save({ ...prefs, tab: { ...prefs.tab, [unit]: t } });
  };

  const forms = useMemo(() => [...new Set(plays.map(formationOf))], [plays]);
  const pers = useMemo(() => [...new Set(plays.map(personnelOf))], [plays]);
  const filtering = !!(query.trim() || formation || personnel);
  const effectiveTab: Tab = tab === "suggested" && filtering ? "all" : tab;
  const rows = useMemo(() => {
    if (effectiveTab === "suggested") return suggest(plays, sit);
    return filterPlays(plays, unit, { tab: effectiveTab, query, formation, personnel }, prefs.starred, prefs.recent).map((play) => ({ play, why: [] as SitTag[] }));
  }, [plays, sit, unit, effectiveTab, query, formation, personnel, prefs.starred, prefs.recent]);

  // Group headings for the long lists; the suggested list is flat.
  const groups = useMemo(() => {
    if (effectiveTab === "suggested" || effectiveTab === "recent") return [["", rows] as const];
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(r.play.group, [...(m.get(r.play.group) ?? []), r]);
    return [...m.entries()];
  }, [rows, effectiveTab]);
  const flat = rows.map((r) => r.play);

  // Number keys 1-9 pick the visible card in that position, 0 the coordinator.
  const flatRef = useRef(flat);
  flatRef.current = flat;
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const coordRef = useRef(onCoordinator);
  coordRef.current = onCoordinator;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      if (e.key === "0") return coordRef.current();
      const p = flatRef.current[Number(e.key) - 1];
      if (p) pickRef.current(p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    tabRefs.current[to]?.focus();
    changeTab(tabs[to][0]);
  };

  let counter = 0;
  const empty =
    effectiveTab === "starred" ? "No starred plays yet. Use the star on a card to keep it here." :
    effectiveTab === "recent" ? "Plays you call show up here." :
    effectiveTab === "custom" ? "No custom plays in this career yet. Plays you design in the playbook appear here, for you to call." :
    "No plays match these filters.";

  return (
    <div className="gr-picker">
      <div className="gr-picker-top">
        <div className="gr-picker-tabs" role="tablist" aria-label={`${unit === "offense" ? "Offensive" : "Defensive"} play lists`}>
          {tabs.map(([t, l], i) => (
            <button key={t} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" id={`gr-tab-${t}`} aria-selected={effectiveTab === t} aria-controls="gr-picker-panel" tabIndex={effectiveTab === t ? 0 : -1} className={effectiveTab === t ? "is-on" : ""} onClick={() => changeTab(t)} onKeyDown={(e) => onTabKey(e, i)}>
              {l}
            </button>
          ))}
        </div>
        <div className="gr-picker-filters">
          <label className="gr-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Search plays"
              aria-label="Search plays"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  if (query) setQuery("");
                  else (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </label>
          <select aria-label={unit === "offense" ? "Formation" : "Package"} value={formation} onChange={(e) => setFormation(e.target.value)}>
            <option value="">{unit === "offense" ? "Any formation" : "Any package"}</option>
            {forms.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select aria-label={unit === "offense" ? "Personnel" : "Call type"} value={personnel} onChange={(e) => setPersonnel(e.target.value)}>
            <option value="">{unit === "offense" ? "Any personnel" : "Any call"}</option>
            {pers.map((f) => <option key={f} value={f}>{unit === "offense" ? `${f} personnel` : f}</option>)}
          </select>
          {filtering && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setQuery(""); setFormation(""); setPersonnel(""); }}>
              <X size={14} aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div id="gr-picker-panel" role="tabpanel" aria-labelledby={`gr-tab-${effectiveTab}`} className="gr-picker-list">
        {effectiveTab === "suggested" && (
          <p className="gr-picker-sit">
            <strong>For this situation:</strong> {situationText(sit)}
          </p>
        )}
        <button type="button" className="gr-card is-auto gr-pcard-auto" data-key="0" aria-keyshortcuts="0" onClick={onCoordinator}>
          <strong><kbd className="gr-kbd">0</kbd>Coordinator call</strong>
          <span className="meta">{coordinatorLabel}</span>
        </button>
        {rows.length === 0 ? (
          <p className="gr-empty" role="status">{empty}</p>
        ) : (
          groups.map(([name, list]) => (
            <section key={name || "list"} className="gr-picker-group" aria-label={name || undefined}>
              {name && <h4>{name}</h4>}
              <div className="gr-cards">
                {list.map(({ play, why }) => {
                  const n = ++counter;
                  const starred = prefs.starred.includes(play.id);
                  return (
                    <div key={play.id} className="gr-pcard">
                      <button type="button" className="gr-card" data-key={n <= 9 ? n : undefined} aria-keyshortcuts={n <= 9 ? String(n) : undefined} onClick={() => pick(play)}>
                        <strong>
                          {n <= 9 && <kbd className="gr-kbd">{n}</kbd>}
                          {play.name}
                          {play.origin === "custom" && <span className="gr-pcard-badge">Custom</span>}
                        </strong>
                        <span className="meta">{metaOf(play)}</span>
                        <span className="gr-pcard-tag">{why.length ? `Fits: ${why.map((t) => TAG_LABEL[t]).join(", ")}` : play.tagline}</span>
                      </button>
                      <button type="button" className={`gr-pcard-star${starred ? " is-on" : ""}`} aria-pressed={starred} aria-label={`${starred ? "Unstar" : "Star"} ${play.name}`} onClick={() => toggleStar(play.id)}>
                        <Star size={14} aria-hidden="true" fill={starred ? "currentColor" : "none"} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
