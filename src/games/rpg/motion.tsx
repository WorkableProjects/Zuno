import { useEffect, useRef, useState } from "react";
import { formatCoins } from "../../game-files/schema/rpg";

const reduced = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off");

/** Eases a number toward its target so balances count instead of jumping. */
export function useTween(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (cur.current === target) return;
    if (reduced()) {
      cur.current = target;
      setShown(target);
      return;
    }
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = Math.round(from.current + (target - from.current) * e);
      setShown(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

/** Coins that count up or down and flash green or red when they change. */
export function Coins({ value, className = "" }: { value: number; className?: string }) {
  const shown = useTween(value);
  const prev = useRef(value);
  const [flash, setFlash] = useState<{ dir: "up" | "down"; n: number } | null>(null);
  useEffect(() => {
    if (value === prev.current) return;
    setFlash((f) => ({ dir: value > prev.current ? "up" : "down", n: (f?.n ?? 0) + 1 }));
    prev.current = value;
  }, [value]);
  return (
    <span key={flash?.n ?? 0} className={`rpg-coins${flash ? ` is-${flash.dir}` : ""} ${className}`}>
      {formatCoins(shown)}
    </span>
  );
}

/** True `ms` after `on` turns true; false at once when it turns off. Hides sub-second busy flashes. */
export function useDelayed(on: boolean, ms = 250): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) {
      setLate(false);
      return;
    }
    const t = window.setTimeout(() => setLate(true), ms);
    return () => window.clearTimeout(t);
  }, [on, ms]);
  return late;
}

/** Keeps the last value around for `ms` after it goes null, so it can animate out. */
export function useLinger<T>(value: T | null, ms = 220): { value: T | null; leaving: boolean } {
  const [kept, setKept] = useState(value);
  useEffect(() => {
    if (value !== null) {
      setKept(value);
      return;
    }
    const t = window.setTimeout(() => setKept(null), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return { value: value ?? kept, leaving: value === null && kept !== null };
}
