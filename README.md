<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/ZunoLogosv2/zuno-lockup-dark.svg">
    <img src="public/ZunoLogosv2/zuno-lockup-horizontal.svg" alt="Zuno" width="160">
  </picture>
</p>

<p align="center"><em>Pick. Build. Play.</em></p>

Zuno is a browser-based party game launcher and builder. Pick a game, play it on one screen or with everyone on their phones, or build your own game file. It runs entirely in the browser; online rooms and profiles use an optional free Firebase project.

**Version 3.0.0**

## Highlights

- **Games**: Jeopardy, Headbands, LIAR, Rock Paper Gamble, Blackjack, Draw It and Survey Feud, played on one shared screen, online with phones, or both.
- **Builder**: a visual editor and an AI prompt guide that produce a `.zuno.json` game file. Files are validated before hosting and never executed.
- **Online rooms**: room codes, QR join links, profile pictures and per-player notepads.
- **Interface**: console-style launcher with animated transitions, keyboard and controller-style navigation, Dark, Light and Vice themes, synthesized sound, and reduced-motion support.

## Run it

```bash
npm install
```

```bash
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds the static site into `dist/` |
| `npm run preview` | Serves the production build |
| `npm test` | Runs the validator and engine tests |
| `npm run logo:export` | Re-renders the PNG app icons from `public/ZunoLogosv2` (needs Playwright) |

The build is fully static, so any static host works. Sample games are in `public/samples/`.

## Online play (optional)

Online rooms use Firebase Realtime Database on the free Spark plan. Without it, Zuno still works and the online buttons are hidden.

1. Create a Firebase project and a Realtime Database.
2. Publish the rules in [`database.rules.json`](database.rules.json) (republish when that file changes).
3. Add a Web app and put its `apiKey`, `databaseURL`, `projectId` and `appId` in `.env.production`, or in `.env.local` for local work (see `.env.example`).

To test without a project, run `npx firebase-tools emulators:start --only database --project demo-zuno` and build with `VITE_FIREBASE_EMULATOR=127.0.0.1:9000`.

## Adding a game

Register an engine in `src/games/registry.ts` with its validator, then map its host and builder screens in `src/app/App.tsx`. The launcher, importer and file validation are shared. Product specs are in [`docs/`](docs).

## Logo files

All current brand assets are in `public/ZunoLogosv2/`. The previous set is kept in `public/ZunoLogosv1/`.

| File | Use |
| --- | --- |
| `zuno-lockup-horizontal.svg` | Mark and wordmark for light backgrounds |
| `zuno-lockup-dark.svg` | Lockup on a dark background |
| `zuno-lockup-mono.svg` | One-color lockup (inherits text color) |
| `zuno-mark.svg`, `zuno-mark-dark.svg` | Standalone mark |
| `zuno-mark-mono.svg`, `zuno-mark-black.svg` | One-color mark |
| `zuno-app-icon.svg` | App icon and favicon |
| `zuno-icon-512.png`, `-192.png`, `-64.png` | PNG app icons |

## Deploying to GitHub Pages

In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**, then push to `main`. Deploying straight from the branch serves unbuilt source and fails.

## Credits

Zuno is a Workable Projects product with Dutch & Friends.

The interface was designed with the unslop method by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.
