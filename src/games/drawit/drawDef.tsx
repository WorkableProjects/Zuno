import { NumberSetting, inRange } from "../party/PartyLobby";
import type { PartyGameDef } from "../party/types";
import { DrawPlay } from "./DrawPlay";
import { CHOICES, DEFAULT_DRAW_SETTINGS, DRAW_LIMITS, createDraw, drawPrivate, drawReducer, parseWords, toDrawOnline, type DrawOnline, type DrawPrivate, type DrawSettings, type DrawState } from "./drawEngine";

export function drawSettingsValid(s: DrawSettings): boolean {
  return inRange(s.rounds, ...DRAW_LIMITS.rounds) && inRange(s.drawSeconds, ...DRAW_LIMITS.drawSeconds) && s.customWords.length <= 4000 && (!s.onlyCustom || parseWords(s.customWords).length >= CHOICES);
}

function Settings({ value, onChange }: { value: DrawSettings; onChange: (s: DrawSettings) => void }) {
  const custom = parseWords(value.customWords).length;
  return (
    <div className="party-settings">
      <NumberSetting label="Rounds" value={value.rounds} min={DRAW_LIMITS.rounds[0]} max={DRAW_LIMITS.rounds[1]} onChange={(n) => onChange({ ...value, rounds: n })} hint="Everyone draws once per round." />
      <NumberSetting label="Seconds to draw" value={value.drawSeconds} min={DRAW_LIMITS.drawSeconds[0]} max={DRAW_LIMITS.drawSeconds[1]} onChange={(n) => onChange({ ...value, drawSeconds: n })} />
      <label className="rpg-switch">
        <input type="checkbox" checked={value.hints} onChange={(e) => onChange({ ...value, hints: e.target.checked })} />
        <span className="setup-label">Letter hints as time runs out</span>
      </label>
      <label className="field setup-field">
        <span className="setup-label">Your own words (optional)</span>
        <textarea className="input party-textarea" rows={3} maxLength={4000} placeholder="Comma or line separated, e.g. teacher, homework, field trip" value={value.customWords} onChange={(e) => onChange({ ...value, customWords: e.target.value })} />
        <span className="meta">{custom} custom word{custom === 1 ? "" : "s"}</span>
      </label>
      <label className="rpg-switch">
        <input type="checkbox" checked={value.onlyCustom} onChange={(e) => onChange({ ...value, onlyCustom: e.target.checked })} />
        <span className="setup-label">Only use my words</span>
      </label>
      {value.onlyCustom && custom < CHOICES && <p className="field-hint rpg-problem">Add at least {CHOICES} words.</p>}
    </div>
  );
}

export const drawDef: PartyGameDef<DrawState, DrawOnline, DrawPrivate, DrawSettings> = {
  kind: "draw",
  gameType: "drawit",
  title: "Draw It",
  tagline: "One player draws a secret word. Everyone else races to guess it.",
  howto: ["On your turn, pick one of three words and draw it. Everyone watches the drawing appear live and types guesses.", "Faster guesses score more, and the drawer scores for every player who gets it."],
  accent: "#F59E0B",
  minPlayers: 2,
  maxPlayers: 12,
  defaultSettings: DEFAULT_DRAW_SETTINGS,
  SettingsEditor: Settings,
  settingsValid: drawSettingsValid,
  note: (s) => `${s.rounds} round${s.rounds === 1 ? "" : "s"} · ${s.drawSeconds}s to draw`,
  create: createDraw,
  reduce: drawReducer,
  toOnline: toDrawOnline,
  privateOf: drawPrivate,
  isOver: (s) => s.phase === "over",
  Play: DrawPlay,
  endText: "Everyone sees the final scores.",
};
