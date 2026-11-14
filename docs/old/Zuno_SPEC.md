# Zuno — Full Developer Specification

**Product:** Zuno  
**Organization:** Dutch & Friends  
**Document:** `SPEC.MD`  
**Version:** 1.1 — Zuno rebrand and logo direction  
**Release target:** V1  
**V1 game:** Jeopardy  
**Product tagline:** *Pick. Build. Play.*

---

## 1. Product Overview

Zuno is a browser-based game launcher and game-building platform for Dutch & Friends. Its dashboard should feel like a premium modern game console interface, using the PlayStation 5 dashboard supplied as the visual reference: a horizontal game row, a large selected-game hero area, layered background artwork, responsive focus states, and fluid transitions.

Zuno is both:

1. **A game launcher** — users load a game file and host a game session.
2. **A game builder** — users create game files themselves with a visual editor or generate the file with an external AI assistant.

The V1 release contains the Jeopardy game engine. The platform should be designed so other game types can be added later without redesigning the dashboard or file-loading system.

### 1.1 Core product rules

- No accounts, profiles, sign-in, or registration.
- No subscription or paid tier is required. “Premium” describes the visual quality and motion design, not a paywall.
- V1 contains Jeopardy only.
- Every game session must be started from a valid game file. A game engine by itself is not playable content.
- The Jeopardy game file contains the board, categories, clues, answers, optional explanations, appearance settings, and game options.
- Users may create a game file with the built-in visual editor or an external AI tool such as ChatGPT or Gemini.
- The AI workflow must use a **Copy Guide** button. Zuno does not need a built-in AI API or AI account integration.
- V1 hosting means running and controlling the game on the current device/browser, typically on a shared display. Online multiplayer, remote players, and network-based hosting are out of scope for V1.
- The application must never silently invent a playable board when no valid game file has been loaded.

### 1.2 Product objectives

- Make the dashboard immediately recognizable as a console-style game launcher.
- Make keyboard navigation feel native and complete.
- Give selected games a rich, animated, full-screen visual identity.
- Make importing and hosting a game straightforward.
- Keep game content portable in a human-readable JSON file.
- Make custom game creation possible without programming knowledge.
- Keep the application usable on a laptop, desktop, and classroom/projector display.

### 1.3 Non-goals for V1

- User accounts, authentication, or cloud profiles.
- Online multiplayer or remote team connections.
- Live cloud game hosting.
- Built-in generative AI or paid AI API usage.
- A public marketplace or community upload system.
- Payment processing or subscriptions.
- A general-purpose code/plugin runtime for uploaded games.

---

## 2. Product Name and Brand

### 2.1 Official name

**Zuno**

Zuno is a short, friendly, memorable platform name that is not tied to one organization, game genre, or format. It should feel natural to say aloud and remain flexible as the platform expands beyond Jeopardy.

**Tagline:** *Pick. Build. Play.*

**Organization:** Workable Projects; Dutch & His Friends (main = Workable)

### 2.2 Brand direction

Zuno should feel like a modern console interface rather than a conventional website or admin dashboard.

- Confident, minimal, and cinematic.
- Dark-first design with restrained accent lighting.
- Large artwork and clear typography.
- Smooth, intentional motion rather than excessive animation.
- Avoid generic gradient-heavy SaaS layouts.
- Do not use PlayStation logos, trademarks, proprietary icons, or copied artwork. Use the supplied PS5 screenshot as an interaction and composition reference, not as a source of branded assets.

### 2.3 Suggested visual identity

| Token | Dark theme | Light theme | Purpose |
|---|---|---|---|
| Main background | `#080B12` | `#F2F4F8` | Full-screen canvas |
| Elevated surface | `#111725` | `#FFFFFF` | Panels and menus |
| Secondary surface | `#1A2232` | `#E8ECF3` | Tiles and cards |
| Primary text | `#F7F9FC` | `#111827` | Titles and labels |
| Secondary text | `#AAB4C5` | `#596579` | Supporting text |
| Accent | `#79B8FF` | `#246BC4` | Focus, selection, and actions |
| Accent glow | `rgba(105, 174, 255, 0.32)` | `rgba(36, 107, 196, 0.18)` | Soft light effects |
| Border | `rgba(255,255,255,0.14)` | `rgba(20,35,55,0.16)` | Default outlines |

The exact accent can be adjusted during implementation, but the interface should use one coherent accent family rather than a different bright gradient on every component.

### 2.4 Logo design and creation

Create a simple, original Zuno logo as part of the initial branding and application-shell work. The logo should be memorable at a glance, easy to reproduce, and restrained enough to sit comfortably in a premium game dashboard. It is a small brand signature, not a complex illustration.

#### Creative direction

Use a broad **1980s Vice-inspired sunset aesthetic** as the visual reference: warm sunset colors, bold display lettering, and a slightly nostalgic, cinematic sense of fun. The reference is about mood and color—not a recreation of the Grand Theft Auto VI logo. Do not copy its lettering, exact composition, outlines, effects, artwork, or recognizable visual arrangement.

Recommended original concept:

- Build a compact **Z monogram** that incorporates a simple horizon or sunset motif. For example, a bold geometric Z can cut across a small sun disc or three clean horizontal sunset bands.
- Pair the mark with a custom-looking **Zuno** wordmark in a bold, friendly geometric display sans-serif.
- Keep the silhouette clean and recognizable without the wordmark. The icon must still read at favicon size.
- Use the sunset gradient as a restrained brand accent: warm orange `#FFB36B` into coral/pink `#F06A9A` and violet `#8266E8`.
- Keep the main application UI's surfaces and typography neutral. The logo palette should enrich the identity without forcing every dashboard component to use the same gradient.

#### Logo construction process

