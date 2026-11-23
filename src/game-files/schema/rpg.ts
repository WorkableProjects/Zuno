import { BACKGROUND_PRESETS, CURRENT_SCHEMA_VERSION, isRecord, type GameFile, type ValidationResult } from "./common";
import { parseCommon } from "./shared";

export const RPG_TYPE = "rpg";

export const RPG_LIMITS = {
  minPlayers: 2,
  maxPlayers: 12,
  minMoney: 100,
  maxMoney: 1_000_000,
  minSeconds: 5,
  maxSeconds: 120,
};

export type ItemId = "bomb" | "nuke" | "landmine" | "interceptor";
export const ITEM_IDS: readonly ItemId[] = ["bomb", "nuke", "landmine", "interceptor"];
export const ITEM_NAMES: Record<ItemId, string> = { bomb: "Atomic Bomb", nuke: "Nuke", landmine: "Landmine", interceptor: "Interceptor" };
export const DEFAULT_ITEM_COSTS: Record<ItemId, number> = { bomb: 3000, nuke: 8000, landmine: 500, interceptor: 1500 };
/** Sane bounds for the host's per-item cost overrides. */
export const ITEM_COST_LIMITS: Record<ItemId, { min: number; max: number }> = {
  bomb: { min: 500, max: 50_000 },
  nuke: { min: 1000, max: 100_000 },
  landmine: { min: 50, max: 10_000 },
  interceptor: { min: 100, max: 20_000 },
};

/** Rock Paper Gamble has no prepared content. Everything lives in the settings. */
export type RpgContent = Record<string, never>;

export interface RpgSettings {
  /** What every player starts with. */
  startingMoney: number;
  maxPlayers: number;
  /** The challenger's time to pick an opponent. */
  selectSeconds: number;
  /** Time for spectators to place bets. */
  bettingSeconds: number;
  /** Time for each rock-paper-scissors round. */
  roundSeconds: number;
  /** How long the payout screen stays up. */
  resultsSeconds: number;
  /** Whether the item shop is open. */
  items: boolean;
  /** What each item costs in the shop. */
  itemCosts: Record<ItemId, number>;
}

export type RpgFile = GameFile<RpgContent, RpgSettings>;

export const DEFAULT_RPG_SETTINGS: RpgSettings = {
  startingMoney: 10000,
  maxPlayers: RPG_LIMITS.maxPlayers,
  selectSeconds: 15,
  bettingSeconds: 20,
  roundSeconds: 15,
  resultsSeconds: 8,
  items: true,
  itemCosts: { ...DEFAULT_ITEM_COSTS },
};

/** A default Rock Paper Gamble file: online only, no prepared content. */
export function blankRpgFile(): RpgFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    gameType: RPG_TYPE,
    metadata: { title: "Rock Paper Gamble", description: "Rock paper scissors duels with money on the line.", author: "", coverImage: null },
    appearance: { accentColor: "#7C3AED", backgroundPreset: BACKGROUND_PRESETS[0] },
    content: {},
    settings: { ...DEFAULT_RPG_SETTINGS },
  };
}

/** Validates the Rock Paper Gamble parts of a parsed game file and returns a clean copy. */
export function validateRpg(raw: Record<string, unknown>): ValidationResult<RpgFile> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { metadata, appearance } = parseCommon(raw, RPG_TYPE, errors, warnings);

  if (!isRecord(raw.content)) errors.push("The file is missing its content section. It may be an empty object.");

  const settings: RpgSettings = { ...DEFAULT_RPG_SETTINGS, itemCosts: { ...DEFAULT_ITEM_COSTS } };
  if (raw.settings !== undefined && raw.settings !== null) {
    if (!isRecord(raw.settings)) {
      errors.push("The settings section must be an object.");
    } else {
      const s = raw.settings;
      const int = (key: "startingMoney" | "maxPlayers" | "selectSeconds" | "bettingSeconds" | "roundSeconds" | "resultsSeconds", lo: number, hi: number) => {
        const v = s[key];
        if (v === undefined || v === null) return;
        if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) errors.push(`The ${key} setting must be a whole number from ${lo.toLocaleString("en-US")} to ${hi.toLocaleString("en-US")}.`);
        else settings[key] = v;
      };
      int("startingMoney", RPG_LIMITS.minMoney, RPG_LIMITS.maxMoney);
      int("maxPlayers", RPG_LIMITS.minPlayers, RPG_LIMITS.maxPlayers);
      int("selectSeconds", RPG_LIMITS.minSeconds, RPG_LIMITS.maxSeconds);
      int("bettingSeconds", RPG_LIMITS.minSeconds, RPG_LIMITS.maxSeconds);
      int("roundSeconds", RPG_LIMITS.minSeconds, RPG_LIMITS.maxSeconds);
      int("resultsSeconds", RPG_LIMITS.minSeconds, RPG_LIMITS.maxSeconds);
      if (s.items !== undefined && s.items !== null) {
        if (typeof s.items !== "boolean") errors.push("The items setting must be true or false.");
        else settings.items = s.items;
      }
      if (s.itemCosts !== undefined && s.itemCosts !== null) {
        if (!isRecord(s.itemCosts)) errors.push("The itemCosts setting must be an object.");
        else {
          for (const id of ITEM_IDS) {
            const v = s.itemCosts[id];
            if (v === undefined || v === null) continue;
            const { min, max } = ITEM_COST_LIMITS[id];
            if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) errors.push(`The ${id} item cost must be a whole number from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}.`);
            else settings.itemCosts[id] = v;
          }
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    file: { schemaVersion: CURRENT_SCHEMA_VERSION, gameType: RPG_TYPE, metadata, appearance, content: {}, settings },
  };
}

