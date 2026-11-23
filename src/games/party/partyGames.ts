import { blackjackDef } from "../blackjack/bjDef";
import { drawDef } from "../drawit/drawDef";
import { feudDef } from "../feud/feudDef";
import type { PartyKind } from "./partyRoom";
import type { AnyPartyDef } from "./types";

export const PARTY_GAMES: readonly AnyPartyDef[] = [blackjackDef, drawDef, feudDef];

export const partyByKind = (kind: PartyKind): AnyPartyDef => PARTY_GAMES.find((d) => d.kind === kind)!;
export const partyByType = (gameType: string): AnyPartyDef | undefined => PARTY_GAMES.find((d) => d.gameType === gameType);
