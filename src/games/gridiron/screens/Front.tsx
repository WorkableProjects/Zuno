import { useMemo, useState } from "react";
import { aiPick, currentPick, draftOrder, draftPlayer, pickKey, pickLabel, potentialGrade, scout, scoutedRange, SCOUT_COST, teamNeeds } from "../gmDraft";
import {
  askingSalary, askingYears, capSpace, deadMoney, evaluateTrade, executeTrade, findPick, freeAgents, offerInterest, payroll, pickValue, playerTradeValue, respondToOffer, signPlayer, signToPs,
  tradeWindowOpen, TRADE_DEADLINE_WEEK, userTeam,
} from "../gmCareer";
import { teamPlayers } from "../gmLeague";
import { capHit, fullName, ovr } from "../gmPlayers";
import { POSITIONS } from "../gmTypes";
import { OfferFields } from "./Team";
import { money, Ovr, Panel, PlayerLink, Seg, TeamTag, useGm } from "./ui";

export function Cap() {
  const { c } = useGm();
  const t = userTeam(c);
  const roster = teamPlayers(t.id, c.players, true).sort((a, b) => capHit(b) - capHit(a));
  const years = [0, 1, 2, 3];
  const committed = (i: number) => roster.reduce((s, p) => s + (p.contract.years[i]?.cap ?? 0), 0) + deadMoney(c, t.id, i);
  return (
    <div className="gr-stack">
      <div className="gr-stats">
        <div><span className="meta">Salary cap</span><strong className="num">{money(c.cap)}</strong></div>
        <div><span className="meta">Payroll</span><strong className="num">{money(payroll(c, t.id))}</strong></div>
        <div><span className="meta">Cap space</span><strong className={`num${capSpace(c, t.id) < 0 ? " gr-neg" : ""}`}>{money(capSpace(c, t.id))}</strong></div>
        <div><span className="meta">Dead money</span><strong className="num">{money(deadMoney(c, t.id))}</strong></div>
      </div>
      <Panel title="Contracts">
        <div className="gr-scroll">
          <table className="gr-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th className="num">Ovr</th>
                {years.map((i) => <th key={i} className="num">{c.year + i}</th>)}
                <th className="num">Guaranteed left</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.id}>
                  <td><PlayerLink p={p} />{p.ps ? <span className="meta"> PS</span> : ""}{p.contract.tagged ? <span className="meta"> tag</span> : ""}</td>
                  <td>{p.pos}</td>
                  <td className="num"><Ovr p={p} /></td>
                  {years.map((i) => <td key={i} className="num">{p.contract.years[i] ? money(p.contract.years[i].cap) : ""}</td>)}
                  <td className="num">{money(p.contract.years.reduce((s, y) => s + y.guar, 0))}</td>
                </tr>
              ))}
              <tr>
                <td>Dead money</td><td /><td />
                {years.map((i) => <td key={i} className="num">{money(deadMoney(c, t.id, i))}</td>)}
                <td />
              </tr>
              <tr className="is-total">
                <td>Committed</td><td /><td />
                {years.map((i) => <td key={i} className="num">{money(committed(i))}</td>)}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="meta">Open a player to restructure, extend, tag or release him. Releasing after June 1 splits dead money over two years.</p>
      </Panel>
    </div>
  );
}

