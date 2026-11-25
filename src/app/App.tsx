import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BuilderHome } from "../components/builder/BuilderHome";
import { HeadbandsAIGuide } from "../components/builder/HeadbandsAIGuide";
import { HeadbandsVisualEditor } from "../components/builder/HeadbandsVisualEditor";
import { JeopardyAIGuide } from "../components/builder/JeopardyAIGuide";
import { JeopardyVisualEditor } from "../components/builder/JeopardyVisualEditor";
import { AmbientBackground, type BackdropSpec } from "../components/dashboard/AmbientBackground";
import { GameDetail } from "../components/launcher/GameDetail";
import { LauncherHome, LauncherShell, type Section } from "../components/launcher/Launcher";
import { BUILD_TILE_ID, buildRailItems, type RailItem } from "../components/dashboard/railItems";
import type { ImportSeed } from "../components/import/GameImporter";
import { ImportScreen } from "../components/import/ImportScreen";
import type { LoadedGame } from "../components/import/loadGame";
import { useSpatialNav } from "../components/navigation/spatialNav";
import { DevicePrompt, StartupIntro } from "../components/intro/Intro";
import { CornerControls } from "../components/ui/CornerControls";
import { installHoverSounds, isSoundTheme, setSoundTheme, type SoundTheme } from "../lib/audio";
import { installClickSounds, playSfx } from "../lib/sfx";
import { withScreenTransition } from "../lib/screenTransition";
import { installRipples } from "../lib/ripple";
import { SettingsPage } from "../components/settings/SettingsPanel";
import type { BackgroundPreset } from "../game-files/schema/common";
import { LIAR_TYPE, blankLiarFile, type LiarFile } from "../game-files/schema/liar";
import { RPG_TYPE, blankRpgFile, type RpgFile } from "../game-files/schema/rpg";
import type { RpgSettings } from "../game-files/schema/rpg";
import { HEADBANDS_TYPE, blankHeadbandsFile, type HeadbandsFile } from "../game-files/schema/headbands";
import { JEOPARDY_TYPE, type JeopardyFile } from "../game-files/schema/jeopardy";
import { HeadbandsGame } from "../games/headbands/HeadbandsGame";
import { HeadbandsJoin } from "../games/headbands/HeadbandsJoin";
import { HeadbandsLobby } from "../games/headbands/HeadbandsLobby";
import { HeadbandsSetup, type HeadbandsStart } from "../games/headbands/HeadbandsSetup";
import { closeLobby, codeFromHash, lobbiesAvailable } from "../games/headbands/lobby";
import { LiarGame } from "../games/liar/LiarGame";
import { LiarSetup } from "../games/liar/LiarSetup";
import type { Options as LiarOptions, Player as LiarPlayer } from "../games/liar/liarEngine";
import { LiarJoin } from "../games/liar/LiarJoin";
import { LiarLobby } from "../games/liar/LiarLobby";
import { LiarOnlineGame } from "../games/liar/LiarOnlineGame";
import { closeLiarLobby, liarCodeFromHash, liarLobbyExists } from "../games/liar/liarLobby";
import { RpgJoin } from "../games/rpg/RpgJoin";
import { RpgLobby } from "../games/rpg/RpgLobby";
import { RpgOnlineGame } from "../games/rpg/RpgOnlineGame";
import { closeRpgLobby, rpgCodeFromHash, rpgLobbyExists } from "../games/rpg/rpgLobby";
import { ConfirmDialog } from "../components/ui/Dialog";
import { PartyHost } from "../games/party/PartyHost";
import { PartyJoin } from "../games/party/PartyJoin";
import { PartyLobby } from "../games/party/PartyLobby";
import { partyByKind, partyByType } from "../games/party/partyGames";
import { closePartyRoom, findPartyRoom, partyCodeFromHash, type PartyKind } from "../games/party/partyRoom";
import { blankPartyFile } from "../game-files/schema/party";
import { JeopardyGame } from "../games/jeopardy/JeopardyGame";
import type { TeamSetup } from "../games/jeopardy/jeopardyEngine";
import { JeopardySetup } from "../games/jeopardy/JeopardySetup";
import { getEngine } from "../games/registry";
import { forgetGame, loadDevice, loadLastTile, loadRecent, loadTheme, rememberGame, saveDevice, saveLastTile, saveTheme, type Device, type Theme } from "./storage";
import { themeDef } from "./themes";

