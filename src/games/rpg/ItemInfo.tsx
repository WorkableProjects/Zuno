import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { itemInfo, type ItemId } from "../../game-files/schema/rpg";

/** Name, cost, when to use and exactly what an item does, for this room's costs. */
export function ItemInfoBody({
  id,
  costs,
}: {
  id: ItemId;
  costs: Record<ItemId, number>;
}) {
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

const OPEN_DELAY = 120;
const CLOSE_MS = 140;

/**
 * An (i) button with a popover. Hover and keyboard focus show it on desktop;
 * a tap or click pins it. Escape or a tap outside closes it. A hover-only
 * popover ignores the pointer so it never covers the controls under it.
 */
export function ItemInfoTip({
  id,
  costs,
}: {
  id: ItemId;
  costs: Record<ItemId, number>;
}) {
  const tipId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || focus || pinned;
  // Stays mounted briefly after closing so it can animate out.
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    width: number;
    above: boolean;
  } | null>(null);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      window.clearTimeout(hoverTimer.current);
      setPinned(false);
      setHover(false);
      setFocus(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || tipRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", away);
    };
  }, [open]);

  // Fixed beside the button, kept inside the screen with a 16px gutter, flipped
  // above when there is no room below. Fixed so scrolling panels cannot clip it.
  useLayoutEffect(() => {
    if (!mounted) {
      setPos(null);
      return;
    }
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 32);
      const left = Math.max(
        16,
        Math.min(r.left + r.width / 2 - 24, window.innerWidth - 16 - width),
      );
      const h = tipRef.current?.offsetHeight ?? 220;
      const above =
        r.bottom + 8 + h > window.innerHeight - 16 && r.top - 8 - h >= 16;
      setPos({ left, top: above ? r.top - 8 : r.bottom + 8, width, above });
    };
    place();
    // Measure again once the popover has its real height.
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [mounted]);

  const name = itemInfo(id, costs).name;
  return (
    <span
      ref={root}
      className="rpg-tipwrap"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        window.clearTimeout(hoverTimer.current);
        hoverTimer.current = window.setTimeout(
          () => setHover(true),
          OPEN_DELAY,
        );
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        window.clearTimeout(hoverTimer.current);
        setHover(false);
      }}
    >
      <button
        ref={btnRef}
        type="button"
        className={`icon-btn icon-btn-sm rpg-tipbtn${open ? " is-open" : ""}`}
        aria-label={`About ${name}`}
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
        onClick={() => {
          window.clearTimeout(hoverTimer.current);
          setPinned((v) => !v);
        }}
      >
        <Info size={16} strokeWidth={1.5} />
      </button>
      {mounted &&
        createPortal(
          <div
            className={`rpg-tip-pos${pinned ? " is-pinned" : ""}${pos?.above ? " is-above" : ""}${open && pos ? " is-open" : ""}`}
            style={
              pos
                ? { left: pos.left, top: pos.top, width: pos.width }
                : { left: -9999, top: 0, width: 320 }
            }
          >
            <div ref={tipRef} id={tipId} role="tooltip" className="rpg-tip">
              <ItemInfoBody id={id} costs={costs} />
            </div>
          </div>,
          // Rendered on <body>: a transformed or blurred ancestor panel would
          // otherwise become the fixed box's anchor and throw it off the button.
          document.body,
        )}
    </span>
  );
}