1. Sketch three simple Z-mark variations using only basic vector shapes: a Z with a horizon cut, a Z crossing a sunset disc, and a minimal striped-sun Z.
2. Select the clearest silhouette at small sizes. Prefer one memorable shape over several decorative details.
3. Create the mark and wordmark as clean SVG vector artwork. Use a licensed or system-available display font during development; convert text to paths only when a final font license and export workflow permit it.
4. Apply the sunset gradient to the mark or one small wordmark detail. Also create flat white, flat dark, and single-color versions so the logo works in both themes and without gradients.
5. Test the mark at 16, 24, 32, and 48 pixels, and test the full wordmark in the dashboard header. Simplify anything that becomes muddy at small sizes.
6. Export the SVG source files and optimized PNG assets. Keep the SVG as the source of truth so the mark remains sharp at any screen density.

#### Required logo assets

- `zuno-logo.svg` — primary horizontal lockup with symbol and wordmark.
- `zuno-mark.svg` — standalone Z/sunset symbol for compact headers and app icons.
- `zuno-wordmark.svg` — wordmark-only variation.
- `favicon.svg` — simplified mark optimized for very small sizes.
- PNG exports at 512 × 512 and 192 × 192 for platform/app-icon use, plus a small 64 × 64 preview if needed.

#### Usage rules

- Use the full lockup in the initial dashboard header when space permits; use the standalone mark at narrow widths.
- Preserve clear space around the logo. Do not add a permanent glow, animated distortion, or thick outline to the master artwork.
- A subtle sheen may be used as a UI interaction on the logo, but the logo must remain attractive and legible when completely static.
- Never use a screenshot, raster trace, or AI-generated imitation of an existing game logo as the final brand asset.
- Do not use controller, joystick, dice, or gamepad clip-art as the primary mark. The Z/sunset concept should be sufficient to identify the platform.

#### Logo acceptance criteria

- The mark is recognizable without the word “Zuno”.
- The full lockup is readable on both dark and light backgrounds.
- The icon remains distinct at 16–24 pixels.
- The logo can be rendered in one flat color without losing its identity.
- The design feels playful and nostalgic but still fits the platform's premium, modern interface.
- The logo is original and does not imitate the GTA VI logo or any PlayStation branding.

---

## 3. Main Application Structure

### 3.1 Primary navigation

The application has two primary areas:

- **Games** — the console-style home/dashboard and game library.
- **Settings** — opened from the gear icon in the top-right corner.

There is no account/profile button because accounts are not part of V1.

### 3.2 Dashboard layout

The dashboard should follow the broad composition of the supplied PS5 reference screenshot:

1. A minimal header near the top edge.
2. The active section name, **Games**, in the upper-left.
3. A settings gear in the upper-right.
4. A horizontal row of game tiles below the header.
5. A large hero area occupying most of the screen.
6. A title and short description for the selected game.
7. A clear primary action such as **Load & Host**.
8. A secondary action such as **Build** or **Details**.
9. Optional lower content such as “Your Games” or “Recently Played”.

For V1, Jeopardy is the only game engine shown in the library. A **Build a Game** tile or action may appear alongside the Jeopardy tile, but it must be visually clear that it is a creation action rather than a playable game.

### 3.3 Dashboard content hierarchy

**Header**
- Zuno wordmark or compact logo.
- Games section label.
- Settings icon.

**Game rail**
- Square or slightly landscape game tiles.
- Selected tile is larger and elevated.
- Other tiles remain visible with reduced emphasis.
- Horizontal navigation must support keyboard and pointer input.

**Hero area**
- Selected game's cover artwork or generated ambient background.
- A dark readability overlay so the title and actions remain legible.
- Game title, short description, and available actions.
- Background fills the entire dashboard canvas, not just a card behind the title.

**Library area**
- V1: Jeopardy.
- Future game engines can be inserted into the same rail without changing the overall layout.

---

## 4. Premium Dashboard Visual System

The visual system is one of the most important parts of Zuno. The dashboard should feel polished and atmospheric, with animation that communicates selection and hierarchy.

### 4.1 Selected-game background behavior

When a user hovers over, focuses, or selects a game tile, the entire dashboard background must react to that game.

#### When the game has a cover image

- Use the cover image as the main full-screen background artwork.
- Scale and crop it with `cover` behavior so it fills the viewport without distortion.
- Keep the focal subject visible where possible.
- Apply a subtle dark gradient overlay, especially behind text and navigation.
- Add a restrained blur or depth layer only when needed for legibility.
- A selected game's image must extend behind the navigation and content areas, creating a unified home-screen experience.

#### When the game does not have a cover image

Generate a background from the game's appearance metadata:

- Use its configured accent color as the primary color source.
- Build an abstract animated scene from layered gradients, soft light fields, and optional low-contrast texture.
- The background should feel associated with the game rather than displaying a generic empty gradient.
- Use gentle movement such as slow drifting light, subtle parallax, or a slowly shifting aurora/wave pattern.
- If the game file does not define appearance metadata, generate a deterministic fallback based on its game type and title. The same file should produce the same visual identity each time.
- The generated scene must cover the full dashboard background, not only the game tile.

#### Background transition

- Crossfade between the previous and next backgrounds.
- Target transition duration: **600–900 ms**.
- Use a smooth ease-out curve; avoid abrupt image replacement.
- A subtle scale movement from approximately `1.02` to `1.00` may be used during the transition.
- Do not stack unlimited old background layers. Remove the previous layer after the transition completes.
- While a user moves rapidly across the game rail, cancel or replace pending transitions so the latest focused game always wins.

### 4.2 Game tile states

Each game tile must support the following visual states:

| State | Appearance |
|---|---|
| Idle | Normal artwork, quiet border, no active glare |
| Hover | Slight scale-up, brighter image, soft lift/shadow |
| Keyboard focus | Same prominence and animation as hover, with a visible focus outline |
| Selected | Persistent selected state while its hero area is active |
| Pressed | Brief compression or scale-down before activation |
| Disabled | Reduced opacity and no active animation; explain why it is unavailable |

