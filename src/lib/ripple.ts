const TARGETS = ".btn, .lx-tab, .segment, .lx-back, .hm-action, .hm-signin";

/** An ink ripple that spreads from the press point on buttons. One listener for the whole app. */
export function installRipples(): () => void {
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (document.documentElement.dataset.motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = (e.target as Element | null)?.closest?.<HTMLElement>(TARGETS);
    if (!host || (host as HTMLButtonElement).disabled) return;
    const r = host.getBoundingClientRect();
    const size = Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX), Math.max(e.clientY - r.top, r.bottom - e.clientY)) * 2;
    const ink = document.createElement("span");
    ink.className = "zuno-ripple";
    ink.setAttribute("aria-hidden", "true");
    ink.style.setProperty("--rx", `${e.clientX - r.left}px`);
    ink.style.setProperty("--ry", `${e.clientY - r.top}px`);
    ink.style.setProperty("--rs", `${size}px`);
    host.appendChild(ink);
    const drop = () => ink.remove();
    ink.addEventListener("animationend", drop, { once: true });
    window.setTimeout(drop, 900);
  };
  window.addEventListener("pointerdown", onDown, { passive: true });
  return () => window.removeEventListener("pointerdown", onDown);
}
