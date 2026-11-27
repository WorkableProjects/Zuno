import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BarChart3, BookOpen, CalendarDays, ClipboardList, Download, DollarSign, GraduationCap, Home, Layers, Library, ListOrdered, Repeat2, Save, ShieldHalf, Trophy, UserPlus, Users,
} from "lucide-react";
import type { GridironFile } from "../../game-files/schema/gridiron";
import { advance, finishLiveGame, newCareer, recordResult, userTeam, weekLabel } from "./gmCareer";
import { finishGame, type GameState } from "./gmEngine";
import { DEFAULT_TEAMS, generateLeague, teamRating, type TeamSeed } from "./gmLeague";
import { deleteCareer, exportCareerText, exportFileName, importCareerText, loadCareerResult, migrateCareer, readIndex, rebuildIndex, saveCareerResult, SLOTS, type SavedCareer, type SlotInfo } from "./gmSave";
import type { Career, ScheduledGame } from "./gmTypes";
import { DraftRoom, Cap, FreeAgency, Trades } from "./screens/Front";
import { Playbook } from "./screens/Playbook";
import { GameDay } from "./screens/GameDay";
import { Hub } from "./screens/Hub";
import { History, Leaders, Standings } from "./screens/League";
import { DepthChart, GamePlan, PlayerCard, Roster, Staff } from "./screens/Team";
import { Ctx, DirtyCtx, Ovr, TeamLogo, type GmCtx } from "./screens/ui";
import { gameFontStyle } from "../gameFont";
import { chime } from "./gmSfx";
import "./gridiron.css";
import "./gridironShell.css";

interface Props {
  file: GridironFile;
  onExit: () => void;
}

const NAV: Array<[string, string, typeof Home]> = [
  ["hub", "Hub", Home],
  ["roster", "Roster", Users],
  ["depth", "Depth chart", Layers],
  ["plan", "Game plan", ClipboardList],
  ["playbook", "Playbook", Library],
  ["cap", "Cap and contracts", DollarSign],
  ["fa", "Free agency", UserPlus],
  ["trades", "Trades", Repeat2],
  ["draft", "Draft room", GraduationCap],
  ["staff", "Staff", ShieldHalf],
  ["standings", "Standings", ListOrdered],
  ["leaders", "Stat leaders", BarChart3],
  ["history", "League history", BookOpen],
];