Recommended selected/hover scale: approximately `1.04–1.08`, tuned to avoid overlapping nearby tiles. Use transform-based animation rather than changing layout dimensions.

### 4.3 Icon glare and moving border — required effect

This effect is mandatory on the game tiles. It consists of **two distinct visual layers** that work together.

#### A. Moving border highlight (border beam)

A thin, bright highlight travels around the outside edge of the selected tile.

- The tile keeps a stable rounded border shape.
- A narrow white/blue highlight moves around the perimeter, creating the impression that light is traveling along the border.
- The highlight should be brighter than the normal border but not look like a thick neon frame.
- The highlight can use a masked conic gradient, a rotating gradient layer, or an equivalent performant border-beam technique.
- The beam should follow the rounded corners smoothly.
- A soft, low-opacity glow may extend just beyond the border.
- The border animation activates on hover, keyboard focus, or selected state.
- It should fade in quickly, then move at a calm pace. Avoid a fast, distracting spin.

Suggested behavior:

- Fade-in: **150–250 ms**.
- One complete perimeter cycle: **2.8–4.0 seconds**.
- Keep the border highlight narrow and localized; most of the border should remain subtle.
- When focus is lost, fade out over **180–250 ms**.
- If the browser/device cannot render the animated beam smoothly, show a static high-contrast focus border instead.

#### B. Icon reflection (diagonal specular sheen)

A translucent strip of light passes across the actual game artwork, as though a light source is reflecting off a glossy physical surface.

- The light source should visually originate from the **top-left**.
- The reflection must travel diagonally toward the **bottom-right**.
- It should cross the icon artwork itself, not merely the frame or border.
- Use a soft, translucent white highlight with feathered edges; it should never obscure the title or important cover art.
- A faint static highlight near the top-left may reinforce the impression of a light source.
- Clip the reflection to the tile's rounded shape.
- The effect must not alter the image pixels or require a separate pre-rendered image.

Suggested behavior:

- Trigger once when a tile first receives hover/focus.
- Sweep duration: **550–850 ms**.
- Use a diagonal linear-gradient band with transparent edges and a soft white center.
- The band starts just outside the top-left portion of the tile and exits beyond the bottom-right edge.
- The sweep may replay after the tile loses focus and receives focus again. Do not restart it on every animation frame or pointer movement.
- An occasional, very subtle repeat may be used for a persistently selected tile, but it must be infrequent (several seconds apart) and should not look like a loading indicator.

#### C. Combined visual result

When a user focuses a tile:

1. The tile gently rises and enlarges.
2. Its border brightens and a highlight begins traveling around the perimeter.
3. A separate reflective sheen sweeps across the artwork from top-left to bottom-right.
4. The full-screen background transitions to the selected game's cover or generated scene.
5. The game's title and actions become the primary focus.

The border beam and artwork sheen must be independently controllable. Do not combine them into one animation, because the border follows the tile perimeter while the reflection crosses the face of the icon.

#### D. Implementation guidance

Recommended implementation approach:

- Use layered pseudo-elements or dedicated overlay elements for the tile frame and glare.
- Use a masked `conic-gradient` or equivalent for the moving border beam.
- Use a translated diagonal gradient layer for the artwork sheen.
- Keep overlays `pointer-events: none` so they never block selection.
- Animate `transform` and `opacity` wherever possible.
- Avoid expensive per-frame layout calculations and avoid repainting the full page for a tile-only effect.
- If pointer-position lighting is implemented, it must have a keyboard-focus equivalent and must not be required for the effect to appear.
- Use a static focus border and static highlight when reduced motion is enabled.

**Important research distinction:** The visible effect is described using established interface-animation terms: *specular sheen/sheen sweep* for the moving reflection and *border beam* for the light moving around the outline. These names describe the visual techniques. The specification does not claim to reproduce Sony's private shader or internal implementation exactly.

### 4.4 Other dashboard motion

| Element | Motion | Target timing |
|---|---|---:|
| Game tile focus | Gentle scale and lift | 180–260 ms |
| Tile image | Slight parallax/scale | 250–400 ms |
| Hero background | Crossfade and slow settle | 600–900 ms |
| Hero title | Fade/short vertical settle | 250–350 ms |
| Settings panel | Fade and slide | 180–260 ms |
| Button press | Quick compression | 90–140 ms |
| Modal open | Fade + slight scale | 180–240 ms |
| Modal close | Fade | 140–200 ms |

Motion should feel deliberate. Avoid excessive bounce, spring overshoot, flashing, continuous fast rotation, and large movement of text.

### 4.5 Background atmosphere

The background may use:

- Soft blurred light fields.
- Slow gradient movement.
- Low-contrast grain/noise texture.
- Subtle ambient particles only when they do not reduce legibility or performance.
- Gentle parallax tied to pointer movement, with a very small movement range.

Atmospheric movement must be slow and low contrast. The game artwork is the focus; background effects must never compete with it.

---

## 5. Navigation and Input

Zuno must be completely usable with a keyboard. The keyboard experience should resemble navigating a console dashboard with a controller.

### 5.1 Required keyboard controls

| Key | Action |
|---|---|
| `Arrow Left` | Move focus left within the current row/group |
| `Arrow Right` | Move focus right within the current row/group |
| `Arrow Up` | Move to the section above or previous navigation row |
| `Arrow Down` | Move to the next section or hero action area |
| `W` / `A` / `S` / `D` | Equivalent directional navigation where appropriate |
| `Enter` | Activate the focused tile, button, or option |
| `Space` | Activate a focused button when appropriate |
| `Escape` | Close the current panel/modal or return to the previous screen |
| `Tab` / `Shift+Tab` | Standard sequential focus navigation for accessibility and form controls |

### 5.2 Navigation behavior

