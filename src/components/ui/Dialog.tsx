import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const TABBABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

interface Props {
  title: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
  variant?: "modal" | "sheet";
  wide?: boolean;
}

/**
 * Modal dialog. Traps Tab inside itself, closes on Escape, and returns focus
 * to whatever opened it. It is also a navigation scope, so arrow keys stay inside.
 */
export function Dialog({ title, onClose, children, variant = "modal", wide }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 150);
  }, [onClose]);

  useEffect(() => {
    opener.current = document.activeElement;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(TABBABLE);
    (first ?? el)?.focus({ preventScroll: true });
    return () => {
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(TABBABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={`dialog-layer${variant === "sheet" ? " is-sheet" : ""}${closing ? " is-closing" : ""}`} data-nav-scope onKeyDown={onKeyDown}>
      <div className="dialog-backdrop" onClick={close} />
      <div ref={panel} className={variant === "sheet" ? "sheet" : `dialog${wide ? " dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        {children(close)}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  return (
    <Dialog title={title} onClose={onClose}>
      {(close) => (
        <>
          <h2 className="dialog-title">{title}</h2>
          <p className="dialog-text">{text}</p>
          <div className="dialog-actions" data-nav-row="0">
            <button type="button" className="btn btn-secondary" data-autofocus onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
              onClick={() => {
                onClose();
                onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
