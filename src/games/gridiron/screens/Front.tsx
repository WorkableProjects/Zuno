import { useEffect, useMemo, useRef, useState } from "react";
import { aiPick, currentPick, draftOrder, draftPlayer, draftProgress, needProspects, pickKey, pickLabel, potentialGrade, rookieSalary, scout, scoutedRange, SCOUT_COST, teamNeeds, upcomingPicks } from "../gmDraft";
import {
  askingSalary, askingYears, capSpace, deadMoney, findPick, freeAgents, offerInterest, payroll, pickValue, signPlayer, signToPs,
  tradeWindowOpen, TRADE_DEADLINE_WEEK, userTeam,
} from "../gmCareer";
import { teamPlayers } from "../gmLeague";
import { capHit, contractSummary, fullName, makeContract, ovr, POS_GROUP } from "../gmPlayers";
import { POSITIONS, type Career, type Player } from "../gmTypes";
import {
  analyzeTrade, answerOffer, emptySide, pickAssets, proposeTrade, rosterAssets, rosterLimit, sideIsEmpty, suggestSweeteners, type TeamBeforeAfter, type TradeSide,
} from "../gmTrade";
import { OfferFields } from "./Team";
import { injuryTag, money, Ovr, Panel, PlayerLink, Seg, TeamTag, useDirtyGuard, useGm } from "./ui";
import "./trade.css";

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
        <div><span className="meta">Active roster</span><strong className="num">{roster.filter((p) => !p.ps).length}/{rosterLimit(c)}</strong></div>
      </div>
      <Panel title="Contracts">
        <div className="gr-scroll">
          <table className="gr-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th className="num">Ovr</th>
                <th className="num">Years</th>
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
                  <td className="num">{contractSummary(p).yearsLeft}</td>
                  {years.map((i) => <td key={i} className="num">{p.contract.years[i] ? money(p.contract.years[i].cap) : ""}</td>)}
                  <td className="num">{money(contractSummary(p).guaranteed)}</td>
                </tr>
              ))}
              <tr>
                <td>Dead money</td><td /><td /><td />
                {years.map((i) => <td key={i} className="num">{money(deadMoney(c, t.id, i))}</td>)}
                <td />
              </tr>
              <tr className="is-total">
                <td>Committed</td><td /><td /><td />
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
  const [affordable, setAffordable] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [confirming, setConfirming] = useState(false);
  const space = capSpace(c, c.userTeam);
  const needs = teamNeeds(c, c.userTeam);
  const active = teamPlayers(c.userTeam, c.players).length;
  const all = freeAgents(c);
  const list = all
    .filter((p) => pos === "All" || p.pos === pos)
    .filter((p) => !affordable || askingSalary(c, p) <= space)
    .sort((a, b) => ovr(b) - ovr(a))
    .slice(0, 80);
  const p = sel !== null ? c.players[sel] : null;
  const [offer, setOffer] = useState({ years: 2, salary: 1, guarantee: 0.4, incentives: 0 });
  const choose = (id: number) => {
    const pl = c.players[id];
    setSel(id);
    setOffer({ years: askingYears(pl), salary: askingSalary(c, pl), guarantee: 0.4, incentives: 0 });
    setMsg("");
    setConfirming(false);
  };
  const valid = !!p && Number.isFinite(offer.salary) && offer.salary > 0 && Number.isInteger(offer.years) && offer.years >= 1 && offer.years <= 5 && offer.guarantee >= 0 && offer.guarantee <= 1;
  const preview = valid ? contractSummary({ ...p!, contract: makeContract(offer.salary, offer.years, offer.guarantee) }) : null;
  const rosterFull = active >= rosterLimit(c);
  const cantAfford = valid && offer.salary > space + 0.01;
  const blocked = !valid ? "Enter a salary above $0 and 1 to 5 years." : cantAfford ? `Not enough cap space (${money(space)} available).` : rosterFull ? "Your roster is full. Release someone first." : "";
  const big = valid && offer.salary >= 10;
  const send = () => {
    if (!p || blocked) return;
    const r = signPlayer(c, p.id, c.userTeam, offer);
    setMsg(r.message);
    setConfirming(false);
    if (r.ok) setSel(null);
    update(r.ok ? r.message : undefined);
  };
  return (
    <div className="gr-stack">
      <div className="gr-stats">
        <div><span className="meta">Cap space</span><strong className={`num${space < 0 ? " gr-neg" : ""}`}>{money(space)}</strong></div>
        <div><span className="meta">Active roster</span><strong className="num">{active}/{rosterLimit(c)}</strong></div>
        <div><span className="meta">Biggest needs</span><strong>{needs.join(", ") || "None"}</strong></div>
      </div>
      <div className="gr-grid2 gr-grid-wide">
        <Panel
          title={`Free agents (${all.length})`}
          actions={
            <div className="gt-fa-filters">
              <label className="gr-check"><input type="checkbox" checked={affordable} onChange={(e) => setAffordable(e.target.checked)} /> Fits my cap</label>
              <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position"><option>All</option>{POSITIONS.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
          }
        >
          {list.length ? (
            <div className="gr-scroll">
              <table className="gr-table">
                <thead><tr><th>Pos</th><th>Name</th><th className="num">Ovr</th><th className="num">Age</th><th className="num">Asking</th><th /></tr></thead>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.id} className={sel === x.id ? "is-sel" : ""}>
                      <td>{x.pos}{needs.includes(POS_GROUP[x.pos]) && <span className="gt-need" title={`${POS_GROUP[x.pos]} is one of your thinnest groups`}> need</span>}</td>
                      <td><PlayerLink p={x} /></td>
                      <td className="num"><Ovr p={x} /></td>
                      <td className="num">{x.age}</td>
                      <td className={`num${askingSalary(c, x) > space ? " gr-neg" : ""}`}>{money(askingSalary(c, x))} × {askingYears(x)}</td>
                      <td><button type="button" className="btn btn-quiet btn-sm" onClick={() => choose(x.id)} aria-label={`Negotiate with ${fullName(x)}`}>Negotiate</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="gr-empty">{all.length === 0 ? "No free agents are available right now." : affordable ? `No free agent at this position asks for ${money(space)} or less. Clear the filter or clear cap space.` : "No free agents at this position."}</p>
          )}
        </Panel>
        <Panel title="Negotiation">
          {p ? (
            <div className="gr-stack">
              <p>{p.pos} <strong>{fullName(p)}</strong> <Ovr p={p} /> · age {p.age} · {p.archetype}</p>
              <OfferFields offer={offer} setOffer={(o) => { setOffer(o); setConfirming(false); }} ask={askingSalary(c, p)} />
              <p className="meta">Players weigh money, guarantees, your record and whether they'll start. Interest: {Math.round(offerInterest(c, p, c.userTeam, offer) * 100)}%</p>
              {preview && (
                <dl className="gt-kv" aria-label="Contract preview">
                  <dt className="head">If he signs</dt><dd className="head">Now</dd><dd className="head">After</dd>
                  <dt>Cap space</dt><dd>{money(space)}</dd><dd className={space - offer.salary < 0 ? "gt-neg" : ""}>{money(Math.round((space - offer.salary) * 10) / 10)}</dd>
                  <dt>Roster</dt><dd>{active}</dd><dd>{active + 1}</dd>
                  <dt>Contract</dt><dd /><dd>{preview.yearsLeft} yr · {money(preview.total)}</dd>
                  <dt>Guaranteed</dt><dd /><dd>{money(preview.guaranteed)}</dd>
                </dl>
              )}
              {blocked && <p className="gr-msg" role="alert">{blocked}</p>}
              {confirming && !blocked ? (
                <div className="gt-confirm" role="group" aria-label="Confirm offer">
                  <strong>Offer {fullName(p)} {money(offer.salary)} a year for {offer.years} years?</strong>
                  <p className="gt-note">That is {money(preview?.total ?? 0)} total with {money(preview?.guaranteed ?? 0)} guaranteed, and leaves {money(Math.round((space - offer.salary) * 10) / 10)} in cap space this year.</p>
                  <div className="gt-actions">
                    <button type="button" className="gt-btn" onClick={() => setConfirming(false)}>Back</button>
                    <button type="button" className="gt-btn is-main" onClick={send}>Confirm offer</button>
                  </div>
                </div>
              ) : (
                <div className="gr-call-row">
                  <button type="button" className="btn btn-primary" disabled={!!blocked} onClick={() => (big ? setConfirming(true) : send())}>Make offer</button>
                  {p.yrs <= 3 && <button type="button" className="btn btn-secondary" onClick={() => { const m = signToPs(c, p.id); setMsg(m); update(m); }}>Sign to practice squad</button>}
                </div>
              )}
            </div>
          ) : (
            <p className="gr-empty">Pick a player to make an offer.</p>
          )}
          {msg && <p className="gr-msg" role="status">{msg}</p>}
        </Panel>
      </div>
    </div>
  );
}