- The dashboard should display a clear focus state at all times.
- Arrow/WASD navigation should move between meaningful UI elements, not arbitrary DOM nodes.
- Left/right on the game rail moves between game tiles.
- Down from the game rail moves focus to the selected game's hero actions.
- Up from hero actions returns to the game rail.
- The settings gear must be reachable from the keyboard.
- Within forms, arrow keys should retain their normal behavior for text entry, select controls, and sliders.
- Global WASD shortcuts must not intercept keystrokes while the user is typing in an input, textarea, or editable field.
- Enter should not accidentally trigger multiple actions or submit an incomplete form.
- When a screen opens, focus should move to its first meaningful interactive element.
- When a modal closes, focus should return to the control that opened it.

### 5.3 Pointer behavior

- Hovering a game tile previews that game in the hero area.
- Clicking selects the tile or activates the primary game action, depending on the interaction context.
- Hover and keyboard focus must produce equivalent previews and visual states.
- No essential information or action may be available only on hover.

### 5.4 Responsive behavior

- Desktop: full horizontal rail and large hero artwork.
- Tablet: preserve the rail, reduce spacing, and keep primary actions visible.
- Small screens: allow horizontal scrolling through tiles; provide visible touch targets and a compact hero region.
- Keyboard navigation remains available on all layouts where a physical keyboard is present.

---

## 6. Settings

Settings are intentionally minimal in V1.

### 6.1 Theme setting

The only required setting is:

- **Dark Mode**
- **Light Mode**

Requirements:

- Dark Mode is the default.
- Theme selection applies to the entire interface, including dashboard, builder, importer, and active game screens.
- The selected theme persists locally between visits.
- Theme changes should transition smoothly without flashing or briefly displaying the wrong theme.
- Game artwork and generated backgrounds should remain legible in both themes.
- The theme preference must not require an account or server.

### 6.2 Settings implementation

Store the theme preference in local browser storage. If no saved preference exists, use Dark Mode. Respect the operating system's reduced-motion preference independently of the color theme.

---

## 7. Game Library and Game Lifecycle

### 7.1 Game tile model

Every game shown in the library should be represented by metadata that the dashboard can render before a game session starts.

Minimum metadata:

- Game type identifier.
- Display title.
- Short description.
- Optional cover image.
- Accent color or visual theme.
- Optional background animation preset.
- Builder availability.
- Supported file schema version.

### 7.2 V1 library

The initial library contains:

- **Jeopardy** — the first playable game engine.
- **Build a Game** — an entry point to the Jeopardy builder, not a playable game engine.

Future games should use the same game tile and file import architecture.

### 7.3 Game lifecycle

A standard game session follows this process:

1. User selects a game engine from the dashboard.
2. User chooses **Load Game File** or **Build Game**.
3. User supplies a valid game file, or creates one in the builder and exports it.
4. Zuno reads and validates the file.
5. The application displays a game preview and validation result.
6. User chooses **Host Game**.
7. User configures available session settings, such as team names.
8. The game starts using the loaded file as its content source.

A game must not be hostable until its required file has been successfully loaded and validated.

### 7.4 Host meaning in V1

“Host” means the person operating the game on the current device/browser. This is suitable for a teacher, presenter, or game host using a laptop connected to a shared display.

V1 does not create a server, room code, remote player connection, or synchronized second-screen experience. Those capabilities may be considered in a future release.

---

## 8. Mandatory Game File System

This is a foundational requirement and must be implemented in the platform architecture, not treated as an optional feature.

### 8.1 Every game requires a file

**All games require a game file before they can be loaded and hosted.** The game engine provides the rules and interface; the file provides the actual game content and configuration.

For example:

- Jeopardy requires a Jeopardy game file.
- A future trivia game would require a trivia game file.
- A future quiz-show game would require a quiz-show game file.

The platform may display game engine tiles without a file, but it must not start a real game session until a compatible file is supplied and validated.

### 8.2 V1 file format

Use human-readable JSON for V1.

Recommended filename convention:

`my-game.zuno.json`

The file must:

- Be importable through a file picker.
- Support drag-and-drop where practical.
- Be readable and editable in a text editor.
- Be generatable by common AI assistants.
- Include an explicit schema version.
- Include a game type identifier so the platform can select the correct engine.
- Be validated before it is loaded into a session.
- Never execute code.

The browser may use the standard `application/json` MIME type. The `.zuno.json` suffix is a naming convention, not a custom executable file format.

### 8.3 Common file structure

Every game file should follow a shared top-level structure:

```json
{
  "schemaVersion": 1,
  "gameType": "jeopardy",
  "metadata": {
    "title": "Example Jeopardy Game",
    "description": "A sample custom game.",
    "author": "Dutch & Friends",
    "coverImage": null
  },
  "appearance": {
    "accentColor": "#79B8FF",
    "backgroundPreset": "aurora"
  },
  "content": {},
  "settings": {}
}
```

The `content` and `settings` sections are specific to each game type. The common metadata and appearance sections allow Zuno to display a consistent dashboard preview across different games.

### 8.4 File validation

Before a file can be used, validate:

- The JSON parses successfully.
- `schemaVersion` is supported.
- `gameType` matches the selected engine.
- Required top-level fields exist.
- Required game-specific content exists.
- Categories, questions, and answers have valid types.
- Numeric values are within supported ranges.
- Duplicate IDs are rejected or normalized safely.
- Optional image data uses an allowed format.
- The file does not contain executable script or unsupported markup.

Validation must produce clear errors, such as:

- “This is not valid JSON.”
- “This file is for Trivia, but you selected Jeopardy.”
- “Category 3 is missing a title.”
- “Question 8 is missing an answer.”
- “This file uses an unsupported schema version.”

Do not silently discard required data. Allow a user to return to the builder or select another file when validation fails.

### 8.5 File security

- Treat all imported values as untrusted text.
- Render text as text; do not inject imported strings as HTML.
- Never run `eval`, imported JavaScript, or scripts from a game file.
- Restrict image data to supported image MIME types.
- Do not allow a game file to load arbitrary executable content.
- Validate URLs and reject unsafe protocols.
- Display an error when an asset cannot be loaded instead of breaking the game.

