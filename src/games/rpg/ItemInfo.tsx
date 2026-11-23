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
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
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
        setFocus(false);
      }
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", away);
    };
  }, [pinned, open]);

  // Fixed under the button, kept inside the screen with a 16px gutter. Fixed so the
  // scrolling panels around it cannot clip it. Recomputed when the viewport changes.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.left, window.innerWidth - 16 - width));
      setPos({ left, top: r.bottom, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("orientationchange", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("orientationchange", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <span ref={root} className="rpg-tipwrap" onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)} onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}>
      <button
        ref={btnRef}
        type="button"
        className="icon-btn icon-btn-sm rpg-tipbtn"
        aria-label={`About ${itemInfo(id, costs).name}`}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={pinned}
        onFocus={(e) => {
          // Only keyboard focus opens it; a tap focuses the button too and would stop a second tap closing it.
          let kb = true;
          try {
            kb = e.currentTarget.matches(":focus-visible");
          } catch {
            /* older browsers: treat as keyboard focus */
          }
          if (kb) setFocus(true);
        }}
        onBlur={() => setFocus(false)}
        onClick={() => setPinned((v) => !v)}
      >
        <Info size={16} strokeWidth={1.5} />
      </button>
      {open && pos && (
        <div className="rpg-tip-pos" style={{ left: pos.left, top: pos.top, width: pos.width }}>
          <div id={tipId} role="tooltip" className="rpg-tip">
            <ItemInfoBody id={id} costs={costs} />
          </div>
        </div>
      )}
    </span>
  );
}
