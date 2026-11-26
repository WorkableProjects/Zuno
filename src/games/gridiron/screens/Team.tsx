import { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { autoDepth, SLOT_POS, SLOT_STARTERS, teamPlayers, teamRating } from "../gmLeague";
import {
  askingSalary, askingYears, cutPlayer, franchiseTag, hireCoach, offerInterest, OFFSEASON, promotePs, restructure, rosterCounts, signPlayer, toggleIR, userTeam, fullStats, PS_MAX, ROSTER_MAX,
} from "../gmCareer";
import { ATTR_LABELS, COVERAGES, DEF_BASES, DEPTH_SLOTS, OFF_SCHEMES, POSITIONS, STAFF_ROLES, type AttrKey, type DepthSlot, type Player, type StatLine } from "../gmTypes";
import { capHit, fullName, ovr, OVR_WEIGHTS, passerRating, POS_GROUP, schemeFit } from "../gmPlayers";
import { GDialog, injuryTag, money, Ovr, Panel, PlayerLink, Seg, useGm } from "./ui";

type SortKey = "pos" | "ovr" | "age" | "cap" | "name";
const POS_ORDER = Object.fromEntries(POSITIONS.map((p, i) => [p, i]));

export function Roster() {
  const { c, update } = useGm();
  const [group, setGroup] = useState("All");
  const [sort, setSort] = useState<SortKey>("pos");
  const [showPs, setShowPs] = useState(false);
  const t = userTeam(c);
  const counts = rosterCounts(c, t.id);
  const list = teamPlayers(t.id, c.players, true)
    .filter((p) => p.ps === showPs)
    .filter((p) => group === "All" || POS_GROUP[p.pos] === group)
    .sort((a, b) => (sort === "pos" ? POS_ORDER[a.pos] - POS_ORDER[b.pos] || ovr(b) - ovr(a) : sort === "ovr" ? ovr(b) - ovr(a) : sort === "age" ? a.age - b.age : sort === "cap" ? capHit(b) - capHit(a) : a.last.localeCompare(b.last)));
  const head = (k: SortKey, label: string, num = false) => (
    <th className={num ? "num" : ""} aria-sort={sort === k ? "descending" : "none"}>
      <button type="button" className="gr-th" onClick={() => setSort(k)}>{label}</button>
    </th>
  );
  return (
    <Panel
      title={`Roster · ${counts.active}/${ROSTER_MAX} active · ${counts.ps}/${PS_MAX} practice squad · ${counts.ir} IR`}
      actions={<Seg label="Squad" value={showPs ? "ps" : "active"} options={[["active", "Active"], ["ps", "Practice squad"]]} onChange={(v) => setShowPs(v === "ps")} />}
    >
      <Seg label="Group" value={group} options={["All", "QB", "RB", "WR", "OL", "DL", "LB", "DB", "ST"].map((g) => [g, g])} onChange={setGroup} />
      <div className="gr-scroll">
        <table className="gr-table">
          <thead>
            <tr>
              {head("pos", "Pos")}
              {head("name", "Name")}
              {head("ovr", "Ovr", true)}
              <th>Archetype</th>
              {head("age", "Age", true)}
              <th className="num">Exp</th>
              {head("cap", "Cap hit", true)}
              <th className="num">Yrs</th>
              <th>Status</th>
              <th className="num">Morale</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.pos}</td>
                <td>
                  <span className="meta">#{p.num}</span> <PlayerLink p={p} />
                </td>
                <td className="num"><Ovr p={p} /></td>
                <td className="meta">{p.archetype}</td>
                <td className="num">{p.age}</td>
                <td className="num">{p.yrs === 0 ? "R" : p.yrs}</td>
                <td className="num">{money(capHit(p))}</td>
                <td className="num">{p.contract.years.length}{p.contract.tagged ? " (tag)" : ""}</td>
                <td>{p.injury ? <span className="gr-inj">{injuryTag(p)} · {p.injury.name}</span> : <span className="meta">Healthy</span>}</td>
                <td className="num">{p.morale}</td>
                <td className="gr-row-actions">
                  {p.ps ? (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => update(promotePs(c, p.id))}>Promote</button>
                  ) : p.injury && !p.injury.ir && p.injury.weeks >= 4 ? (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => update(toggleIR(c, p.id))}>Place on IR</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function DepthChart() {
  const { c, update } = useGm();
  const t = userTeam(c);
  const [slot, setSlot] = useState<DepthSlot>("QB");
  const [drag, setDrag] = useState<number | null>(null);
  const ids = t.depth[slot] ?? [];
  const eligible = teamPlayers(t.id, c.players).filter((p) => SLOT_POS[slot].includes(p.pos) || slot === "KR" || slot === "PR" || slot === "LS");
  const move = (from: number, to: number) => {
    const list = ids.slice();
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
    t.depth[slot] = list;
    update();
  };
  const add = (id: number) => {
    t.depth[slot] = [...ids.filter((x) => x !== id), id];
    update();
  };
  return (
    <div className="gr-depth">
      <Panel title="Positions">
        <div className="gr-slotlist" role="listbox" aria-label="Depth chart position">
          {DEPTH_SLOTS.map((s) => {
            const top = c.players[(t.depth[s] ?? [])[0]];
            return (
              <button key={s} type="button" role="option" aria-selected={s === slot} className={s === slot ? "is-on" : ""} onClick={() => setSlot(s)}>
                <span>{s}</span>
                <span className="meta">{top ? top.last : "—"}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => { autoDepth(t, c.players); update("Depth chart reset to best available."); }}>Auto-fill depth chart</button>
      </Panel>
      <Panel title={`${slot} · ${SLOT_STARTERS[slot]} starter${SLOT_STARTERS[slot] > 1 ? "s" : ""}`}>
        <p className="meta">Drag to reorder. Starters are above the line.</p>
        <ol className="gr-dnd">
          {ids.map((id, i) => {
            const p = c.players[id];
            if (!p) return null;
            return (
              <li
                key={id}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag !== null && drag !== i) move(drag, i); setDrag(null); }}
                className={i === SLOT_STARTERS[slot] - 1 ? "is-cut" : ""}
              >
                <GripVertical size={16} className="meta" aria-hidden="true" />
                <span className="num meta">{i + 1}</span>
                <span>{p.pos}</span>
                <PlayerLink p={p} />
                <Ovr p={p} />
                {schemeFit(p, t.offScheme, t.defBase) !== 0 && <span className="meta">fit {schemeFit(p, t.offScheme, t.defBase) > 0 ? "+" : ""}{schemeFit(p, t.offScheme, t.defBase)}</span>}
                {p.injury && <span className="gr-inj">{injuryTag(p)}</span>}
                <span className="gr-dnd-btns">
                  <button type="button" className="btn btn-quiet btn-sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up">↑</button>
                  <button type="button" className="btn btn-quiet btn-sm" disabled={i === ids.length - 1} onClick={() => move(i, i + 1)} aria-label="Move down">↓</button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => { t.depth[slot] = ids.filter((x) => x !== id); update(); }} aria-label="Remove">×</button>
                </span>
              </li>
            );
          })}
        </ol>
        <h3>Add</h3>
        <ul className="gr-list">
          {eligible.filter((p) => !ids.includes(p.id)).sort((a, b) => ovr(b) - ovr(a)).slice(0, 10).map((p) => (
            <li key={p.id}>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => add(p.id)}>Add</button> {p.pos} {fullName(p)} <Ovr p={p} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function GamePlan() {
  const { c, update } = useGm();
  const t = userTeam(c);
  const r = teamRating(t, c.players);
  const slider = (key: "passRatio" | "aggression" | "blitz" | "tempo", label: string, lo: string, hi: string) => (
    <label className="gr-slider">
      <span>{label}</span>
      <span className="meta">{lo}</span>
      <input type="range" min={0} max={100} value={t.plan[key]} onChange={(e) => { t.plan[key] = Number(e.target.value); update(); }} />
      <span className="meta">{hi}</span>
      <span className="num">{t.plan[key]}</span>
    </label>
  );
  return (
    <div className="gr-grid2">
      <Panel title="Schemes">
        <p className="meta">Players who fit the scheme play up to 3 points better.</p>
        <h3>Offense</h3>
        <Seg label="Offensive scheme" value={t.offScheme} options={OFF_SCHEMES.map((x) => [x, x])} onChange={(v) => { t.offScheme = v; update(); }} />
        <h3>Defensive front</h3>
        <Seg label="Defensive front" value={t.defBase} options={DEF_BASES.map((x) => [x, x])} onChange={(v) => { t.defBase = v; autoDepth(t, c.players); update(); }} />
        <h3>Coverage tendency</h3>
        <Seg label="Coverage" value={t.coverage} options={COVERAGES.map((x) => [x, x])} onChange={(v) => { t.coverage = v; update(); }} />
        <dl className="gr-ratings">
          <div><dt className="meta">Offense</dt><dd><Ovr value={r.off} /></dd></div>
          <div><dt className="meta">Defense</dt><dd><Ovr value={r.def} /></dd></div>
          <div><dt className="meta">Special teams</dt><dd><Ovr value={r.st} /></dd></div>
        </dl>
      </Panel>
      <Panel title="Game plan">
        {slider("passRatio", "Run / pass", "Run", "Pass")}
        {slider("aggression", "4th down", "Safe", "Aggressive")}
        {slider("blitz", "Blitz", "Rarely", "Often")}
        {slider("tempo", "Tempo", "Slow", "Fast")}
        <h3>Two-point conversions</h3>
        <Seg label="Two-point policy" value={t.plan.twoPoint} options={[["Never", "Never"], ["Situational", "Chart"], ["Always", "Always"]]} onChange={(v) => { t.plan.twoPoint = v; update(); }} />
        <h3>Play calling on game day</h3>
        <Seg label="Coach mode" value={c.coachMode ? "on" : "off"} options={[["on", "I call the plays"], ["off", "Coordinators call"]]} onChange={(v) => { c.coachMode = v === "on"; update(); }} />
      </Panel>
      <Panel title="Practice">
        <h3>Weekly focus</h3>
        <Seg label="Training focus" value={c.training.focus} options={(["Balanced", "Offense", "Defense", "Rookies", "Conditioning"] as const).map((x) => [x, x])} onChange={(v) => { c.training.focus = v; update(); }} />
        <h3>Intensity</h3>
        <Seg label="Intensity" value={c.training.intensity} options={(["Light", "Normal", "Hard"] as const).map((x) => [x, x])} onChange={(v) => { c.training.intensity = v; update(); }} />
        <p className="meta">Hard practices speed up development and raise the injury risk. Conditioning keeps legs fresh.</p>
      </Panel>
    </div>
  );
}

export function Staff() {
  const { c, update } = useGm();
  const t = userTeam(c);
  const offseason = OFFSEASON.includes(c.phase);
  return (
    <div className="gr-grid2">
      <Panel title="Your staff">
        <table className="gr-table">
          <thead><tr><th>Role</th><th>Coach</th><th className="num">Rating</th><th className="num">Dev</th><th>Scheme</th><th className="num">Salary</th></tr></thead>
          <tbody>
            {STAFF_ROLES.map((r) => {
              const co = t.staff[r];
              return (
                <tr key={r}>
                  <td>{r}</td>
                  <td>{co?.name ?? "Vacant"}</td>
                  <td className="num">{co ? <Ovr value={co.rating} /> : "—"}</td>
                  <td className="num">{co ? `+${co.dev}` : "—"}</td>
                  <td className="meta">{co?.scheme ?? ""}</td>
                  <td className="num">{co ? money(co.salary) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="meta">Coordinators lift their side of the ball on game day. Position coaches add to development every offseason. A new OC or DC brings his scheme.</p>
      </Panel>
      <Panel title="Available coaches">
        {!offseason && <p className="meta">You can hire during the offseason.</p>}
        <table className="gr-table">
          <thead><tr><th>Role</th><th>Coach</th><th className="num">Rating</th><th className="num">Dev</th><th>Scheme</th><th /></tr></thead>
          <tbody>
            {c.coachPool.slice().sort((a, b) => a.role.localeCompare(b.role) || b.rating - a.rating).map((co) => (
              <tr key={co.id}>
                <td>{co.role}</td>
                <td>{co.name} <span className="meta">{co.age}</span></td>
                <td className="num"><Ovr value={co.rating} /></td>
                <td className="num">+{co.dev}</td>
                <td className="meta">{co.scheme ?? ""}</td>
                <td><button type="button" className="btn btn-quiet btn-sm" disabled={!offseason} onClick={() => update(hireCoach(c, co.id))}>Hire</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PlayerCard({ id, onClose }: { id: number; onClose: () => void }) {
  const { c, update } = useGm();
  const p = c.players[id];
  const [msg, setMsg] = useState("");
  const [cutOpen, setCutOpen] = useState(false);
  const mine = p.teamId === c.userTeam;
  const keys = useMemo(() => {
    const w = OVR_WEIGHTS[p.pos];
    const main = (Object.keys(w) as AttrKey[]).sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0));
    return [...main, ...(["spd", "str", "agi", "awr"] as AttrKey[]).filter((k) => !main.includes(k))];
  }, [p.pos]);
  const act = (m: string) => {
    setMsg(m);
    update(m);
  };
  const season = c.seasonStats[p.id];
  const statRow = (s: StatLine) =>
    p.pos === "QB" ? `${s.pCmp}/${s.pAtt}, ${s.pYds} yds, ${s.pTd} TD, ${s.pInt} INT, ${passerRating(s)} rtg` :
    ["RB", "FB"].includes(p.pos) ? `${s.rAtt} car, ${s.rYds} yds, ${s.rTd} TD · ${s.rec} rec, ${s.recYds} yds` :
    ["WR", "TE"].includes(p.pos) ? `${s.rec} rec, ${s.recYds} yds, ${s.recTd} TD` :
    ["K"].includes(p.pos) ? `${s.fgm}/${s.fga} FG, ${s.xpm}/${s.xpa} XP` :
    p.pos === "P" ? `${s.punts} punts, ${s.punts ? (s.puntYds / s.punts).toFixed(1) : 0} avg` :
    `${s.tkl} tkl, ${s.sck} sck, ${s.dInt} INT, ${s.pd} PD, ${s.ff} FF`;
  const ask = askingSalary(c, p);
  const [offer, setOffer] = useState({ years: askingYears(p), salary: ask, guarantee: 0.5, incentives: 0 });
  const canExtend = mine && (p.contract.years.length <= 2 || c.phase === "resign") && !p.ps;
  return (
    <GDialog title={`${p.first} ${p.last}`} onClose={onClose}>
      <div className="gr-card-head">
        <Ovr p={p} />
        <div>
          <p>
            {p.pos} · {p.archetype} · #{p.num} · Age {p.age} · {p.yrs === 0 ? "Rookie" : `${p.yrs} yrs pro`} · {p.college}
          </p>
          <p className="meta">
            {p.teamId !== null ? `${c.teams[p.teamId].city} ${c.teams[p.teamId].name}${p.ps ? " (practice squad)" : ""}` : p.retired ? "Retired" : "Free agent"} · Development: {p.dev} · Morale {p.morale}
            {p.draft ? ` · Drafted ${p.draft.year} R${p.draft.round} #${p.draft.pick}` : ""}
          </p>
          {p.injury && <p className="gr-inj">{injuryTag(p)}: {p.injury.name}, {p.injury.weeks} wk</p>}
        </div>
      </div>
      <div className="gr-attrs">
        {keys.map((k) => (
          <div key={k} className="gr-attr">
            <span className="meta">{ATTR_LABELS[k]}</span>
            <span className="gr-bar"><i style={{ width: `${p.attrs[k]}%` }} /></span>
            <span className="num">{p.attrs[k]}</span>
          </div>
        ))}
      </div>
      {p.contract.years.length > 0 && (
        <table className="gr-table gr-table-tight">
          <thead><tr><th>Contract</th>{p.contract.years.map((_, i) => <th key={i} className="num">{c.year + i + (OFFSEASON.includes(c.phase) && c.phase !== "resign" ? 1 : 0)}</th>)}</tr></thead>
          <tbody>
            <tr><td>Cap hit</td>{p.contract.years.map((y, i) => <td key={i} className="num">{money(y.cap)}</td>)}</tr>
            <tr><td>Guaranteed</td>{p.contract.years.map((y, i) => <td key={i} className="num">{money(y.guar)}</td>)}</tr>
          </tbody>
        </table>
      )}
      {(season || p.career.length > 0) && (
        <table className="gr-table gr-table-tight">
          <thead><tr><th>Year</th><th>Team</th><th className="num">GP</th><th>Stats</th></tr></thead>
          <tbody>
            {season && <tr><td>{c.year}</td><td>{p.teamId !== null ? c.teams[p.teamId].abbr : ""}</td><td className="num">{season.gp}</td><td>{statRow(season)}</td></tr>}
            {p.career.slice().reverse().map((x) => {
              const s = fullStats(x.stats);
              return <tr key={x.year}><td>{x.year}</td><td>{x.teamId >= 0 ? c.teams[x.teamId].abbr : ""}</td><td className="num">{s.gp}</td><td>{statRow(s)}</td></tr>;
            })}
          </tbody>
        </table>
      )}
      {p.awards.length > 0 && <p className="meta">Awards: {p.awards.join(" · ")}</p>}
      {mine && (
        <div className="gr-call-row">
          {canExtend && (
            <div className="gr-offer">
              <strong>{p.contract.years.length <= 1 ? "Re-sign" : "Extend"}</strong>
              <OfferFields offer={offer} setOffer={setOffer} ask={ask} />
              <span className="meta">Interest {Math.round(offerInterest(c, p, c.userTeam, offer) * 100)}%</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => act(signPlayer(c, p.id, c.userTeam, offer).message)}>Offer</button>
            </div>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(restructure(c, p.id))}>Restructure</button>
          {c.phase === "resign" && p.contract.years.length === 1 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(franchiseTag(c, p.id))}>Franchise tag</button>}
          {p.injury && !p.injury.ir && <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(toggleIR(c, p.id))}>Place on IR</button>}
          <button type="button" className="btn btn-quiet btn-sm gr-danger" onClick={() => setCutOpen(true)}>Release</button>
        </div>
      )}
      {cutOpen && (
        <div className="gr-confirm">
          <p>Release {fullName(p)}? Guaranteed money left: {money(p.contract.years.reduce((s, y) => s + y.guar, 0))}.</p>
          <div className="gr-call-row">
            <button type="button" className="btn btn-secondary btn-sm gr-danger" onClick={() => { act(cutPlayer(c, p.id, false)); onClose(); }}>Release now</button>
            {p.contract.years.length > 1 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { act(cutPlayer(c, p.id, true)); onClose(); }}>Release, post-June 1</button>}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCutOpen(false)}>Keep him</button>
          </div>
        </div>
      )}
      {msg && <p className="gr-msg" role="status">{msg}</p>}
    </GDialog>
  );
}

export function OfferFields({ offer, setOffer, ask }: { offer: { years: number; salary: number; guarantee: number; incentives: number }; setOffer: (o: { years: number; salary: number; guarantee: number; incentives: number }) => void; ask: number }) {
  return (
    <span className="gr-offer-fields">
      <label>Years <input type="number" min={1} max={6} value={offer.years} onChange={(e) => setOffer({ ...offer, years: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} /></label>
      <label>$M/yr <input type="number" min={0.5} max={70} step={0.1} value={offer.salary} onChange={(e) => setOffer({ ...offer, salary: Math.max(0.5, Number(e.target.value) || 0.5) })} /></label>
      <label>Guaranteed <input type="number" min={0} max={100} step={5} value={Math.round(offer.guarantee * 100)} onChange={(e) => setOffer({ ...offer, guarantee: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)) })} />%</label>
      <label>Incentives <input type="number" min={0} max={10} step={0.5} value={offer.incentives} onChange={(e) => setOffer({ ...offer, incentives: Math.max(0, Number(e.target.value) || 0) })} /></label>
      <span className="meta">Asking about {money(ask)}</span>
    </span>
  );
}

export type { Player };
