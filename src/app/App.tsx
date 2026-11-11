import { useCallback, useEffect, useMemo, useState } from "react";
import { BuilderHome } from "../components/builder/BuilderHome";
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
import { JEOPARDY_TYPE, countClues, type JeopardyFile } from "../game-files/schema/jeopardy";
import { JeopardyGame } from "../games/jeopardy/JeopardyGame";
import type { TeamSetup } from "../games/jeopardy/jeopardyEngine";
import { JeopardySetup } from "../games/jeopardy/JeopardySetup";
import { forgetGame, loadLastTile, loadRecent, loadTheme, rememberGame, saveLastTile, saveTheme, type Theme } from "./storage";

type Screen =
  | { name: "dashboard" }
  | { name: "import"; gameType: string; seed?: ImportSeed }
  | { name: "setup"; game: LoadedGame<JeopardyFile> }
  | { name: "play"; game: LoadedGame<JeopardyFile>; teams: TeamSetup[]; allowNegativeScores: boolean; timeLimitSeconds: number }
  | { name: "builder" }
  | { name: "editor" }
  | { name: "ai" };

function backdropForGame(game: LoadedGame): BackdropSpec {
  const { metadata, appearance } = game.file;
  return {
    key: `loaded:${game.filename}:${metadata.title}:${appearance.accentColor}:${appearance.backgroundPreset}`,
    cover: metadata.coverImage,
    accent: appearance.accentColor,
    preset: appearance.backgroundPreset,
    artwork: "board",
  };
}

export function App() {
  useSpatialNav();

  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [recent, setRecent] = useState(loadRecent);
  const [stack, setStack] = useState<Screen[]>([{ name: "dashboard" }]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState<LoadedGame | null>(null);
  const [draftBackdrop, setDraftBackdrop] = useState<BackdropSpec | null>(null);

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
      const file = game.file as JeopardyFile;
      const cats = file.content.categories.length;
      const list = rememberGame({
        gameType: file.gameType,
        filename: game.filename,
        title: file.metadata.title,
        description: file.metadata.description,
        author: file.metadata.author,
        accentColor: file.appearance.accentColor,
        backgroundPreset: file.appearance.backgroundPreset,
        coverImage: file.metadata.coverImage,
        summary: `${cats} ${cats === 1 ? "category" : "categories"} · ${countClues(file)} clues`,
        text: game.text,
      });
      setRecent(list);
      setLoaded(game);
      push({ name: "setup", game: game as LoadedGame<JeopardyFile> });
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
  else if (screen.name === "setup" || screen.name === "play") backdrop = backdropForGame(screen.game);
  else if (screen.name === "import" && loaded) backdrop = backdropForGame(loaded);

  const toBuilder = useCallback(() => {
    setLoaded(null);
    push({ name: "builder" });
  }, [push]);
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
          onEditor={() => push({ name: "editor" })}
          onAiBuilder={() => push({ name: "ai" })}
          onOpenRecent={openRecent}
          onForgetRecent={forgetRecent}
          onSettings={() => setSettingsOpen(true)}
        />
      )}
      {screen.name === "import" && (
        <ImportScreen key={stack.length} gameType={screen.gameType} seed={screen.seed} onBack={back} onHost={host} onBuilder={toBuilder} onLoaded={setLoaded} />
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
      {screen.name === "builder" && <BuilderHome onBack={back} onEditor={() => push({ name: "editor" })} onAiBuilder={() => push({ name: "ai" })} />}
      {screen.name === "editor" && (
        <JeopardyVisualEditor onBack={pop} onHost={(text, filename) => push({ name: "import", gameType: JEOPARDY_TYPE, seed: { filename, text } })} onAppearance={onDraftAppearance} />
      )}
      {screen.name === "ai" && <JeopardyAIGuide onBack={back} onHost={host} onLoaded={setLoaded} />}

      {settingsOpen && <SettingsPanel theme={theme} onTheme={changeTheme} onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