export function FreeAgency() {
  const { c, update } = useGm();
  const [pos, setPos] = useState("All");
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const list = freeAgents(c).filter((p) => pos === "All" || p.pos === pos).sort((a, b) => ovr(b) - ovr(a)).slice(0, 80);
  const p = sel !== null ? c.players[sel] : null;
  const [offer, setOffer] = useState({ years: 2, salary: 1, guarantee: 0.4, incentives: 0 });
  const choose = (id: number) => {
    const pl = c.players[id];
    setSel(id);
    setOffer({ years: askingYears(pl), salary: askingSalary(c, pl), guarantee: 0.4, incentives: 0 });
    setMsg("");
  };
  return (
    <div className="gr-grid2 gr-grid-wide">
      <Panel title={`Free agents · ${money(capSpace(c, c.userTeam))} cap space`} actions={<select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position"><option>All</option>{POSITIONS.map((x) => <option key={x}>{x}</option>)}</select>}>
        <div className="gr-scroll">
          <table className="gr-table">
            <thead><tr><th>Pos</th><th>Name</th><th className="num">Ovr</th><th className="num">Age</th><th className="num">Asking</th><th /></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} className={sel === x.id ? "is-sel" : ""}>
                  <td>{x.pos}</td>
                  <td><PlayerLink p={x} /></td>
                  <td className="num"><Ovr p={x} /></td>
                  <td className="num">{x.age}</td>
                  <td className="num">{money(askingSalary(c, x))} × {askingYears(x)}</td>
                  <td><button type="button" className="btn btn-quiet btn-sm" onClick={() => choose(x.id)}>Negotiate</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Negotiation">
        {p ? (
          <div className="gr-stack">
            <p>{p.pos} <strong>{fullName(p)}</strong> <Ovr p={p} /> · age {p.age} · {p.archetype}</p>
            <OfferFields offer={offer} setOffer={setOffer} ask={askingSalary(c, p)} />
            <p className="meta">Players weigh money, guarantees, your record and whether they'll start. Interest: {Math.round(offerInterest(c, p, c.userTeam, offer) * 100)}%</p>
            <div className="gr-call-row">
              <button type="button" className="btn btn-primary" onClick={() => { const r = signPlayer(c, p.id, c.userTeam, offer); setMsg(r.message); if (r.ok) { setSel(null); } update(r.ok ? r.message : undefined); }}>Make offer</button>
              {p.yrs <= 3 && <button type="button" className="btn btn-secondary" onClick={() => { const m = signToPs(c, p.id); setMsg(m); update(m); }}>Sign to practice squad</button>}
            </div>
          </div>
        ) : (
          <p className="meta">Pick a player to make an offer.</p>
        )}
        {msg && <p className="gr-msg" role="status">{msg}</p>}
      </Panel>
    </div>
  );
}

