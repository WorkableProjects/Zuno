import { useRef, useState } from "react";
import { Plus } from "lucide-react";
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
  const label = item.kind === "file" ? `${item.title}, recent game file` : item.kind === "build" ? "Build a game" : `${item.title}, game engine`;

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
        {item.kind === "engine" && <BoardCover />}
        {item.kind === "file" && <FileCover item={item} />}
        {item.kind === "build" && (
          <span className="tile-img tile-create">
            <Plus size={28} strokeWidth={1.5} />
            <span>Build</span>
          </span>
        )}
        <span className="tile-shade" />
        <span className="tile-gloss" />
        <span className="tile-sheen" />
      </span>
      <span className="tile-ring" />
      <span className="tile-beam tile-beam-glow" />
      <span className="tile-beam" />
    </button>
  );
}
