import { NumberSetting, inRange } from "../party/PartyLobby";
import type { PartyGameDef } from "../party/types";
import { FeudPlay } from "./FeudPlay";
import { DEFAULT_FEUD_SETTINGS, FEUD_LIMITS, createFeud, feudPrivate, feudReducer, toFeudOnline, type FeudOnline, type FeudPrivate, type FeudSettings, type FeudState } from "./feudEngine";

export function feudSettingsValid(s: FeudSettings): boolean {
  return inRange(s.maxAnswers, ...FEUD_LIMITS.maxAnswers) && inRange(s.writeSeconds, ...FEUD_LIMITS.writeSeconds) && inRange(s.guessSeconds, ...FEUD_LIMITS.guessSeconds) && inRange(s.strikes, ...FEUD_LIMITS.strikes);
}

function Settings({ value, onChange }: { value: FeudSettings; onChange: (s: FeudSettings) => void }) {
  const set = (k: keyof FeudSettings) => (n: number) => onChange({ ...value, [k]: n });
  return (
    <div className="party-settings">
      <NumberSetting label="Answers per survey (most)" value={value.maxAnswers} min={FEUD_LIMITS.maxAnswers[0]} max={FEUD_LIMITS.maxAnswers[1]} onChange={set("maxAnswers")} />
      <NumberSetting label="Strikes per round" value={value.strikes} min={FEUD_LIMITS.strikes[0]} max={FEUD_LIMITS.strikes[1]} onChange={set("strikes")} />
      <NumberSetting label="Seconds to write surveys" value={value.writeSeconds} min={FEUD_LIMITS.writeSeconds[0]} max={FEUD_LIMITS.writeSeconds[1]} onChange={set("writeSeconds")} />
      <NumberSetting label="Seconds per answer" value={value.guessSeconds} min={FEUD_LIMITS.guessSeconds[0]} max={FEUD_LIMITS.guessSeconds[1]} onChange={set("guessSeconds")} />
    </div>
  );
}

export const feudDef: PartyGameDef<FeudState, FeudOnline, FeudPrivate, FeudSettings> = {
  kind: "feud",
  gameType: "feud",
  title: "Survey Feud",
  tagline: "Everyone writes a survey. Each one becomes a round hosted by its author.",
  howto: [
    "First, everyone writes a question and the answers they expect, with points for each. Then each survey is played as a round, hosted by whoever wrote it.",
    "Players take turns answering. Find an answer to score its points. A miss is a strike, and the round ends after too many strikes or when the board is cleared.",
  ],
  accent: "#2563EB",
  minPlayers: 3,
  maxPlayers: 12,
  defaultSettings: DEFAULT_FEUD_SETTINGS,
  SettingsEditor: Settings,
  settingsValid: feudSettingsValid,
  note: (s) => `Up to ${s.maxAnswers} answers per survey · ${s.strikes} strikes`,
  create: (players, settings) => createFeud(players, settings),
  reduce: feudReducer,
  toOnline: toFeudOnline,
  privateOf: feudPrivate,
  isOver: (s) => s.phase === "over",
  Play: FeudPlay,
  endText: "Everyone sees the final scores.",
};
