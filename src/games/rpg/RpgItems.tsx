import { useEffect, useRef, useState } from "react";
import { Bomb, Check, Rocket, ShoppingCart, Zap } from "lucide-react";
import { ITEM_IDS, formatCoins, itemInfo, type ItemId } from "../../game-files/schema/rpg";
import { CHOICES, TRAP_ITEMS, TRAP_MIN_PLAYERS, WIRES, type Choice } from "./rpgEngine";
import { ItemInfoBody, ItemInfoTip } from "./ItemInfo";
import type { RpgOnline, RpgOnlineDuel, RpgMove, RpgPrivate } from "./rpgLobby";

type Send = (move: RpgMove) => Promise<void>;
interface Common {
  game: RpgOnline;
  me: string;
  nameOf: (id: string) => string;
  send: Send;
  sending: boolean;
  priv: RpgPrivate;
}

const EMOJI: Record<Choice, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
const LABEL: Record<Choice, string> = { rock: "Rock", paper: "Paper", scissors: "Scissors" };

/** Shop and inventory, shown while players are choosing an opponent. */
export function ItemShop({ game, me, nameOf, send, sending, priv }: Common) {
  const [open, setOpen] = useState(false);
  const [aiming, setAiming] = useState(false);
  const [confirmNuke, setConfirmNuke] = useState(false);
  const mine = game.players.find((p) => p.id === me);
  if (!game.itemsOn || !mine || mine.removed) return null;
  const broke = mine.coins <= 0;
  const trapsOk = game.players.filter((p) => !p.removed && p.coins > 0).length >= TRAP_MIN_PLAYERS;
  const targets = game.players.filter((p) => p.id !== me && !p.removed && p.coins > 0);
  return (
    <div className="rpg-items card">
      <div className="rpg-row">
        <button type="button" className="btn btn-quiet btn-sm" aria-expanded={open} disabled={broke} onClick={() => setOpen((v) => !v)}>
          <ShoppingCart size={16} strokeWidth={1.5} />
          Shop
        </button>
        <span className="meta">Your items: {priv.items.length === 0 ? "none" : priv.items.length}</span>
      </div>
      {open && !broke && (
        <ul className="rpg-shop" aria-label="Item shop">
          {ITEM_IDS.map((id) => {
            const have = priv.items.includes(id);
            const cost = game.itemCosts[id];
            const needs = TRAP_ITEMS.includes(id) && !trapsOk;
            return (
              <li key={id}>
                <span className="rpg-grow">
                  <strong>{itemInfo(id, game.itemCosts).name}</strong> <ItemInfoTip id={id} costs={game.itemCosts} />
                  <span className="meta rpg-status">{needs ? "Needs 3+ players" : itemInfo(id, game.itemCosts).short}</span>
                </span>
                <button type="button" className="btn btn-primary btn-sm" disabled={have || needs || cost >= mine.coins || sending} onClick={() => void send({ type: "buy", item: id })}>
                  {have ? "Owned" : `Buy ${formatCoins(cost)}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {priv.items.length > 0 && (
        <ul className="rpg-shop" aria-label="Your inventory">
          {priv.items.map((id) => (
            <li key={id}>
              <span className="rpg-grow">
                <strong>{itemInfo(id, game.itemCosts).name}</strong> <ItemInfoTip id={id} costs={game.itemCosts} />
              </span>
              {id === "bomb" && (
                <button type="button" className="btn btn-quiet btn-sm" aria-expanded={aiming} disabled={sending || targets.length === 0} onClick={() => setAiming((v) => !v)}>
                  <Bomb size={16} strokeWidth={1.5} />
                  Use
                </button>
              )}
              {id === "nuke" &&
                (confirmNuke ? (
                  <span className="rpg-row" role="group" aria-label="Confirm nuke launch">
                    <button
                      type="button"
                      className="btn rpg-btn-danger btn-sm"
                      disabled={sending || targets.length === 0}
                      onClick={() => {
                        setConfirmNuke(false);
                        void send({ type: "nuke" });
                      }}
                    >
                      <Rocket size={16} strokeWidth={1.5} />
                      Confirm launch
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmNuke(false)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-quiet btn-sm" disabled={sending || targets.length === 0} onClick={() => setConfirmNuke(true)}>
                    <Rocket size={16} strokeWidth={1.5} />
                    Launch
                  </button>
                ))}
              {(id === "landmine" || id === "interceptor") && <span className="meta">Use during betting</span>}
            </li>
          ))}
        </ul>
      )}
      {aiming && priv.items.includes("bomb") && (
        <div className="rpg-row" role="group" aria-label="Choose a bomb target">
          {targets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn rpg-btn-danger btn-sm"
              disabled={sending}
              onClick={() => {
                setAiming(false);
                void send({ type: "bomb", target: p.id });
              }}
            >
              Bomb {nameOf(p.id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Landmine and Interceptor, placed in secret while bets are open. */
export function ItemTraps({ game, duel, me, nameOf, send, sending, priv }: Common & { duel: RpgOnlineDuel }) {
  const mineP = game.players.find((p) => p.id === me);
  if (!game.itemsOn || !mineP || mineP.removed || mineP.coins <= 0) return null;
  if (me === duel.challenger || me === duel.challengee) return null;
  const hasMine = priv.items.includes("landmine");
  const hasIc = priv.items.includes("interceptor");
  if (!hasMine && !hasIc && priv.mine === null && priv.intercept === null) return null;
  return (
    <div className="rpg-items card">
      {priv.mine !== null ? (
        <p className="rpg-locked">
          <Check size={18} strokeWidth={2} /> Landmine hidden on {LABEL[priv.mine]}
        </p>
      ) : (
        hasMine && (
          <div className="rpg-trap">
            <p className="rpg-h">
              Landmine <ItemInfoTip id="landmine" costs={game.itemCosts} />
            </p>
            <div className="rpg-row" role="group" aria-label="Pick the Landmine symbol">
              {CHOICES.map((c) => (
                <button key={c} type="button" className="btn btn-quiet btn-sm" disabled={sending} onClick={() => void send({ type: "mine", choice: c })}>
                  {EMOJI[c]} {LABEL[c]}
                </button>
              ))}
            </div>
          </div>
        )
      )}
      {priv.intercept !== null ? (
        <p className="rpg-locked">
          <Check size={18} strokeWidth={2} /> Interceptor locked on {nameOf(priv.intercept)}
        </p>
      ) : (
        hasIc && (
          <div className="rpg-trap">
            <p className="rpg-h">
              Interceptor <ItemInfoTip id="interceptor" costs={game.itemCosts} />
            </p>
            <div className="rpg-row" role="group" aria-label="Pick who wins the duel">
              {[duel.challenger, duel.challengee].map((id) => (
                <button key={id} type="button" className="btn btn-quiet btn-sm" disabled={sending} onClick={() => void send({ type: "intercept", target: id })}>
                  {nameOf(id)} wins
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function PhaseHead({ title, text, seconds }: { title: string; text: string; seconds: number }) {
  return (
    <div className="rpg-head">
      <div>
        <h2 className="rpg-h">{title}</h2>
        <p className="meta">{text}</p>
      </div>
      <span className={`rpg-timer${seconds <= 5 ? " is-low" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>
        {seconds}s
      </span>
    </div>
  );
}

export function BombPhase({ game, me, nameOf, send, sending }: Common) {
  const bomb = game.bomb;
  if (!bomb) return null;
  const target = bomb.target === me;
  return (
    <div className="rpg-phase rpg-bomb">
      <PhaseHead
        title={target ? "Defuse the bomb!" : `${nameOf(bomb.target)} is defusing a bomb`}
        text={target ? `${nameOf(bomb.by)} planted it. Cut the right wire.` : "If they cut the wrong wire or run out of time, it detonates."}
        seconds={game.timeLeft}
      />
      <div className="rpg-wires" role="group" aria-label="Wires">
        {Array.from({ length: WIRES }, (_, i) => (
          <button key={i} type="button" className={`rpg-wire is-w${i}`} disabled={!target || sending} onClick={() => void send({ type: "wire", wire: i })}>
            <span>Wire {i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function NukeVotePhase({ game, me, nameOf, send, sending }: Common) {
  const nuke = game.nuke;
  if (!nuke) return null;
  const isUser = nuke.by === me;
  const mineP = game.players.find((p) => p.id === me);
  const canVote = !isUser && !!mineP && !mineP.removed && mineP.coins > 0;
  const voted = nuke.voted.includes(me);
  return (
    <div className="rpg-phase rpg-nuke">
      <PhaseHead title="Nuke incoming" text={`${nameOf(nuke.by)} launched a Nuke. More Block than Allow stops it. No vote counts as Allow.`} seconds={game.timeLeft} />
      {canVote ? (
        voted ? (
          <p className="rpg-locked">
            <Check size={18} strokeWidth={2} /> Vote locked in.
          </p>
        ) : (
          <div className="rpg-row">
            <button type="button" className="btn btn-quiet" disabled={sending} onClick={() => void send({ type: "vote", vote: "allow" })}>
              Allow
            </button>
            <button type="button" className="btn rpg-btn-danger" disabled={sending} onClick={() => void send({ type: "vote", vote: "block" })}>
              <Zap size={16} strokeWidth={1.5} />
              Block
            </button>
          </div>
        )
      ) : (
        <p className="meta">{isUser ? "Waiting for the vote." : "You can't vote."}</p>
      )}
      <p className="meta">{nuke.voted.length} votes in</p>
    </div>
  );
}

export function NukeDuelPhase({ game, me, nameOf, send, sending }: Common) {
  const nuke = game.nuke;
  if (!nuke || !nuke.target) return null;
  const duelist = me === nuke.by || me === nuke.target;
  const locked = nuke.picked.includes(me);
  return (
    <div className="rpg-phase rpg-nuke">
      <PhaseHead title="Nuke duel" text={`${nameOf(nuke.by)} against ${nameOf(nuke.target)}. One round. Ties replay (${nuke.ties} of 3).`} seconds={game.timeLeft} />
      <div className="rpg-weapons" role="group" aria-label="Choose your weapon">
        {CHOICES.map((c) => (
          <button key={c} type="button" className={`rpg-weapon is-${c}`} disabled={!duelist || locked || sending} onClick={() => void send({ type: "pick", choice: c })}>
            <span className="rpg-emoji" aria-hidden="true">
              {EMOJI[c]}
            </span>
            <span>{LABEL[c]}</span>
          </button>
        ))}
      </div>
      {duelist && locked && <p className="rpg-wait">Choice locked. Waiting…</p>}
      {nuke.last && nuke.last.reason === "same" && <p className="meta">Last round was a tie.</p>}
    </div>
  );
}

/** A big banner for each item event, plus the full-screen effects. Everything still reads with reduced motion. */
export function ItemFx({ game }: { game: RpgOnline }) {
  const ev = game.event;
  const [shown, setShown] = useState<RpgOnline["event"]>(null);
  const seen = useRef<number | null>(ev?.id ?? null);
  useEffect(() => {
    if (!ev || ev.id === seen.current) return;
    seen.current = ev.id;
    setShown(ev);
    const t = window.setTimeout(() => setShown(null), 4500);
    return () => window.clearTimeout(t);
    // Keyed on the id: phones get a fresh object each snapshot, which would clear the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id]);
  const bombing = game.phase === "bomb";
  const nuking = game.phase === "nukeVote" || game.phase === "nukeDuel";
  return (
    <>
      {bombing && <div className="rpg-fx rpg-fx-bomb" aria-hidden="true" />}
      {nuking && <div className="rpg-fx rpg-fx-nuke" aria-hidden="true" />}
      {shown && (
        <div className={`rpg-banner is-${shown.kind} is-${shown.tone}${shown.kind === "bomb" && shown.tone === "bad" ? " is-rumble" : ""}`} role="status">
          <strong className="rpg-banner-title">{shown.title}</strong>
          <span>{shown.text}</span>
          {shown.kind === "intercept" && shown.tone === "good" && <span className="rpg-stamp">INTERCEPTED</span>}
          {shown.kind === "mine" && <span className="rpg-boom" aria-hidden="true">💥</span>}
          <ItemBannerTip kind={shown.kind} costs={game.itemCosts} />
        </div>
      )}
    </>
  );
}

function ItemBannerTip({ kind, costs }: { kind: "bomb" | "nuke" | "mine" | "intercept"; costs: Record<ItemId, number> }) {
  const id: ItemId = kind === "mine" ? "landmine" : kind === "intercept" ? "interceptor" : kind;
  return <ItemInfoTip id={id} costs={costs} />;
}

export { ItemInfoBody };