export function formatCoins(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Fixed numbers behind the items. The engine and every description read these. */
export const ITEM_RULES = {
  bombSeconds: 10,
  bombTarget: 90,
  bombNext: 30,
  bombOthers: 10,
  nukeVoteSeconds: 15,
  nukeRoundSeconds: 15,
  nukeMaxTies: 3,
  nukeRefund: 50,
  nukeImpact: 25,
  nukeBackfire: 75,
  minePayout: 250,
  interceptMultiplier: 2,
  interceptMin: 200,
  interceptPenalty: 200,
} as const;

export interface ItemInfo {
  name: string;
  /** One line for lists. */
  short: string;
  /** When it can be used. */
  when: string;
  /** Exactly what happens, for the room's current costs. */
  lines: string[];
}

/** Every description of an item lives here, so the shop, the banners and the lobby agree. */
export function itemInfo(id: ItemId, costs: Record<ItemId, number> = DEFAULT_ITEM_COSTS): ItemInfo {
  const r = ITEM_RULES;
  const c = (n: number) => formatCoins(n);
  switch (id) {
    case "bomb":
      return {
        name: ITEM_NAMES.bomb,
        short: "Plant a bomb on a player. Cut the right wire or they get robbed.",
        when: "Use while players are choosing an opponent, on any other player with coins.",
        lines: [
          `Costs ${c(costs.bomb)}.`,
          `The target has ${r.bombSeconds} seconds to cut one of 3 wires. One hidden wire defuses it.`,
          "Right wire: Defused. Nothing happens and the bomb is spent.",
          `Wrong wire or time out: Detonated. You take ${r.bombTarget}% of the target's coins, ${r.bombNext}% of the next player in turn order (skipping you, the target and anyone broke), and ${r.bombOthers}% from every other player.`,
        ],
      };
    case "nuke":
      return {
        name: ITEM_NAMES.nuke,
        short: "Everyone votes, then you duel the richest player for a share of everyone's coins.",
        when: "Use while players are choosing an opponent.",
        lines: [
          `Costs ${c(costs.nuke)}.`,
          `Every other player votes Allow or Block for ${r.nukeVoteSeconds} seconds. No vote counts as Allow.`,
          `More Block than Allow: the nuke fizzles and you get ${r.nukeRefund}% back (${c(Math.floor((costs.nuke * r.nukeRefund) / 100))}).`,
          `Otherwise you play one rock-paper-scissors round against the richest other player. Ties replay; after ${r.nukeMaxTies} ties it backfires.`,
          `You win: Impact. You take ${r.nukeImpact}% of the coins of every other player.`,
          `You lose: Backfire. You lose ${r.nukeBackfire}% of your own coins, split evenly among the other active players.`,
        ],
      };
    case "landmine":
      return {
        name: ITEM_NAMES.landmine,
        short: "Secretly pick a symbol. If both duelists throw it, you get paid.",
        when: "Use during betting, if you are not one of the duelists.",
        lines: [
          `Costs ${c(costs.landmine)}.`,
          "Secretly pick Rock, Paper or Scissors.",
          `The first round where both duelists throw your symbol triggers it: you get ${c(r.minePayout)} from each duelist (at most what they have).`,
          "It triggers once and is spent at the end of the duel either way. A void duel refunds it.",
        ],
      };
    case "interceptor":
      return {
        name: ITEM_NAMES.interceptor,
        short: "Secretly call who wins the duel. Right: steal from the loser. Wrong: pay the winner.",
        when: "Use during betting, if you are not one of the duelists.",
        lines: [
          `Costs ${c(costs.interceptor)}.`,
          "Secretly pick who wins the duel. It settles at the results.",
          `Correct: you steal ${r.interceptMultiplier}x the duel wager from the loser, at least ${c(r.interceptMin)} (at most what the loser has).`,
          `Wrong: you pay ${c(r.interceptPenalty)} to the winner (at most what you have).`,
          "One Interceptor per duel per player. A void duel refunds it.",
        ],
      };
  }
}
