import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { itemInfo, type ItemId } from "../../game-files/schema/rpg";

/** Name, cost, when to use and exactly what an item does, for this room's costs. */
export function ItemInfoBody({ id, costs }: { id: ItemId; costs: Record<ItemId, number> }) {
  const info = itemInfo(id, costs);
  return (
    <>
      <strong className="rpg-tip-name">{info.name}</strong>
      <span className="meta">{info.when}</span>
      <ul>
        {info.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </>
  );
}

/**
 * An (i) button with a popover. Hover and keyboard focus show it on desktop;
 * a tap toggles it on touch. Escape or a tap outside closes it.
 */
export function ItemInfoTip({ id, costs }: { id: ItemId; costs: Record<ItemId, number> }) {
  const tipId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const open = hover || focus || pinned;

  useEffect(() => {
    if (!pinned && !open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setHover(false);
        setFocus(false);
      }
    };
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setPinned(false);
        setHover(false);
      }
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", away);
    };
  }, [pinned, open]);

  // Keep the popover inside the screen, with a 16px gutter.
  useLayoutEffect(() => {
    if (!open || !tip.current) return;
    const el = tip.current;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    const max = window.innerWidth - 16;
    setShift(r.left < 16 ? 16 - r.left : r.right > max ? max - r.right : 0);
  }, [open]);

  return (
    <span ref={root} className="rpg-tipwrap" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className="icon-btn icon-btn-sm rpg-tipbtn"
        aria-label={`About ${itemInfo(id, costs).name}`}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={pinned}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onClick={() => setPinned((v) => !v)}
      >
        <Info size={16} strokeWidth={1.5} />
      </button>
      {open && (
        <div ref={tip} id={tipId} role="tooltip" className="rpg-tip" style={{ transform: `translateX(${shift}px)` }}>
          <ItemInfoBody id={id} costs={costs} />
        </div>
      )}
    </span>
  );
}
