import { useEffect, useState, type ReactNode } from "react";
import { Check, Gift, Minus, Plus, Swords, Trophy } from "lucide-react";
import { Avatar } from "../../components/avatar/AvatarView";
import { StyledUsername } from "../../components/cosmetics/Cosmetics";
import { formatCoins } from "../../game-files/schema/rpg";
import { CHOICES, WINS_NEEDED, type Choice } from "./rpgEngine";
import { BombPhase, ItemFx, ItemShop, ItemTraps, NukeDuelPhase, NukeVotePhase } from "./RpgItems";
import { EMPTY_PRIVATE, sendRpgMove, watchRpgPrivate, type RpgPrivate, type RpgLobbyState, type RpgMove, type RpgOnline, type RpgOnlineDuel } from "./rpgLobby";
import { useRpgSounds } from "./useRpgSounds";
import { Coins, useDelayed, useLinger } from "./motion";

interface Props {
  code: string;
  me: string;
  lobby: RpgLobbyState;
  game: RpgOnline;
  /** The host's device applies moves directly. */
  onMove?: (move: RpgMove) => void;
  /** Host-only controls, shown above the players. */
  host?: ReactNode;
  /** The host's own inventory and hidden picks. Phones read theirs from the room. */
  priv?: RpgPrivate;
}

const EMOJI: Record<Choice, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
const LABEL: Record<Choice, string> = { rock: "Rock", paper: "Paper", scissors: "Scissors" };

type Send = (move: RpgMove) => Promise<void>;