### 8.6 Image and asset handling

For V1:

- A cover image is optional.
- A cover image may be supplied as a supported HTTPS image URL or an embedded image data URL.
- The builder should be able to accept an uploaded image and embed it when exporting the JSON file.
- Keep image size limits configurable and provide a clear message when an image is too large.
- If no cover is supplied, use the generated animated background system described in Section 4.
- Do not require an additional image file for a game to be playable.

A future version may add a packaged archive format for multiple assets, but V1 should keep the file format simple and AI-friendly.

---

## 9. Jeopardy — V1 Game Engine

### 9.1 Overview

Jeopardy is the first game available in Zuno. The engine provides the board and gameplay controls; the imported Jeopardy JSON file supplies the categories, clues, answers, values, and optional final round.

### 9.2 Required content

A Jeopardy file must contain:

- A game title.
- At least one category.
- At least one clue in each category.
- A clue/prompt for every question.
- A correct answer for every question.
- A point value for every question.

The recommended standard board is five categories with five clues per category, with values of 100, 200, 300, 400, and 500. The editor may support custom category and question counts, within limits set by the game engine.

### 9.3 Recommended Jeopardy data shape

```json
{
  "schemaVersion": 1,
  "gameType": "jeopardy",
  "metadata": {
    "title": "Science Jeopardy",
    "description": "A custom science review game.",
    "author": "Dutch & Friends",
    "coverImage": null
  },
  "appearance": {
    "accentColor": "#79B8FF",
    "backgroundPreset": "aurora"
  },
  "content": {
    "categories": [
      {
        "id": "atoms",
        "title": "Atomic Structure",
        "questions": [
          {
            "id": "atoms-100",
            "value": 100,
            "clue": "This negatively charged particle is found outside the nucleus.",
            "answer": "What is an electron?",
            "explanation": "Electrons have a negative charge and occupy the space around the nucleus."
          }
        ]
      }
    ],
    "finalJeopardy": {
      "enabled": false,
      "category": "",
      "clue": "",
      "answer": ""
    }
  },
  "settings": {
    "allowNegativeScores": false,
    "showExplanations": true
  }
}
```

The example is intentionally abbreviated. A complete playable file must contain the actual questions intended for the session.

### 9.4 Session setup

Before starting, allow the host to:

- Review the imported game title and board summary.
- Choose the number of teams within the supported range.
- Edit team display names.
- Choose whether negative scores are allowed if the file supports that option.
- Confirm the selected game file.

Suggested initial team count: two teams, with an option to add more.

### 9.5 Gameplay interface

The active game should provide:

- A Jeopardy board with category headers.
- Point-value buttons for each available clue.
- A clear indication of used clues.
- A clue view with readable text.
- A reveal-answer action.
- A way for the host to award or deduct points.
- A visible team scoreboard.
- A return-to-board action.
- A way to end or restart the session with confirmation.

Optional explanation text should be shown only after the answer is revealed or when the host requests it.

### 9.6 Game state

The session state should track:

- Loaded game file metadata.
- Current board and clue selection.
- Which clues have been used.
- Team names and scores.
- Whether the current clue or answer is visible.
- Current round and final Jeopardy state, if enabled.

The game must prevent a used clue from being selected again unless the host explicitly resets the board.

---

## 10. Game Builder

Every game engine should expose a **Build** entry point. V1 implements the Jeopardy builder.

The builder must present two equally valid creation methods:

1. **Visual Editor** — the user creates and edits the game directly in Zuno.
2. **AI Builder** — the user copies a structured guide, sends it to an external AI assistant, receives JSON, and imports that JSON into Zuno.

The two routes must ultimately produce the same valid game file format.

### 10.1 Builder entry screen

When the user selects **Build**, show two clear options:

**Visual Editor**
- “Build your game manually with the built-in editor.”
- Opens the Jeopardy visual editor.

**AI Builder**
- “Use ChatGPT, Gemini, or another AI assistant to generate your game file.”
- Opens the AI instructions page containing the Copy Guide action.

Do not label the AI route as an integrated Zuno AI feature. It is an external AI-assisted workflow.

### 10.2 Visual Editor

The visual editor must support:

- Editing game title and description.
- Setting the author field.
- Adding, renaming, reordering, and deleting categories.
- Adding, editing, reordering, and deleting clues.
- Editing clue point values.
- Editing answers.
- Adding optional explanations.
- Enabling or disabling Final Jeopardy.
- Editing Final Jeopardy category, clue, and answer.
- Selecting an accent color.
- Selecting a generated background preset.
- Uploading an optional cover image.
- Previewing the board before exporting.

Recommended editor organization:

- Left panel: category list and board structure.
- Main panel: selected category and clue editor.
- Right panel or drawer: game appearance, validation, and preview controls.

The editor should provide clear empty states and not require the user to understand JSON.

### 10.3 Visual Editor validation

Before export, show a validation summary:

- Missing game title.
- Missing category title.
- Empty category.
- Missing clue.
- Missing answer.
- Invalid point value.
- Invalid or incomplete Final Jeopardy data.
- Image too large or unsupported.

Allow the user to export only when all required fields are valid. Optional fields may remain empty.

### 10.4 Exporting from the Visual Editor

The export flow must:

1. Convert the editor state into the shared Zuno JSON schema.
2. Validate the generated JSON.
3. Let the user name the file.
4. Download a file using the `.zuno.json` suffix.
5. Offer a clear next action: **Load & Host This Game**.

For a consistent file-based workflow, the host action must load the exported game definition through the same validation path used by a manually selected file. The application may pass the exported file directly into that importer after it has been created, but it must not bypass file validation.

### 10.5 AI Builder

The AI Builder is a guide-and-import workflow, not an AI chat interface.

