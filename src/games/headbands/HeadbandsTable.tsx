import { CircleCheck } from "lucide-react";
import type { HeadbandsIdentity, HeadbandsMode } from "../../game-files/schema/headbands";
import { IdentityCard } from "./IdentityCard";
import { Avatar } from "../../components/avatar/Avatar";
import type { AvatarSpec } from "../../components/avatar/avatar";

export interface Seat {
  id: string;
  name: string;
  /** The card on this player's headband, or null when it is not known. */
  card: HeadbandsIdentity | null;
  /** True when the viewer is this player and must not see the card. */
  hidden: boolean;
  solved: boolean;
  current: boolean;
  isMe: boolean;
  avatar?: AvatarSpec | null;
}

interface Props {
  seats: Seat[];
  mode: HeadbandsMode;
}

/**
 * Everyone around the table, each wearing a card only the others can read.
 * Shown on every device, the host's included, so nobody has to share a screen.
 */
export function HeadbandsTable({ seats, mode }: Props) {
  return (
    <ul className="hb-table" aria-label="Everyone's headbands">
      {seats.map((s) => (
        <li key={s.id} className={`hb-seat${s.current ? " is-current" : ""}${s.solved ? " is-solved" : ""}${s.isMe ? " is-me" : ""}`}>
          <p className="hb-seat-tag">{s.isMe ? "You" : s.current ? "Asking now" : " "}</p>
          <div className="hb-seat-card">
            {s.hidden || !s.card ? (
              <div className="id-card id-card-sm id-card-text hb-seat-unknown">
                <p className="id-text" aria-label="Hidden from you">
                  ???
                </p>
              </div>
            ) : (
              <IdentityCard identity={s.card} mode={mode} size="sm" />
            )}
          </div>
          <Avatar name={s.name} avatar={s.avatar} className="hb-seat-avatar" />
          <p className="hb-seat-name">
            {s.name}
            {s.solved && <CircleCheck size={14} strokeWidth={1.5} aria-label="Solved" />}
          </p>
        </li>
      ))}
    </ul>
  );
}
