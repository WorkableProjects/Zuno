import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BarChart3, BookOpen, CalendarDays, ClipboardList, Download, DollarSign, GraduationCap, Home, Layers, ListOrdered, Repeat2, Save, ShieldHalf, Trophy, UserPlus, Users,
} from "lucide-react";
import type { GridironFile } from "../../game-files/schema/gridiron";
import { advance, finishLiveGame, newCareer, recordResult, userTeam, weekLabel } from "./gmCareer";
import { finishGame, type GameState } from "./gmEngine";
import { DEFAULT_TEAMS, generateLeague, teamRating, type TeamSeed } from "./gmLeague";
import { deleteCareer, exportableCareer, loadCareer, readIndex, saveCareer, SLOTS, type SlotInfo } from "./gmSave";
import type { Career, ScheduledGame } from "./gmTypes";
import { DraftRoom, Cap, FreeAgency, Trades } from "./screens/Front";
import { GameDay } from "./screens/GameDay";
import { Hub } from "./screens/Hub";
import { History, Leaders, Standings } from "./screens/League";
import { DepthChart, GamePlan, PlayerCard, Roster, Staff } from "./screens/Team";
import { Ctx, Ovr, TeamLogo, type GmCtx } from "./screens/ui";
import "./gridiron.css";

interface Props {
  file: GridironFile;
  onExit: () => void;
}

