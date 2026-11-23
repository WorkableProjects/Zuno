const WORDS = ["Rock", "Paper", "Gamble"];

/** "ROCK PAPER GAMBLE" rolling in letter by letter, like a slot machine. */
export function RpgTitle({ className = "" }: { className?: string }) {
  const starts = WORDS.map((_, i) => WORDS.slice(0, i).reduce((sum, w) => sum + w.length, 0));
  return (
    <h1 className={`rpg-title ${className}`} aria-label="Rock Paper Gamble">
      {WORDS.map((w, wi) => (
        <span key={w} className={`rpg-title-word${wi === 2 ? " is-gamble" : ""}`} aria-hidden="true">
          {w.split("").map((ch, ci) => (
            <span key={ci} className="rpg-roll" style={{ "--n": starts[wi] + ci } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}
