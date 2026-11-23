import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BuilderHome } from "../components/builder/BuilderHome";
import { HeadbandsAIGuide } from "../components/builder/HeadbandsAIGuide";
import { HeadbandsVisualEditor } from "../components/builder/HeadbandsVisualEditor";
import { JeopardyAIGuide } from "../components/builder/JeopardyAIGuide";
import { JeopardyVisualEditor } from "../components/builder/JeopardyVisualEditor";
import { AmbientBackground, type BackdropSpec } from "../components/dashboard/AmbientBackground";
import { Dashboard } from "../components/dashboard/Dashboard";
import { BUILD_TILE_ID, buildRailItems, type RailItem } from "../components/dashboard/railItems";
import type { ImportSeed } from "../components/import/GameImporter";
import { ImportScreen } from "../components/import/ImportScreen";
import type { LoadedGame } from "../components/import/loadGame";
import { useSpatialNav } from "../components/navigation/spatialNav";
import { DevicePrompt, StartupIntro } from "../components/intro/Intro";
import { SoundToggle } from "../components/ui/SoundToggle";
import { installHoverSounds, setSoundTheme } from "../lib/audio";
import { installClickSounds, playSfx } from "../lib/sfx";
import { SettingsPanel } from "../components/settings/SettingsPanel";
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
import { JeopardyGame } from "../games/jeopardy/JeopardyGame";
import type { TeamSetup } from "../games/jeopardy/jeopardyEngine";
import { JeopardySetup } from "../games/jeopardy/JeopardySetup";
import { getEngine } from "../games/registry";
import { forgetGame, loadDevice, loadLastTile, loadRecent, loadTheme, rememberGame, saveDevice, saveLastTile, saveTheme, type Device, type Theme } from "./storage";

type Screen =
  | { name: "dashboard" }
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

/** Each game's screens use its own track; everything else uses the Headbands track. */
function backdropTheme(screen: Screen, tileGameType: string): "jeopardy" | "headbands" | "liar" {
  if (screen.name === "dashboard") return tileGameType === "jeopardy" ? "jeopardy" : tileGameType === "liar" ? "liar" : "headbands";
  if (screen.name === "setup" || screen.name === "play") return "jeopardy";
  if (screen.name.startsWith("liar")) return "liar";
  return "headbands";
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
    if (code || liarCode || rpgCode) history.replaceState(null, "", window.location.pathname + window.location.search);
    if (rpgCode) return [{ name: "dashboard" }, { name: "rpgJoin", code: rpgCode }];
    if (liarCode) return [{ name: "dashboard" }, { name: "liarJoin", code: liarCode }];
    return code ? [{ name: "dashboard" }, { name: "hbJoin", code }] : [{ name: "dashboard" }];
  });
  /** The online lobby this device is hosting, closed when the host goes home. */
  const hostedLobby = useRef<string | null>(null);
  const hostedLiar = useRef<string | null>(null);
  const hostedRpg = useRef<string | null>(null);
  /** A destructive navigation waiting for confirmation. */
  const [pending, setPending] = useState<{ title: string; text: string; label: string; run: () => void } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState<LoadedGame | null>(null);
  const [draftBackdrop, setDraftBackdrop] = useState<BackdropSpec | null>(null);
  const [buildType, setBuildType] = useState(JEOPARDY_TYPE);

  const items = useMemo(() => buildRailItems(recent), [recent]);
  const [selectedId, setSelectedId] = useState(() => {
    const last = loadLastTile();
    return items.some((i) => i.id === last) ? last! : items[0].id;
  });
  const selected = items.find((i) => i.id === selectedId) ?? items[0];
  const screen = stack[stack.length - 1];

  const push = useCallback((next: Screen) => setStack((s) => [...s, next]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const home = useCallback(() => {
    if (hostedLobby.current) void closeLobby(hostedLobby.current).catch(() => undefined);
    hostedLobby.current = null;
    if (hostedLiar.current) void closeLiarLobby(hostedLiar.current).catch(() => undefined);
    hostedLiar.current = null;
    if (hostedRpg.current) void closeRpgLobby(hostedRpg.current).catch(() => undefined);
    hostedRpg.current = null;
    setLoaded(null);
    setStack([{ name: "dashboard" }]);
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    saveLastTile(id);
  }, []);

  const changeTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-shift");
    root.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#F2F4F8" : "#080B12");
    window.setTimeout(() => root.classList.remove("theme-shift"), 400);
    setTheme(next);
    saveTheme(next);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
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
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".tile.is-active")?.focus({ preventScroll: true }));
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
  if (screen.name === "editor") backdrop = draftBackdrop ?? buildBackdrop;
  else if (screen.name === "builder") backdrop = buildBackdrop;
  else if (screen.name === "ai") backdrop = loaded ? backdropForGame(loaded) : buildBackdrop;
  else if (screen.name === "setup" || screen.name === "play" || screen.name === "hbSetup" || screen.name === "hbPlay" || screen.name === "liarSetup" || screen.name === "liarPlay") backdrop = backdropForGame(screen.game);
  else if (screen.name === "rpgLobby" || screen.name === "rpgOnline") backdrop = backdropForGame({ file: screen.file, filename: "lobby", text: "", warnings: [] });
  else if (screen.name === "liarLobby" || screen.name === "liarOnline") backdrop = backdropForGame({ file: screen.file, filename: "lobby", text: "", warnings: [] });
  else if (screen.name === "hbLobby") backdrop = backdropForGame({ file: screen.base, filename: "lobby", text: "", warnings: [] });
  else if (screen.name === "import" && loaded) backdrop = backdropForGame(loaded);

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

  /** Asks before leaving a game in progress. */
  const guard = (title: string, text: string, label: string, run: () => void) => () => setPending({ title, text, label, run });
  const exitGame = guard("Leave this game?", "The match in progress ends and scores are lost.", "Leave game", home);

  return (
    <>
      <AmbientBackground spec={backdrop} dim={screen.name !== "dashboard"} />

      {screen.name === "dashboard" && (
        <Dashboard
          items={items}
          selectedId={selected.id}
          onSelect={select}
          onLoad={(gameType) => push({ name: "import", gameType })}
          onBuild={toBuilder}
          onJoin={lobbiesAvailable() ? () => push({ name: "hbJoin", code: null }) : undefined}
          onHostOnline={lobbiesAvailable() ? () => push({ name: "rpgLobby", file: blankRpgFile(), code: null }) : undefined}
          onJoinOnline={lobbiesAvailable() ? () => push({ name: "rpgJoin", code: null }) : undefined}
          onOpenRecent={openRecent}
          onForgetRecent={forgetRecent}
          onSettings={() => setSettingsOpen(true)}
        />
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

      {pending && <ConfirmDialog title={pending.title} text={pending.text} confirmLabel={pending.label} danger onConfirm={pending.run} onClose={() => setPending(null)} />}
      <SoundToggle />
      <StartupIntro />
      {device === null && <DevicePrompt onChoose={chooseDevice} />}
      {settingsOpen && <SettingsPanel theme={theme} onTheme={changeTheme} device={device ?? (document.documentElement.dataset.device as Device) ?? "desktop"} onDevice={chooseDevice} onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