It must display:

- A short explanation of how the workflow works.
- A **Copy Guide** button.
- A visible indication when the guide has been copied.
- A short instruction to paste the guide into ChatGPT, Gemini, or another AI assistant.
- An import area for the returned JSON file.
- A validation and preview step before hosting.

#### Copy Guide button requirements

When activated, **Copy Guide** copies a complete prompt to the clipboard. The prompt must tell the external AI assistant to:

- Create a Zuno-compatible Jeopardy game file.
- Output valid JSON only, with no Markdown fences or commentary.
- Use the supported `schemaVersion` and `gameType`.
- Include all required metadata, content, and settings fields.
- Create valid categories and question objects.
- Include a clue, correct answer, and numeric point value for every question.
- Use unique IDs.
- Include optional explanations only when useful.
- Use the standard five-category/five-clue board unless the user requests another valid board size.
- Never add JavaScript, HTML, or executable code.
- Keep strings properly escaped so the output parses as JSON.

The guide should also include the current supported schema and validation rules so the assistant has enough information to generate a compatible file.

#### Suggested AI guide text

The application should generate a complete guide similar to the following. It may be expanded as the schema evolves:

```text
You are creating a game file for Zuno, a browser-based game platform.

Create a complete Jeopardy game as valid Zuno JSON.

Requirements:
- Output JSON only. Do not use Markdown code fences or add an explanation before or after the JSON.
- Use schemaVersion: 1 and gameType: "jeopardy".
- Include metadata with title, description, author, and coverImage.
- Include appearance with accentColor and backgroundPreset.
- Include content.categories as an array of category objects.
- Each category must have a unique id, a title, and a questions array.
- Every question must have a unique id, numeric value, clue, and answer.
- An optional explanation may be included for each question.
- Include content.finalJeopardy with enabled, category, clue, and answer fields.
- Include settings.allowNegativeScores and settings.showExplanations as booleans.
- Use five categories and five questions per category by default, unless I request a different supported board size.
- Use sensible ascending point values by default: 100, 200, 300, 400, and 500.
- Ensure all IDs are unique and all JSON strings are correctly escaped.
- Do not include HTML, JavaScript, functions, or other executable content.
- Do not leave required fields blank.

Use this structure:
{
  "schemaVersion": 1,
  "gameType": "jeopardy",
  "metadata": {
    "title": "Game Title",
    "description": "Game description",
    "author": "Author",
    "coverImage": null
  },
  "appearance": {
    "accentColor": "#79B8FF",
    "backgroundPreset": "aurora"
  },
  "content": {
    "categories": [
      {
        "id": "category-id",
        "title": "Category Name",
        "questions": [
          {
            "id": "question-id",
            "value": 100,
            "clue": "Clue text",
            "answer": "Correct answer",
            "explanation": "Optional explanation"
          }
        ]
      }
    ],
    "finalJeopardy": {
      "enabled": false,
      "category": "",
      "clue": "",
      "answer": ""
    }
  },
  "settings": {
    "allowNegativeScores": false,
    "showExplanations": true
  }
}

After generating the JSON, do not wrap it in Markdown. Make sure the result is valid and complete so it can be saved as a .zuno.json file and imported into Zuno.
```

The final in-app guide should be versioned with the schema. If the schema changes, update the prompt and the file validator together.

### 10.6 AI output import flow

1. User copies the guide.
2. User opens an external AI assistant.
3. User adds their topic, preferred difficulty, and any custom requirements.
4. The assistant returns JSON.
5. User saves the response as a `.zuno.json` file.
6. User returns to Zuno and selects **Import Game File**.
7. Zuno validates the file and shows a preview.
8. User selects **Host Game**.

Zuno should explain that the external AI assistant may need to be asked to correct its output if the JSON is invalid. The validator must provide actionable error messages.

---

## 11. Load and Host Experience

### 11.1 Game detail state

Selecting Jeopardy opens a detail view with:

- Jeopardy artwork or generated background.
- Short game description.
- **Load Game File** primary action.
- **Build Game** secondary action.
- Optional recent-file shortcuts, if locally available.

### 11.2 Import interface

The import interface must provide:

- A file picker.
- Drag-and-drop target where supported.
- Supported file type information.
- Clear validation results.
- A preview of the game title, category count, clue count, and optional cover image.
- **Host Game** action only after successful validation.
- **Choose Another File** action.

### 11.3 Hosting transition

After the file passes validation:

1. Display the loaded game title.
2. Allow team/session setup.
3. Confirm the user is starting the selected file.
4. Transition into the game runtime.

A user must be able to return to the dashboard without corrupting or losing the source JSON file.

### 11.4 Local persistence

V1 may store non-sensitive preferences locally:

- Theme setting.
- Last selected dashboard tile.
- Recent game filenames or metadata.

Do not store account data because accounts do not exist. Do not assume that a recent filename guarantees that the original file remains available. If a file is not retained in browser storage, ask the user to select it again. A remembered game entry must never bypass validation.

---

## 12. Technical Architecture

The exact stack can be adjusted by the development team, but V1 should use a maintainable browser-based architecture.

### 12.1 Suggested stack

- **Frontend:** React + TypeScript.
- **Build tool:** Vite.
- **Styling:** CSS modules, plain CSS, or a utility system with custom motion layers.
- **Animation:** CSS transitions/keyframes first; use an animation library only if it materially improves orchestration.
- **Persistence:** Local storage for small preferences; IndexedDB only if retaining imported game files becomes necessary.
- **Deployment:** Static hosting is sufficient for V1.

No backend is required for the V1 feature set.

### 12.2 Suggested application modules

