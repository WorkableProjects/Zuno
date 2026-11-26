import type { CSSProperties, ReactNode } from "react";
import { ZunoMark } from "../brand/Logo";
import { cleanCosmeticId } from "../../lib/cosmetics";
import "./cosmetics.css";

/**
 * The ring/frame around an avatar for an equipped decoration. Avatar (AvatarView.tsx) wraps
 * itself in this whenever its spec carries `deco`, so every surface that already shows a
 * player's avatar (rail, lobbies, player lists, feeds) gets the decoration with no extra code.
 */
export function DecorationFrame({ id, size, className = "", children }: { id: string | null | undefined; size: number; className?: string; children: ReactNode }) {
  const deco = cleanCosmeticId(id);
  if (!deco) return <>{children}</>;
  return (
    <span className={`deco deco-${deco} ${className}`} style={{ "--deco-size": `${size}px` } as CSSProperties} data-deco={deco}>
      {children}
      {deco === "zuno" && (
        <span className="deco-orbit" aria-hidden="true">
          <ZunoMark size={Math.max(12, Math.round(size * 0.36))} />
        </span>
      )}
    </span>
  );
}

/** A display name in its equipped name style. Unknown or missing styles render plain. */
export function StyledUsername({ name, styleId, className = "", as: Tag = "span" }: { name: string; styleId?: string | null; className?: string; as?: "span" | "strong" | "h1" | "h2" }) {
  const style = cleanCosmeticId(styleId);
  return (
    <Tag className={`uname${style ? ` uname-${style}` : ""} ${className}`} data-text={name}>
      {style === "zuno" && <ZunoMark size={14} />}
      {name}
    </Tag>
  );
}
