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
import { SettingsPanel } from "../components/settings/SettingsPanel";
import type { BackgroundPreset } from "../game-files/schema/common";
import { HEADBANDS_TYPE, blankHeadbandsFile, type HeadbandsFile } from "../game-files/schema/headbands";
import { JEOPARDY_TYPE, type JeopardyFile } from "../game-files/schema/jeopardy";
import { HeadbandsGame } from "../games/headbands/HeadbandsGame";
import { HeadbandsJoin } from "../games/headbands/HeadbandsJoin";
import { HeadbandsLobby } from "../games/headbands/HeadbandsLobby";
import { HeadbandsSetup, type HeadbandsStart } from "../games/headbands/HeadbandsSetup";
import { closeLobby, codeFromHash, lobbiesAvailable } from "../games/headbands/lobby";
import { JeopardyGame } from "../games/jeopardy/JeopardyGame";
import type { TeamSetup } from "../games/jeopardy/jeopardyEngine";
import { JeopardySetup } from "../games/jeopardy/JeopardySetup";
import { getEngine } from "../games/registry";
import { forgetGame, loadLastTile, loadRecent, loadTheme, rememberGame, saveLastTile, saveTheme, type Theme } from "./storage";

type Screen =
  | { name: "dashboard" }
  | { name: "import"; gameType: string; seed?: ImportSeed }
  | { name: "setup"; game: LoadedGame<JeopardyFile> }
  | { name: "play"; game: LoadedGame<JeopardyFile>; teams: TeamSetup[]; allowNegativeScores: boolean; timeLimitSeconds: number }
  | { name: "hbSetup"; game: LoadedGame<HeadbandsFile> }
  | { name: "hbPlay"; game: LoadedGame<HeadbandsFile>; start: HeadbandsStart; lobbyCode?: string }
  | { name: "hbLobby"; base: HeadbandsFile; code: string | null }
  | { name: "hbJoin"; code: string | null }
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

export function App() {
  useSpatialNav();

  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [recent, setRecent] = useState(loadRecent);
  const [stack, setStack] = useState<Screen[]>(() => {
    // A phone opened from a lobby's QR code or link goes straight to joining.
    const code = lobbiesAvailable() ? codeFromHash(window.location.hash) : null;
    if (code) history.replaceState(null, "", window.location.pathname + window.location.search);
    return code ? [{ name: "dashboard" }, { name: "hbJoin", code }] : [{ name: "dashboard" }];
  });
  /** The online lobby this device is hosting, closed when the host goes home. */
  const hostedLobby = useRef<string | null>(null);
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
      if (file.gameType === HEADBANDS_TYPE) push({ name: "hbSetup", game: game as LoadedGame<HeadbandsFile> });
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
  else if (screen.name === "setup" || screen.name === "play" || screen.name === "hbSetup" || screen.name === "hbPlay") backdrop = backdropForGame(screen.game);
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
          onLobby={screen.gameType === HEADBANDS_TYPE && lobbiesAvailable() ? () => push({ name: "hbLobby", base: blankHeadbandsFile(), code: null }) : undefined}
          onJoin={screen.gameType === HEADBANDS_TYPE && lobbiesAvailable() ? () => push({ name: "hbJoin", code: null }) : undefined}
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
      {screen.name === "hbJoin" && <HeadbandsJoin code={screen.code} onExit={home} />}
      {screen.name === "hbPlay" && <HeadbandsGame key={stack.length} file={screen.game.file} start={screen.start} lobbyCode={screen.lobbyCode} onAgain={pop} onExit={home} />}
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

      {settingsOpen && <SettingsPanel theme={theme} onTheme={changeTheme} onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
