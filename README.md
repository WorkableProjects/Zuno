<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/zuno-logo-white.svg">
    <img src="public/zuno-logo-dark.svg" alt="Zuno" width="260">
  </picture>
</p>

<p align="center"><em>Pick. Build. Play.</em></p>

Zuno is a browser-based, console-style game launcher and game builder. It ships two game engines, Jeopardy and Headbands. Everything runs in the browser; the optional Headbands online lobby uses a free Firebase Realtime Database. Every session runs from a game file (`.zuno.json`) that you load, build in the visual editor, or have an AI assistant write for you. There are no accounts and no server of its own.

The full product specification is in [Zuno_SPEC.md](Zuno_SPEC.md). Headbands is specified in [HeadbandsSPEC.md](HeadbandsSPEC.md).

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

## What is in Zuno

- **Dashboard** with a horizontal game rail, a full-screen background that follows the focused game, and a hero area with its actions
- **Tile effects**: a border beam that travels around the selected tile and a separate diagonal sheen across its artwork, both with reduced-motion fallbacks
- **Keyboard navigation** with arrow keys, WASD, Enter, Escape and Tab on every screen
- **Game files** in readable JSON, validated before anything can be hosted, never executed
- **Jeopardy**: session setup with team names, board, clue and answer reveal, scoring, optional final round, standings
- **Headbands**: everyone holds a secret identity they can't see and asks the group yes-or-no questions. Text Mode or Image Mode (a picture with its answer underneath), shuffled or hand-picked deals, a privacy cover between turns, guess checking, host overrides, pause, skip, reorder and a recap
- **Builder**: a visual editor that exports a `.zuno.json` file, and an AI Builder with a Copy Guide prompt for ChatGPT, Gemini or another assistant
- **Settings**: Dark Mode (default) and Light Mode, saved on the device

Sample games live in `public/samples/` (`science-review.zuno.json` for Jeopardy, `everyday-things.zuno.json` for Headbands) and can be loaded from each import screen.

## Headbands online lobby (v1.0.1)

Players can join the host from their own phones and write each other's identities, instead of using a deck from a file. In a lobby:

- The host screen shows a room code, a QR code and a join link. Players scan it, or open Zuno, pick Headbands, choose **Join a game** and type the code.
- Players sit in a circle the host can reorder or shuffle. Each player writes for the next one, and the last writes for the first. The circle is also the turn order.
- The host picks **Text, any topic** (players type any word, name or phrase) or **A picture with its answer** (players upload or take a photo and write the answer shown under it).
- Each phone only shows who it is writing for. Nobody sees what was written for them, and the host screen only shows who has finished.
- When everyone has written, the host starts the game and it runs on the host screen as usual. **Play again** goes back to the lobby for a fresh round of writing.

Start a lobby from the Headbands load screen (**Host an online lobby**, no file needed) or from session setup (**Let players write them on their phones instead**, which keeps the loaded game's title and colors).

### Setting up Firebase (free)

Lobbies use Firebase Realtime Database. The free Spark plan (100 simultaneous connections, 1 GB stored, 10 GB a month downloaded) is plenty, and no card is needed. Without this setup Zuno still works, and the online buttons are hidden.

1. In the [Firebase console](https://console.firebase.google.com/), create a project, then **Build → Realtime Database → Create database** (start in locked mode).
2. In the database's **Rules** tab, paste the contents of [`database.rules.json`](database.rules.json) and publish.
3. **Project settings → Your apps → Add app → Web**, and note `apiKey`, `databaseURL`, `projectId` and `appId`.
4. Put them in [`.env.production`](.env.production), which every production build reads, including the GitHub Pages deploy. This repository already has its project's values there. For a different project locally, copy `.env.example` to `.env.local` and fill it in.

These web config values are public by design; the rules limit what can be written. Lobbies live under `/hb/{code}` and are removed when the host leaves or closes the tab.

To try it without a project: `npx firebase-tools emulators:start --only database --project demo-zuno`, then build with `VITE_FIREBASE_EMULATOR=127.0.0.1:9000` and the other variables set to any placeholder (for example `VITE_FIREBASE_PROJECT_ID=demo-zuno`).

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
  game-files/schema/    Shared file shape, Jeopardy and Headbands schemas, validator
  games/
    registry.ts         Game engine registry
    jeopardy/           Setup, runtime screens and the session engine
    headbands/          Setup, play screen, identity card and the session engine
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

## Deploying to GitHub Pages

The site must be built before it can be served, so Pages has to deploy from the workflow, not straight from the branch:

1. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Push to `main` (or run **Deploy to GitHub Pages** from the Actions tab).

If Source is left on "Deploy from a branch", Pages serves the raw source and the browser shows 404 errors for `main.tsx` and `favicon.svg`.