/** Every device during an online Rock Paper Gamble game: the table on the left, standings on the right. */
export function RpgOnlinePlay({ code, me, lobby, game, onMove, host, priv: hostPriv }: Props) {
  const [remote, setRemote] = useState<RpgPrivate>(EMPTY_PRIVATE);
  useEffect(() => (onMove ? undefined : watchRpgPrivate(code, me, setRemote)), [onMove, code, me]);
  const priv = onMove ? (hostPriv ?? EMPTY_PRIVATE) : remote;
  useRpgSounds(game, me);
  const [sending, setSending] = useState(false);
  // Buttons only look busy when a move is slow, so quick moves don't flash every control.
  const busy = useDelayed(sending);
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ key: string; choice: Choice } | null>(null);
  const [giftTo, setGiftTo] = useState<string | null>(null);

  const byId = (id: string) => game.players.find((p) => p.id === id);
  const nameOf = (id: string) => byId(id)?.name ?? "Someone";
  const avatarOf = (id: string) => lobby.players[id]?.avatar;
  const mine = byId(me);
  const inGame = !!mine && !mine.removed;

  const send: Send = async (move) => {
    if (sending) return;
    setSending(true);
    setProblem(null);
    try {
      if (onMove) onMove(move);
      else await sendRpgMove(code, me, move);
    } catch {
      setProblem("That didn't reach the host. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const duel = game.duel;
  const pickKey = duel ? `${game.match}-${duel.round}` : "";
  const myPick = picked && picked.key === pickKey ? picked.choice : null;

  return (
    <div className="rpg-online">
      <ItemFx game={game} />
      <section className="card rpg-main" aria-live="polite">
        <p className="meta rpg-meta">
          <span>Match {Math.max(game.match, 1)}</span>
          {mine && (
            <span className="rpg-balance" aria-label={`Your balance ${mine.coins}`}>
              You have <Coins value={mine.coins} />
            </span>
          )}
        </p>
        <div key={`${game.phase}-${game.match}`} className="rpg-stage">
        {game.phase === "countdown" && <Countdown n={game.timeLeft} />}
        {game.phase === "select" && (
          <>
            <Select game={game} me={me} nameOf={nameOf} avatarOf={avatarOf} send={send} sending={busy} giftTo={giftTo} setGiftTo={setGiftTo} />
            <ItemShop game={game} me={me} nameOf={nameOf} send={send} sending={busy} priv={priv} />
          </>
        )}
        {game.phase === "betting" && duel && (
          <>
            <Betting game={game} duel={duel} me={me} nameOf={nameOf} avatarOf={avatarOf} send={send} sending={busy} />
            <ItemTraps game={game} duel={duel} me={me} nameOf={nameOf} send={send} sending={busy} priv={priv} />
          </>
        )}
        {game.phase === "bomb" && <BombPhase game={game} me={me} nameOf={nameOf} send={send} sending={busy} priv={priv} />}
        {game.phase === "nukeVote" && <NukeVotePhase game={game} me={me} nameOf={nameOf} send={send} sending={busy} priv={priv} />}
        {game.phase === "nukeDuel" && <NukeDuelPhase game={game} me={me} nameOf={nameOf} send={send} sending={busy} priv={priv} />}
        {game.phase === "duel" && duel && (
          <Duel
            game={game}
            duel={duel}
            me={me}
            nameOf={nameOf}
            myPick={myPick}
            sending={busy}
            onPick={(choice) => {
              setPicked({ key: pickKey, choice });
              void send({ type: "pick", choice });
            }}
          />
        )}
        {game.phase === "results" && <Results game={game} me={me} nameOf={nameOf} />}
        {game.phase === "over" && <Over game={game} me={me} avatarOf={avatarOf} />}
        </div>
        {!inGame && game.phase !== "over" && <p className="field-hint">You are watching. You are no longer in this game.</p>}
        {problem && (
          <p className="field-hint rpg-problem" role="alert">
            {problem}
          </p>
        )}
      </section>

      <aside className="rpg-side">
        {host}
        <section className="card rpg-block">
          <h2 className="aside-title">Players</h2>
          <ol className="rpg-players">
            {game.players.map((p) => {
              const role = duel && (game.phase === "betting" || game.phase === "duel") ? (p.id === duel.challenger ? "Challenger" : p.id === duel.challengee ? "Challengee" : "") : p.id === game.activeId ? "Choosing" : "";
              return (
                <li key={p.id} className={`${role === "Challenger" ? "is-a" : role === "Challengee" ? "is-b" : role ? "is-turn" : ""}${p.removed ? " is-gone" : p.coins <= 0 ? " is-broke" : ""}`}>
                  <Avatar name={p.name} avatar={avatarOf(p.id)} size={34} />
                  <span className="rpg-grow">
                    <StyledUsername name={p.name} styleId={(avatarOf(p.id))?.style} />
                    {p.id === me && <span className="meta"> · you</span>}
                    <span className="meta rpg-status">
                      {p.removed ? "Left" : p.coins <= 0 ? "Broke" : role}
                      {game.itemsOn && !p.removed && (game.itemCounts[p.id] ?? 0) > 0 ? `${role ? " · " : ""}${game.itemCounts[p.id]} item${game.itemCounts[p.id] === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                  <strong className="rpg-money"><Coins value={p.coins} /></strong>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="card rpg-block">
          <h2 className="aside-title">Event feed</h2>
          {game.log.length === 0 ? (
            <p className="meta">Waiting for events…</p>
          ) : (
            <ol className="rpg-feed">
              {feedKeys(game.log).slice(0, 12).map((key, i) => (
                // Stable keys: existing lines stay mounted, only new ones animate in.
                <li key={key}>{game.log[i]}</li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

function Countdown({ n }: { n: number }) {
  return (
    <div className="rpg-countdown" role="status" aria-label={n > 0 ? `Starting in ${n}` : "Go"}>
      <span key={n} className={`rpg-count${n === 0 ? " is-go" : ""}`}>
        {n > 0 ? n : "GO!"}
      </span>
      <p className="meta">Everyone starts with the same money. Pick your fights.</p>
    </div>
  );
}

function Timer({ seconds, label = "Time left" }: { seconds: number | null; label?: string }) {
  if (seconds === null) return <span className="rpg-timer">…</span>;
  return (
    <span className={`rpg-timer${seconds <= 5 ? " is-low" : ""}`} role="timer" aria-label={`${label}: ${seconds} seconds`}>
      <span key={seconds <= 5 ? seconds : "n"} className="rpg-timer-n">
        {seconds}s
      </span>
    </span>
  );
}

/** A whole-number field with steps and a MAX button. The host checks it again. */
function AmountField({ id, value, onChange, max, step = 50, label }: { id: string; value: number; onChange: (n: number) => void; max: number; step?: number; label: string }) {
  const clamp = (n: number) => Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : 0)));
  return (
    <div className="rpg-amount">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper" role="group" aria-label={label}>
        <button type="button" className="icon-btn icon-btn-sm" aria-label={`Lower by ${step}`} disabled={value <= 0} onClick={() => onChange(clamp(value - step))}>
          <Minus size={18} strokeWidth={1.5} />
        </button>
        <input id={id} className="input rpg-amount-input" inputMode="numeric" value={value === 0 ? "" : String(value)} placeholder="0" onChange={(e) => onChange(clamp(Number(e.target.value.replace(/[^0-9]/g, ""))))} />
        <button type="button" className="icon-btn icon-btn-sm" aria-label={`Raise by ${step}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
          <Plus size={18} strokeWidth={1.5} />
        </button>
        <button type="button" className="btn btn-quiet btn-sm" disabled={max <= 0} onClick={() => onChange(max)}>
          MAX
        </button>
      </div>
      <p className="meta">Balance: {formatCoins(max)}</p>
    </div>
  );
}

function Select({
  game,
  me,
  nameOf,
  avatarOf,
  send,
  sending,
  giftTo,
  setGiftTo,
}: {
  game: RpgOnline;
  me: string;
  nameOf: (id: string) => string;
  avatarOf: (id: string) => RpgLobbyState["players"][string]["avatar"] | undefined;
  send: Send;
  sending: boolean;
  giftTo: string | null;
  setGiftTo: (id: string | null) => void;
}) {
  const mine = game.players.find((p) => p.id === me);
  const myTurn = game.activeId === me;
  const [wager, setWager] = useState(0);
  const [gift, setGift] = useState(100);
  const others = game.players.filter((p) => p.id !== me && !p.removed);
  const myMax = mine?.coins ?? 0;
  const broke = !!mine && mine.coins <= 0;

  return (
    <div className="rpg-phase">
      <div className="rpg-head">
        <div>
          <h2 className="rpg-h">{myTurn ? "Pick your opponent" : `${nameOf(game.activeId ?? "")} is choosing`}</h2>
          <p className="meta">{myTurn ? "Choose who you want to duel. Rock, paper, scissors, first to three." : "The challenger is picking a target. You can gift coins while you wait."}</p>
        </div>
        <Timer seconds={game.timeLeft} />
      </div>

      {myTurn && (
        <AmountField id="rpg-wager" label="Duel wager (optional, you both put it in)" value={wager} max={myMax} onChange={setWager} />
      )}

      <ul className="rpg-targets">
        {others.map((p) => {
          const canDuel = myTurn && p.coins > 0 && (wager === 0 || wager <= p.coins);
          return (
            <li key={p.id} className={p.coins <= 0 ? "is-broke" : ""}>
              <Avatar name={p.name} avatar={avatarOf(p.id)} size={40} />
              <span className="rpg-grow">
                <StyledUsername as="strong" name={p.name} styleId={(avatarOf(p.id))?.style} />
                <span className="meta rpg-status">{p.coins <= 0 ? "Broke" : formatCoins(p.coins)}</span>
              </span>
              {myTurn && (
                <button type="button" className="btn btn-primary btn-sm" disabled={!canDuel || sending || wager > myMax} onClick={() => void send({ type: "challenge", target: p.id, wager })}>
                  <Swords size={16} strokeWidth={1.5} />
                  Challenge
                </button>
              )}
              <button type="button" className="btn btn-quiet btn-sm" disabled={myMax <= 0 || sending} aria-label={`Gift coins to ${p.name}`} onClick={() => setGiftTo(giftTo === p.id ? null : p.id)}>
                <Gift size={16} strokeWidth={1.5} />
                Gift
              </button>
            </li>
          );
        })}
      </ul>
      {myTurn && wager > 0 && others.every((p) => p.coins < wager) && <p className="field-hint">Nobody can match that wager. Lower it.</p>}

      {giftTo && (
        <div className="rpg-gift card" role="group" aria-label={`Gift coins to ${nameOf(giftTo)}`}>
          <p className="rpg-h">Sending to {nameOf(giftTo)}</p>
          <AmountField id="rpg-gift" label="Gift amount" value={gift} max={myMax} onChange={setGift} />
          <div className="rpg-row">
            <button type="button" className="btn btn-quiet" onClick={() => setGiftTo(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={gift < 1 || gift > myMax || sending}
              onClick={() => {
                void send({ type: "gift", target: giftTo, amount: gift });
                setGiftTo(null);
              }}
            >
              <Gift size={16} strokeWidth={1.5} />
              Send
            </button>
          </div>
        </div>
      )}
      {broke && <p className="field-hint">You have no coins. You can still watch, and a gift will bring you back.</p>}
    </div>
  );
}

function Versus({ duel, me, nameOf, avatarOf }: { duel: RpgOnlineDuel; me: string; nameOf: (id: string) => string; avatarOf: (id: string) => RpgLobbyState["players"][string]["avatar"] | undefined; }) {
  const side = (id: string, cls: string, tag: string) => (
    <div className={`rpg-side-card ${cls}`}>
      <Avatar name={nameOf(id)} avatar={avatarOf(id)} size={56} />
      <strong className="rpg-name">
        <StyledUsername name={nameOf(id)} styleId={(avatarOf(id))?.style} />
        {id === me && <span className="meta"> · you</span>}
      </strong>
      <span className="rpg-tag">{tag}</span>
      {duel.wager > 0 && <span className="meta">Wager {formatCoins(duel.wager)}</span>}
    </div>
  );
  return (
    <div className="rpg-versus">
      {side(duel.challenger, "is-a", "Challenger")}
      <span className="rpg-vs">VS</span>
      {side(duel.challengee, "is-b", "Challengee")}
    </div>
  );
}

function Betting({ game, duel, me, nameOf, avatarOf, send, sending }: { game: RpgOnline; duel: RpgOnlineDuel; me: string; nameOf: (id: string) => string; avatarOf: (id: string) => RpgLobbyState["players"][string]["avatar"] | undefined; send: Send; sending: boolean }) {
  const mine = game.players.find((p) => p.id === me);
  const myBet = duel.stakes.find((x) => x.by === me && x.kind === "bet");
  const max = mine?.coins ?? 0;
  const [amount, setAmount] = useState(100);
  const value = Math.min(amount, max);
  const isDuelist = me === duel.challenger || me === duel.challengee;
  const canBet = !!mine && !mine.removed && !myBet && max > 0;
  return (
    <div className="rpg-phase">
      <div className="rpg-head">
        <div>
          <h2 className="rpg-h">Place your bets</h2>
          <p className="meta">{isDuelist ? "You are dueling. You may still bet on either side." : "Back a duelist. If they win you get double your stake back."}</p>
        </div>
        <Timer seconds={game.timeLeft} />
      </div>
      <Versus duel={duel} me={me} nameOf={nameOf} avatarOf={avatarOf} />
      <p className="rpg-pool" aria-label={`Prize pool ${duel.pool}`}>
        <span className="meta">Prize pool</span>
        <strong><Coins value={duel.pool} /></strong>
      </p>
      {myBet ? (
        <p className="rpg-locked">
          <Check size={18} strokeWidth={2} /> Bet locked in: {formatCoins(myBet.amount)} on {nameOf(myBet.target)}
        </p>
      ) : canBet ? (
        <div className="rpg-bet card">
          <AmountField id="rpg-bet" label="Select your bet" value={value} max={max} onChange={setAmount} />
          <div className="rpg-row">
            {[duel.challenger, duel.challengee].map((id, i) => (
              <button key={id} type="button" className={`btn ${i === 0 ? "rpg-btn-a" : "rpg-btn-b"}`} disabled={value < 1 || sending} onClick={() => void send({ type: "bet", target: id, amount: value })}>
                Bet on {nameOf(id)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="meta">{max <= 0 ? "You have no coins to bet." : "Betting is closed for you."}</p>
      )}
      <Others stakes={duel.stakes} nameOf={nameOf} />
    </div>
  );
}

function Others({ stakes, nameOf }: { stakes: RpgOnlineDuel["stakes"]; nameOf: (id: string) => string }) {
  const bets = stakes.filter((x) => x.kind === "bet");
  if (bets.length === 0) return null;
  return (
    <ul className="rpg-bets meta">
      {bets.map((x) => (
        <li key={x.by}>
          {nameOf(x.by)} bet {formatCoins(x.amount)} on {nameOf(x.target)}
        </li>
      ))}
    </ul>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <span className="rpg-dots" aria-label={`${n} of ${WINS_NEEDED} round wins`}>
      {Array.from({ length: WINS_NEEDED }, (_, i) => (
        <span key={i} className={i < n ? "is-on" : ""} />
      ))}
    </span>
  );
}

function Duel({
  game,
  duel,
  me,
  nameOf,
  myPick,
  sending,
  onPick,
}: {
  game: RpgOnline;
  duel: RpgOnlineDuel;
  me: string;
  nameOf: (id: string) => string;
  myPick: Choice | null;
  sending: boolean;
  onPick: (c: Choice) => void;
}) {
  const duelist = me === duel.challenger || me === duel.challengee;
  const locked = duel.picked.includes(me) || !!myPick;
  const showing = duel.overlay > 0 && duel.last;
  const overlay = useLinger(showing ? duel.last : null);
  return (
    <div className="rpg-phase rpg-duel">
      <div className="rpg-head">
        <div>
          <h2 className="rpg-h">{duelist ? "Choose your weapon" : "Duel in progress"}</h2>
          <p className="meta">{duelist ? "Victory belongs to the swift. Miss the clock and you lose the round." : "Watch the duelists battle it out."}</p>
        </div>
        <span className="rpg-round-pill">Round {Math.max(duel.round, 1)}</span>
      </div>
      <div className="rpg-scorebar">
        <div className="is-a">
          <strong>{nameOf(duel.challenger)}</strong>
          <Dots n={duel.score[duel.challenger] ?? 0} />
        </div>
        <Timer seconds={showing ? null : game.timeLeft} />
        <div className="is-b">
          <strong>{nameOf(duel.challengee)}</strong>
          <Dots n={duel.score[duel.challengee] ?? 0} />
        </div>
      </div>
      <div className="rpg-weapons" role="group" aria-label="Choose your weapon">
        {CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            className={`rpg-weapon is-${c}${myPick === c ? " is-picked" : ""}${locked && myPick !== c ? " is-dim" : ""}`}
            disabled={!duelist || locked || sending || !!showing}
            aria-pressed={myPick === c}
            onClick={() => onPick(c)}
          >
            <span className="rpg-emoji" aria-hidden="true">
              {EMOJI[c]}
            </span>
            <span>{LABEL[c]}</span>
            {myPick === c && <Check size={18} strokeWidth={2} className="rpg-check" />}
          </button>
        ))}
      </div>
      <div className="rpg-statusline">
        {duelist && locked && !showing && <p className="rpg-wait">Choice locked. Waiting for your opponent…</p>}
        {duelist && !locked && !showing && <p className="meta">Pick before the clock runs out.</p>}
        {!duelist && !showing && (
          <p className="meta">
            {duel.picked.length === 0 ? "Nobody has picked yet." : `${duel.picked.length} of 2 locked in.`}
          </p>
        )}
      </div>
      {overlay.value && <RoundOverlay duel={duel} last={overlay.value} leaving={overlay.leaving} me={me} nameOf={nameOf} />}
    </div>
  );
}

function RoundOverlay({ duel, last, leaving, me, nameOf }: { duel: RpgOnlineDuel; last: NonNullable<RpgOnlineDuel["last"]>; leaving: boolean; me: string; nameOf: (id: string) => string }) {
  const duelist = me === duel.challenger || me === duel.challengee;
  const tone = last.winner === null ? "tie" : !duelist ? "watch" : last.winner === me ? "win" : "lose";
  const title = last.winner === null ? "TIE!" : !duelist ? `${nameOf(last.winner)} won the round` : last.winner === me ? "ROUND WON!" : "ROUND LOST!";
  const sub = last.reason === "bothMiss" ? "Neither duelist picked in time." : last.reason === "miss" ? "A missed pick loses the round." : last.reason === "same" ? "Same pick. The round is replayed." : "";
  const show = (id: string) => (last.picks[id] ? `${EMOJI[last.picks[id] as Choice]} ${LABEL[last.picks[id] as Choice]}` : "No pick");
  return (
    <div className={`rpg-overlay is-${tone}${leaving ? " is-leaving" : ""}`} role="status">
      <p className="rpg-overlay-title">{title}</p>
      <div className="rpg-overlay-picks">
        <span className="is-a">
          <span className="meta">{nameOf(duel.challenger)}</span>
          <strong>{show(duel.challenger)}</strong>
        </span>
        <span className="rpg-vs">VS</span>
        <span className="is-b">
          <span className="meta">{nameOf(duel.challengee)}</span>
          <strong>{show(duel.challengee)}</strong>
        </span>
      </div>
      {sub && <p className="meta">{sub}</p>}
      <span className="rpg-overlay-bar" style={{ "--secs": "3s" } as React.CSSProperties} key={duel.round} />
    </div>
  );
}

function Results({ game, me, nameOf }: { game: RpgOnline; me: string; nameOf: (id: string) => string }) {
  const r = game.result;
  const ranked = game.players.slice().sort((a, b) => b.coins - a.coins);
  return (
    <div className="rpg-phase">
      <div className="rpg-head">
        <div>
          <p className="rpg-pill">Match concluded</p>
          <h2 className="rpg-h">{r?.void ? "Duel void" : r?.winner ? `${nameOf(r.winner)} wins ${formatCoins(r.pool)}` : "Results"}</h2>
          <p className="meta">{r?.void ? "Both duelists kept missing. Every stake was refunded." : r?.backers.length ? `${r.backers.map(nameOf).join(", ")} backed the winner and were paid double.` : "Next match soon."}</p>
        </div>
        <Timer seconds={game.timeLeft} label="Next match in" />
      </div>
      <ol className="rpg-results">
        {ranked.map((p, i) => {
          const d = r?.delta[p.id] ?? 0;
          return (
            <li key={p.id} className={p.id === me ? "is-me" : ""} style={{ "--i": i } as React.CSSProperties}>
              <span className="rpg-rank">{i + 1}</span>
              <span className="rpg-grow">
                {p.name}
                {p.id === me && <span className="meta"> · you</span>}
                {r?.winner === p.id && <span className="rpg-tag is-win"> Won</span>}
                {r?.loser === p.id && <span className="rpg-tag is-lose"> Lost</span>}
              </span>
              {d !== 0 && <span className={d > 0 ? "rpg-up" : "rpg-down"}>{d > 0 ? "+" : "-"}{formatCoins(Math.abs(d))}</span>}
              <strong className="rpg-money"><Coins value={p.coins} /></strong>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Over({ game, me, avatarOf }: { game: RpgOnline; me: string; avatarOf: (id: string) => RpgLobbyState["players"][string]["avatar"] | undefined }) {
  const ranked = game.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.coins - a.p.coins || a.i - b.i).map((x) => x.p);
  const top = ranked[0];
  return (
    <div className="rpg-phase">
      <h2 className="rpg-h">
        <Trophy size={24} strokeWidth={1.5} /> {game.endedEarly ? "Game ended" : "Game over"}
      </h2>
      {top && <p className="rpg-winner">{top.id === me ? "You finish on top" : `${top.name} finishes on top`} with {formatCoins(top.coins)}</p>}
      <ol className="rpg-results">
        {ranked.map((p, i) => (
          <li key={p.id} className={`rpg-final-${Math.min(i + 1, 4)}${p.id === me ? " is-me" : ""}`} style={{ "--i": i } as React.CSSProperties}>
            <span className="rpg-rank">{i + 1}</span>
            <Avatar name={p.name} avatar={avatarOf(p.id)} size={32} />
            <span className="rpg-grow">
              <StyledUsername name={p.name} styleId={(avatarOf(p.id))?.style} />
              {p.id === me && <span className="meta"> · you</span>}
              {p.removed && <span className="meta"> · left</span>}
            </span>
            <strong className="rpg-money">{formatCoins(p.coins)}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Keys that survive new lines arriving: the text plus how many identical lines sit below it. */
function feedKeys(log: string[]): string[] {
  const seen = new Map<string, number>();
  const keys: string[] = new Array(log.length);
  for (let i = log.length - 1; i >= 0; i--) {
    const n = seen.get(log[i]) ?? 0;
    seen.set(log[i], n + 1);
    keys[i] = `${n}:${log[i]}`;
  }
  return keys;
}
