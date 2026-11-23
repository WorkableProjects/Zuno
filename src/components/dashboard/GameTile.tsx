import { useRef, useState } from "react";
import { Plus, Sticker } from "lucide-react";
import type { RailItem } from "./railItems";

/** Cover for the Jeopardy engine: a small board with one clue picked. */
function BoardCover() {
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const lit = r === 1 && c === 1;
      cells.push(<rect key={`${r}${c}`} x={20 + c * 28} y={32 + r * 21} width="24" height="17" rx="4" className={lit ? "cover-lit" : "cover-cell"} />);
    }
  }
  return (
    <svg className="tile-img" viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" className="cover-bg" />
      {[0, 1, 2].map((c) => (
        <rect key={c} x={20 + c * 28} y="20" width="24" height="8" rx="3" className="cover-head" />
      ))}
      {cells}
    </svg>
  );
}

/** Cover for the Headbands engine: three held-up cards, the middle one turned away. */
function CardsCover() {
  return (
    <svg className="tile-img" viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" className="cover-bg" />
      <rect x="14" y="40" width="30" height="42" rx="5" className="cover-cell" transform="rotate(-10 29 61)" />
      <rect x="76" y="40" width="30" height="42" rx="5" className="cover-cell" transform="rotate(10 91 61)" />
      <rect x="20" y="52" width="16" height="4" rx="2" className="cover-head" transform="rotate(-10 29 61)" />
      <rect x="84" y="52" width="16" height="4" rx="2" className="cover-head" transform="rotate(10 91 61)" />
      <rect x="43" y="32" width="34" height="48" rx="6" className="cover-lit" />
      <text x="60" y="65" textAnchor="middle" className="cover-mark">?</text>
    </svg>
  );
}

/** Cover for LIAR: a speech bubble of three statements, one struck out and stamped. */
function LiarCover() {
  return (
    <svg className="tile-img" viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" className="cover-bg" />
      <path d="M22 26h76a8 8 0 0 1 8 8v42a8 8 0 0 1-8 8H52l-16 13v-13H22a8 8 0 0 1-8-8V34a8 8 0 0 1 8-8z" className="cover-cell" />
      <rect x="26" y="38" width="54" height="7" rx="3.5" className="cover-head" />
      <rect x="26" y="52" width="62" height="7" rx="3.5" className="cover-head" />
      <rect x="26" y="66" width="44" height="7" rx="3.5" className="cover-head" />
      <rect x="22" y="54.5" width="70" height="2.5" rx="1.25" className="cover-lit" />
      <g transform="rotate(-14 86 74)">
        <rect x="68" y="64" width="38" height="20" rx="4" className="cover-stamp" />
        <text x="87" y="79" textAnchor="middle" className="cover-stamp-text">LIE</text>
      </g>
    </svg>
  );
}

/** Cover for Rock Paper Gamble: a fist and an open hand facing off over a coin. */
function RpgCover() {
  return (
    <svg className="tile-img" viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" className="cover-bg" />
      <rect x="14" y="44" width="32" height="40" rx="9" className="cover-cell" transform="rotate(-8 30 64)" />
      <rect x="74" y="44" width="32" height="40" rx="9" className="cover-cell" transform="rotate(8 90 64)" />
      <rect x="20" y="54" width="20" height="4" rx="2" className="cover-head" transform="rotate(-8 30 64)" />
      <rect x="80" y="54" width="20" height="4" rx="2" className="cover-head" transform="rotate(8 90 64)" />
      <circle cx="60" cy="58" r="17" className="cover-lit" />
      <text x="60" y="65" textAnchor="middle" className="cover-mark">$</text>
    </svg>
  );
}

function DeckCover() {
  return (
    <svg className="tile-img" viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" className="cover-bg" />
      <rect x="26" y="34" width="36" height="50" rx="6" className="cover-cell" transform="rotate(-12 44 59)" />
      <rect x="56" y="32" width="36" height="50" rx="6" className="cover-lit" transform="rotate(10 74 57)" />
      <text x="75" y="64" textAnchor="middle" className="cover-mark" transform="rotate(10 74 57)">21</text>
    </svg>
  );
}

