import { useEffect, useState } from "react";
import { Hand as HandIcon, Layers, Minus, Plus, Split, Square, Trophy } from "lucide-react";
import { Avatar } from "../../components/avatar/AvatarView";
import { StyledUsername } from "../../components/cosmetics/Cosmetics";
import { useSoundOnChange } from "../../lib/useGameSounds";
import { Coins } from "../rpg/motion";
import { FeedList, PartyTimer, Standings } from "../party/PartyBits";
import type { PlayProps } from "../party/types";
import { handTotal, isBlackjack, rankOf, suitOf, type BjOnline, type Card, type Hand } from "./bjEngine";
import "./blackjack.css";

const SUIT: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

export function PlayingCard({ card, i = 0 }: { card: Card | "??"; i?: number }) {
  if (card === "??") return <span className="bj-card is-back" style={{ "--i": i } as React.CSSProperties} aria-label="Face-down card" />;
  const red = suitOf(card) === "H" || suitOf(card) === "D";
  return (
    <span key={card} className={`bj-card${red ? " is-red" : ""}`} style={{ "--i": i } as React.CSSProperties} aria-label={`${rankOf(card)} of ${{ S: "spades", H: "hearts", D: "diamonds", C: "clubs" }[suitOf(card)]}`}>
      <span className="bj-corner">
        {rankOf(card)}
        <br />
        {SUIT[suitOf(card)]}
      </span>
      <span className="bj-pip">{SUIT[suitOf(card)]}</span>
    </span>
  );
}

const RESULT_LABEL: Record<NonNullable<Hand["result"]>, string> = { blackjack: "Blackjack!", win: "Win", push: "Push", lose: "Lose", bust: "Bust" };

function HandView({ hand, active }: { hand: Hand; active: boolean }) {
  const t = handTotal(hand.cards);
  return (
    <div className={`bj-hand${active ? " is-active" : ""}${hand.result ? ` is-${hand.result}` : ""}`}>
      <div className="bj-cards">
        {hand.cards.map((c, i) => (
          <PlayingCard key={`${i}-${c}`} card={c} i={i} />
        ))}
      </div>
      <div className="bj-hand-meta">
        <span className={`bj-total${t.total > 21 ? " is-bust" : ""}`}>{isBlackjack(hand) ? "BJ" : `${t.soft && t.total <= 21 ? "Soft " : ""}${t.total}`}</span>
        <span className="meta">
          Bet <Coins value={hand.bet} />
          {hand.doubled ? " · doubled" : ""}
        </span>
        {hand.result && <span className={`bj-result is-${hand.result}`}>{RESULT_LABEL[hand.result]}</span>}
      </div>
    </div>
  );
}