type Screen =
  | { name: "dashboard" }
  | { name: "game"; gameType: string }
  | { name: "import"; gameType: string; seed?: ImportSeed }
  | { name: "setup"; game: LoadedGame<JeopardyFile> }
  | { name: "play"; game: LoadedGame<JeopardyFile>; teams: TeamSetup[]; allowNegativeScores: boolean; timeLimitSeconds: number }
  | { name: "hbSetup"; game: LoadedGame<HeadbandsFile> }
  | { name: "hbPlay"; game: LoadedGame<HeadbandsFile>; start: HeadbandsStart; lobbyCode?: string }
  | { name: "hbLobby"; base: HeadbandsFile; code: string | null }
  | { name: "hbJoin"; code: string | null }
  | { name: "liarSetup"; game: LoadedGame<LiarFile> }
  | { name: "liarPlay"; game: LoadedGame<LiarFile>; names: string[]; options: LiarOptions }
  | { name: "liarLobby"; file: LiarFile; code: string | null; defaults?: Partial<LiarOptions> }
  | { name: "liarOnline"; file: LiarFile; code: string; players: LiarPlayer[]; options: LiarOptions }
  | { name: "liarJoin"; code: string | null; playerName?: string }
  | { name: "rpgLobby"; file: RpgFile; code: string | null }
  | { name: "rpgOnline"; file: RpgFile; code: string; players: Array<{ id: string; name: string }>; settings: RpgSettings }
  | { name: "rpgJoin"; code: string | null; playerName?: string }
  | { name: "partyLobby"; kind: PartyKind; code: string | null }
  | { name: "partyOnline"; kind: PartyKind; code: string; players: Array<{ id: string; name: string }>; settings: unknown }
  | { name: "partyJoin"; kind: PartyKind; code: string | null; playerName?: string }
  | { name: "builder" }
  | { name: "editor"; gameType: string }
  | { name: "ai"; gameType: string };

function backdropForGame(game: LoadedGame): BackdropSpec {
  const { metadata, appearance } = game.file;
  return {
    key: `loaded:${game.filename}:${metadata.title}:${appearance.accentColor}:${appearance.backgroundPreset}`,
    cover: metadata.coverImage,
    accent: appearance.accentColor,
    preset: appearance.backgroundPreset,
    artwork: getEngine(game.file.gameType)?.artwork ?? null,
  };
}

/** Each game's screens use its own track; anything else uses the Headbands track. */
function backdropTheme(screen: Screen, tileGameType: string): SoundTheme {
  const pick = (t: string): SoundTheme => (isSoundTheme(t) ? t : "headbands");
  if (screen.name === "dashboard") return pick(tileGameType);
  if (screen.name === "game") return pick(screen.gameType);
  if (screen.name === "setup" || screen.name === "play") return "jeopardy";
  if (screen.name.startsWith("liar")) return "liar";
  if (screen.name.startsWith("rpg")) return "rpg";
  if (screen.name.startsWith("party")) return pick(partyByKind((screen as { kind: PartyKind }).kind).gameType);
  return "headbands";
}

/** Each theme is a base palette plus an optional skin; see themes.ts. */
function applyTheme(t: Theme) {
  const root = document.documentElement;
  const def = themeDef(t);
  root.dataset.theme = def.base;
  if (def.skin) root.dataset.skin = def.skin;
  else delete root.dataset.skin;
}