```text
src/
  app/
    App.tsx
    routes.ts
    state/
  components/
    dashboard/
      Dashboard.tsx
      GameRail.tsx
      GameTile.tsx
      HeroPanel.tsx
      AmbientBackground.tsx
    navigation/
      KeyboardNavigator.tsx
      FocusManager.tsx
    settings/
      SettingsPanel.tsx
    import/
      GameFilePicker.tsx
      FileValidationSummary.tsx
      GamePreview.tsx
    builder/
      BuilderHome.tsx
      JeopardyVisualEditor.tsx
      JeopardyAIGuide.tsx
    games/
      jeopardy/
        JeopardySetup.tsx
        JeopardyBoard.tsx
        JeopardyClue.tsx
        JeopardyScoreboard.tsx
        jeopardyEngine.ts
  game-files/
    schema/
      common.schema.ts
      jeopardy.schema.ts
      validateGameFile.ts
  styles/
    tokens.css
    theme-dark.css
    theme-light.css
    motion.css
```

This is an organizational suggestion, not a requirement to use these exact filenames.

### 12.3 Separation of concerns

Keep these responsibilities separate:

- Dashboard presentation and navigation.
- Game metadata and library registration.
- Game file parsing and validation.
- Game-specific data schema.
- Game engine and session state.
- Visual builder state.
- Export/import pipeline.
- Theme and motion preferences.

The dashboard should not need to understand the internal Jeopardy board structure. It should only read common metadata and appearance fields.

### 12.4 Game engine registration

Design a simple registry so future game types can be added without rewriting the application shell.

Each registered game engine should define:

- `gameType` identifier.
- Display metadata.
- Expected schema version(s).
- File validation function.
- Builder entry point, if supported.
- Host/session entry point.
- Optional default appearance preset.

V1 registers only `jeopardy`.

### 12.5 Performance requirements

- Keep dashboard animations smooth on typical modern laptop hardware.
- Prefer GPU-friendly transforms and opacity transitions.
- Avoid animating large layout properties such as width, height, margin, and top/left when transforms can be used.
- Lazy-load large artwork where possible.
- Preload the next likely hero image when practical.
- Avoid rendering every game screen when only one game is active.
- Clean up old background layers and animation listeners.
- Ensure the UI remains responsive while a game file is parsed and validated.

---

## 13. Accessibility and Motion Preferences

Premium motion must not come at the cost of usability.

- Respect `prefers-reduced-motion`.
- When reduced motion is enabled, disable long background drift, parallax, repeated glints, and animated border cycles.
- Use instant or short opacity transitions where necessary to communicate state.
- Preserve clear static focus outlines.
- Do not rely on color alone to identify selected or used clues.
- Keep text contrast high over hero images.
- Provide accessible names for icon-only buttons, including Settings.
- Ensure all functionality works without a mouse.
- Keep focus visible in both Dark Mode and Light Mode.
- Do not trap keyboard focus except inside an open modal/dialog.

---

## 14. Error Handling and Empty States

The interface should always explain what the user can do next.

### No game file loaded

Message: “No game file loaded yet.”  
Actions: **Import Game File** and **Build a Game**.

### Invalid game file

Message should identify the issue and its location. Example: “Question 12 is missing an answer.”  
Actions: **Choose Another File** and **Return to Builder** where applicable.

### Unsupported game type

Message: “This file belongs to a different game type. Open the matching game engine to load it.”

### Unsupported schema version

Message: “This game file was created with a newer format that this version of Zuno does not support.”

### Missing cover image

Do not show a broken-image icon. Use the generated animated background fallback.

### Clipboard access denied

If Copy Guide cannot access the clipboard, display the guide in a selectable text area and explain that the user can copy it manually.

### File too large

Show the maximum supported file size and explain whether the issue is caused by the JSON file or its embedded image.

---

## 15. Testing Requirements

### 15.1 Dashboard and motion tests

- Selecting each tile updates the full-screen hero background.
- A tile with a cover image uses that image as the dashboard background.
- A tile without a cover receives a generated animated background.
- Background transitions do not flash or leave old image layers behind.
- Hover and keyboard focus produce equivalent visual states.
- The border beam follows the tile outline smoothly.
- The icon sheen visibly travels from top-left to bottom-right.
- The icon sheen is clipped to the tile artwork and does not cover important content for too long.
- Glare does not replay continuously due to pointer movement.
- Reduced-motion mode disables continuous effects and keeps visible focus.
- Dark Mode and Light Mode both preserve readability.

### 15.2 Navigation tests

- Arrow keys move between all dashboard controls.
- WASD works when focus is not inside a text-entry control.
- Enter activates the focused control.
- Escape closes the current panel or returns to the previous view.
- Tab navigation works normally.
- Focus returns to the correct control after closing a modal.
- No keyboard action is duplicated.

### 15.3 File tests

- Valid Jeopardy JSON imports successfully.
- Invalid JSON is rejected with an understandable message.
- Incorrect `gameType` is rejected.
- Unsupported schema version is rejected.
- Missing categories, clues, answers, or point values are identified.
- Duplicate IDs are rejected or safely normalized.
- Malicious HTML/script strings are displayed as plain text or rejected.
- Unsafe image protocols are rejected.
- Missing images fall back to the generated background.
- Exported visual-editor files pass the same validator as imported files.
- AI-generated JSON can be saved and imported using the documented schema.

### 15.4 Jeopardy tests

- Board reflects the imported categories and point values.
- Each clue opens once.
- Answer reveal works.
- Score award/deduction updates the correct team.
- Used clues are visibly marked.
- Optional explanations appear only when requested or after answer reveal.
- Final Jeopardy works when enabled and is omitted when disabled.
- Reset and exit actions request confirmation where data could be lost.

---

## 16. V1 Acceptance Criteria

V1 is ready for release when all of the following are true:

### Dashboard

