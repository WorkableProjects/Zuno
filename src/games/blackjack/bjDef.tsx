import { NumberSetting, inRange } from "../party/PartyLobby";
import type { PartyGameDef } from "../party/types";
import { BlackjackPlay } from "./BlackjackPlay";
import { BJ_LIMITS, DEFAULT_BJ_SETTINGS, bjReducer, createBlackjack, toBjOnline, type BjOnline, type BjSettings, type BjState } from "./bjEngine";

export function bjSettingsValid(s: BjSettings): boolean {
  return (
    inRange(s.startingChips, ...BJ_LIMITS.chips) &&
    inRange(s.minBet, ...BJ_LIMITS.minBet) &&
    s.minBet <= s.startingChips &&
    inRange(s.betSeconds, ...BJ_LIMITS.betSeconds) &&
    inRange(s.turnSeconds, ...BJ_LIMITS.turnSeconds) &&
    inRange(s.rounds, ...BJ_LIMITS.rounds)
  );
}

function Settings({ value, onChange }: { value: BjSettings; onChange: (s: BjSettings) => void }) {
  const set = (k: keyof BjSettings) => (n: number) => onChange({ ...value, [k]: n });
  return (
    <div className="party-settings">
      <NumberSetting label="Starting chips" value={value.startingChips} min={BJ_LIMITS.chips[0]} max={BJ_LIMITS.chips[1]} onChange={set("startingChips")} />
      <NumberSetting label="Minimum bet" value={value.minBet} min={BJ_LIMITS.minBet[0]} max={Math.min(BJ_LIMITS.minBet[1], value.startingChips || BJ_LIMITS.minBet[1])} onChange={set("minBet")} />
      <NumberSetting label="Rounds" value={value.rounds} min={BJ_LIMITS.rounds[0]} max={BJ_LIMITS.rounds[1]} onChange={set("rounds")} hint="0 plays until one player has chips left." />
      <NumberSetting label="Seconds to bet" value={value.betSeconds} min={BJ_LIMITS.betSeconds[0]} max={BJ_LIMITS.betSeconds[1]} onChange={set("betSeconds")} />
      <NumberSetting label="Seconds per move" value={value.turnSeconds} min={BJ_LIMITS.turnSeconds[0]} max={BJ_LIMITS.turnSeconds[1]} onChange={set("turnSeconds")} />
    </div>
  );
}

export const blackjackDef: PartyGameDef<BjState, BjOnline, null, BjSettings> = {
  kind: "bj",
  gameType: "blackjack",
  title: "Blackjack",
  tagline: "Everyone plays against the dealer. Get closer to 21 without going over.",
  howto: ["Everyone bets, then takes turns to hit, stand, double down or split. The dealer stands on 17 and Blackjack pays 3 to 2.", "Whoever has the most chips at the end wins."],
  accent: "#16A34A",
  minPlayers: 1,
  maxPlayers: 7,
  defaultSettings: DEFAULT_BJ_SETTINGS,
  SettingsEditor: Settings,
  settingsValid: bjSettingsValid,
  note: (s) => `Everyone starts with $${s.startingChips.toLocaleString("en-US")} · minimum bet $${s.minBet}`,
  create: createBlackjack,
  reduce: bjReducer,
  toOnline: toBjOnline,
  privateOf: () => null,
  isOver: (s) => s.phase === "over",
  Play: BlackjackPlay,
  endText: "Bets on the table are refunded and everyone sees the final chip counts.",
};
