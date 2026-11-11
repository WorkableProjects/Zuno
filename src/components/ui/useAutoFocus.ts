import { useEffect, useRef } from "react";

/** When a screen opens, focus its first meaningful control. */
export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>("[data-autofocus]");
    target?.focus({ preventScroll: true });
  }, []);
  return ref;
}