- [ ] The dashboard follows the console-style composition of the supplied PS5 reference.
- [ ] The interface is dark-first and has a working Light Mode.
- [ ] Navigation works with arrow keys, WASD, Enter, Escape, and Tab.
- [ ] Jeopardy appears as the first game tile.
- [ ] Focusing or hovering Jeopardy updates the full-screen background.
- [ ] Cover art is used when present.
- [ ] An animated, game-themed background appears when cover art is absent.
- [ ] The icon has a diagonal top-left-to-bottom-right sheen.
- [ ] The tile border has a separate moving light highlight.
- [ ] All effects have keyboard-focus equivalents and reduced-motion fallbacks.

### Game files

- [ ] A game file is required before a game can be hosted.
- [ ] The V1 Jeopardy file format is JSON.
- [ ] File validation runs before the host flow.
- [ ] Imported game files cannot execute code.
- [ ] The file format includes metadata, appearance, content, settings, and schema version.

### Builder

- [ ] The builder offers both Visual Editor and AI Builder.
- [ ] The Visual Editor can create and export a valid Jeopardy file.
- [ ] The AI Builder has a working Copy Guide button.
- [ ] The guide contains the current JSON schema and clear output instructions.
- [ ] AI-produced JSON can be imported and validated.

### Hosting

- [ ] A valid Jeopardy file can be loaded and hosted on the current device.
- [ ] The host can configure team names.
- [ ] The board, clue reveal, answer reveal, scoreboard, and scoring work.
- [ ] The user can exit the session and return to the dashboard.

### Scope

- [ ] No account or registration flow exists.
- [ ] No server or online multiplayer is required for V1.
- [ ] Settings include Dark Mode and Light Mode.

---

## 17. Recommended Build Order

1. **Brand foundation and application shell** — create the original Zuno SVG logo family using the logo brief in Section 2.4; establish routing/state, design tokens, theme support, and the responsive base layout.
2. **Dashboard foundation** — header, game rail, hero panel, tile selection, global background behavior.
3. **Motion system** — tile lift, border beam, diagonal sheen, background transitions, reduced-motion fallback.
4. **Keyboard navigation** — roving focus, arrow/WASD map, Enter/Escape behavior, focus restoration.
5. **Common game-file schema** — JSON types, parser, validation, safe rendering.
6. **Jeopardy engine** — board, clue screen, answer reveal, teams, scoreboard, session state.
7. **Import and host flow** — file picker, preview, validation, session setup, host launch.
8. **Visual builder** — editable categories/questions, validation, appearance controls, JSON export.
9. **AI builder** — schema-aware Copy Guide, clipboard fallback, import instructions.
10. **QA and polish** — keyboard, file security, reduced motion, performance, responsive testing.

The dashboard and game-file architecture should be established before expanding the platform with additional game engines.

---

## 18. Future Expansion (Not V1)

Potential future game types:

- Trivia.
- Family Feud-style survey game.
- Quiz bowl.
- Word guessing games.
- Memory and matching games.
- Custom classroom review games.

Potential future platform features:

- Multiple game-file formats or bundled assets.
- Local game-file library management.
- Additional background animation presets.
- More dashboard customization.
- Optional online hosting and remote participant connections.
- Shared game sessions across devices.
- Additional editor templates.

Future games must reuse the common dashboard, file validation, game registration, and import/host architecture.

---

## 19. Visual Research and References

The supplied PS5 dashboard screenshot is the primary visual reference for Zuno's composition: a horizontal row of game icons, a large selected-game artwork area, a minimal top navigation, and content arranged around the selected game.

The following research informed the implementation requirements:

1. **Sony — How to customize the Welcome hub on PS5 consoles**  
   https://www.playstation.com/en-us/support/account/welcome-hub/  
   Sony documents customizable backgrounds, image selection, slideshow mode, and other ways to personalize the PS5 home-screen hub. This supports Zuno's use of game-specific full-screen artwork and optional animated backgrounds.

2. **Sony — PS5 system update introduces the Welcome hub**  
   https://blog.playstation.com/2024/09/12/ps5-system-update-adds-welcome-hub-party-share-personalized-3d-audio-profiles-adaptive-controller-charging-and-more/  
   Sony describes the Welcome hub as a customizable home-screen area with widgets and selectable backgrounds, including animated designs.

3. **Charcoal UI — Glare Hover**  
   https://charcoalui.com/docs/components/glare-hover  
   Documents a diagonal band of light translated across a surface on hover. This is a useful technical reference for Zuno's icon reflection layer. Its documentation also calls for keyboard/static equivalents and reduced-motion handling.

4. **Kinetics — Sheen Sweep**  
   https://kinetics.colorion.co/effects/sheen-sweep/  
   Describes a specular highlight gliding across a surface and demonstrates a translucent gradient strip moving across an element. This informs the diagonal icon sheen behavior and its timing.

5. **Kinetics — Border Beam**  
   https://kinetics.colorion.co/effects/border-beam/  
   Describes a moving light along a masked gradient border. This informs the separate moving outline highlight.

### 19.1 Interpretation note

The researched terms — *specular highlight*, *sheen sweep*, and *border beam* — are standard descriptions for the visible effects requested. Public PlayStation support material documents the dashboard and background customization behavior, but does not publish the exact internal shader, animation code, or rendering pipeline used for the PS5 icon glare. Zuno should reproduce the visual impression with its own implementation rather than claim to duplicate Sony's proprietary internals.

---

## 20. Final Product Definition

Zuno V1 is a premium-feeling, keyboard-first, PS5-inspired game dashboard with one game engine: Jeopardy. It does not ship with fixed Jeopardy content that can be played without a file. Each session is powered by a user-supplied or user-created JSON game file.

Users can create that file in either of two ways:

- Build it themselves in the visual editor.
- Use the AI Builder's **Copy Guide** prompt with an external AI assistant, save the resulting JSON, and import it.

Once a valid file is loaded, the user can host the game locally on the current device. The dashboard, artwork behavior, animated fallback backgrounds, moving border light, diagonal icon reflection, keyboard navigation, and Dark/Light Mode should all feel like parts of one cohesive product.

**Zuno — Pick. Build. Play.**
