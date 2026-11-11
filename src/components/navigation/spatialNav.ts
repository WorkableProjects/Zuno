import { useEffect } from "react";

/**
 * Console-style directional navigation.
 *
 * Mark a container with `data-nav-row="<number>"`. Every focusable control
 * inside it becomes one stop in that row. Left/Right (or A/D) move inside the
 * row, Up/Down (or W/S) move to the nearest stop in the next row.
 * `data-nav-default` marks the stop a row prefers when it is entered.
 * The innermost open `[data-nav-scope]` (a dialog, for example) limits the
 * search, so focus never escapes an open modal.
 */

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

type Dir = "left" | "right" | "up" | "down";

const KEY_DIR: Record<string, Dir> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  a: "left",
  d: "right",
  w: "up",
  s: "down",
};

/** Which directions a control needs for itself. */
function reservedDirections(el: Element | null, viaLetter: boolean): "all" | "horizontal" | "none" {
  if (!(el instanceof HTMLElement)) return "none";
  if (el.isContentEditable) return "all";
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return "all";
  if (el instanceof HTMLInputElement) {
    const type = el.type;
    if (type === "checkbox" || type === "radio" || type === "button" || type === "submit" || type === "file") return "none";
    if (type === "range" || type === "number" || type === "color") return "all";
    // Single-line text: letters always type, Left/Right move the caret, Up/Down are free.
    return viaLetter ? "all" : "horizontal";
  }
  return "none";
}

function currentScope(): ParentNode {
  const scopes = document.querySelectorAll("[data-nav-scope]");
  return scopes.length ? scopes[scopes.length - 1] : document;
}

interface Stop {
  el: HTMLElement;
  row: number;
  rect: DOMRect;
}

function collectStops(scope: ParentNode): Stop[] {
  const stops: Stop[] = [];
  scope.querySelectorAll<HTMLElement>("[data-nav-row]").forEach((rowEl) => {
    const row = Number(rowEl.dataset.navRow);
    const candidates = rowEl.matches(FOCUSABLE) ? [rowEl] : Array.from(rowEl.querySelectorAll<HTMLElement>(FOCUSABLE));
    for (const el of candidates) {
      if (el.closest("[data-nav-row]") !== rowEl) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      stops.push({ el, row, rect });
    }
  });
  return stops;
}

function focusStop(stop: Stop) {
  stop.el.focus({ preventScroll: true });
  stop.el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function enterRow(stops: Stop[], fromX: number): Stop {
  const preferred = stops.find((s) => s.el.hasAttribute("data-nav-default"));
  if (preferred) return preferred;
  return stops.reduce((best, s) =>
    Math.abs(s.rect.left + s.rect.width / 2 - fromX) < Math.abs(best.rect.left + best.rect.width / 2 - fromX) ? s : best,
  );
}

export function moveFocus(dir: Dir): boolean {
  const stops = collectStops(currentScope());
  if (stops.length === 0) return false;
  const active = document.activeElement;
  const here = stops.find((s) => s.el === active);
  if (!here) {
    const rows = [...new Set(stops.map((s) => s.row))].sort((a, b) => a - b);
    const start = stops.find((s) => s.el.hasAttribute("data-nav-default")) ?? stops.find((s) => s.row === rows[0])!;
    focusStop(start);
    return true;
  }
  if (dir === "left" || dir === "right") {
    const row = stops.filter((s) => s.row === here.row);
    const next = row[row.indexOf(here) + (dir === "left" ? -1 : 1)];
    if (next) focusStop(next);
    return true;
  }
  const rows = [...new Set(stops.map((s) => s.row))].sort((a, b) => a - b);
  const targetRow = rows[rows.indexOf(here.row) + (dir === "up" ? -1 : 1)];
  if (targetRow === undefined) return true;
  focusStop(
    enterRow(
      stops.filter((s) => s.row === targetRow),
      here.rect.left + here.rect.width / 2,
    ),
  );
  return true;
}

/** Installs the one global key handler. Call once, at the app root. */
export function useSpatialNav() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A held Enter must never activate the next screen's focused button.
      if (e.key === "Enter" && e.repeat) {
        e.preventDefault();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const viaLetter = e.key.length === 1;
      const dir = KEY_DIR[viaLetter ? e.key.toLowerCase() : e.key];
      if (!dir) return;
      const reserved = reservedDirections(document.activeElement, viaLetter);
      if (reserved === "all") return;
      if (reserved === "horizontal" && (dir === "left" || dir === "right")) return;
      if (moveFocus(dir)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Runs `handler` on Escape unless a dialog is open above this screen. */
export function useEscape(handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("[data-nav-scope]")) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handler, enabled]);
}