export function BlackjackPlay({ me, game, send, busy, host, avatarOf }: PlayProps<BjOnline, null>) {
  const mine = game.players.find((p) => p.id === me);
  const myTurn = game.turn?.id === me && game.phase === "playing";
  const myHand = game.turn && myTurn ? game.hands[me]?.[game.turn.hand] : null;
  const [bet, setBet] = useState(game.minBet);
  const max = mine?.chips ?? 0;
  const value = Math.max(Math.min(bet, max), 0);
  const bettingOpen = game.phase === "betting" && !!mine && !mine.removed && !game.bets[me] && max >= game.minBet;

  useEffect(() => {
    if (game.phase === "betting") setBet((b) => Math.min(Math.max(b, game.minBet), Math.max(max, game.minBet)));
  }, [game.phase, game.minBet, max]);

  useSoundOnChange(`${game.phase}|${game.turn?.id ?? ""}|${game.dealer.length}|${game.rev}`, (a, b) => {
    const [p0, t0, d0] = a.split("|");
    const [p1, t1, d1] = b.split("|");
    if (p1 !== p0 && p1 === "results") {
      const won = (game.hands[me] ?? []).some((h) => h.result === "win" || h.result === "blackjack");
      return won ? "win" : null;
    }
    if (t1 !== t0 && t1 === me) return "turn";
    if (d1 !== d0) return "reveal";
    return null;
  });

  const seats = game.players.filter((p) => !p.removed && game.hands[p.id]?.length);
  const chips = [game.minBet, game.minBet * 5, game.minBet * 10, game.minBet * 25].filter((c, i, a) => a.indexOf(c) === i);

  return (
    <div className="rpg-online">
      <section className="card rpg-main bj-table" aria-live="polite">
        <p className="meta rpg-meta">
          <span>
            Round {game.round}
            {game.rounds > 0 ? ` of ${game.rounds}` : ""}
          </span>
          {mine && (
            <span className="rpg-balance">
              Chips <Coins value={mine.chips} />
            </span>
          )}
        </p>
        <div key={`${game.phase}-${game.round}`} className="rpg-stage">
          {game.phase === "over" ? (
            <div className="rpg-phase">
              <h2 className="rpg-h">
                <Trophy size={24} strokeWidth={1.5} /> {game.endedEarly ? "Table closed" : "Game over"}
              </h2>
              <Standings players={game.players.map((p) => ({ id: p.id, name: p.name, score: p.chips, removed: p.removed }))} me={me} avatarOf={avatarOf} money />
            </div>
          ) : (
            <>
              <div className="rpg-head">
                <div>
                  <h2 className="rpg-h">
                    {game.phase === "betting" ? "Place your bets" : game.phase === "playing" ? (myTurn ? "Your move" : `${game.players.find((p) => p.id === game.turn?.id)?.name ?? "Someone"} is playing`) : game.phase === "dealer" ? "Dealer plays" : "Payouts"}
                  </h2>
                  <p className="meta">{game.phase === "betting" ? `Minimum bet ${game.minBet}. Blackjack pays 3 to 2. Dealer stands on 17.` : game.phase === "results" ? "Next round soon." : "Beat the dealer without going over 21."}</p>
                </div>
                {game.phase !== "dealer" && <PartyTimer seconds={game.timeLeft} />}
              </div>

              <div className="bj-dealer">
                <span className="bj-label">
                  Dealer {game.dealerTotal !== null && <span className="bj-total">{game.dealerTotal}</span>}
                </span>
                <div className="bj-cards">
                  {game.dealer.length === 0 ? (
                    <span className="bj-card is-slot" />
                  ) : (
                    game.dealer.map((c, i) => <PlayingCard key={`${i}-${c}`} card={c} i={i} />)
                  )}
                </div>
              </div>

              {seats.length > 0 && (
                <ul className="bj-seats">
                  {seats.map((p) => (
                    <li key={p.id} className={`bj-seat${game.turn?.id === p.id ? " is-turn" : ""}${p.id === me ? " is-me" : ""}`}>
                      <span className="bj-seat-name">
                        <Avatar name={p.name} avatar={avatarOf(p.id)} size={28} />
                        <StyledUsername as="strong" name={p.name} styleId={(avatarOf(p.id))?.style} />
                        {p.id === me && <span className="meta">you</span>}
                      </span>
                      <div className="bj-hands">
                        {game.hands[p.id].map((h, i) => (
                          <HandView key={i} hand={h} active={game.turn?.id === p.id && game.turn.hand === i} />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {game.phase === "betting" && (
                <div className="bj-betbox card">
                  {game.bets[me] ? (
                    <p className="rpg-locked">Bet locked in: {game.bets[me]}. Waiting for the others…</p>
                  ) : bettingOpen ? (
                    <>
                      <div className="bj-chips" role="group" aria-label="Quick chips">
                        {chips.map((c) => (
                          <button key={c} type="button" className="bj-chip" disabled={c > max} onClick={() => setBet(c)}>
                            {c}
                          </button>
                        ))}
                        <button type="button" className="bj-chip is-all" onClick={() => setBet(max)}>
                          All in
                        </button>
                      </div>
                      <div className="stepper rpg-row">
                        <button type="button" className="icon-btn icon-btn-sm" aria-label="Lower bet" disabled={value <= game.minBet} onClick={() => setBet(Math.max(game.minBet, value - game.minBet))}>
                          <Minus size={18} strokeWidth={1.5} />
                        </button>
                        <input className="input rpg-amount-input" inputMode="numeric" aria-label="Bet" value={String(value)} onChange={(e) => setBet(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} />
                        <button type="button" className="icon-btn icon-btn-sm" aria-label="Raise bet" disabled={value >= max} onClick={() => setBet(Math.min(max, value + game.minBet))}>
                          <Plus size={18} strokeWidth={1.5} />
                        </button>
                        <button type="button" className="btn btn-primary" disabled={busy || value < game.minBet || value > max} onClick={() => void send({ type: "bet", amount: value })}>
                          <Layers size={16} strokeWidth={1.5} />
                          Bet {value}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="meta">{mine && mine.chips < game.minBet ? "You can't cover the minimum bet. Watch the table." : "Watching this round."}</p>
                  )}
                  <p className="meta">{Object.keys(game.bets).length} bet{Object.keys(game.bets).length === 1 ? "" : "s"} in</p>
                </div>
              )}

              {myTurn && myHand && (
                <div className="bj-actions" role="group" aria-label="Your move">
                  <button type="button" className="btn btn-primary bj-act" disabled={busy} onClick={() => void send({ type: "hit" })}>
                    <Plus size={18} strokeWidth={1.5} />
                    Hit
                  </button>
                  <button type="button" className="btn btn-secondary bj-act" disabled={busy} onClick={() => void send({ type: "stand" })}>
                    <HandIcon size={18} strokeWidth={1.5} />
                    Stand
                  </button>
                  <button type="button" className="btn btn-quiet bj-act" disabled={busy || myHand.cards.length !== 2 || max < myHand.bet} onClick={() => void send({ type: "double" })}>
                    <Square size={18} strokeWidth={1.5} />
                    Double
                  </button>
                  <button type="button" className="btn btn-quiet bj-act" disabled={busy || !game.canSplit} onClick={() => void send({ type: "split" })}>
                    <Split size={18} strokeWidth={1.5} />
                    Split
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <aside className="rpg-side">
        {host}
        <section className="card rpg-block">
          <h2 className="aside-title">Chips</h2>
          <Standings players={game.players.map((p) => ({ id: p.id, name: p.name, score: p.chips, removed: p.removed, tag: game.turn?.id === p.id ? "Playing" : game.bets[p.id] ? `Bet ${game.bets[p.id]}` : undefined }))} me={me} avatarOf={avatarOf} money keepOrder />
        </section>
        <section className="card rpg-block">
          <h2 className="aside-title">Table feed</h2>
          <FeedList lines={game.log} />
        </section>
      </aside>
    </div>
  );
}