export function Trades() {
  const { c, update } = useGm();
  const others = c.teams.filter((t) => t.id !== c.userTeam);
  const [other, setOther] = useState(others[0].id);
  const [give, setGive] = useState<{ players: number[]; picks: string[] }>({ players: [], picks: [] });
  const [get, setGet] = useState<{ players: number[]; picks: string[] }>({ players: [], picks: [] });
  const [msg, setMsg] = useState("");
  const ev = evaluateTrade(c, other, give, get);
  const toggle = (side: "give" | "get", kind: "players" | "picks", id: number | string) => {
    const set = side === "give" ? setGive : setGet;
    const cur = side === "give" ? give : get;
    const list = cur[kind] as Array<number | string>;
    set({ ...cur, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };
  const side = (teamId: number, which: "give" | "get") => {
    const sel = which === "give" ? give : get;
    const roster = teamPlayers(teamId, c.players).sort((a, b) => ovr(b) - ovr(a));
    const picks = c.picks.filter((p) => p.owner === teamId && p.playerId === undefined).sort((a, b) => a.year - b.year || a.round - b.round);
    return (
      <div className="gr-trade-side">
        <div className="gr-scroll gr-trade-list">
          <ul className="gr-list">
            {roster.map((p) => (
              <li key={p.id}>
                <label className="gr-check">
                  <input type="checkbox" checked={sel.players.includes(p.id)} onChange={() => toggle(which, "players", p.id)} />
                  {p.pos} {fullName(p)} <Ovr p={p} /> <span className="meta">{p.age} · {money(capHit(p))} · value {Math.round(playerTradeValue(p))}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <h3>Draft picks</h3>
        <ul className="gr-list">
          {picks.map((pk) => (
            <li key={pickKey(pk)}>
              <label className="gr-check">
                <input type="checkbox" checked={sel.picks.includes(pickKey(pk))} onChange={() => toggle(which, "picks", pickKey(pk))} />
                {pickLabel(pk, c.teams)} <span className="meta">value {Math.round(pickValue(c, pk))}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <div className="gr-stack">
      {c.offers.length > 0 && (
        <Panel title="Offers for you">
          {c.offers.map((o) => (
            <div key={o.id} className="gr-offer-card">
              <TeamTag team={c.teams[o.fromTeam]} full />
              <p>
                They want {o.give.players.map((id) => fullName(c.players[id])).join(", ")} and send{" "}
                {[...o.get.players.map((id) => `${c.players[id].pos} ${fullName(c.players[id])} (${ovr(c.players[id])})`), ...o.get.picks.map((k) => (findPick(c, k) ? pickLabel(findPick(c, k)!, c.teams) : k))].join(", ")}.
              </p>
              <div className="gr-call-row">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { const m = respondToOffer(c, o.id, true); setMsg(m); update(m); }}>Accept</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const m = respondToOffer(c, o.id, false); setMsg(m); update(m); }}>Decline</button>
              </div>
            </div>
          ))}
        </Panel>
      )}
      <Panel
        title={tradeWindowOpen(c) ? "Build a trade" : `Trades closed after week ${TRADE_DEADLINE_WEEK}`}
        actions={
          <select value={other} onChange={(e) => { setOther(Number(e.target.value)); setGet({ players: [], picks: [] }); }} aria-label="Trade partner">
            {others.map((t) => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
          </select>
        }
      >
        <p className="meta">{c.teams[other].name} need: {teamNeeds(c, other).join(", ")} · cap space {money(capSpace(c, other))}</p>
        <div className="gr-grid2">
          <div><h3>You give</h3>{side(c.userTeam, "give")}</div>
          <div><h3>You get</h3>{side(other, "get")}</div>
        </div>
        <div className="gr-trade-meter">
          <span className="meta">Value you give {Math.round(ev.giveValue)} · value you get {Math.round(ev.getValue)}</span>
          <strong>{ev.message}</strong>
          <button type="button" className="btn btn-primary" disabled={!ev.ok} onClick={() => { executeTrade(c, other, give, get); setGive({ players: [], picks: [] }); setGet({ players: [], picks: [] }); setMsg("Trade done."); update("Trade done."); }}>
            Propose trade
          </button>
        </div>
        {msg && <p className="gr-msg" role="status">{msg}</p>}
      </Panel>
    </div>
  );
}

export function DraftRoom() {
  const { c, update, openPlayer } = useGm();
  const [pos, setPos] = useState("All");
  const [view, setView] = useState<"board" | "mine" | "results">("board");
  const pk = currentPick(c);
  const onClock = pk && pk.owner === c.userTeam && c.phase === "draft";
  const order = useMemo(() => (c.phase === "draft" ? [] : draftOrder(c)), [c, c.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const board = c.prospects
    .filter((pr) => pos === "All" || c.players[pr.playerId].pos === pos)
    .filter((pr) => view !== "mine" || pr.starred)
    .sort((a, b) => (view === "mine" ? (b.starred ? 1 : 0) - (a.starred ? 1 : 0) : 0) || a.rank - b.rank)
    .slice(0, 120);
  const simTo = (stopAtMine: boolean) => {
    let guard = 0;
    while (guard++ < 300) {
      const p = currentPick(c);
      if (!p || (stopAtMine && p.owner === c.userTeam)) break;
      const id = aiPick(c, p.owner);
      if (id === null) break;
      draftPlayer(c, id);
      if (!stopAtMine) break;
    }
    update();
  };
  const myPicks = c.picks.filter((p) => p.owner === c.userTeam && p.year === c.year + (c.phase === "draft" || c.phase === "fa" || c.phase === "combine" || c.phase === "resign" ? 0 : 1));
  return (
    <div className="gr-stack">
      <div className="gr-stats">
        <div><span className="meta">Scouting points</span><strong className="num">{c.scoutPoints}</strong></div>
        <div><span className="meta">Your picks</span><strong>{myPicks.filter((p) => p.playerId === undefined).map((p) => (p.overall ? `#${p.overall}` : `R${p.round}`)).join(", ") || "None"}</strong></div>
        <div><span className="meta">On the clock</span><strong>{c.phase === "draft" && pk ? `${c.teams[pk.owner].abbr} · #${pk.overall}` : c.phase === "draft" ? "Draft complete" : "Draft opens in the offseason"}</strong></div>
      </div>
      {c.phase === "draft" && pk && (
        <div className="gr-call-row">
          {!onClock && <button type="button" className="btn btn-primary" onClick={() => simTo(true)}>Sim to your pick</button>}
          {!onClock && <button type="button" className="btn btn-secondary" onClick={() => simTo(false)}>Next pick</button>}
          {onClock && <strong>You're on the clock. Pick from the board or trade the pick on the Trades screen.</strong>}
        </div>
      )}
      {c.phase !== "draft" && order.length > 0 && <p className="meta">Projected order if the season ended today: {order.slice(0, 8).map((id, i) => `${i + 1}. ${c.teams[id].abbr}`).join(" · ")}</p>}
      <Panel
        title={`${c.phase === "draft" ? c.year : c.year + 1} draft class`}
        actions={
          <>
            <Seg label="View" value={view} options={[["board", "Big board"], ["mine", "Starred"], ["results", "Picks made"]]} onChange={setView} />
            <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position"><option>All</option>{POSITIONS.map((x) => <option key={x}>{x}</option>)}</select>
          </>
        }
      >
        {view === "results" ? (
          <ol className="gr-list">
            {c.picks.filter((p) => p.playerId !== undefined && p.year === c.year).sort((a, b) => a.overall! - b.overall!).map((p) => {
              const pl = c.players[p.playerId!];
              return <li key={pickKey(p)}><span className="num">#{p.overall}</span> {c.teams[p.owner].abbr} · {pl?.pos} {pl ? <PlayerLink p={pl} /> : ""}</li>;
            })}
          </ol>
        ) : (
          <div className="gr-scroll">
            <table className="gr-table">
              <thead><tr><th className="num">Rank</th><th>Pos</th><th>Name</th><th className="num">Age</th><th className="num">Ovr range</th><th>Pot</th><th className="num">40</th><th className="num">Bench</th><th className="num">Vert</th><th className="num">Cone</th><th /></tr></thead>
              <tbody>
                {board.map((pr) => {
                  const p = c.players[pr.playerId];
                  const [lo, hi] = scoutedRange(c, pr);
                  const combine = c.phase !== "regular" && c.phase !== "playoffs" && c.phase !== "resign";
                  return (
                    <tr key={pr.playerId}>
                      <td className="num">{pr.rank}</td>
                      <td>{p.pos}</td>
                      <td>
                        <button type="button" className={`gr-star${pr.starred ? " is-on" : ""}`} aria-pressed={!!pr.starred} aria-label="Star" onClick={() => { pr.starred = !pr.starred; update(); }}>★</button>{" "}
                        <button type="button" className="gr-link" onClick={() => pr.scouted >= 2 && openPlayer(p.id)}>{fullName(p)}</button> <span className="meta">{p.college}</span>
                      </td>
                      <td className="num">{p.age}</td>
                      <td className="num">{lo === hi ? lo : `${lo}–${hi}`}</td>
                      <td>{potentialGrade(c, pr)}</td>
                      <td className="num">{combine ? pr.combine.forty.toFixed(2) : "—"}</td>
                      <td className="num">{combine ? pr.combine.bench : "—"}</td>
                      <td className="num">{combine ? pr.combine.vertical : "—"}</td>
                      <td className="num">{combine && pr.proDay ? pr.combine.cone.toFixed(2) : combine ? `${pr.combine.cone.toFixed(2)}` : "—"}</td>
                      <td className="gr-row-actions">
                        {pr.scouted < 3 && <button type="button" className="btn btn-quiet btn-sm" disabled={c.scoutPoints < SCOUT_COST} onClick={() => { scout(c, p.id); update(); }}>Scout ({SCOUT_COST})</button>}
                        {onClock && <button type="button" className="btn btn-primary btn-sm" onClick={() => { draftPlayer(c, p.id); update(`You drafted ${fullName(p)}.`); }}>Draft</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="meta">Scouting narrows the overall range and, at the third level, reveals potential. The combine posts 40, bench, vertical and 3-cone for everyone. Undrafted players become free agents.</p>
      </Panel>
    </div>
  );
}