const NAV: Array<[string, string, typeof Home]> = [
  ["hub", "Hub", Home],
  ["roster", "Roster", Users],
  ["depth", "Depth chart", Layers],
  ["plan", "Game plan", ClipboardList],
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
  const toastId = useRef(0);

  const flash = (m?: string) => {
    if (!m) return;
    setToast(m);
    const id = ++toastId.current;
    window.setTimeout(() => toastId.current === id && setToast(""), 3500);
  };

  const update = useCallback((m?: string) => {
    setTick((x) => x + 1);
    if (career) career.updatedAt = Date.now();
    flash(m);
  }, [career]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (c: Career) => {
    const ok = await saveCareer(c);
    if (!ok) flash("Couldn't save. Your browser storage may be full.");
  }, []);

  const doAdvance = () => {
    if (!career || busy) return;
    setBusy(true);
    // Let the button state paint before the sim runs.
    window.setTimeout(() => {
      const m = advance(career);
      update(m);
      void persist(career);
      setBusy(false);
    }, 20);
  };

  const ctx: GmCtx | null = useMemo(() => (career ? { c: career, update, openPlayer: setPlayer, go: setScreen } : null), [career, update]);

  if (!career || !ctx) return <Saves file={file} onExit={onExit} onLoad={(c) => { setCareer(c); setScreen("hub"); }} />;

  const t = userTeam(career);
  const unread = career.inbox.filter((m) => !m.read).length;

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
      <div className="gr-app" style={{ "--team": t.colors[0], "--team-2": t.colors[1] } as React.CSSProperties}>
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
                <TeamLogo team={t} size={32} />
                <div>
                  <strong>{t.abbr}</strong>
                  <span className="meta">{weekLabel(career)}</span>
                </div>
              </div>
              <ul>
                {NAV.map(([id, label, Icon]) => (
                  <li key={id}>
                    <button type="button" className={screen === id ? "is-on" : ""} onClick={() => setScreen(id)} aria-current={screen === id ? "page" : undefined}>
                      <Icon size={16} strokeWidth={1.5} />
                      <span>{label}</span>
                      {id === "hub" && unread > 0 && <span className="meta num">{unread}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="gr-nav-foot">
                <button type="button" onClick={() => { void persist(career).then(() => flash("Saved")); }}>
                  <Save size={16} strokeWidth={1.5} /> <span>Save</span>
                </button>
                <button type="button" onClick={() => exportCareer(career)}>
                  <Download size={16} strokeWidth={1.5} /> <span>Export file</span>
                </button>
                <button type="button" onClick={() => { void persist(career); setCareer(null); }}>
                  <CalendarDays size={16} strokeWidth={1.5} /> <span>Save slots</span>
                </button>
                <button type="button" onClick={() => { void persist(career).then(onExit); }}>
                  <ArrowLeft size={16} strokeWidth={1.5} /> <span>Quit to Zuno</span>
                </button>
              </div>
            </nav>
            <main className="gr-content" aria-busy={busy}>
              <header className="gr-content-head">
                <h1>{NAV.find((n) => n[0] === screen)?.[1]}</h1>
                {screen !== "hub" && (
                  <button type="button" className="btn btn-primary" onClick={doAdvance} disabled={busy}>
                    {busy ? "Simulating" : "Advance"}
                  </button>
                )}
              </header>
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
              {screen === "cap" && <Cap />}
              {screen === "fa" && <FreeAgency />}
              {screen === "trades" && <Trades />}
              {screen === "draft" && <DraftRoom />}
              {screen === "staff" && <Staff />}
              {screen === "standings" && <Standings />}
              {screen === "leaders" && <Leaders />}
              {screen === "history" && <History />}
            </main>
          </div>
        )}
        {player !== null && <PlayerCard key={player} id={player} onClose={() => setPlayer(null)} />}
        {toast && <div className="gr-toast" role="status">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}

function exportCareer(c: Career) {
  const t = c.teams[c.userTeam];
  const data = {
    schemaVersion: 1,
    gameType: "gridiron",
    metadata: { title: `${t.city} ${t.name} · ${c.year}`, description: `${c.coachName}'s career`, author: c.coachName, coverImage: null },
    appearance: { accentColor: "#22C55E", backgroundPreset: "tide" },
    content: { league: null, career: exportableCareer(c) },
    settings: {},
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${t.abbr.toLowerCase()}-${c.year}.zuno.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------

function Saves({ file, onExit, onLoad }: { file: GridironFile; onExit: () => void; onLoad: (c: Career) => void }) {
  const [index, setIndex] = useState<SlotInfo[]>(() => readIndex());
  const [creating, setCreating] = useState<number | null>(null);
  const imported = file.content.career as unknown as Career | null;
  const [msg, setMsg] = useState("");

  useEffect(() => setIndex(readIndex()), [creating]);

  const open = async (slot: number) => {
    const c = await loadCareer(slot);
    if (c) onLoad(c);
    else setMsg("That save couldn't be read.");
  };

  if (creating !== null) return <NewCareer slot={creating} teams={file.content.league?.teams ?? DEFAULT_TEAMS} onBack={() => setCreating(null)} onStart={(c) => { void saveCareer(c); onLoad(c); }} />;

  return (
    <div className="gr-saves">
      <header className="gr-saves-head">
        <button type="button" className="btn btn-quiet" onClick={onExit}><ArrowLeft size={16} /> Back</button>
        <h1>Zuno Gridiron GM</h1>
        <p className="meta">{file.metadata.title}{file.content.league ? " · custom league" : ""}</p>
      </header>
      {imported && (
        <section className="gr-panel">
          <h2>Imported career</h2>
          <p>{imported.coachName} · {imported.teams[imported.userTeam].city} {imported.teams[imported.userTeam].name} · {imported.year}</p>
          <div className="gr-call-row">
            {SLOTS.map((s) => (
              <button key={s} type="button" className="btn btn-secondary btn-sm" onClick={() => { const c = { ...imported, slot: s }; void saveCareer(c).then(() => onLoad(c)); }}>
                Load into slot {s}
              </button>
            ))}
          </div>
        </section>
      )}
      <ol className="gr-slots">
        {SLOTS.map((s) => {
          const info = index.find((x) => x.slot === s);
          return (
            <li key={s} className="gr-slot" style={info ? ({ "--tc": info.colors[0] } as React.CSSProperties) : undefined}>
              <span className="meta">Slot {s}</span>
              {info ? (
                <>
                  <strong>{info.team}</strong>
                  <span className="meta">{info.coach} · {info.label} · saved {new Date(info.updatedAt).toLocaleDateString()}</span>
                  <div className="gr-call-row">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => void open(s)}>Continue</button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCreating(s)}>New career here</button>
                    <button type="button" className="btn btn-quiet btn-sm gr-danger" onClick={() => { void deleteCareer(s).then(() => setIndex(readIndex())); }}>Delete</button>
                  </div>
                </>
              ) : (
                <>
                  <strong>Empty</strong>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreating(s)}>New career</button>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {msg && <p className="gr-msg">{msg}</p>}
      <p className="meta">Careers autosave after every week. Export a career from inside the game to move it to another browser.</p>
    </div>
  );
}

function NewCareer({ slot, teams, onBack, onStart }: { slot: number; teams: TeamSeed[]; onBack: () => void; onStart: (c: Career) => void }) {
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const [name, setName] = useState("");
  const [pickId, setPickId] = useState<number | null>(null);
  const preview = useMemo(() => generateLeague(seed, teams), [seed, teams]);
  const ratings = useMemo(() => preview.teams.map((t) => teamRating(t, preview.players)), [preview]);
  const [starting, setStarting] = useState(false);
  return (
    <div className="gr-saves">
      <header className="gr-saves-head">
        <button type="button" className="btn btn-quiet" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <h1>New career · slot {slot}</h1>
      </header>
      <label className="gr-field-label">
        Coach name
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </label>
      <h2>Pick a team</h2>
      <ul className="gr-teampick">
        {preview.teams.map((t, i) => (
          <li key={t.id}>
            <button type="button" className={pickId === t.id ? "is-on" : ""} aria-pressed={pickId === t.id} onClick={() => setPickId(t.id)} style={{ "--tc": t.colors[0] } as React.CSSProperties}>
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
        <span className="meta">{pickId !== null ? `${preview.teams[pickId].city} ${preview.teams[pickId].name}` : "Choose a franchise"}</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pickId === null || starting}
          onClick={() => {
            setStarting(true);
            window.setTimeout(() => onStart(newCareer({ seed, teamId: pickId!, coachName: name || "Coach", slot, teams })), 20);
          }}
        >
          <Trophy size={16} /> {starting ? "Building the league" : "Start career"}
        </button>
      </div>
    </div>
  );
}
