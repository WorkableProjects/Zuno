import { useEffect, useRef, useState } from "react";
import { Check, Send, Trophy } from "lucide-react";
import { useSoundOnChange } from "../../lib/useGameSounds";
import { PartyTimer, Standings } from "../party/PartyBits";
import type { PlayProps } from "../party/types";
import { DrawBoard } from "./DrawBoard";
import { dropTurnCanvas } from "./canvasSync";
import type { DrawOnline, DrawPrivate } from "./drawEngine";
import "./drawit.css";

export function DrawPlay({ code, me, game, priv, send, busy, host, avatarOf }: PlayProps<DrawOnline, DrawPrivate>) {
  const [text, setText] = useState("");
  const chatEnd = useRef<HTMLOListElement>(null);
  const isDrawer = game.drawer === me;
  const drawer = game.players.find((p) => p.id === game.drawer);
  const solved = me in game.turnPoints && !isDrawer;
  const nameOf = (id: string | null) => game.players.find((p) => p.id === id)?.name ?? "";

  // The host tidies up the previous turn's canvas.
  const prevTurn = useRef(game.turnKey);
  useEffect(() => {
    if (!host) return;
    if (prevTurn.current !== game.turnKey) {
      void dropTurnCanvas(code, prevTurn.current).catch(() => undefined);
      prevTurn.current = game.turnKey;
    }
  }, [host, code, game.turnKey]);

  useEffect(() => {
    const el = chatEnd.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [game.chat.length]);

  useSoundOnChange(`${game.phase}|${game.chat[game.chat.length - 1]?.id ?? 0}|${game.chat[game.chat.length - 1]?.kind ?? ""}`, (a, b) => {
    const [p0, i0] = a.split("|");
    const [p1, i1, k1] = b.split("|");
    if (p1 !== p0) return p1 === "draw" ? "turn" : p1 === "reveal" ? "reveal" : p1 === "over" ? "win" : null;
    if (i1 !== i0 && k1 === "correct") return "correct";
    return null;
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    void send({ type: "guess", text: t });
  };

  const word = isDrawer || solved ? (priv?.word ?? null) : null;
  const drawing = isDrawer && game.phase === "draw";
  const guessForm = (cls: string) => (
    <form className={`draw-guess ${cls}`} onSubmit={submit}>
      <input
        className="input"
        value={text}
        maxLength={60}
        placeholder={drawing ? "You're drawing" : solved ? "You got it! Chat away" : "Type your guess"}
        disabled={drawing}
        aria-label="Your guess"
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="icon-btn" aria-label="Send guess" disabled={!text.trim() || drawing}>
        <Send size={18} strokeWidth={1.5} />
      </button>
    </form>
  );

  return (
    <div className="rpg-online draw-online">
      <section className="card rpg-main draw-main" aria-live="polite">
        <div className="draw-top">
          <span key={game.round} className="meta ru-pill ru-turn">
            Round {Math.min(game.round, game.rounds)} of {game.rounds}
          </span>
          <div className="draw-word" aria-label={word ? `The word is ${word}` : game.reveal ? `The word was ${game.reveal}` : `${game.mask.filter((c) => c === "_").length} letters hidden`}>
            {word ? (
              <span className="draw-word-full">{word}</span>
            ) : game.phase === "pick" ? (
              <span className="meta">{isDrawer ? "Choose a word" : `${drawer?.name ?? "Someone"} is choosing a word`}</span>
            ) : (
              game.mask.map((ch, i) => (
                <span key={`${game.turnKey}-${i}-${ch}`} className={`draw-letter${ch === "_" ? " is-blank" : ch === " " ? " is-space" : " is-shown"}`}>
                  {ch === "_" ? "" : ch}
                </span>
              ))
            )}
            {!word && game.phase === "draw" && <sup className="meta draw-count">{game.mask.filter((c) => /[^ -]/.test(c)).length}</sup>}
          </div>
          {game.phase !== "over" && <PartyTimer seconds={game.timeLeft} />}
        </div>

        {game.phase === "over" ? (
          <div className="rpg-stage rpg-phase">
            <h2 className="rpg-h ru-reveal">
              <Trophy size={24} strokeWidth={1.5} /> {game.endedEarly ? "Game ended" : "Game over"}
            </h2>
            <Standings final players={game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, removed: p.removed }))} me={me} avatarOf={avatarOf} />
          </div>
        ) : (
          <div className="draw-stage">
            <DrawBoard code={code} turnKey={game.turnKey} canDraw={isDrawer && game.phase === "draw"} drawerName={drawer?.name ?? "Someone"} />
            {game.phase === "pick" && (
              <div className="draw-overlay" key={`pick-${game.turnKey}`}>
                {isDrawer && priv?.choices.length ? (
                  <>
                    <p className="rpg-h">Choose a word to draw</p>
                    <div className="draw-choices">
                      {priv.choices.map((w, i) => (
                        <button key={w} type="button" className="btn btn-primary draw-choice ru-deal" style={{ "--i": i } as React.CSSProperties} disabled={busy} onClick={() => void send({ type: "pick", index: i })}>
                          {w}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="rpg-h ru-turn">{drawer?.name ?? "Someone"} is choosing a word…</p>
                )}
              </div>
            )}
            {game.phase === "reveal" && (
              <div className="draw-overlay is-reveal" key={`rev-${game.turnKey}`}>
                <p className="meta">The word was</p>
                <p className="draw-reveal ru-reveal">{game.reveal}</p>
                <ul className="draw-gains">
                  {Object.entries(game.turnPoints)
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, pts], i) => (
                      <li key={id} className="ru-reveal" style={{ "--i": i } as React.CSSProperties}>
                        <span>
                          {nameOf(id)}
                          {id === game.drawer ? " (drawer)" : ""}
                        </span>
                        <strong className="rpg-up">+{pts}</strong>
                      </li>
                    ))}
                  {Object.keys(game.turnPoints).length === 0 && <li className="meta">Nobody got it.</li>}
                </ul>
              </div>
            )}
            {!drawing && (
              <div className="draw-inline">
                <ol className="draw-chat-list is-inline" aria-hidden="true">
                  {game.chat.slice(-3).map((l) => (
                    <li key={l.id} className={`is-${l.kind}`}>
                      {l.kind === "guess" && <strong>{nameOf(l.by)}: </strong>}
                      {l.text}
                    </li>
                  ))}
                </ol>
                {priv?.close && game.phase === "draw" && <p className="draw-close">"{priv.close}" is close!</p>}
                {guessForm("is-inline")}
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="rpg-side">
        {host}
        <section className="card rpg-block">
          <h2 className="aside-title">Scores</h2>
          <Standings
            players={game.players.map((p) => ({ id: p.id, name: p.name, score: p.score, removed: p.removed, tag: p.id === game.drawer && game.phase !== "over" ? "Drawing" : p.id in game.turnPoints && game.phase === "draw" ? "Guessed it" : undefined }))}
            me={me}
            avatarOf={avatarOf}
          />
        </section>
        <section className="card rpg-block draw-chat">
          <h2 className="aside-title">Guesses</h2>
          <ol className="draw-chat-list" ref={chatEnd}>
            {game.chat.map((l) => (
              <li key={l.id} className={`is-${l.kind}`}>
                {l.kind === "guess" && <strong>{nameOf(l.by)}: </strong>}
                {l.kind === "correct" && <Check size={14} strokeWidth={2.5} />} {l.text}
              </li>
            ))}
          </ol>
          {priv?.close && game.phase === "draw" && <p className="draw-close">"{priv.close}" is close!</p>}
          {guessForm("is-side")}
        </section>
      </aside>
    </div>
  );
}