function SketchCover() {
  return (
    <svg className="tile-img" viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" className="cover-bg" />
      <rect x="22" y="28" width="76" height="58" rx="8" className="cover-cell" />
      <path d="M34 72 C 44 44, 58 44, 64 62 S 82 72, 88 46" fill="none" strokeWidth="5" strokeLinecap="round" className="cover-stroke" />
      <circle cx="40" cy="96" r="5" className="cover-lit" />
      <circle cx="56" cy="96" r="5" className="cover-head" />
      <circle cx="72" cy="96" r="5" className="cover-head" />
    </svg>
  );
}

function SurveyCover() {
  return (
    <svg className="tile-img" viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" className="cover-bg" />
      <rect x="18" y="30" width="40" height="16" rx="4" className="cover-lit" />
      <rect x="62" y="30" width="40" height="16" rx="4" className="cover-cell" />
      <rect x="18" y="52" width="40" height="16" rx="4" className="cover-cell" />
      <rect x="62" y="52" width="40" height="16" rx="4" className="cover-cell" />
      <rect x="44" y="76" width="32" height="28" rx="6" className="cover-x" />
      <path d="M52 82 L68 98 M68 82 L52 98" strokeWidth="5" strokeLinecap="round" className="cover-x-mark" />
    </svg>
  );
}

/** The drawn cover art for a game type. */
export function TileCover({ gameType }: { gameType: string }) {
  return gameType === "headbands" ? <CardsCover /> : gameType === "liar" ? <LiarCover /> : gameType === "rpg" ? <RpgCover /> : gameType === "blackjack" ? <DeckCover /> : gameType === "drawit" ? <SketchCover /> : gameType === "feud" ? <SurveyCover /> : <BoardCover />;
}

function FileCover({ item }: { item: RailItem }) {
  const [failed, setFailed] = useState(false);
  const cover = item.backdrop.cover;
  if (cover && !failed) {
    return <img className="tile-img" src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return (
    <span className="tile-img tile-generated">
      <span className="tile-generated-title">{item.title}</span>
    </span>
  );
}

interface Props {
  item: RailItem;
  active: boolean;
  onSelect: () => void;
  onActivate: () => void;
}

export function GameTile({ item, active, onSelect, onActivate }: Props) {
  const wasActive = useRef(false);
  const label =
    item.kind === "file"
      ? `${item.title}, recent game file`
      : item.kind === "build"
        ? "Build a game"
        : item.kind === "soon"
          ? `${item.title}, coming soon`
          : `${item.title}, game engine`;

  return (
    <button
      type="button"
      className={`tile tile-${item.kind}${active ? " is-active" : ""}`}
      style={{ "--game": item.backdrop.accent } as React.CSSProperties}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      data-nav-default={active ? "" : undefined}
      data-tile-id={item.id}
      onFocus={onSelect}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        onSelect();
        // One cursor: when the pointer previews a tile, keyboard focus follows it.
        const focused = document.activeElement;
        if (!focused || focused === document.body || focused.classList.contains("tile")) {
          e.currentTarget.focus({ preventScroll: true });
        }
      }}
      onPointerDown={() => {
        wasActive.current = active;
      }}
      onClick={(e) => {
        // A first tap only selects. Enter, or a click on the selected tile, activates.
        if (e.detail > 0 && !wasActive.current) {
          wasActive.current = true;
          return;
        }
        onActivate();
      }}
    >
      <span className="tile-shadow" />
      <span className="tile-art">
        {item.kind === "engine" && (item.gameType === "headbands" ? <CardsCover /> : item.gameType === "liar" ? <LiarCover /> : item.gameType === "rpg" ? <RpgCover /> : item.gameType === "blackjack" ? <DeckCover /> : item.gameType === "drawit" ? <SketchCover /> : item.gameType === "feud" ? <SurveyCover /> : <BoardCover />)}
        {item.kind === "file" && <FileCover item={item} />}
        {item.kind === "build" && (
          <span className="tile-img tile-create">
            <Plus size={28} strokeWidth={1.5} />
            <span>Build</span>
          </span>
        )}
        {item.kind === "soon" && (
          <span className="tile-img tile-soon-cover">
            <Sticker size={48} strokeWidth={1.5} />
          </span>
        )}
        <span className="tile-shade" />
        <span className="tile-gloss" />
        <span className="tile-sheen" />
        {item.kind === "soon" && <span className="tile-badge">COMING SOON</span>}
      </span>
      <span className="tile-ring" />
      <span className="tile-beam tile-beam-glow" />
      <span className="tile-beam" />
    </button>
  );
}