export function App() {
  useSpatialNav();

  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [recent, setRecent] = useState(loadRecent);
  const [stack, setStack] = useState<Screen[]>(() => {
    // A phone opened from a lobby's QR code or link goes straight to joining.
    const code = lobbiesAvailable() ? codeFromHash(window.location.hash) : null;
    const liarCode = lobbiesAvailable() ? liarCodeFromHash(window.location.hash) : null;
    const rpgCode = lobbiesAvailable() ? rpgCodeFromHash(window.location.hash) : null;
    const party = lobbiesAvailable() ? partyCodeFromHash(window.location.hash) : null;
    if (code || liarCode || rpgCode || party) history.replaceState(null, "", window.location.pathname + window.location.search);
    if (party) return [{ name: "dashboard" }, { name: "partyJoin", kind: party.kind, code: party.code }];
    if (rpgCode) return [{ name: "dashboard" }, { name: "rpgJoin", code: rpgCode }];
    if (liarCode) return [{ name: "dashboard" }, { name: "liarJoin", code: liarCode }];
    return code ? [{ name: "dashboard" }, { name: "hbJoin", code }] : [{ name: "dashboard" }];
  });
  /** The online lobby this device is hosting, closed when the host goes home. */
  const hostedLobby = useRef<string | null>(null);
  const hostedLiar = useRef<string | null>(null);
  const hostedRpg = useRef<string | null>(null);
  const hostedParty = useRef<{ kind: PartyKind; code: string } | null>(null);
  /** A destructive navigation waiting for confirmation. */
  const [pending, setPending] = useState<{ title: string; text: string; label: string; run: () => void } | null>(null);
  const [loaded, setLoaded] = useState<LoadedGame | null>(null);
  const [draftBackdrop, setDraftBackdrop] = useState<BackdropSpec | null>(null);
  const [buildType, setBuildType] = useState(JEOPARDY_TYPE);
  const [section, setSection] = useState<Section>("home");

  const items = useMemo(() => buildRailItems(recent), [recent]);
  const [selectedId, setSelectedId] = useState(() => {
    const last = loadLastTile();
    return items.some((i) => i.id === last) ? last! : items[0].id;
  });
  const selected = items.find((i) => i.id === selectedId) ?? items[0];
  const screen = stack[stack.length - 1];

  const push = useCallback((next: Screen, morph?: string) => withScreenTransition("forward", () => setStack((s) => [...s, next]), { morph }), []);
  const pop = useCallback((morph?: string) => withScreenTransition("back", () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), { morph: typeof morph === "string" ? morph : undefined }), []);
  const home = useCallback(() => {
    if (hostedLobby.current) void closeLobby(hostedLobby.current).catch(() => undefined);
    hostedLobby.current = null;
    if (hostedLiar.current) void closeLiarLobby(hostedLiar.current).catch(() => undefined);
    hostedLiar.current = null;
    if (hostedRpg.current) void closeRpgLobby(hostedRpg.current).catch(() => undefined);
    hostedRpg.current = null;
    if (hostedParty.current) void closePartyRoom(hostedParty.current.kind, hostedParty.current.code).catch(() => undefined);
    hostedParty.current = null;
    withScreenTransition("back", () => {
      setLoaded(null);
      setStack([{ name: "dashboard" }]);
    });
  }, []);

  /** Sidebar moves: slide up or down by nav order; leaving a game page morphs it back into its tile. */
  const goSection = useCallback(
    (next: Section) => {
      const order: Section[] = ["home", "library", "settings"];
      const top = stack[stack.length - 1];
      if (top.name === "dashboard" && next === section) return;
      const dir = top.name !== "dashboard" ? "back" : order.indexOf(next) > order.indexOf(section) ? "down" : "up";
      withScreenTransition(
        dir,
        () => {
          setSection(next);
          if (top.name !== "dashboard") setStack([{ name: "dashboard" }]);
        },
        { morph: top.name === "game" ? `game:${top.gameType}` : undefined },
      );
    },
    [stack, section],
  );

  const select = useCallback((id: string) => {
    setSelectedId(id);
    saveLastTile(id);
  }, []);

  const changeTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    const def = themeDef(next);
    if (root.dataset.theme === def.base && (root.dataset.skin ?? "") === (def.skin ?? "")) return;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", def.themeColor);
    saveTheme(next);
    // A circular wipe from the toggle. When no view transition runs, the update happens
    // synchronously, so the colour cross-fade class must already be on.
    root.classList.add("theme-shift");
    const wiped = withScreenTransition("theme", () => {
      applyTheme(next);
      setTheme(next);
    });
    // The wipe applies the theme later, off a snapshot; a cross-fade then would fight it.
    if (wiped) root.classList.remove("theme-shift");
    else window.setTimeout(() => root.classList.remove("theme-shift"), 400);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Layout preference: asked once, then remembered. Defaults to a guess so the first paint is sensible.
  const [device, setDevice] = useState<Device | null>(loadDevice);
  useEffect(() => {
    document.documentElement.dataset.device = device ?? (window.matchMedia?.("(max-width: 760px)").matches ? "mobile" : "desktop");
  }, [device]);
  const chooseDevice = useCallback((d: Device) => {
    setDevice(d);
    saveDevice(d);
  }, []);

  useEffect(() => installHoverSounds(), []);
  useEffect(() => installClickSounds(), []);
  useEffect(() => installRipples(), []);
  // A soft transition whenever the screen changes.
  const screenName = stack[stack.length - 1].name;
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    playSfx("navigate");
  }, [screenName, stack.length]);

  /** A validated file is about to be hosted: remember it, then set up the session. */
  const host = useCallback(
    (game: LoadedGame) => {
      const file = game.file;
      const list = rememberGame({
        gameType: file.gameType,
        filename: game.filename,
        title: file.metadata.title,
        description: file.metadata.description,
        author: file.metadata.author,
        accentColor: file.appearance.accentColor,
        backgroundPreset: file.appearance.backgroundPreset,
        coverImage: file.metadata.coverImage,
        summary: getEngine(file.gameType)?.summarize(file) ?? "",
        text: game.text,
      });
      setRecent(list);
      setLoaded(game);
      if (file.gameType === RPG_TYPE) push({ name: "rpgLobby", file: file as RpgFile, code: null });
      else if (file.gameType === LIAR_TYPE) push({ name: "liarSetup", game: game as LoadedGame<LiarFile> });
      else if (file.gameType === HEADBANDS_TYPE) push({ name: "hbSetup", game: game as LoadedGame<HeadbandsFile> });
      else push({ name: "setup", game: game as LoadedGame<JeopardyFile> });
    },
    [push],
  );

  const openRecent = useCallback(
    (item: RailItem) => {
      if (!item.recent) return;
      push({ name: "import", gameType: item.gameType, seed: { filename: item.recent.filename, text: item.recent.text } });
    },
    [push],
  );

  const forgetRecent = useCallback(
    (item: RailItem) => {
      if (!item.recent) return;
      const list = forgetGame(item.recent.id);
      setRecent(list);
      const next = buildRailItems(list);
      const index = Math.min(items.indexOf(item), next.length - 1);
      select(next[index].id);
      // Keep a visible cursor after the tile disappears.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".lib-tile.is-active")?.focus({ preventScroll: true }));
    },
    [items, select],
  );

  const onDraftAppearance = useCallback((a: { accentColor: string; backgroundPreset: BackgroundPreset; coverImage: string | null }) => {
    setDraftBackdrop({
      key: `draft:${a.accentColor}:${a.backgroundPreset}:${a.coverImage ? a.coverImage.length : 0}`,
      cover: a.coverImage,
      accent: a.accentColor,
      preset: a.backgroundPreset,
      artwork: null,
    });
  }, []);

  const buildBackdrop = items.find((i) => i.id === BUILD_TILE_ID)!.backdrop;
  let backdrop: BackdropSpec = selected.backdrop;
  if (screen.name === "game") backdrop = items.find((i) => i.kind === "engine" && i.gameType === screen.gameType)?.backdrop ?? selected.backdrop;
  else if (screen.name === "editor") backdrop = draftBackdrop ?? buildBackdrop;
  else if (screen.name === "builder") backdrop = buildBackdrop;
  else if (screen.name === "ai") backdrop = loaded ? backdropForGame(loaded) : buildBackdrop;
  else if (screen.name === "setup" || screen.name === "play" || screen.name === "hbSetup" || screen.name === "hbPlay" || screen.name === "liarSetup" || screen.name === "liarPlay") backdrop = backdropForGame(screen.game);
  else if (screen.name === "rpgJoin") backdrop = backdropForGame({ file: blankRpgFile(), filename: "lobby", text: "", warnings: [] });
  else if (screen.name === "rpgLobby" || screen.name === "rpgOnline") backdrop = backdropForGame({ file: screen.file, filename: "lobby", text: "", warnings: [] });
  else if (screen.name === "liarLobby" || screen.name === "liarOnline") backdrop = backdropForGame({ file: screen.file, filename: "lobby", text: "", warnings: [] });
  else if (screen.name === "hbLobby") backdrop = backdropForGame({ file: screen.base, filename: "lobby", text: "", warnings: [] });
  else if (screen.name === "partyLobby" || screen.name === "partyOnline" || screen.name === "partyJoin") {
    const def = partyByKind(screen.kind);
    backdrop = { ...backdropForGame({ file: blankPartyFile(def.gameType, def.title, def.accent, {}), filename: "lobby", text: "", warnings: [] }), preset: getEngine(def.gameType)?.appearance.backgroundPreset ?? "aurora" };
  } else if (screen.name === "import" && loaded) backdrop = backdropForGame(loaded);

  const toBuilder = useCallback(
    (gameType?: string) => {
      setLoaded(null);
      if (gameType && getEngine(gameType)?.hasBuilder) setBuildType(gameType);
      push({ name: "builder" });
    },
    [push],
  );
  const back = useCallback(() => {
    setLoaded(null);
    pop();
  }, [pop]);

  setSoundTheme(backdropTheme(screen, selected.gameType));

  // The launcher keeps the full 3D backdrop; every other screen is calmer.
  const focusScene = screen.name !== "dashboard" && screen.name !== "game";
  useEffect(() => {
    document.documentElement.dataset.scene = focusScene ? "focus" : "launcher";
  }, [focusScene]);

  /** Asks before leaving a game in progress. */
  const guard = (title: string, text: string, label: string, run: () => void) => () => setPending({ title, text, label, run });
  const exitGame = guard("Leave this game?", "The match in progress ends and scores are lost.", "Leave game", home);

  return (
    <>
      <AmbientBackground spec={backdrop} dim={screen.name !== "game"} paused={screen.name !== "dashboard" && screen.name !== "game"} />
      <div className="app-stage" data-screen={screen.name}>

      {(screen.name === "dashboard" || screen.name === "game") && (
        <LauncherShell
          section={screen.name === "dashboard" ? section : null}
          accent={screen.name === "game" ? (getEngine(screen.gameType)?.appearance.accentColor ?? selected.backdrop.accent) : selected.backdrop.accent}
          onSection={goSection}
          onSettings={() => goSection("settings")}
        >
          {screen.name === "dashboard" && section === "settings" ? (
            <SettingsPage theme={theme} onTheme={changeTheme} device={device ?? (document.documentElement.dataset.device as Device) ?? "desktop"} onDevice={chooseDevice} />
          ) : screen.name === "dashboard" ? (
            <LauncherHome
              section={section}
              items={items}
              selectedId={selected.id}
              onSelect={select}
              onOpen={(item) => {
                if (item.kind === "engine") push({ name: "game", gameType: item.gameType }, `game:${item.gameType}`);
                else if (item.kind === "build") toBuilder();
                else if (item.kind === "file") openRecent(item);
              }}
              onJoin={lobbiesAvailable() ? () => push({ name: "hbJoin", code: null }) : undefined}
              onForget={forgetRecent}
              onSection={goSection}
            />
          ) : (
            <GameDetail
              key={screen.gameType}
              gameType={screen.gameType}
              onBack={() => pop(`game:${screen.gameType}`)}
              onLoad={(gameType) => push({ name: "import", gameType })}
              onBuild={(gameType) => toBuilder(gameType)}
              onJoin={lobbiesAvailable() ? () => push({ name: "hbJoin", code: null }) : undefined}
              onHostOnline={
                lobbiesAvailable()
                  ? (gameType) => {
                      const def = partyByType(gameType);
                      push(def ? { name: "partyLobby", kind: def.kind, code: null } : { name: "rpgLobby", file: blankRpgFile(), code: null });
                    }
                  : undefined
              }
              onJoinOnline={
                lobbiesAvailable()
                  ? (gameType) => {
                      const def = partyByType(gameType);
                      push(def ? { name: "partyJoin", kind: def.kind, code: null } : { name: "rpgJoin", code: null });
                    }
                  : undefined
              }
            />
          )}
        </LauncherShell>
      )}
      {screen.name === "import" && (
        <ImportScreen
          key={stack.length}
          gameType={screen.gameType}
          seed={screen.seed}
          onBack={back}
          onHost={host}
          onBuilder={() => toBuilder(screen.gameType)}
          onLoaded={setLoaded}
          onLobby={!lobbiesAvailable() ? undefined : screen.gameType === HEADBANDS_TYPE ? () => push({ name: "hbLobby", base: blankHeadbandsFile(), code: null }) : screen.gameType === LIAR_TYPE ? () => push({ name: "liarLobby", file: blankLiarFile(), code: null }) : undefined}
          onlineText={screen.gameType === LIAR_TYPE ? "Players join on their phones, write their statements privately and vote from their own device." : undefined}
          onJoin={!lobbiesAvailable() ? undefined : screen.gameType === HEADBANDS_TYPE ? () => push({ name: "hbJoin", code: null }) : screen.gameType === LIAR_TYPE ? () => push({ name: "liarJoin", code: null }) : undefined}
        />
      )}
      {screen.name === "setup" && (
        <JeopardySetup
          game={screen.game}
          onBack={pop}
          onStart={(teams, allowNegativeScores, timeLimitSeconds) => push({ name: "play", game: screen.game, teams, allowNegativeScores, timeLimitSeconds })}
        />
      )}
      {screen.name === "play" && (
        <JeopardyGame file={screen.game.file} teams={screen.teams} allowNegativeScores={screen.allowNegativeScores} timeLimitSeconds={screen.timeLimitSeconds} onExit={home} />
      )}
      {screen.name === "hbSetup" && (
        <HeadbandsSetup
          game={screen.game}
          onBack={pop}
          onStart={(start) => push({ name: "hbPlay", game: screen.game, start })}
          onLobby={lobbiesAvailable() ? () => push({ name: "hbLobby", base: screen.game.file, code: null }) : undefined}
        />
      )}
      {screen.name === "hbLobby" && (
        <HeadbandsLobby
          key={stack.length}
          base={screen.base}
          code={screen.code}
          onCode={(code) => {
            hostedLobby.current = code;
            setStack((s) => s.map((x, i) => (i === s.length - 1 && x.name === "hbLobby" ? { ...x, code } : x)));
          }}
          onBack={() => {
            hostedLobby.current = null;
            pop();
          }}
          onStart={(file, start) => push({ name: "hbPlay", game: { file, filename: "lobby", text: "", warnings: [] }, start, lobbyCode: hostedLobby.current ?? undefined })}
        />
      )}
      {screen.name === "hbJoin" && (
        <HeadbandsJoin
          code={screen.code}
          onExit={home}
          onOtherRoom={async (code, playerName) => {
            if (await liarLobbyExists(code)) {
              setStack((s) => [...s.slice(0, -1), { name: "liarJoin", code, playerName }]);
              return true;
            }
            if (await rpgLobbyExists(code)) {
              setStack((s) => [...s.slice(0, -1), { name: "rpgJoin", code, playerName }]);
              return true;
            }
            const kind = await findPartyRoom(code);
            if (kind) {
              setStack((s) => [...s.slice(0, -1), { name: "partyJoin", kind, code, playerName }]);
              return true;
            }
            return false;
          }}
        />
      )}
      {screen.name === "rpgJoin" && <RpgJoin code={screen.code} name={screen.playerName} onExit={home} />}
      {screen.name === "rpgLobby" && (
        <RpgLobby
          key={stack.length}
          file={screen.file}
          code={screen.code}
          onCode={(code) => {
            hostedRpg.current = code;
            setStack((s) => s.map((x, i) => (i === s.length - 1 && x.name === "rpgLobby" ? { ...x, code } : x)));
          }}
          onBack={() => {
            hostedRpg.current = null;
            pop();
          }}
          onStart={(players, settings) => screen.code && push({ name: "rpgOnline", file: screen.file, code: screen.code, players, settings })}
        />
      )}
      {screen.name === "rpgOnline" && <RpgOnlineGame key={stack.length} file={screen.file} code={screen.code} players={screen.players} settings={screen.settings} onAgain={pop} onExit={home} />}
      {screen.name === "partyJoin" && <PartyJoin key={`${screen.kind}-${stack.length}`} def={partyByKind(screen.kind)} code={screen.code} name={screen.playerName} onExit={home} />}
      {screen.name === "partyLobby" && (
        <PartyLobby
          key={`${screen.kind}-${stack.length}`}
          def={partyByKind(screen.kind)}
          code={screen.code}
          onCode={(code) => {
            hostedParty.current = { kind: screen.kind, code };
            setStack((s) => s.map((x, i) => (i === s.length - 1 && x.name === "partyLobby" ? { ...x, code } : x)));
          }}
          onBack={() => {
            hostedParty.current = null;
            pop();
          }}
          onStart={(players, settings) => screen.code && push({ name: "partyOnline", kind: screen.kind, code: screen.code, players, settings })}
        />
      )}
      {screen.name === "partyOnline" && <PartyHost key={stack.length} def={partyByKind(screen.kind)} code={screen.code} players={screen.players} settings={screen.settings} onAgain={pop} onExit={home} />}
      {screen.name === "liarJoin" && <LiarJoin code={screen.code} name={screen.playerName} onExit={home} />}
      {screen.name === "liarLobby" && (
        <LiarLobby
          key={stack.length}
          file={screen.file}
          code={screen.code}
          defaults={screen.defaults}
          onCode={(code) => {
            hostedLiar.current = code;
            setStack((s) => s.map((x, i) => (i === s.length - 1 && x.name === "liarLobby" ? { ...x, code } : x)));
          }}
          onBack={() => {
            hostedLiar.current = null;
            pop();
          }}
          onStart={(players, options) => screen.code && push({ name: "liarOnline", file: screen.file, code: screen.code, players, options })}
        />
      )}
      {screen.name === "liarOnline" && <LiarOnlineGame key={stack.length} file={screen.file} code={screen.code} players={screen.players} options={screen.options} onAgain={pop} onExit={home} />}
      {screen.name === "hbPlay" && <HeadbandsGame key={stack.length} file={screen.game.file} start={screen.start} lobbyCode={screen.lobbyCode} onAgain={pop} onExit={home} />}
      {screen.name === "liarSetup" && (
        <LiarSetup
          game={screen.game}
          onBack={pop}
          onStart={(names, options) => push({ name: "liarPlay", game: screen.game, names, options })}
          onLobby={lobbiesAvailable() ? (options) => push({ name: "liarLobby", file: screen.game.file, code: null, defaults: options }) : undefined}
        />
      )}
      {screen.name === "liarPlay" && <LiarGame key={stack.length} file={screen.game.file} names={screen.names} options={screen.options} onAgain={pop} onExit={exitGame} />}
      {screen.name === "builder" && (
        <BuilderHome
          gameType={buildType}
          onGameType={setBuildType}
          onBack={back}
          onEditor={() => push({ name: "editor", gameType: buildType })}
          onAiBuilder={() => push({ name: "ai", gameType: buildType })}
        />
      )}
      {screen.name === "editor" &&
        (screen.gameType === HEADBANDS_TYPE ? (
          <HeadbandsVisualEditor onBack={pop} onHost={(text, filename) => push({ name: "import", gameType: HEADBANDS_TYPE, seed: { filename, text } })} onAppearance={onDraftAppearance} />
        ) : (
          <JeopardyVisualEditor onBack={pop} onHost={(text, filename) => push({ name: "import", gameType: JEOPARDY_TYPE, seed: { filename, text } })} onAppearance={onDraftAppearance} />
        ))}
      {screen.name === "ai" &&
        (screen.gameType === HEADBANDS_TYPE ? <HeadbandsAIGuide onBack={back} onHost={host} onLoaded={setLoaded} /> : <JeopardyAIGuide onBack={back} onHost={host} onLoaded={setLoaded} />)}

      </div>
      {pending && <ConfirmDialog title={pending.title} text={pending.text} confirmLabel={pending.label} danger onConfirm={pending.run} onClose={() => setPending(null)} />}
      <CornerControls docked={screen.name === "dashboard" || screen.name === "game"} />
      <StartupIntro />
      {device === null && <DevicePrompt onChoose={chooseDevice} />}
    </>
  );
}