type StepId = "partner" | "give" | "get" | "review";
const STEPS: Array<[StepId, string]> = [["partner", "1 Partner"], ["give", "2 Give"], ["get", "3 Receive"], ["review", "4 Review"]];

function PlayerRow({ p, added, off, onAct, actLabel, actClass }: { p: Player; added?: boolean; off?: string | null; onAct?: () => void; actLabel: string; actClass?: string }) {
  const inj = injuryTag(p);
  const yrs = p.contract.years.length;
  const dis = !!off || !!added;
  return (
    <li className={`gt-row${added ? " is-added" : ""}${off ? " is-off" : ""}`}>
      <span className="num-badge" aria-label={`Number ${p.num}`}>#{p.num}</span>
      <span className="pos">{p.pos}</span>
      <span className="who">
        <strong>{fullName(p)}</strong>
        <span>Age {p.age} · cap {money(capHit(p))} · {yrs} yr{yrs === 1 ? "" : "s"} left{inj ? ` · ${inj}` : ""}</span>
      </span>
      <Ovr p={p} />
      {onAct && (
        <button type="button" className={`gt-btn ${actClass ?? ""}`} disabled={dis} onClick={onAct} aria-label={`${actLabel} ${fullName(p)}`}>
          {off ? "Unavailable" : added ? "Added" : actLabel}
        </button>
      )}
      {off && <span className="tag" title={off}>{off}</span>}
    </li>
  );
}

