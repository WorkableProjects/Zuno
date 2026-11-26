import { useMemo, useState } from "react";
import { FieldView } from "../FieldView";
import { CONF_NAMES, computeStandings, DIV_NAMES, divisionOrder, playoffSeeds, recordText } from "../gmLeague";
import { leaders, playoffSeedMap, teamName } from "../gmCareer";
import { fullName, passerRating } from "../gmPlayers";
import { buildPlayScript } from "../gmPlayScript";
import type { PlaySpec, ScheduledGame, StatLine } from "../gmTypes";
import { GDialog, Panel, PlayerLink, Seg, TeamLogo, TeamTag, useGm } from "./ui";

export function Standings() {
  const { c } = useGm();
  const st = useMemo(() => computeStandings(c.teams, c.schedule), [c, c.updatedAt]);
  const seeds = c.phase === "playoffs" || c.week > 10 ? playoffSeedMap(c) : {};
  return (
    <div className="gr-stack">
      {(c.phase === "playoffs" || c.schedule.some((g) => g.round)) && <Bracket />}
      {[0, 1].map((conf) => (
        <Panel key={conf} title={CONF_NAMES[conf]}>
          <div className="gr-divs">
            {[0, 1, 2, 3].map((d) => (
              <table key={d} className="gr-table">
                <caption>{DIV_NAMES[d]}</caption>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th className="num">W-L</th>
                    <th className="num">Div</th>
                    <th className="num">PF</th>
                    <th className="num">PA</th>
                    <th className="num">Strk</th>
                  </tr>
                </thead>
                <tbody>
                  {divisionOrder(conf, d, c.teams, st, c.schedule, c.seed).map((id) => {
                    const s = st[id];
                    return (
                      <tr key={id} className={id === c.userTeam ? "is-you" : ""}>
                        <td>
                          <TeamTag team={c.teams[id]} full />
                          {seeds[id] && <span className="meta gr-seed"> {seeds[id]}</span>}
                        </td>
                        <td className="num">{recordText(s)}</td>
                        <td className="num">{recordText({ w: s.divW, l: s.divL, t: s.divT })}</td>
                        <td className="num">{s.pf}</td>
                        <td className="num">{s.pa}</td>
                        <td className="num">{s.streak > 0 ? `W${s.streak}` : s.streak < 0 ? `L${-s.streak}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </Panel>
      ))}
      <p className="meta">Ties break by head-to-head, division record, common games, conference record, then point differential. Seven teams per conference make the playoffs; the 1 seed gets a bye.</p>
    </div>
  );
}

function Bracket() {
  const { c } = useGm();
  const [box, setBox] = useState<ScheduledGame | null>(null);
  const rounds: Array<[ScheduledGame["round"], string]> = [["WC", "Wild Card"], ["DIV", "Divisional"], ["CONF", "Conference"], ["BOWL", "Zuno Bowl"]];
  const st = computeStandings(c.teams, c.schedule);
  const seeds = [0, 1].map((conf) => playoffSeeds(conf, c.teams, st, c.schedule, c.seed));
  return (
    <Panel title={`${c.year} playoffs`}>
      <div className="gr-bracket">
        {rounds.map(([r, label]) => (
          <div key={r} className="gr-round">
            <h3>{label}</h3>
            {c.schedule.filter((g) => g.round === r).map((g) => (
              <button key={g.id} type="button" className="gr-matchup" onClick={() => g.result && setBox(g)} disabled={!g.result}>
                {[g.away, g.home].map((id, i) => (
                  <span key={id} className={g.result && (g.result.score[i === 0 ? 1 : 0] > g.result.score[i === 0 ? 0 : 1]) ? "is-win" : ""}>
                    <TeamLogo team={c.teams[id]} size={18} /> <span className="meta">{seeds[c.teams[id].conf].indexOf(id) + 1}</span> {c.teams[id].abbr}
                    <b className="num">{g.result ? g.result.score[i === 0 ? 1 : 0] : ""}</b>
                  </span>
                ))}
              </button>
            ))}
          </div>
        ))}
      </div>
      {box && <BoxScore game={box} onClose={() => setBox(null)} />}
    </Panel>
  );
}

const LEADER_KEYS: Array<[keyof StatLine, string]> = [
  ["pYds", "Passing yards"], ["pTd", "Passing TDs"], ["rYds", "Rushing yards"], ["rTd", "Rushing TDs"], ["recYds", "Receiving yards"], ["rec", "Receptions"],
  ["sck", "Sacks"], ["dInt", "Interceptions"], ["tkl", "Tackles"], ["fgm", "Field goals"],
];

export function Leaders() {
  const { c } = useGm();
  const [scope, setScope] = useState<"league" | "team">("league");
  return (
    <div className="gr-stack">
      <Seg label="Scope" value={scope} options={[["league", "League"], ["team", "Your team"]]} onChange={setScope} />
      <div className="gr-grid3">
        {LEADER_KEYS.map(([k, label]) => (
          <Panel key={k} title={label}>
            <ol className="gr-leaders">
              {leaders(c, k, 5, scope === "team" ? c.userTeam : undefined).map(({ p, v }) => (
                <li key={p.id}>
                  <PlayerLink p={p} /> <span className="meta">{p.teamId !== null ? c.teams[p.teamId].abbr : "FA"}</span>
                  <span className="num">{v}</span>
                </li>
              ))}
            </ol>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export function History() {
  const { c } = useGm();
  return (
    <div className="gr-stack">
      <Panel title="Trophy room">
        {c.trophies.length ? (
          <ul className="gr-trophies">
            {c.trophies.map((t, i) => (
              <li key={i}>
                <span className="num">{t.year}</span> {t.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">No trophies yet. Division titles and Zuno Bowls land here.</p>
        )}
      </Panel>
      <Panel title="Seasons">
        {c.history.length ? (
          <table className="gr-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Your record</th>
                <th>Finish</th>
                <th>Champion</th>
                <th>MVP</th>
                <th>OPOY</th>
                <th>DPOY</th>
                <th>ROTY</th>
                <th>Coach of the Year</th>
              </tr>
            </thead>
            <tbody>
              {c.history.slice().reverse().map((h) => (
                <tr key={h.year}>
                  <td className="num">{h.year}</td>
                  <td className="num">{recordText({ w: h.userRecord[0], l: h.userRecord[1], t: h.userRecord[2] })}</td>
                  <td>{h.userFinish}</td>
                  <td>{h.champion !== null ? <TeamTag team={c.teams[h.champion]} /> : "—"}</td>
                  {(["MVP", "OPOY", "DPOY", "ROTY", "COY"] as const).map((k) => (
                    <td key={k}>{h.awards[k]?.name ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="meta">Finish a season to start the record book.</p>
        )}
      </Panel>
      <div className="gr-grid2">
        <Panel title="Franchise records">
          {Object.keys(c.records).length ? (
            <table className="gr-table">
              <tbody>
                {Object.entries(c.records).map(([k, r]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{r.name}</td>
                    <td className="num">{r.value}</td>
                    <td className="num meta">{r.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="meta">Records are set at the end of each season.</p>
          )}
        </Panel>
        <Panel title="Hall of Fame">
          {c.hallOfFame.length ? (
            <ul className="gr-list">
              {c.hallOfFame.map((h) => (
                <li key={h.playerId}>
                  {h.name} <span className="meta">{h.pos} · class of {h.year}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="meta">Great careers end here.</p>
          )}
        </Panel>
      </div>
      {c.history.length > 0 && (
        <Panel title={`${c.history[c.history.length - 1].year} All-Pro team`}>
          <ul className="gr-allpro">
            {c.history[c.history.length - 1].allPro.map((id) => {
              const p = c.players[id];
              return p ? (
                <li key={id}>
                  <span className="meta">{p.pos}</span> {fullName(p)}
                </li>
              ) : null;
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

export function BoxScore({ game, onClose }: { game: ScheduledGame; onClose: () => void }) {
  const { c } = useGm();
  const [hl, setHl] = useState<PlaySpec | null>(null);
  const r = game.result!;
  const home = c.teams[game.home];
  const away = c.teams[game.away];
  const playersOf = (tid: number) => Object.entries(r.players).map(([id, s]) => ({ p: c.players[Number(id)], s })).filter((x) => x.p && x.p.teamId === tid);
  const section = (tid: number) => {
    const list = playersOf(tid);
    const pass = list.filter((x) => x.s.pAtt > 0).sort((a, b) => b.s.pAtt - a.s.pAtt);
    const rush = list.filter((x) => x.s.rAtt > 0).sort((a, b) => b.s.rYds - a.s.rYds);
    const recv = list.filter((x) => x.s.rec > 0).sort((a, b) => b.s.recYds - a.s.recYds);
    const def = list.filter((x) => x.s.tkl + x.s.sck + x.s.dInt > 0).sort((a, b) => b.s.tkl - a.s.tkl).slice(0, 6);
    const kick = list.filter((x) => x.s.fga + x.s.xpa + x.s.punts > 0);
    return (
      <div className="gr-box-team">
        <h3>
          <TeamTag team={c.teams[tid]} full />
        </h3>
        {!list.length && <p className="meta">Player stats are kept for your games only.</p>}
        {pass.length > 0 && (
          <table className="gr-table gr-table-tight">
            <thead><tr><th>Passing</th><th className="num">C/A</th><th className="num">Yds</th><th className="num">TD</th><th className="num">INT</th><th className="num">Rtg</th></tr></thead>
            <tbody>{pass.map(({ p, s }) => <tr key={p.id}><td><PlayerLink p={p} /></td><td className="num">{s.pCmp}/{s.pAtt}</td><td className="num">{s.pYds}</td><td className="num">{s.pTd}</td><td className="num">{s.pInt}</td><td className="num">{passerRating(s)}</td></tr>)}</tbody>
          </table>
        )}
        {rush.length > 0 && (
          <table className="gr-table gr-table-tight">
            <thead><tr><th>Rushing</th><th className="num">Att</th><th className="num">Yds</th><th className="num">TD</th></tr></thead>
            <tbody>{rush.map(({ p, s }) => <tr key={p.id}><td><PlayerLink p={p} /></td><td className="num">{s.rAtt}</td><td className="num">{s.rYds}</td><td className="num">{s.rTd}</td></tr>)}</tbody>
          </table>
        )}
        {recv.length > 0 && (
          <table className="gr-table gr-table-tight">
            <thead><tr><th>Receiving</th><th className="num">Rec</th><th className="num">Yds</th><th className="num">TD</th></tr></thead>
            <tbody>{recv.map(({ p, s }) => <tr key={p.id}><td><PlayerLink p={p} /></td><td className="num">{s.rec}</td><td className="num">{s.recYds}</td><td className="num">{s.recTd}</td></tr>)}</tbody>
          </table>
        )}
        {def.length > 0 && (
          <table className="gr-table gr-table-tight">
            <thead><tr><th>Defense</th><th className="num">Tkl</th><th className="num">Sck</th><th className="num">INT</th><th className="num">PD</th><th className="num">FF</th></tr></thead>
            <tbody>{def.map(({ p, s }) => <tr key={p.id}><td><PlayerLink p={p} /></td><td className="num">{s.tkl}</td><td className="num">{s.sck}</td><td className="num">{s.dInt}</td><td className="num">{s.pd}</td><td className="num">{s.ff}</td></tr>)}</tbody>
          </table>
        )}
        {kick.length > 0 && (
          <table className="gr-table gr-table-tight">
            <thead><tr><th>Kicking</th><th className="num">FG</th><th className="num">XP</th><th className="num">Punts</th></tr></thead>
            <tbody>{kick.map(({ p, s }) => <tr key={p.id}><td><PlayerLink p={p} /></td><td className="num">{s.fgm}/{s.fga}</td><td className="num">{s.xpm}/{s.xpa}</td><td className="num">{s.punts ? `${s.punts} · ${(s.puntYds / s.punts).toFixed(1)} avg` : "—"}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    );
  };
  return (
    <GDialog title={`${away.abbr} ${r.score[1]}, ${home.abbr} ${r.score[0]}${r.ot ? " (OT)" : ""}`} onClose={onClose}>
      <table className="gr-table gr-linescore">
        <thead>
          <tr>
            <th />
            {r.quarters[0].map((_, i) => <th key={i} className="num">{i < 4 ? i + 1 : "OT"}</th>)}
            <th className="num">T</th>
          </tr>
        </thead>
        <tbody>
          {([[away, 1], [home, 0]] as const).map(([t, s]) => (
            <tr key={t.id}>
              <td><TeamTag team={t} /></td>
              {r.quarters[s].map((q, i) => <td key={i} className="num">{q}</td>)}
              <td className="num"><b>{r.score[s]}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">
        {r.weather} · {teamName(c, game.home)} home{r.mvp && c.players[r.mvp] ? ` · Player of the game: ${fullName(c.players[r.mvp])}` : ""}
      </p>
      <table className="gr-table gr-table-tight">
        <thead><tr><th /><th className="num">{away.abbr}</th><th className="num">{home.abbr}</th></tr></thead>
        <tbody>
          {([["Total yards", "totalYds"], ["Passing", "passYds"], ["Rushing", "rushYds"], ["First downs", "firstDowns"], ["Turnovers", "turnovers"], ["Sacks", "sacks"], ["Penalties", "penalties"]] as const).map(([l, k]) => (
            <tr key={k}><td>{l}</td><td className="num">{r.team[1][k]}</td><td className="num">{r.team[0][k]}</td></tr>
          ))}
          <tr><td>Possession</td><td className="num">{Math.floor(r.team[1].top / 60)}:{String(r.team[1].top % 60).padStart(2, "0")}</td><td className="num">{Math.floor(r.team[0].top / 60)}:{String(r.team[0].top % 60).padStart(2, "0")}</td></tr>
        </tbody>
      </table>
      {r.highlights.length > 0 && (
        <section className="gr-highlights">
          <h3>Highlights</h3>
          <ul>
            {r.highlights.map((h) => (
              <li key={h.id}>
                <button type="button" className="gr-link" onClick={() => setHl(h)}>
                  {h.label ?? "Play"}
                </button>{" "}
                <span className="meta">{h.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {r.log.length > 0 && (
        <section>
          <h3>Scoring</h3>
          <ul className="gr-list">{r.log.map((l, i) => <li key={i} className="meta">{l}</li>)}</ul>
        </section>
      )}
      <div className="gr-grid2">
        {section(game.away)}
        {section(game.home)}
      </div>
      {hl && <HighlightPlayer spec={hl} onClose={() => setHl(null)} />}
    </GDialog>
  );
}

export function HighlightPlayer({ spec, onClose }: { spec: PlaySpec; onClose: () => void }) {
  const { c } = useGm();
  const script = useMemo(() => buildPlayScript(spec), [spec]);
  const [key, setKey] = useState(0);
  const [speed, setSpeed] = useState(1);
  const off = c.teams[spec.offTeam];
  const def = c.teams[spec.defTeam];
  const left = spec.dir > 0 ? off : def;
  const right = left === off ? def : off;
  return (
    <GDialog title={spec.label ?? "Highlight"} onClose={onClose}>
      <p>{spec.text}</p>
      <div className="gr-hl-stage">
        <FieldView
          key={key}
          script={script}
          teams={{ left: { abbr: left.abbr, colors: left.colors }, right: { abbr: right.abbr, colors: right.colors } }}
          offColors={off.colors}
          defColors={["#f3f3ef", def.colors[0]]}
          losX={spec.dir > 0 ? 10 + spec.los : 110 - spec.los}
          firstX={spec.special ? null : spec.dir > 0 ? 10 + spec.firstDownAt : 110 - spec.firstDownAt}
          speed={speed}
          paused={false}
          mode="follow"
          overlays={{ routes: true, coverage: false, blocks: false, names: false }}
        />
      </div>
      <div className="gr-call-row">
        <button type="button" className="btn btn-secondary" onClick={() => setKey((k) => k + 1)}>Replay</button>
        <Seg label="Speed" value={speed} options={[[0.25, "¼×"], [0.5, "½×"], [1, "1×"], [2, "2×"]]} onChange={setSpeed} />
      </div>
    </GDialog>
  );
}
