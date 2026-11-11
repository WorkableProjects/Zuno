<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/zuno-logo-white.svg">
    <img src="public/zuno-logo-dark.svg" alt="Zuno" width="260">
  </picture>
</p>

<p align="center"><em>Pick. Build. Play.</em></p>

Zuno is a browser-based, console-style game launcher and game builder. V1 ships one game engine, Jeopardy. Every session runs from a game file (`.zuno.json`) that you load, build in the visual editor, or have an AI assistant write for you. There are no accounts and no server.

The full product specification is in [Zuno_SPEC.md](Zuno_SPEC.md).

## Run it

```bash
npm install
```

```bash
npm run dev
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the static site into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm test` | Runs the file validator and game engine tests |
| `npm run logo:export` | Re-renders the PNG app icons from the SVG logo (needs Playwright) |

The build is fully static, so any static host works.

## What is in V1

- **Dashboard** with a horizontal game rail, a full-screen background that follows the focused game, and a hero area with its actions
- **Tile effects**: a border beam that travels around the selected tile and a separate diagonal sheen across its artwork, both with reduced-motion fallbacks
- **Keyboard navigation** with arrow keys, WASD, Enter, Escape and Tab on every screen
- **Game files** in readable JSON, validated before anything can be hosted, never executed
- **Jeopardy**: session setup with team names, board, clue and answer reveal, scoring, optional final round, standings
- **Builder**: a visual editor that exports a `.zuno.json` file, and an AI Builder with a Copy Guide prompt for ChatGPT, Gemini or another assistant
- **Settings**: Dark Mode (default) and Light Mode, saved on the device

A sample game lives at `public/samples/science-review.zuno.json` and can be loaded from the import screen.

## Keyboard

| Key | Action |
| --- | --- |
| Arrow keys, `W` `A` `S` `D` | Move between tiles, actions, board cells and buttons |
| `Enter`, `Space` | Activate the focused control |
| `Escape` | Close the panel or go back |
| `Tab`, `Shift+Tab` | Standard focus order, used inside forms |

WASD is ignored while you type in a field.

## Project layout

```text
src/
  app/                  App shell, screen stack, local storage
  components/
    brand/              Logo
    dashboard/          Rail, tiles, hero, ambient background
    navigation/         Directional (arrow/WASD) focus navigation
    import/             File picker, validation summary, preview
    builder/            Builder entry, visual editor, AI guide
    settings/           Theme panel
    ui/                 Dialog and small helpers
  game-files/schema/    Shared file shape, Jeopardy schema, validator
  games/
    registry.ts         Game engine registry
    jeopardy/           Setup, runtime screens and the session engine
  styles/               Tokens, base styles, motion
public/                 Logo family, app icons, sample game
tests/                  Validator and engine tests
```

Adding a game type means registering an engine in `src/games/registry.ts` with its validator and mapping its host and builder screens in `src/app/App.tsx`. The dashboard, importer and file validation are shared.

## Logo files

| File | Use |
| --- | --- |
| `public/zuno-logo.svg` | Horizontal lockup, light text for dark backgrounds |
| `public/zuno-logo-dark.svg` | Horizontal lockup for light backgrounds |
| `public/zuno-logo-flat-white.svg`, `zuno-logo-flat-dark.svg` | Single-color lockups |
| `public/zuno-mark.svg`, `zuno-mark-white.svg`, `zuno-mark-dark.svg` | Standalone mark |
| `public/zuno-wordmark.svg`, `zuno-wordmark-dark.svg` | Wordmark only |
| `public/favicon.svg` | Simplified mark for small sizes |
| `public/zuno-icon-512.png`, `-192.png`, `-64.png` | App icons |

## Credits

Zuno is a Workable Projects product with Dutch & Friends.

The interface was designed with the unslop method by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.