function PickRow({ label, value, round, added, onAct, actLabel, actClass, owner, orig }: { label: string; value: number; round: number; added?: boolean; onAct: () => void; actLabel: string; actClass?: string; owner?: string; orig?: string }) {
  return (
    <li className={`gt-row is-pick${added ? " is-added" : ""}`}>
      <span className="who">
        <strong>{label}</strong>
        <span>Round {round} · trade value {Math.round(value)}{owner && orig && owner !== orig ? ` · originally ${orig}` : ""}</span>
      </span>
      <span className="tag">Draft pick</span>
      <button type="button" className={`gt-btn ${actClass ?? ""}`} disabled={added} onClick={onAct} aria-label={`${actLabel} ${label}`}>{added ? "Added" : actLabel}</button>
    </li>
  );
}

function AssetSection({ c, which, teamId, deal, setDeal }: { c: Career; which: "give" | "get"; teamId: number; deal: TradeSide; setDeal: (d: TradeSide) => void }) {
  const [tab, setTab] = useState<"roster" | "picks">("roster");
  const [q, setQ] = useState("");
  const roster = useMemo(() => rosterAssets(c, teamId), [c, c.updatedAt, teamId, deal.players.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const picks = useMemo(() => pickAssets(c, teamId), [c, c.updatedAt, teamId, deal.picks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = q.trim().toLowerCase();
  const shown = roster.filter((a) => !needle || `${a.player.pos} ${fullName(a.player)} ${a.player.num}`.toLowerCase().includes(needle));
  const heading = which === "give" ? "You give" : "You receive";
  const addP = (id: number) => deal.players.includes(id) || setDeal({ ...deal, players: [...deal.players, id] });
  const addK = (k: string) => deal.picks.includes(k) || setDeal({ ...deal, picks: [...deal.picks, k] });
  const empty = deal.players.length + deal.picks.length === 0;
  return (
    <section className={`gt-sec is-${which}`} id={`gt-panel-${which}`} aria-labelledby={`gt-h-${which}`}>
      <header>
        <h2 id={`gt-h-${which}`}>{heading} ({deal.players.length + deal.picks.length})</h2>
        <span className="meta">{c.teams[teamId].city} {c.teams[teamId].name}</span>
      </header>
      {empty ? (
        <p className="gr-empty">{which === "give" ? "Nothing offered yet. Add players or picks from your roster below." : "Nothing requested yet. Add players or picks from their roster below."}</p>
      ) : (
        <ul className="gt-list" aria-label={`${heading} in this deal`}>
          {deal.players.map((id) => <PlayerRow key={id} p={c.players[id]} actLabel="Remove" actClass="is-remove" onAct={() => setDeal({ ...deal, players: deal.players.filter((x) => x !== id) })} />)}
          {deal.picks.map((k) => {
            const pk = findPick(c, k);
            return pk ? <PickRow key={k} label={pickLabel(pk, c.teams)} round={pk.round} value={pickValue(c, pk)} owner={c.teams[pk.owner].abbr} orig={c.teams[pk.orig].abbr} actLabel="Remove" actClass="is-remove" onAct={() => setDeal({ ...deal, picks: deal.picks.filter((x) => x !== k) })} /> : null;
          })}
        </ul>
      )}
      <div className="gt-fa-filters">
        <div className="gt-tabs" role="group" aria-label={`${heading} asset type`}>
          <button type="button" className="gt-tab" aria-selected={tab === "roster"} aria-pressed={tab === "roster"} onClick={() => setTab("roster")}>Roster assets</button>
          <button type="button" className="gt-tab" aria-selected={tab === "picks"} aria-pressed={tab === "picks"} onClick={() => setTab("picks")}>Draft assets</button>
        </div>
        {tab === "roster" && <input className="gt-search" type="search" placeholder="Search name, position or number" aria-label={`Search ${which === "give" ? "your" : "their"} roster`} value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      <div className="gt-picker" tabIndex={0} aria-label={tab === "roster" ? "Roster assets" : "Draft assets"}>
        {tab === "roster" ? (
          shown.length ? (
            <ul className="gt-list">
              {shown.map((a) => <PlayerRow key={a.player.id} p={a.player} added={deal.players.includes(a.player.id)} off={a.unavailable} actLabel={which === "give" ? "Give" : "Get"} onAct={() => addP(a.player.id)} />)}
            </ul>
          ) : <p className="gr-empty">No players match your search.</p>
        ) : picks.length ? (
          <ul className="gt-list">
            {picks.map((a) => <PickRow key={a.key} label={a.label} round={a.pick.round} value={a.value} owner={c.teams[a.pick.owner].abbr} orig={c.teams[a.pick.orig].abbr} added={deal.picks.includes(a.key)} actLabel={which === "give" ? "Give" : "Get"} onAct={() => addK(a.key)} />)}
          </ul>
        ) : <p className="gr-empty">{which === "give" ? "You have" : "They have"} no draft picks left to trade.</p>}
      </div>
    </section>
  );
}

const VERDICT_TITLE: Record<string, string> = {
  accept: "They will accept this deal",
  counter: "Close: they want a little more",
  reject: "They would reject this deal",
  blocked: "This deal is not allowed",
  empty: "Add assets to build a deal",
};
const FAIR_TEXT: Record<string, string> = {
  empty: "No value yet",
  "one-sided-them": "Heavily in their favor",
  balanced: "Roughly balanced",
  "one-sided-you": "Heavily in your favor",
};

function BeforeAfter({ label, ba, c }: { label: string; ba: TeamBeforeAfter; c: Career }) {
  const roster = (n: number) => `${n}/${rosterLimit(c)}`;
  return (
    <dl className="gt-kv" aria-label={`${label} before and after`}>
      <dt className="head">{label}</dt><dd className="head">Now</dd><dd className="head">After</dd>
      <dt>Cap space</dt><dd>{money(ba.before.capSpace)}</dd><dd className={ba.after.capSpace < 0 ? "gt-neg" : ""}>{money(ba.after.capSpace)}</dd>
      <dt>Roster</dt><dd>{roster(ba.before.active)}</dd><dd className={ba.after.active > rosterLimit(c) ? "gt-neg" : ""}>{roster(ba.after.active)}</dd>
    </dl>
  );
}

export function Trades() {
  const { c, update } = useGm();
  const others = c.teams.filter((t) => t.id !== c.userTeam);
  const [other, setOther] = useState(others[0].id);
  const [q, setQ] = useState("");
  const [give, setGive] = useState<TradeSide>(emptySide());
  const [get, setGet] = useState<TradeSide>(emptySide());
  const [step, setStep] = useState<StepId>("partner");
  const [stage, setStage] = useState<"edit" | "confirm" | "processing">("edit");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [sweet, setSweet] = useState<ReturnType<typeof suggestSweeteners> | null>(null);
  const [msg, setMsg] = useState("");
  const busy = useRef(false);
  const timer = useRef<number | null>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const dirty = !sideIsEmpty(give) || !sideIsEmpty(get);
  useDirtyGuard(dirty && stage !== "processing");
  const open = tradeWindowOpen(c);

  const a = useMemo(() => analyzeTrade(c, other, give, get), [c, c.updatedAt, other, give, get]); // eslint-disable-line react-hooks/exhaustive-deps
  const partner = c.teams[other];

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  useEffect(() => { if (stage === "confirm") confirmRef.current?.focus(); }, [stage]);

  const edit = (which: "give" | "get") => (d: TradeSide) => {
    if (busy.current) return;
    (which === "give" ? setGive : setGet)(d);
    setStage("edit"); setResult(null); setSweet(null);
  };
  const clearDeal = () => { setGive(emptySide()); setGet(emptySide()); setStage("edit"); setResult(null); setSweet(null); };
  const choose = (id: number) => {
    if (id === other) return;
    if (dirty && !window.confirm("Switching partners clears the current deal. Continue?")) return;
    setOther(id); clearDeal(); setMsg("");
  };
  const submit = () => {
    if (busy.current) return;
    busy.current = true;
    setStage("processing");
    timer.current = window.setTimeout(() => {
      const r = proposeTrade(c, other, give, get);
      busy.current = false;
      if (r.applied) {
        clearDeal();
        setResult({ ok: true, text: `${r.message} The deal is final and saved.` });
        update(r.message);
      } else {
        setStage("edit");
        setResult({ ok: false, text: r.message });
      }
    }, 350);
  };
  const askWhatWorks = () => setSweet(suggestSweeteners(c, other, give, get, 4));

  const teams = others.filter((t) => `${t.city} ${t.name} ${t.abbr}`.toLowerCase().includes(q.trim().toLowerCase()));
  const canReview = a.legal && open && !sideIsEmpty(give) || (a.legal && open && !sideIsEmpty(get));
  const meterText = `Value you give ${Math.round(a.giveValue)}, value you get ${Math.round(a.getValue)}, their asking price ${Math.round(a.required)}.`;

  return (
    <div className="gt" data-step={step}>
      {c.offers.length > 0 && (
        <Panel title="Offers for you">
          {c.offers.map((o) => (
            <div key={o.id} className="gr-offer-card">
              <TeamTag team={c.teams[o.fromTeam]} full />
              <p>
                They want {o.give.players.map((id) => fullName(c.players[id])).join(", ")} and send{" "}
                {[...o.get.players.map((id) => `${c.players[id].pos} ${fullName(c.players[id])} (${ovr(c.players[id])})`), ...o.get.picks.map((k) => (findPick(c, k) ? pickLabel(findPick(c, k)!, c.teams) : k))].join(", ") || "nothing"}.
              </p>
              <div className="gr-call-row">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { const m = answerOffer(c, o.id, true); setMsg(m); update(m); }}>Accept</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const m = answerOffer(c, o.id, false); setMsg(m); update(m); }}>Decline</button>
              </div>
            </div>
          ))}
        </Panel>
      )}
      {msg && <p className="gr-msg" role="status">{msg}</p>}
      {!open && <p className="gr-msg" role="alert">{c.phase === "playoffs" ? "Trades are closed during the playoffs." : `Trades closed after week ${TRADE_DEADLINE_WEEK}. They reopen in the offseason.`}</p>}

      <div className="gt-steps" role="tablist" aria-label="Trade steps">
        {STEPS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`gt-step-${id}`} className="gt-step" aria-selected={step === id} onClick={() => setStep(id)}>{label}</button>
        ))}
      </div>

      <div className="gt-layout">
        <div className="gt-col partner">
          <section className="gt-sec" aria-labelledby="gt-h-partner">
            <h2 id="gt-h-partner">Trade partner</h2>
            <input className="gt-search" type="search" placeholder="Search teams" aria-label="Search teams" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="gt-teams" aria-label="Teams">
              {teams.map((t) => (
                <li key={t.id}>
                  <button type="button" className="gt-team" aria-pressed={t.id === other} onClick={() => choose(t.id)}>
                    <TeamTag team={t} full />
                    <span className="meta" style={{ marginLeft: "auto" }}>{money(capSpace(c, t.id))}</span>
                  </button>
                </li>
              ))}
              {!teams.length && <li className="gr-empty">No team matches.</li>}
            </ul>
          </section>
          <section className="gt-sec" aria-labelledby="gt-h-needs">
            <h2 id="gt-h-needs">{partner.name} needs</h2>
            <ul className="gt-chips" aria-label="Thinnest position groups">
              {a.partner.before.needs.map((n) => <li key={n} className="gt-chip">{n}</li>)}
            </ul>
            <p className="gt-note">Needs are the three position groups with the lowest top-two average rating. The trade AI ignores needs when it values a deal.</p>
            <h2>Your needs</h2>
            <ul className="gt-chips" aria-label="Your thinnest position groups">
              {a.user.before.needs.map((n) => <li key={n} className="gt-chip">{n}</li>)}
            </ul>
          </section>
        </div>

        <div className="gt-canvas">
          <AssetSection c={c} which="give" teamId={c.userTeam} deal={give} setDeal={edit("give")} />
          <AssetSection c={c} which="get" teamId={other} deal={get} setDeal={edit("get")} />
        </div>

        <div className="gt-col summary">
          <section className="gt-sec" aria-labelledby="gt-h-sum">
            <h2 id="gt-h-sum">Deal summary</h2>
            <div className="gt-meter">
              <div className="gt-bar" role="img" aria-label={`${FAIR_TEXT[a.fairness]}. ${meterText}`}>
                <i style={{ width: `${Math.round(a.giveShare * 100)}%` }} />
                <b style={{ left: `${Math.round(a.thresholdShare * 100)}%` }} />
              </div>
              <div className="gt-bar-legend"><span>You give {Math.round(a.giveValue)}</span><span>You get {Math.round(a.getValue)}</span></div>
              <p className="gt-note"><strong>{FAIR_TEXT[a.fairness]}.</strong> The marker is their asking price ({Math.round(a.required)} points). Trade value is the game's own estimate from rating, age, position and contract. It is not a guarantee and a bigger number is not always a better player.</p>
            </div>
            <div className={`gt-verdict is-${a.verdict}`} role="status" aria-live="polite">
              <strong>{VERDICT_TITLE[a.verdict]}</strong>
              <ul className="gt-reasons">{a.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
            {(a.verdict === "reject" || a.verdict === "counter") && (
              <div className="gt-sweet">
                <button type="button" className="gt-btn" onClick={askWhatWorks}>What would they take?</button>
                {sweet && (sweet.length ? (
                  <ul className="gt-list" aria-label="Suggested additions">
                    {sweet.map((s) => (
                      <li key={String(s.id)} className="gt-row is-pick">
                        <span className="who"><strong>{s.label}</strong><span>trade value {Math.round(s.value)}</span></span>
                        <span className="tag">Makes it work</span>
                        <button type="button" className="gt-btn" aria-label={`Add ${s.label} to what you give`} onClick={() => { edit("give")(s.kind === "player" ? { ...give, players: [...give.players, s.id as number] } : { ...give, picks: [...give.picks, s.id as string] }); }}>Add</button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="gt-note">No single asset from your side makes this work. Try adding more or asking for less.</p>)}
              </div>
            )}
            <BeforeAfter label="You" ba={a.user} c={c} />
            <BeforeAfter label={partner.abbr} ba={a.partner} c={c} />
            {stage === "edit" && result && <p className={`gt-result ${result.ok ? "is-ok" : "is-no"}`} role={result.ok ? "status" : "alert"}>{result.text}</p>}
            {stage === "edit" ? (
              <div className="gt-actions">
                <button type="button" className="gt-btn" disabled={!dirty} onClick={clearDeal}>Clear deal</button>
                <button type="button" className="gt-btn is-main" disabled={!canReview} onClick={() => { setResult(null); setStage("confirm"); }}>Review trade</button>
              </div>
            ) : (
              <div className="gt-confirm" role="group" aria-labelledby="gt-h-confirm">
                <h3 id="gt-h-confirm" tabIndex={-1} ref={confirmRef} style={{ margin: 0 }}>Review trade with {partner.city}</h3>
                <ul>
                  <li>You give: {[...a.giveLines.map((l) => l.label)].join(", ") || "nothing"}</li>
                  <li>You receive: {[...a.getLines.map((l) => l.label)].join(", ") || "nothing"}</li>
                  <li>Your cap space {money(a.user.before.capSpace)} to {money(a.user.after.capSpace)}; roster {a.user.before.active} to {a.user.after.active}</li>
                </ul>
                <p className="gt-note">Trades are final once accepted. Rejected or cancelled deals change nothing.</p>
                <div className="gt-actions">
                  <button type="button" className="gt-btn" disabled={stage === "processing"} onClick={() => setStage("edit")}>Back</button>
                  <button type="button" className="gt-btn is-main" disabled={stage === "processing"} aria-busy={stage === "processing"} onClick={submit}>{stage === "processing" ? "Processing…" : "Propose trade"}</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="gt-minibar">
        <span>Give {give.players.length + give.picks.length} · Get {get.players.length + get.picks.length} · {a.verdict === "accept" ? "Accepted" : a.verdict === "empty" ? "Empty" : a.verdict === "blocked" ? "Not allowed" : "Not yet"}</span>
        {step !== "review" ? <button type="button" className="gt-btn is-main" onClick={() => setStep(step === "partner" ? "give" : step === "give" ? "get" : "review")}>Next</button> : <button type="button" className="gt-btn" onClick={() => setStep("give")}>Edit deal</button>}
      </div>
    </div>
  );
}

export function DraftRoom() {
  const { c, update, openPlayer } = useGm();
  const [pos, setPos] = useState("All");
  const [view, setView] = useState<"board" | "mine" | "results">("board");
  const [pending, setPending] = useState<number | null>(null);
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
  const progress = draftProgress(c);
  const upcoming = c.phase === "draft" ? upcomingPicks(c, 10) : [];
  const needs = teamNeeds(c, c.userTeam);
  const fit = needProspects(c, c.userTeam, 3);
  const rosterNow = teamPlayers(c.userTeam, c.players).length;
  const myPicks = c.picks.filter((p) => p.owner === c.userTeam && p.year === c.year + (c.phase === "draft" || c.phase === "fa" || c.phase === "combine" || c.phase === "resign" ? 0 : 1));
  return (
    <div className="gr-stack">
      <div className="gr-stats">
        <div><span className="meta">Scouting points</span><strong className="num">{c.scoutPoints}</strong></div>
        <div><span className="meta">Your picks</span><strong>{myPicks.filter((p) => p.playerId === undefined).map((p) => (p.overall ? `#${p.overall}` : `R${p.round}`)).join(", ") || "None"}</strong></div>
        <div><span className="meta">Roster / needs</span><strong>{rosterNow} · {needs.join(", ")}</strong></div>
        {c.phase === "draft" && <div><span className="meta">Progress</span><strong className="num">{progress.made}/{progress.total} picks</strong></div>}
        <div><span className="meta">On the clock</span><strong>{c.phase === "draft" && pk ? `${c.teams[pk.owner].abbr} · #${pk.overall}` : c.phase === "draft" ? "Draft complete" : "Draft opens in the offseason"}</strong></div>
      </div>
      {c.phase === "draft" && pk && (
        <div className="gr-call-row">
          {!onClock && <button type="button" className="btn btn-primary" onClick={() => simTo(true)}>Sim to your pick</button>}
          {!onClock && <button type="button" className="btn btn-secondary" onClick={() => simTo(false)}>Next pick</button>}
          {!onClock && <button type="button" className="btn btn-quiet" onClick={() => { if (window.confirm("Auto-pick for every team including yours until the draft ends?")) { let g = 0; while (g++ < 300) { const p = currentPick(c); if (!p) break; const id = aiPick(c, p.owner); if (id === null) break; draftPlayer(c, id); } update(); } }}>Sim rest of draft</button>}
          {onClock && <strong>You're on the clock. Pick from the board or trade the pick on the Trades screen.</strong>}
        </div>
      )}
      {upcoming.length > 0 && (
        <ol className="gt-strip" aria-label="Upcoming picks">
          {upcoming.map((u) => (
            <li key={u.overall} className={u.owner === c.userTeam ? "is-mine" : ""}>
              <strong>#{u.overall} · {c.teams[u.owner].abbr}</strong>
              <small>Round {u.round}{u.traded ? ` · from ${c.teams[u.orig].abbr}` : ""}</small>
            </li>
          ))}
        </ol>
      )}
      {onClock && fit.length > 0 && <p className="meta">Best-ranked prospects at your thinnest groups: {fit.map((pr) => `${c.players[pr.playerId].pos} ${fullName(c.players[pr.playerId])} (#${pr.rank})`).join(", ")}.</p>}
      {pending !== null && onClock && pk && (
        <div className="gt-confirm" role="group" aria-label="Confirm draft pick">
          <strong>Draft {c.players[pending].pos} {fullName(c.players[pending])} with pick #{pk.overall} (round {pk.round})?</strong>
          <p className="gt-note">Rookie contract: {money(rookieSalary(pk.overall!))} a year for 4 years. The pick cannot be undone.</p>
          <div className="gt-actions">
            <button type="button" className="gt-btn" onClick={() => setPending(null)}>Cancel</button>
            <button type="button" className="gt-btn is-main" onClick={() => { draftPlayer(c, pending); const nm = fullName(c.players[pending]); setPending(null); update(`You drafted ${nm}.`); }}>Confirm pick</button>
          </div>
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
                        {onClock && <button type="button" className="btn btn-primary btn-sm" onClick={() => setPending(p.id)}>Draft</button>}
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
