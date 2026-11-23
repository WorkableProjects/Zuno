import { useState, type CSSProperties } from "react";
import "./parts3d.css";

export type PartsKind = "board" | "cards" | "statements" | "hands";
const BOARD_VALUES = [100, 200, 300, 400, 500];
/** Cells the host "picks" in turn, as [row, column]. One lights up every few seconds. */
const BOARD_PICKS: Array<[number, number]> = [
  [2, 2],
  [3, 0],
  [1, 3],
  [4, 4],
  [0, 2],
];

/** A tilted game board, drawn in code. Decorative: it holds no real clues. */
function BoardArt() {
  return (
    <div className="art-board" aria-hidden="true">
      <div className="art-board-grid">
        {Array.from({ length: 5 }, (_, c) => (
          <div key={`h${c}`} className="art-cell art-head">
            <span style={{ width: `${[58, 44, 66, 50, 60][c]}%` }} />
          </div>
        ))}
        {BOARD_VALUES.map((v, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const pick = BOARD_PICKS.findIndex(([pr, pc]) => pr === r && pc === c);
            const used = (r === 0 && c < 2) || (r === 1 && c === 0);
            return (
              <div
                key={`${r}-${c}`}
                className={`art-cell${pick >= 0 ? " is-pick" : ""}${pick === 0 ? " is-first" : ""}${used ? " is-used" : ""}`}
                style={pick >= 0 ? ({ "--pick": pick } as CSSProperties) : undefined}
              >
                {v}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

/** Identities the face-down card turns over to show. Generic, never from a loaded deck. */
const CARD_WORDS = ["Penguin", "Lighthouse", "Pizza", "Astronaut", "Volcano", "Violin"];

/** A fan of headband cards, drawn in code. The middle card turns over now and then. */
function CardsArt() {
  const [word, setWord] = useState(0);
  return (
    <div className="art-cards" aria-hidden="true">
      <div className="art-card art-card-back is-left">
        <span className="art-band" />
        <span className="art-line" />
        <span className="art-line is-short" />
      </div>
      <div className="art-card art-card-back is-right">
        <span className="art-band" />
        <span className="art-line" />
        <span className="art-line is-short" />
      </div>
      <div className="art-card-flip" onAnimationIteration={() => setWord((w) => (w + 1) % CARD_WORDS.length)}>
        <div className="art-card art-face is-mystery">
          <span className="art-band" />
          <span className="art-mark">?</span>
        </div>
        <div className="art-card art-face is-reveal">
          <span className="art-band" />
          <span className="art-word">{CARD_WORDS[word]}</span>
        </div>
      </div>
    </div>
  );
}

/** Generic statements for the LIAR scene. Never from a loaded file. */
const STATEMENT_SETS = [
  ["I have met a famous chef", "I can juggle five balls", "I was born on a boat"],
  ["I have never seen snow", "I once won a spelling bee", "I keep a pet snail"],
  ["I have climbed a volcano", "I speak three languages", "I hate chocolate"],
];

/**
 * Three statement cards, drawn in code. They drift, then one of them is
 * stamped as the lie before the set changes.
 */
function StatementsArt() {
  const [set, setSet] = useState(0);
  const lines = STATEMENT_SETS[set];
  const lie = set % 3 === 0 ? 1 : set % 3 === 1 ? 2 : 0;
  return (
    <div className="art-statements" aria-hidden="true" onAnimationIteration={(e) => e.target === e.currentTarget && setSet((s) => (s + 1) % STATEMENT_SETS.length)}>
      {lines.map((text, i) => (
        <div key={`${set}-${i}`} className={`art-statement${i === lie ? " is-lie" : ""}`} style={{ "--i": i } as CSSProperties}>
          <span className="art-statement-num">{i + 1}</span>
          <span className="art-statement-text">{text}</span>
          {i === lie && <span className="art-stamp">LIE</span>}
        </div>
      ))}
    </div>
  );
}

const HANDS = ["rock", "paper", "scissors"] as const;
const HAND_PATHS: Record<(typeof HANDS)[number], string> = {
  // Simple filled silhouettes: fist, open palm, two-finger scissors.
  rock: "M20 34c0-6 4-10 9-10h20c6 0 11 4 11 10v14c0 10-8 18-18 18h-4c-10 0-18-8-18-18zM26 24v-6a5 5 0 0 1 10 0v6M38 24v-8a5 5 0 0 1 10 0v8",
  paper: "M18 44V22a4 4 0 0 1 8 0v14V14a4 4 0 0 1 8 0v22V10a4 4 0 0 1 8 0v26V16a4 4 0 0 1 8 0v34c0 10-8 18-18 18s-14-6-18-14z",
  scissors: "M30 40 20 12a4 4 0 0 1 8-3l9 28 9-28a4 4 0 0 1 8 3L44 40c8 2 12 8 12 14 0 8-6 12-14 12s-12-6-12-14c0-4 0-8 0-12z",
};
/** [shape, chip?, left %, top %, size px, depth px, delay s] — generic floaters. */
const FLOATERS: Array<[number, boolean, number, number, number, number, number]> = [
  [0, false, 68, 12, 120, 60, 0],
  [1, false, 78, 58, 150, -40, -6],
  [2, false, 60, 70, 110, 90, -11],
  [0, true, 70, 20, 64, 120, -3],
  [1, true, 88, 30, 48, -60, -9],
  [2, true, 56, 44, 56, 30, -14],
  [0, true, 84, 80, 72, 70, -5],
  [1, true, 66, 88, 44, -20, -17],
];

/** Rock, paper and scissors hands and casino chips drifting slowly. */
function HandsArt() {
  return (
    <div className="art-hands" aria-hidden="true">
      {FLOATERS.map(([shape, chip, x, y, size, z, delay], i) => (
        <span
          key={i}
          className={`art-float${chip ? " is-chip" : " is-hand"} tone-${(i % 3) + 1}`}
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, "--z": `${z}px`, "--d": `${delay}s`, "--i": i } as CSSProperties}
        >
          {chip ? (
            <svg viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="29" className="chip-body" />
              <circle cx="32" cy="32" r="29" className="chip-edge" />
              <circle cx="32" cy="32" r="17" className="chip-inner" />
              <text x="32" y="38" textAnchor="middle" className="chip-mark">{["R", "P", "S"][shape]}</text>
            </svg>
          ) : (
            <svg viewBox="0 0 72 72">
              <path d={HAND_PATHS[HANDS[shape]]} />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * 3D parts system: engine artwork (board, headband cards, statements) on a
 * stage that fills the right side of the screen and slowly orbits in 3D.
 */
export function Parts3D({ kind, palette }: { kind: PartsKind; palette: CSSProperties }) {
  return (
    <div className="p3d" style={palette}>
      <div className="p3d-rig">
        {kind === "board" && <BoardArt />}
        {kind === "cards" && <CardsArt />}
        {kind === "statements" && <StatementsArt />}
        {kind === "hands" && <HandsArt />}
      </div>
    </div>
  );
}
