import { useState } from "react";
import { Eye, FastForward, Play } from "lucide-react";
import { computeStandings, recordText, teamRating } from "../gmLeague";
import { gamesThisWeek, isFired, OFFSEASON, PHASE_LABEL, pressConference, PRESS_CHOICES, pressTopic, rosterCounts, userGame, userTeam, weekLabel, ROSTER_MAX } from "../gmCareer";
import type { ScheduledGame } from "../gmTypes";
import { BoxScore } from "./League";
import { Ovr, Panel, TeamLogo, TeamTag, useGm } from "./ui";

const OFFSEASON_HELP: Record<string, string> = {
  resign: "Contracts are expiring. Open players on the Roster to re-sign, extend or franchise-tag them before they hit free agency.",
  combine: "Spend scouting points on the Draft board. The combine posts measurables for every prospect when you advance.",
  fa: "Free agency is open. Make offers on the Free agency screen; other teams sign players each time you advance.",
  draft: "Seven rounds. Sim to your pick, choose from the board, or trade picks. Advancing finishes the draft for everyone.",
  camp: "Training camp. Young players develop. Hire coaches on the Staff screen.",
  cutdown: `Trim to ${ROSTER_MAX} active and up to 16 on the practice squad. When you advance, any extra players are cut automatically.`,
};