export function GridironPlay({ file, onExit }: Props) {
  const [career, setCareer] = useState<Career | null>(null);
  const [screen, setScreen] = useState("hub");
  const [, setTick] = useState(0);
  const [toast, setToast] = useState("");
  const [player, setPlayer] = useState<number | null>(null);
  const [live, setLive] = useState<{ game: ScheduledGame; side: 0 | 1 | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: "saved", at: null });
  const [leaving, setLeaving] = useState<"quit" | "slots" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingScreen, setPendingScreen] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const [savingNow, setSavingNow] = useState(false);
  const toastId = useRef(0);
  const rev = useRef(0);

  const flash = (m?: string) => {
    if (!m) return;
    setToast(m);
    const id = ++toastId.current;
    window.setTimeout(() => toastId.current === id && setToast(""), 3500);
  };

  const update = useCallback((m?: string) => {
    setTick((x) => x + 1);
    rev.current++;
    setSaveState((s) => (s.status === "saving" ? s : { status: "unsaved", at: s.at }));
    flash(m);
  }, [career]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Writes the career. Reports success only after storage confirms; failures stay visible in the nav. */
  const persist = useCallback(async (c: Career, quiet = true): Promise<boolean> => {
    const mark = rev.current;
    setSaveState((s) => ({ status: "saving", at: s.at }));
    const r = await saveCareerResult(c);
    if (r.ok) {
      setSaveState({ status: mark === rev.current ? "saved" : "unsaved", at: c.updatedAt });
      if (!quiet) flash("Saved to this device.");
    } else {
      setSaveState((s) => ({ status: "error", at: s.at, error: r.error }));
      flash(r.error ?? "Couldn't save.");
    }
    return r.ok;
  }, []);

  /** Screens report work in progress (a deal, a play being edited); leaving them asks first. */
  const reportDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
    setDirty(d);
  }, []);
  const gotoScreen = useCallback((to: string) => {
    if (dirtyRef.current && to !== screenRef.current) setPendingScreen(to);
    else setScreen(to);
  }, []);
  const screenRef = useRef("hub");
  screenRef.current = screen;

  useEffect(() => {
    if (!career) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState.status !== "saved" || dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [career, saveState.status, dirty]);

  useEffect(() => {
    if (!leaving) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setLeaving(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [leaving]);

  useEffect(() => {
    if (!pendingScreen) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPendingScreen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [pendingScreen]);

  const doAdvance = () => {
    if (!career || busy) return;
    setBusy(true);
    // Let the button state paint before the sim runs.
    window.setTimeout(() => {
      try {
        const m = advance(career);
        update(m);
        void persist(career);
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const ctx: GmCtx | null = useMemo(() => (career ? { c: career, update, openPlayer: setPlayer, go: gotoScreen } : null), [career, update, gotoScreen]);

  if (!career || !ctx) return <div className="gr-app" style={gameFontStyle("gridiron")}><Saves file={file} onExit={onExit} onLoad={(c) => { setCareer(c); setScreen("hub"); setSaveState({ status: "saved", at: c.updatedAt || null }); }} /></div>;

  const t = userTeam(career);
  const unread = career.inbox.filter((m) => !m.read).length;
  const leave = (to: "quit" | "slots") => {
    if (saveState.status === "saved" && !dirty) return finishLeave(to);
    setLeaving(to);
  };
  const finishLeave = (to: "quit" | "slots") => {
    setLeaving(null);
    reportDirty(false);
    if (to === "quit") onExit();
    else setCareer(null);
  };
  const saveAndLeave = async (to: "quit" | "slots") => {
    setSavingNow(true);
    const ok = await persist(career);
    setSavingNow(false);
    if (ok) finishLeave(to);
  };

  const endLive = (g: GameState) => {
    if (!live) return;
    if (!live.game.result) {
      if (live.side === null) recordResult(career, live.game, finishGame(g));
      else finishLiveGame(career, live.game, g);
    }
    setLive(null);
    update(`Final: ${career.teams[live.game.away].abbr} ${g.score[1]}, ${career.teams[live.game.home].abbr} ${g.score[0]}`);
    void persist(career);
  };

  return (
    <Ctx.Provider value={ctx}>
      <DirtyCtx.Provider value={reportDirty}>
      <div className="gr-app" style={{ ...gameFontStyle("gridiron"), "--team": t.colors[0], "--team-2": t.colors[1] } as React.CSSProperties}>
        {live ? (
          <GameDay
            key={live.game.id}
            game={live.game}
            userSide={live.side}
            onDone={endLive}
            onExit={() => undefined}
          />
        ) : (
          <div className="gr-shell">
            <nav className="gr-nav" aria-label="Gridiron GM">
              <div className="gr-nav-team">
                <TeamLogo team={t} size={36} />
                <div>
                  <strong>{t.city} {t.name}</strong>
                  <span className="meta">{weekLabel(career)}</span>
                  <span className={`gr-savestat is-${saveState.status}`} role="status">{saveLabel(saveState)}</span>
                </div>
              </div>
              <ul>
                {NAV.map(([id, label, Icon]) => (
                  <li key={id}>
                    <button type="button" className={screen === id ? "is-on" : ""} onClick={() => gotoScreen(id)} aria-current={screen === id ? "page" : undefined}>
                      <Icon size={16} strokeWidth={1.5} />
                      <span>{label}</span>
                      {id === "hub" && unread > 0 && <span className="meta num gr-unread" aria-label={`${unread} unread message${unread === 1 ? "" : "s"}`}>{unread}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="gr-nav-foot">
                <button type="button" disabled={saveState.status === "saving"} title={`Save to slot ${career.slot} on this device`} onClick={() => { void persist(career, false).then((ok) => ok && chime(true)); }}>
                  <Save size={16} strokeWidth={1.5} /> <span>{saveState.status === "error" ? "Retry save" : `Save to slot ${career.slot}`}</span>
                </button>
                <button type="button" title="Download a copy of this career as a file" onClick={() => flash(exportCareer(career))}>
                  <Download size={16} strokeWidth={1.5} /> <span>Export file</span>
                </button>
                <button type="button" title="Go to the three save slots" onClick={() => leave("slots")}>
                  <CalendarDays size={16} strokeWidth={1.5} /> <span>Save slots</span>
                </button>
                <button type="button" onClick={() => leave("quit")}>
                  <ArrowLeft size={16} strokeWidth={1.5} /> <span>Quit to Zuno</span>
                </button>
              </div>
            </nav>
            <main className="gr-content" aria-busy={busy}>
              <header className="gr-content-head" key={`h-${screen}`}>
                <div className="gr-title">
                  <span className="gr-eyebrow">{t.city} {t.name} · {weekLabel(career)}</span>
                  <h1>{NAV.find((n) => n[0] === screen)?.[1]}</h1>
                </div>
                {screen !== "hub" && (
                  <button type="button" className={`btn btn-primary gr-advance${busy ? " is-busy" : ""}`} onClick={doAdvance} disabled={busy}>
                    {busy ? <><span className="gr-spin" aria-hidden="true" /> Simulating</> : "Advance"}
                  </button>
                )}
              </header>
              <div className="gr-screen" key={screen}>
              {screen === "hub" && (
                <Hub
                  onPlay={(g) => setLive({ game: g, side: g.home === career.userTeam ? 0 : 1 })}
                  onWatch={(g) => setLive({ game: g, side: null })}
                  onAdvance={doAdvance}
                />
              )}
              {screen === "roster" && <Roster />}
              {screen === "depth" && <DepthChart />}
              {screen === "plan" && <GamePlan />}
              {screen === "playbook" && <Playbook />}
              {screen === "cap" && <Cap />}
              {screen === "fa" && <FreeAgency />}
              {screen === "trades" && <Trades />}
              {screen === "draft" && <DraftRoom />}
              {screen === "staff" && <Staff />}
              {screen === "standings" && <Standings />}
              {screen === "leaders" && <Leaders />}
              {screen === "history" && <History />}
              </div>
            </main>
          </div>
        )}
        {leaving && (
          <div className="gr-modal-back" onClick={() => !savingNow && setLeaving(null)}>
            <div className="gr-modal" role="alertdialog" aria-modal="true" aria-labelledby="gr-leave-t" aria-describedby="gr-leave-d" onClick={(e) => e.stopPropagation()}>
              <h2 id="gr-leave-t"><AlertTriangle size={18} aria-hidden="true" /> {saveState.status === "error" ? "Your career isn't saved" : "You have unsaved changes"}</h2>
              <p id="gr-leave-d">
                {saveState.status === "error"
                  ? `${saveState.error ?? "The save failed."} Export a file to keep a copy before you leave.`
                  : "Changes since your last save will be lost if you leave now."}
              </p>
              <div className="gr-call-row">
                <button type="button" autoFocus className="btn btn-primary btn-sm" disabled={savingNow} onClick={() => void saveAndLeave(leaving)}>{savingNow ? "Saving" : "Save and leave"}</button>
                {saveState.status === "error" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => flash(exportCareer(career))}>Export file</button>}
                <button type="button" className="btn btn-quiet btn-sm gr-danger" disabled={savingNow} onClick={() => finishLeave(leaving)}>Leave without saving</button>
                <button type="button" className="btn btn-quiet btn-sm" disabled={savingNow} onClick={() => setLeaving(null)}>Stay</button>
              </div>
            </div>
          </div>
        )}
        {pendingScreen && (
          <div className="gr-modal-back" onClick={() => setPendingScreen(null)}>
            <div className="gr-modal" role="alertdialog" aria-modal="true" aria-labelledby="gr-pend-t" aria-describedby="gr-pend-d" onClick={(e) => e.stopPropagation()}>
              <h2 id="gr-pend-t"><AlertTriangle size={18} aria-hidden="true" /> Leave without finishing?</h2>
              <p id="gr-pend-d">{screen === "trades" ? "Your trade proposal hasn't been sent. Leaving clears the deal you're building." : "You have unsaved edits on this screen. Leaving discards them."}</p>
              <div className="gr-call-row">
                <button type="button" autoFocus className="btn btn-primary btn-sm" onClick={() => setPendingScreen(null)}>Stay</button>
                <button type="button" className="btn btn-quiet btn-sm gr-danger" onClick={() => { const to = pendingScreen; reportDirty(false); setPendingScreen(null); setScreen(to); }}>Leave</button>
              </div>
            </div>
          </div>
        )}
        {player !== null && <PlayerCard key={player} id={player} onClose={() => setPlayer(null)} />}
        {toast && <div className="gr-toast" role="status" aria-live="polite">{toast}</div>}
      </div>
      </DirtyCtx.Provider>
    </Ctx.Provider>
  );
}

interface SaveState {
  status: "saved" | "unsaved" | "saving" | "error";
  at: number | null;
  error?: string;
}

function saveLabel(s: SaveState): string {
  if (s.status === "saving") return "Saving";
  if (s.status === "error") return "Not saved";
  if (s.status === "unsaved") return "Unsaved changes";
  return s.at ? `Saved ${new Date(s.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved";
}

/** Downloads a copy of the career as a file. Returns the message to show. */
function exportCareer(c: Career): string {
  try {
    const blob = new Blob([exportCareerText(c)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName(c);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return `Exported ${a.download}. It's a copy for moving or backing up, separate from your save slots.`;
  } catch {
    return "Couldn't create the export file.";
  }
}

// ---------------------------------------------------------------------------

function Saves({ file, onExit, onLoad }: { file: GridironFile; onExit: () => void; onLoad: (c: Career) => void }) {
  const [index, setIndex] = useState<SlotInfo[]>(() => readIndex());
  const [creating, setCreating] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "new" | "import"; slot: number } | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);

  const [picked, setPicked] = useState<{ ok: true; career: SavedCareer; notes: string[] } | { ok: false; error: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = importCareerText(await f.text());
      setPicked(r.ok ? { ok: true, career: r.career, notes: r.warnings } : { ok: false, error: r.errors.join(" ") });
    } catch {
      setPicked({ ok: false, error: "That file could not be read." });
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const imported = useMemo(() => {
    if (picked) return picked;
    if (!file.content.career) return null;
    const m = migrateCareer(file.content.career);
    return m.ok ? m : { ok: false as const, error: m.error };
  }, [file, picked]);

  const refresh = useCallback(async () => {
    setIndex(await rebuildIndex());
    setLoaded(true);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, creating]);

  useEffect(() => {
    if (!confirm) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setConfirm(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [confirm]);

  const open = async (slot: number) => {
    if (busySlot !== null) return;
    setBusySlot(slot);
    const r = await loadCareerResult(slot);
    setBusySlot(null);
    if (r.status === "ok") onLoad(r.career);
    else if (r.status === "empty") setMsg({ text: `Slot ${slot} is empty.`, bad: true });
    else setMsg({ text: `Slot ${slot} couldn't be read: ${r.reason} You can delete it to start over.`, bad: true });
    if (r.status !== "ok") void refresh();
  };

  const doImport = async (slot: number) => {
    if (!imported || !imported.ok || busySlot !== null) return;
    setBusySlot(slot);
    setConfirm(null);
    const c: SavedCareer = { ...imported.career, slot };
    const r = await saveCareerResult(c);
    setBusySlot(null);
    if (r.ok) onLoad(c);
    else setMsg({ text: r.error ?? "Couldn't save the imported career.", bad: true });
  };

  const doDelete = async (slot: number) => {
    setConfirm(null);
    const ok = await deleteCareer(slot);
    setMsg(ok ? { text: `Slot ${slot} deleted.`, bad: false } : { text: `Slot ${slot} couldn't be fully deleted.`, bad: true });
    await refresh();
  };

  if (creating !== null) {
    return (
      <NewCareer
        slot={creating}
        teams={file.content.league?.teams ?? DEFAULT_TEAMS}
        onBack={() => setCreating(null)}
        onStart={async (c) => {
          const r = await saveCareerResult(c);
          if (r.ok) onLoad(c);
          return r.ok ? null : { error: r.error ?? "Couldn't save.", proceed: () => onLoad(c) };
        }}
      />
    );
  }

  const occupied = (s: number) => index.some((x) => x.slot === s);
  const slotBtn = (s: number, kind: "new" | "import") => {
    const label = kind === "new" ? "New career here" : `Load into slot ${s}`;
    return (
      <button
        key={s}
        type="button"
        className={kind === "new" ? "btn btn-quiet btn-sm" : "btn btn-secondary btn-sm"}
        disabled={busySlot !== null}
        onClick={() => (occupied(s) ? setConfirm({ kind, slot: s }) : kind === "new" ? setCreating(s) : void doImport(s))}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="gr-saves">
      <header className="gr-saves-head">
        <button type="button" className="btn btn-quiet" onClick={onExit}><ArrowLeft size={16} /> Back to Zuno</button>
        <div className="gr-hero">
          <span className="gr-eyebrow">Franchise mode{file.content.league ? " · custom league" : ""}</span>
          <h1 ref={headRef} tabIndex={-1}>Gridiron GM</h1>
          <p>Build a roster, call the plays and chase the Zuno Bowl. Three save slots, kept on this device.</p>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Import career file" onChange={(e) => void pickFile(e.target.files?.[0])} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>Import career file</button>
        </div>
      </header>
      {imported && (
        <section className="gr-panel" aria-labelledby="gr-imp-t">
          <h2 id="gr-imp-t">Imported career</h2>
          {imported.ok ? (
            <>
              <p>
                <strong>{imported.career.coachName}</strong> · {imported.career.teams[imported.career.userTeam].city} {imported.career.teams[imported.career.userTeam].name} · {imported.career.year} · {imported.career.phase === "regular" ? `Week ${imported.career.week}` : imported.career.phase}
                {(imported.career.customPlays?.length ?? 0) > 0 && ` · ${imported.career.customPlays!.length} custom play${imported.career.customPlays!.length === 1 ? "" : "s"}`}
              </p>
              {imported.notes.map((n) => <p key={n} className="meta">{n}</p>)}
              <p className="meta">Pick a slot to open it in. Nothing is overwritten until you confirm.</p>
              <div className="gr-call-row">{SLOTS.map((s) => slotBtn(s, "import"))}</div>
            </>
          ) : (
            <p className="gr-msg is-bad" role="alert">This career can't be opened: {imported.error}</p>
          )}
        </section>
      )}
      <ol className="gr-slots" aria-busy={!loaded}>
        {SLOTS.map((s) => {
          const info = index.find((x) => x.slot === s);
          const asking = confirm?.slot === s ? confirm : null;
          return (
            <li key={s} className="gr-slot" style={info && !info.corrupt ? ({ "--tc": info.colors[0] } as React.CSSProperties) : undefined}>
              <span className="meta">Slot {s}</span>
              {info?.corrupt ? (
                <>
                  <strong className="gr-danger">Unreadable save</strong>
                  <span className="meta">{info.label}</span>
                  <div className="gr-call-row">
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCreating(s)}>New career here</button>
                    <button type="button" className="btn btn-quiet btn-sm gr-danger" onClick={() => setConfirm({ kind: "delete", slot: s })}>Delete</button>
                  </div>
                </>
              ) : info ? (
                <>
                  <strong>{info.team}</strong>
                  <span className="meta">{info.coach} · {info.label}</span>
                  <span className="meta">Last saved {info.updatedAt ? new Date(info.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "unknown"}</span>
                  <div className="gr-call-row">
                    <button type="button" className="btn btn-primary btn-sm" disabled={busySlot !== null} onClick={() => void open(s)}>{busySlot === s ? "Opening" : "Continue"}</button>
                    <button type="button" className="btn btn-quiet btn-sm" disabled={busySlot !== null} onClick={() => setConfirm({ kind: "new", slot: s })}>New career here</button>
                    <button type="button" className="btn btn-quiet btn-sm gr-danger" disabled={busySlot !== null} onClick={() => setConfirm({ kind: "delete", slot: s })}>Delete</button>
                  </div>
                </>
              ) : (
                <>
                  <strong className="is-empty">Empty slot</strong>
                  <span className="meta">{loaded ? "No career saved here yet. Pick a team and start one." : "Checking this slot"}</span>
                  <div className="gr-call-row">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(s)}>New career</button>
                  </div>
                </>
              )}
              {asking && (
                <div className="gr-confirm" role="alertdialog" aria-label={`Confirm for slot ${s}`}>
                  <p>
                    {asking.kind === "delete" && `Delete slot ${s}? This can't be undone. Export it first if you want a copy.`}
                    {asking.kind === "new" && `Start a new career in slot ${s}? The existing career is replaced once you save the new one.`}
                    {asking.kind === "import" && `Replace the career in slot ${s} with the imported one?`}
                  </p>
                  <div className="gr-call-row">
                    <button
                      type="button"
                      autoFocus
                      className="btn btn-secondary btn-sm gr-danger"
                      onClick={() => (asking.kind === "delete" ? void doDelete(s) : asking.kind === "import" ? void doImport(s) : (setConfirm(null), setCreating(s)))}
                    >
                      {asking.kind === "delete" ? "Delete" : "Replace"}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {msg && <p className={`gr-msg${msg.bad ? " is-bad" : ""}`} role={msg.bad ? "alert" : "status"}>{msg.text}</p>}
      <p className="meta">
        Careers autosave to the slot after every week and when a game ends. A slot lives in this browser; an exported file is a separate copy you can move to another browser (use Export file inside a career).
      </p>
    </div>
  );
}

function NewCareer({ slot, teams, onBack, onStart }: {
  slot: number;
  teams: TeamSeed[];
  onBack: () => void;
  onStart: (c: Career) => Promise<{ error: string; proceed: () => void } | null>;
}) {
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const [name, setName] = useState("");
  const [pickId, setPickId] = useState<number | null>(null);
  const preview = useMemo(() => generateLeague(seed, teams), [seed, teams]);
  const ratings = useMemo(() => preview.teams.map((t) => teamRating(t, preview.players)), [preview]);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<{ error: string; proceed: () => void } | null>(null);
  const timer = useRef<number | null>(null);
  const cancelled = useRef(false);
  const built = useRef<Career | null>(null);

  useEffect(() => () => {
    cancelled.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const start = () => {
    if (pickId === null || starting) return;
    cancelled.current = false;
    setStarting(true);
    setFailure(null);
    timer.current = window.setTimeout(async () => {
      try {
        if (!built.current) built.current = newCareer({ seed, teamId: pickId, coachName: name.trim() || "Coach", slot, teams });
        if (cancelled.current) return;
        const f = await onStart(built.current);
        if (cancelled.current) return;
        if (f) setFailure(f);
      } catch {
        setFailure({ error: "Couldn't build the league. Try again.", proceed: () => undefined });
      }
      setStarting(false);
    }, 20);
  };

  const cancel = () => {
    cancelled.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);
    built.current = null;
    setStarting(false);
  };

  const chosen = pickId !== null ? preview.teams[pickId] : null;
  return (
    <div className="gr-saves">
      <header className="gr-saves-head">
        <button type="button" className="btn btn-quiet" onClick={onBack} disabled={starting}><ArrowLeft size={16} /> Back to save slots</button>
        <div className="gr-hero"><span className="gr-eyebrow">Slot {slot}</span><h1>New career</h1></div>
      </header>
      <label className="gr-field-label">
        Coach name
        <input value={name} maxLength={40} autoComplete="off" disabled={starting} onChange={(e) => setName(e.target.value)} placeholder="Coach" />
        <span className="meta">Optional. Shown on your save slot. Leave blank to be "Coach".</span>
      </label>
      <h2 className="gr-section-title">Pick a franchise</h2>
      <ul className="gr-teampick" role="group" aria-label="Franchises">
        {preview.teams.map((t, i) => (
          <li key={t.id}>
            <button type="button" disabled={starting} className={pickId === t.id ? "is-on" : ""} aria-pressed={pickId === t.id} onClick={() => setPickId(t.id)} style={{ "--tc": t.colors[0] } as React.CSSProperties}>
              <TeamLogo team={t} size={36} />
              <span>
                <strong>{t.city}</strong> {t.name}
              </span>
              <span className="meta">
                <Ovr value={ratings[i].ovr} /> · {t.market} market · patience {t.ownerPatience}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="gr-start-bar">
        <span className="meta" aria-live="polite">
          {failure ? failure.error : starting ? "Building the league. This takes a moment." : chosen ? `${chosen.city} ${chosen.name}` : "Choose a franchise to continue"}
        </span>
        <div className="gr-call-row">
          {failure && (
            <button type="button" className="btn btn-quiet" onClick={() => failure.proceed()}>Continue without saving</button>
          )}
          {starting && <button type="button" className="btn btn-quiet" onClick={cancel}>Cancel</button>}
          <button type="button" className="btn btn-primary" disabled={pickId === null || starting} onClick={start}>
            {starting ? <><span className="gr-spin" aria-hidden="true" /> Building</> : <><Trophy size={16} /> {failure ? "Retry save" : "Start career"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
