import { useEffect, useState, type ReactNode } from "react";
import { useDelayed } from "../rpg/motion";
import { sendPartyMove, watchPartyPrivate, type PartyLobbyState } from "./partyRoom";
import type { AnyPartyDef, Published } from "./types";

interface Props {
  def: AnyPartyDef;
  code: string;
  me: string;
  lobby: PartyLobbyState<Published<unknown>>;
  game: Published<unknown>;
  /** The host's device applies moves directly and passes its own private view. */
  onMove?: (move: Record<string, unknown>) => void;
  priv?: unknown;
  host?: ReactNode;
}

/** One device's view of a running party game: wires sending and private state, then renders the game. */
export function PartyPlayer({ def, code, me, lobby, game, onMove, priv: hostPriv, host }: Props) {
  const [remote, setRemote] = useState<unknown>(null);
  useEffect(() => (onMove ? undefined : watchPartyPrivate(def.kind, code, me, setRemote)), [onMove, code, me, def.kind]);
  const [sending, setSending] = useState(false);
  const busy = useDelayed(sending);

  const send = async (move: Record<string, unknown>) => {
    if (sending) return;
    setSending(true);
    try {
      if (onMove) onMove(move);
      else await sendPartyMove(def.kind, code, me, move);
    } finally {
      setSending(false);
    }
  };

  const Play = def.Play;
  return <Play code={code} me={me} lobby={lobby} game={game} priv={onMove ? (hostPriv ?? null) : remote} send={send} busy={busy} host={host} avatarOf={(id: string) => lobby.players[id]?.avatar} />;
}