export function Hub({ onPlay, onWatch, onAdvance }: { onPlay: (g: ScheduledGame) => void; onWatch: (g: ScheduledGame) => void; onAdvance: () => void }) {
  const { c, update } = useGm();
  const [box, setBox] = useState<ScheduledGame | null>(null);
  const t = userTeam(c);
  const st = computeStandings(c.teams, c.schedule);
  const mine = userGame(c);
  const inSeason = c.phase === "regular" || c.phase === "playoffs";
  const games = inSeason ? gamesThisWeek(c) : [];
  const r = teamRating(t, c.players);
  const schedule = c.schedule.filter((g) => g.home === t.id || g.away === t.id).sort((a, b) => a.week - b.week);
  const counts = rosterCounts(c, t.id);
  if (isFired(c))
    return (
      <Panel title="You're fired">
        <p>The owner has seen enough. Job security fell to {Math.round(c.jobSecurity)}. Start a new career from the save menu.</p>
      </Panel>
    );
  return (
    <div className="gr-hub">
      <div className="gr-hub-main">
        <Panel title={weekLabel(c)} className="gr-matchday">
          {inSeason && mine ? (
            <Matchup g={mine} onPlay={() => onPlay(mine)} onSim={onAdvance} onBox={() => setBox(mine)} />
          ) : inSeason ? (
            <p>Your season is over{c.phase === "playoffs" ? ". The playoffs go on without you" : ""}. Advance to keep going.</p>
          ) : (
            <div className="gr-stack">
              <ol className="gr-calendar">
                {OFFSEASON.map((ph) => (
                  <li key={ph} className={ph === c.phase ? "is-now" : OFFSEASON.indexOf(ph) < OFFSEASON.indexOf(c.phase) ? "is-done" : ""}>
                    {PHASE_LABEL[ph]}
                  </li>
                ))}
              </ol>
              <p>{OFFSEASON_HELP[c.phase]}</p>
              {c.phase === "cutdown" && <p className="meta">Active roster: {counts.active}/{ROSTER_MAX} · practice squad {counts.ps}/16</p>}
              <button type="button" className="btn btn-primary" onClick={onAdvance}>
                <FastForward size={16} /> {c.phase === "cutdown" ? "Start the season" : "Advance"}
              </button>
            </div>
          )}
          {inSeason && !mine && (
            <button type="button" className="btn btn-primary" onClick={onAdvance}>
              <FastForward size={16} /> Advance
            </button>
          )}
        </Panel>

        {c.pressPending && (
          <Panel title="Press conference">
            <p>{pressTopic(c)}</p>
            <div className="gr-call-row">
              {PRESS_CHOICES.map((p) => (
                <button key={p.id} type="button" className="btn btn-secondary btn-sm" onClick={() => update(pressConference(c, p.id))}>
                  {p.label}
                </button>
              ))}
            </div>
          </Panel>
        )}

        {games.length > 0 && (
          <Panel title="Around the league">
            <ul className="gr-scores">
              {games.map((g) => (
                <li key={g.id}>
                  <span className="gr-score-teams">
                    <TeamTag team={c.teams[g.away]} /> <span className="num">{g.result ? g.result.score[1] : ""}</span>
                    <span className="meta">at</span>
                    <TeamTag team={c.teams[g.home]} /> <span className="num">{g.result ? g.result.score[0] : ""}</span>
                  </span>
                  {g.result ? (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setBox(g)}>Box score</button>
                  ) : g !== mine ? (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => onWatch(g)}>
                      <Eye size={16} /> Watch live
                    </button>
                  ) : (
                    <span className="meta">Your game</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title="Inbox">
          <ul className="gr-inbox">
            {c.inbox.slice(0, 12).map((m) => (
              <li key={m.id} className={m.read ? "" : "is-new"} onClick={() => { m.read = true; update(); }}>
                <span className="meta">{m.week} · {m.from}</span>
                <strong>{m.subject}</strong>
                <span>{m.body}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <aside className="gr-hub-side">
        <Panel>
          <div className="gr-teamcard">
            <TeamLogo team={t} size={48} />
            <div>
              <h2>{t.city} {t.name}</h2>
              <p className="meta">{recordText(st[t.id])} · {t.offScheme} · {t.defBase} · {t.market} market</p>
            </div>
          </div>
          <dl className="gr-ratings">
            <div><dt className="meta">Overall</dt><dd><Ovr value={r.ovr} /></dd></div>
            <div><dt className="meta">Offense</dt><dd><Ovr value={r.off} /></dd></div>
            <div><dt className="meta">Defense</dt><dd><Ovr value={r.def} /></dd></div>
          </dl>
          <div className="gr-meter">
            <span className="meta">Job security</span>
            <span className="gr-bar"><i style={{ width: `${c.jobSecurity}%` }} className={c.jobSecurity < 30 ? "is-low" : ""} /></span>
            <span className="num">{Math.round(c.jobSecurity)}</span>
          </div>
          <p className="meta">Season goal: {c.goal}</p>
        </Panel>
        <Panel title={`${c.year} schedule`}>
          <ol className="gr-sched">
            {schedule.map((g) => {
              const home = g.home === t.id;
              const opp = c.teams[home ? g.away : g.home];
              const res = g.result;
              const mineScore = res ? (home ? res.score[0] : res.score[1]) : 0;
              const theirs = res ? (home ? res.score[1] : res.score[0]) : 0;
              return (
                <li key={g.id} className={g.week === c.week && inSeason ? "is-now" : ""}>
                  <span className="meta num">{g.round ?? `W${g.week}`}</span>
                  <span>{home ? "vs" : "at"} <TeamTag team={opp} /></span>
                  {res ? (
                    <button type="button" className={`gr-link ${mineScore > theirs ? "is-w" : mineScore < theirs ? "is-l" : ""}`} onClick={() => setBox(g)}>
                      {mineScore > theirs ? "W" : mineScore < theirs ? "L" : "T"} {mineScore}-{theirs}
                    </button>
                  ) : (
                    <span className="meta">{recordText(st[opp.id])}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>
      </aside>
      {box && <BoxScore game={box} onClose={() => setBox(null)} />}
    </div>
  );
}

function Matchup({ g, onPlay, onSim, onBox }: { g: ScheduledGame; onPlay: () => void; onSim: () => void; onBox: () => void }) {
  const { c } = useGm();
  const st = computeStandings(c.teams, c.schedule);
  const home = c.teams[g.home];
  const away = c.teams[g.away];
  const side = (tid: number) => {
    const t = c.teams[tid];
    return (
      <div className="gr-mu-team" style={{ "--tc": t.colors[0] } as React.CSSProperties}>
        <TeamLogo team={t} size={56} />
        <strong>{t.city}</strong>
        <span>{t.name}</span>
        <span className="meta num">{recordText(st[tid])} · <Ovr value={teamRating(t, c.players).ovr} /></span>
      </div>
    );
  };
  return (
    <div className="gr-matchup-hero">
      <div className="gr-mu-row">
        {side(away.id)}
        <span className="gr-mu-at">{g.result ? `${g.result.score[1]} – ${g.result.score[0]}` : g.neutral ? "vs" : "at"}</span>
        {side(home.id)}
      </div>
      <p className="meta">{g.round ? { WC: "Wild Card", DIV: "Divisional round", CONF: "Conference championship", BOWL: "Zuno Bowl" }[g.round] : `Week ${g.week}`} · {home.stadium}{home.dome ? " (dome)" : ""}</p>
      <div className="gr-call-row">
        {g.result ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={onBox}>Box score</button>
            <button type="button" className="btn btn-primary" onClick={onSim}><FastForward size={16} /> Advance</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onPlay}><Play size={16} fill="currentColor" /> Play live</button>
            <button type="button" className="btn btn-secondary" onClick={onSim}><FastForward size={16} /> Sim week</button>
          </>
        )}
      </div>
    </div>
  );
}
