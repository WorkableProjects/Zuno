# Headbands — Game Specification

**Product:** Zuno  
**Game:** Headbands  
**Game type:** `headbands`  
**Document:** `HeadbandsSPEC.md`  
**Status:** Implementation specification  
**Target:** Add Headbands as a second first-party Zuno game engine  
**Deployment:** Static GitHub Pages; no backend required

---

## 1. Overview

Headbands is a local, group-based hidden-identity guessing game. Each player receives an identity that they cannot see, while the other players can see it. On their turn, a player asks the group questions that can be answered with **Yes** or **No**, then makes a guess when they think they have identified what is assigned to them.

The game should preserve the familiar forehead-card experience while making it easy to host from a laptop, tablet, classroom display, or phone.

Headbands is a separate game engine inside Zuno. It must not change Jeopardy's gameplay, file format, or existing host flow.

### 1.1 Product goals

- Recreate the core hidden-identity, yes/no-question party game.
- Support both written identities and image identities.
- Let the host choose the identity mode before starting.
- In image mode, display a short answer label directly underneath each image. For example, an image of an iPhone has the subtext `iPhone`.
- Make it possible to prepare and run a complete game without accounts, a server, or third-party services.
- Keep game content portable in Zuno's existing `.zuno.json` format.
- Work on GitHub Pages and other static hosts.
- Match Zuno's premium, console-inspired design language while keeping the in-game interface fast and readable.

### 1.2 Non-goals

- Online multiplayer, matchmaking, room codes, or cross-device synchronization.
- Accounts, registration, profiles, or cloud saves.
- Built-in voice/video calls or chat.
- AI-generated identities or images.
- Required external image APIs, image search, or image hosting.
- A 3D world, avatars, or a real-time networked environment.
- Copying another website's branding, visual assets, layouts, text, or implementation.

The game is named **Headbands** in Zuno. Do not use another product or website name in the UI, source identifiers, game metadata defaults, or documentation.

---

## 2. Core Gameplay

### 2.1 The basic idea

Every active player has one secret identity assigned to them.

- The identity is visible to the rest of the group.
- The player assigned that identity must not see it.
- The player asks questions about their own identity.
- Other players answer honestly using only Yes or No.
- The player uses the answers to narrow down the possibilities and guess the identity.

Examples of useful questions:

- Am I a real object?
- Am I electronic?
- Am I something people use every day?
- Am I alive?
- Am I a fictional character?
- Am I commonly found in a house?

The group should not give unsolicited hints, spell the answer, or describe the identity unless the host has explicitly enabled a house-rule variation.

### 2.2 Player count

- Support **2–8 players** in the initial release.
- Require at least 2 players to start.
- Do not impose a network-based player limit.
- The host may participate as a guessing player or act only as the host.

### 2.3 Round flow

A standard game follows this sequence:

1. The host loads a valid Headbands game file.
2. The host enters player names and chooses the identity mode.
3. The host assigns identities manually or shuffles the available identity deck.
4. Zuno verifies that every active player has exactly one valid identity.
5. The host starts the round.
6. The first player takes their turn.
7. The identity card is presented so the player can see the group but cannot see their own identity.
8. The player asks a Yes/No question.
9. The group answers.
10. The player may make a direct guess when ready.
11. A correct guess marks that player as solved.
12. An incorrect guess follows the selected guess rule.
13. The turn passes to the next unsolved player.
14. Play continues until everyone has guessed correctly or the host ends the game.

The default turn order is the order entered by the host.

### 2.4 Question and answer rules

- Questions must be answerable with Yes or No.
- The group should agree on one answer when there is disagreement.
- The host may record the answer to the current question for reference.
- The game must not automatically infer or generate answers.
- The game must not reveal an identity just because a player asks a question.
- Players can ask broad questions first and progressively narrow their guesses.

**Default turn rule:** Each player gets one question per turn. After the group answers, the turn passes to the next unsolved player. The player can make a guess during their turn.

Offer an optional setting, **Continue after Yes**, which keeps the turn with the current player when the group answers Yes. When disabled, every question ends the turn. This setting must be explained in the setup screen.

### 2.5 Guessing rules

A player can submit an exact guess at any point during their turn.

- A correct guess marks the player as solved and records their completion.
- A wrong guess does not reveal the correct identity.
- By default, an incorrect guess ends the player's turn.
- The host can enable **Unlimited Guesses**, which permits additional guesses during the same turn.
- The host may reveal the answer after the game ends or when manually ending the round.
- A solved player no longer receives turns but may continue answering questions for others.

Comparison should be case-insensitive and ignore leading/trailing whitespace. Do not use aggressive fuzzy matching that could accept an unrelated answer. The host must have a way to accept a reasonable alternate spelling or manually mark a guess correct.

### 2.6 Game completion

The standard game ends when all active players have correctly guessed their identities.

The end screen should show:

- Game title.
- Player names.
- Each player's solved status.
- Number of questions asked, if tracked.
- Number of guesses, if tracked.
- A **Play Again** action.
- A **Return to Zuno** action.

The host can end the game early. If the host ends early, show the remaining identities only after explicit confirmation.

No player should be declared a winner solely because they guessed first unless the host selects a first-to-solve house rule. The default objective is for everyone to solve their own identity.

---

## 3. Identity Modes

The host must choose one of two modes during session setup.

### 3.1 Text Mode

**Purpose:** Classic written-identity gameplay.

Each identity is a short word or phrase displayed on a card.

Examples:

- iPhone
- Taylor Swift
- Eiffel Tower
- Golden Retriever
- Spider-Man
- Pizza

Requirements:

- Display the identity in large, high-contrast typography.
- Support multi-word identities.
- Preserve punctuation and accents.
- Wrap long identities without clipping.
- Do not show the active player's identity to that player.
- Do not display extra hints unless they are part of an explicitly configured variation.

### 3.2 Image Mode

**Purpose:** Use an image as the primary identity card.

Each identity must contain:

1. An image.
2. A required subtext label containing the identity to guess.

Example:

- Image: photograph of an iPhone.
- Subtext: `iPhone`.

The subtext is the answer label. It is not a hint or a description. It must be displayed directly underneath the image, clearly associated with it.

Requirements:

- The image is the main visual element.
- The subtext appears directly below the image, centered and readable.
- The subtext must not be embedded into the image as the only way to identify the answer.
- The answer label must remain available to the game engine for guess validation.
- The image and its subtext must be treated as one identity.
- The image must preserve its aspect ratio and use a contained/cropped presentation that does not distort the subject.
- Use a neutral placeholder if an image cannot load; never show a broken-image icon.
- The player assigned the identity must not see either the image or its subtext until their identity is revealed after a correct guess or the game ends.

**Visibility rule:** Other players can see the image and its subtext. The player assigned that identity cannot see either one. This rule applies to every image identity, including custom uploads.

### 3.3 Host mode selection

The setup screen must show two clear choices:

- **Text** — Guess a word or phrase.
- **Images** — Guess from a picture with its answer displayed underneath.

The choice must be explicit; do not silently switch modes based on which fields happen to exist in the game file.

When Image Mode is selected:

- Only image identities are eligible for assignment.
- Every identity must have a valid image and non-empty subtext.
- Show an image preview and its subtext in the host's assignment interface.
- Reject incomplete image identities before the game starts.

When Text Mode is selected:

- Only text identities are eligible for assignment.
- Image fields are ignored for gameplay and should not be displayed.
- Reject identities without a usable text answer.

---

## 4. Identity Assignment and Host Controls

### 4.1 Host setup

The host setup screen must include:

- Game title and description.
- Player count and player-name fields.
- Text/Image mode selection.
- Identity assignment method.
- A preview of the identity deck.
- Game rules and optional settings.
- A validation summary.
- A **Start Game** action.

### 4.2 Assignment methods

Support two assignment methods.

**Manual assignment**

- The host chooses one identity for each player.
- Each player must receive exactly one identity.
- The same identity cannot be assigned to multiple players in the same round unless the game file explicitly allows duplicates.
- The host can change an assignment before starting.

**Random assignment**

- Shuffle eligible identities and assign one to each player.
- Use a proper in-browser random shuffle.
- Do not assign more identities than are available.
- If the deck has fewer eligible identities than players, disable Start Game and explain how many more are needed.
- A player must never be assigned an identity that is also displayed as their own answer elsewhere in the interface during their turn.

### 4.3 Assignment privacy

The host needs to see and manage all assignments before starting. The guessing player must not be able to open the host assignment screen during normal gameplay.

After the game starts:

- Do not display the full player-to-identity assignment list in the normal player interface.
- Do not include secret answers in visible browser titles, notifications, or accessibility labels on the guesser's screen.
- Do not put secret identity text into DOM elements that are visually hidden but still exposed to the active guesser's interface.
- Keep the answer in session state for validation, but only render it in views where the host or other players are permitted to see it.
- Avoid accidental answer leaks in debug output, logs, or error messages.

This is a shared-device party game, not a security boundary against a technically sophisticated user with developer tools. The interface must nevertheless make accidental spoilers difficult.

### 4.4 Host controls during play

Provide a compact host control panel with:

- Pause/resume.
- Show/hide the current identity card for the group.
- Mark a guess correct (host override).
- Undo the most recent host override where practical.
- Skip a player's turn.
- Reorder remaining players.
- End game.
- Restart round, with confirmation.

The host must be able to hide the identity card before handing the device to the guesser.

### 4.5 Physical presentation and privacy

The game should work naturally in two arrangements:

**Phone/tablet held outward**

The player holds the device facing the rest of the group, like a digital forehead card. The group can see the identity while the player cannot see the screen. The host can hide the card while the device is passed to the next player.

**Shared screen/projector**

The identity is displayed on a shared screen for the group. The active player faces away from the display while asking questions. The host hides the card before revealing the next player's identity.

The UI should include a brief reminder at the start of each turn: **Keep your own identity hidden from yourself.**

Do not require camera access, face tracking, or device orientation permissions.

---

## 5. Session Interface

### 5.1 Main play screen

The main game screen should prioritize the current player and their turn.

Display:

- Game title in a compact header.
- Current player's name and turn indicator.
- Turn progress (for example, Player 2 of 5).
- A clear identity card when the group view is active.
- Question/answer guidance.
- A guess action.
- Host controls.
- Remaining players and solved status.

The interface should be understandable from a distance and on a small screen.

### 5.2 Identity card states

The identity card must support these states:

| State | Behavior |
|---|---|
| Group visible | Other players can read the identity |
| Hidden | Card is covered by a neutral privacy surface |
| Guesser turn | The active player is reminded not to look at the card |
| Solved | The player's identity may be revealed to them |
| Game over | All identities can be revealed in the recap |

Do not use blur alone as the privacy mechanism. Use an opaque cover or a fully separate hidden state.

### 5.3 Question tracking

The game may keep a simple per-player question history:

- Question text.
- Group answer (Yes/No/Unsure).
- Turn number.

The host or active player can enter a question and record the group's answer. Question history is optional for a casual game but should be supported by the session engine.

Do not make question entry mandatory. The group can play entirely verbally.

### 5.4 Guess dialog

The guess dialog should:

- Accept a text answer.
- Provide a submit action.
- Provide a cancel action.
- Compare the submitted guess with the assigned answer.
- Give clear correct/incorrect feedback.
- Avoid displaying the correct answer after an incorrect guess.
- Support host acceptance for alternate spellings.

For image mode, compare the guess against the image identity's subtext label, not its filename or image URL.

### 5.5 Responsive behavior

- Desktop: use a centered, spacious play layout.
- Tablet: prioritize the identity card and current-player status.
- Phone: use a single-column layout with large controls.
- Avoid horizontal scrolling.
- Keep all essential actions reachable without hover.
- Support touch, mouse, keyboard, and accessible focus states.

---

## 6. Game File Format

Headbands must use the existing Zuno game-file envelope.

- `schemaVersion`: `1`
- `gameType`: `"headbands"`
- Shared metadata and appearance fields must follow the existing common schema.
- Content and settings must be validated by a Headbands-specific validator.
- The importer must reject a Headbands file when the user explicitly selected a different game engine.

### 6.1 Example file

The following example demonstrates both identity formats in one deck. The host's selected mode determines which entries are eligible for assignment. In Image Mode, every eligible identity must have both `image` and `subtext`.

```json
{
  "schemaVersion": 1,
  "gameType": "headbands",
  "metadata": {
    "title": "Everyday Objects",
    "description": "Guess familiar objects using yes-or-no questions.",
    "author": "Zuno",
    "coverImage": null
  },
  "appearance": {
    "accentColor": "#79B8FF",
    "backgroundPreset": "spotlight"
  },
  "content": {
    "identities": [
      {
        "id": "identity-iphone",
        "text": "iPhone",
        "image": "data:image/webp;base64,REPLACE_WITH_IMAGE_DATA",
        "subtext": "iPhone",
        "allowDuplicate": false
      },
      {
        "id": "identity-toaster",
        "text": "Toaster",
        "image": "data:image/webp;base64,REPLACE_WITH_IMAGE_DATA",
        "subtext": "Toaster",
        "allowDuplicate": false
      },
      {
        "id": "identity-pizza",
        "text": "Pizza",
        "image": "data:image/webp;base64,REPLACE_WITH_IMAGE_DATA",
        "subtext": "Pizza",
        "allowDuplicate": false
      },
      {
        "id": "identity-eiffel",
        "text": "Eiffel Tower",
        "image": null,
        "subtext": null,
        "allowDuplicate": false
      }
    ]
  },
  "settings": {
    "defaultMode": "text",
    "continueAfterYes": false,
    "unlimitedGuesses": false,
    "allowDuplicateAssignments": false,
    "maxPlayers": 8
  }
}
```

The example's image data strings are placeholders, not valid images. A real file must contain valid image data URLs or valid HTTPS image URLs.

### 6.2 Type definitions

Suggested TypeScript types:

```ts
export const HEADBANDS_TYPE = "headbands";

export type HeadbandsMode = "text" | "image";

export interface HeadbandsIdentity {
  id: string;
  /** Identity used in Text Mode and as the canonical answer. */
  text: string;
  /** HTTPS image URL or embedded raster data URL. Required for Image Mode. */
  image: string | null;
  /** Visible answer label below the image. Required for Image Mode. */
  subtext: string | null;
  /** Whether this identity may be assigned more than once when duplicates are enabled. */
  allowDuplicate?: boolean;
}

export interface HeadbandsContent {
  identities: HeadbandsIdentity[];
}

export interface HeadbandsSettings {
  defaultMode: HeadbandsMode;
  continueAfterYes: boolean;
  unlimitedGuesses: boolean;
  allowDuplicateAssignments: boolean;
  maxPlayers: number;
}
```

### 6.3 Validation requirements

The Headbands validator must check:

**Common fields**

- Supported schema version.
- Correct `gameType`.
- Valid metadata and appearance.
- Safe, non-executable plain-text content.
- File size within the shared Zuno file limit.

**Identities**

- `content.identities` must be a non-empty array.
- Every identity must be an object.
- Every identity must have a unique, non-empty ID.
- `text` must be a non-empty string.
- `image` must be null or a valid HTTPS image URL / supported embedded raster data URL.
- `subtext` must be null or a non-empty string.
- Text and subtext must respect the shared text-length limit.
- Image data must respect the shared image-size limit.
- Duplicate IDs must be rejected or safely normalized with a warning, following the established Zuno validator convention.

**Settings**

- `defaultMode` must be `text` or `image`.
- Boolean settings must be actual booleans.
- `maxPlayers` must be a whole number from 2 through 8.

**Mode-specific validation**

- Text Mode requires at least two usable text identities.
- Image Mode requires at least two identities with both a valid image and non-empty subtext.
- The setup flow must verify there are enough eligible, non-duplicate identities for the selected player count.
- A missing image must never silently become a text identity in Image Mode.
- A missing subtext must never be replaced with a filename, URL, or inferred answer.

### 6.4 Security and rendering

- Treat all imported values as untrusted data.
- Render text as plain text; never inject game-file strings as HTML.
- Reject unsafe image protocols such as `javascript:`, `data:text/html`, and non-HTTPS remote URLs.
- Only allow the image formats already supported by Zuno's shared validator.
- Never evaluate imported code.
- Do not load scripts, stylesheets, or executable resources from a game file.
- Do not log secret answers during normal play.

---

## 7. Game Builder and Import Workflow

### 7.1 Builder integration

Add Headbands to the Zuno game builder.

The Headbands builder should let a user:

- Set title, description, author, and appearance.
- Add, edit, duplicate, reorder, and remove identities.
- Enter the text identity.
- Upload an image for an identity.
- Enter the image subtext.
- Preview the text card.
- Preview the image card with its subtext.
- Choose the default identity mode.
- Configure default game rules.
- Validate and export a `.zuno.json` file.

The builder should make the distinction between `text`, `image`, and `subtext` obvious. Do not label subtext as an optional caption in Image Mode; it is the answer that players are trying to guess.

### 7.2 Image uploads

No upload service is permitted or required.

When the user selects a local image:

1. Read it in the browser.
2. Validate its MIME type and file size.
3. Convert it to a supported embedded raster data URL if needed.
4. Store the data URL in the game-file draft.
5. Show a preview.
6. Include the image data in the exported `.zuno.json` file.

Prefer embedded image data for portability and reliable GitHub Pages operation. HTTPS image URLs may be supported as an optional advanced input, but they can depend on the external host remaining available.

Use the existing shared image-size limits unless a deliberate, tested change is made to the common schema. Do not raise the global file limit only to accommodate Headbands without reviewing the effects on all game engines.

### 7.3 Import

The existing Zuno importer must recognize `gameType: "headbands"` through the registry.

After a successful import:

- Show title and description.
- Show the number of usable text identities.
- Show the number of usable image identities.
- Show any validation warnings.
- Allow the host to continue to Headbands setup.
- Never start a session before validation succeeds.

### 7.4 AI Builder

A Headbands AI Builder may be added alongside the visual editor.

Its Copy Guide must instruct an external AI assistant to output valid Zuno JSON only, with:

- Correct schema version and game type.
- Unique IDs.
- Complete metadata and settings.
- A useful deck of recognizable identities.
- Text labels for every identity.
- Image fields left null unless the user supplies actual image URLs or embedded image data.
- Both image and subtext populated for every image identity.
- No invented image URLs.
- No HTML, JavaScript, or executable content.

The AI Builder must not call a paid AI API or require an AI account integration.

---

## 8. Technical Architecture and Repository Integration

### 8.1 Existing architecture

The current repository already separates:

- Shared game-file types and validation.
- Game-specific validators.
- The game engine registry.
- Import and host routing.
- Game-specific runtime screens.
- Builder screens.

Preserve this architecture. Headbands should be added through the existing extension points rather than being implemented as conditional logic throughout Jeopardy components.

### 8.2 Expected implementation areas

Use the repository's existing naming and organization conventions. A likely structure is:

```text
src/
  game-files/
    schema/
      headbands.ts
  games/
    registry.ts
    headbands/
      HeadbandsSetup.tsx
      HeadbandsGame.tsx
      headbandsEngine.ts
      headbandsSession.ts
  components/
    builder/
      HeadbandsVisualEditor.tsx
      HeadbandsAIGuide.tsx
```

Additional small components may be created for:

- Identity card.
- Player list.
- Guess dialog.
- Question history.
- Host controls.
- Mode selection.

Do not create a second independent importer, dashboard, settings system, or file format pipeline.

### 8.3 Registry integration

Register Headbands in `src/games/registry.ts` with:

- `gameType: "headbands"`
- Display title: `Headbands`
- A concise description.
- Supported schema version `[1]`.
- A Headbands-specific validator.
- Builder availability.
- A distinct but compatible appearance preset/accent.

The dashboard should discover Headbands through the existing engine registry.

### 8.4 Application routing

Extend `src/app/App.tsx` with Headbands-specific screens and typed session state.

Expected states:

- Dashboard.
- Import.
- Headbands setup.
- Headbands play.
- Headbands visual editor.
- Optional Headbands AI guide.

Do not route a Headbands file into Jeopardy setup or runtime. Do not weaken the existing type safety to make the two engines share incompatible state.

### 8.5 Session engine

Keep game rules and state transitions outside the React presentation components.

The session engine should manage:

- Active player order.
- Player names and solved status.
- Identity assignments.
- Selected mode.
- Current turn.
- Question history.
- Guess attempts.
- Correct/incorrect outcomes.
- Host overrides.
- Pause and end-game state.

Suggested pure operations:

- Create a session from validated content and setup options.
- Assign identities.
- Get the next unsolved player.
- Record a question and answer.
- Submit a guess.
- Mark a player solved.
- Apply a host correctness override.
- Skip a turn.
- End or reset a round.

Pure operations make the game easier to test and prevent UI components from becoming the source of game rules.

---

## 9. Zero-Setup and GitHub Pages Requirements

This requirement is mandatory.

### 9.1 Static-only operation

Headbands must run entirely in the browser.

- No backend server.
- No database.
- No authentication.
- No environment variables.
- No API keys.
- No server-side image processing.
- No cloud upload.
- No WebSocket connection.
- No external multiplayer service.
- No required third-party runtime dependency loaded from a CDN.

The normal Zuno build must be sufficient to deploy the feature.

### 9.2 GitHub Pages compatibility

- Use the existing Vite build process.
- Preserve the relative base path in `vite.config.ts`.
- Do not assume the app is hosted at the domain root.
- Do not introduce server-side routing requirements.
- Ensure static assets resolve correctly when hosted under a repository subpath.
- Do not require custom HTTP headers or server configuration.
- Verify the production build using the repository's existing build command.

### 9.3 Browser storage

The current session should work without persistent storage.

Optional persistence may use localStorage for small preferences, such as the last selected mode. Do not store sensitive information.

If draft persistence or recent game files are added, follow the existing Zuno storage conventions. Never assume a browser-stored filename means the original file remains available.

### 9.4 Offline and image behavior

- Embedded images must work without a separate image host.
- Remote HTTPS images are optional and may fail if the external host blocks or removes them.
- A failed remote image must produce a clear placeholder and host-facing warning.
- Text Mode must not require image loading.
- No image search or upload request may occur automatically.

### 9.5 Device capabilities

Do not require:

- Camera.
- Microphone.
- Geolocation.
- Notifications.
- Clipboard.
- Orientation permissions.

The game must work with ordinary browser input and rendering capabilities.

---

## 10. Visual Design and UX

### 10.1 Design direction

Headbands should feel like a native Zuno game, not a separate website.

- Reuse Zuno's dark/light themes and design tokens.
- Use the existing typography and button language.
- Keep the game interface focused on the identity card and current player.
- Use the configured game accent color for emphasis.
- Use restrained transitions and clear feedback.
- Avoid generic gradients, excessive glass effects, and unnecessary decorative UI.

### 10.2 Identity card

The identity card is the visual centerpiece.

Text Mode:
- Large, centered identity text.
- Strong contrast.
- Flexible wrapping.
- No unnecessary artwork.

Image Mode:
- Large image.
- Subtext directly below.
- Clear spacing between image and answer label.
- Consistent card sizing.
- No distorted images.

### 10.3 Motion

- Card reveal/hide: 180–260 ms.
- Turn transition: 200–300 ms.
- Correct guess feedback: 250–400 ms.
- Dialog open: 180–240 ms.
- Use opacity and transform for transitions.
- Respect `prefers-reduced-motion`.
- Never make a moving animation the only indicator of turn or solved status.

### 10.4 Accessibility

- Full keyboard operation.
- Visible focus indicators.
- Semantic headings and button labels.
- Accessible labels for identity images.
- Sufficient text contrast in both themes.
- Do not use color alone to communicate correctness or solved status.
- Support browser zoom and narrow screens.
- Respect reduced-motion preferences.
- Keep touch targets comfortably sized.

---

## 11. Error Handling and Edge Cases

The host should always understand what is wrong and how to fix it.

| Situation | Required behavior |
|---|---|
| Fewer than 2 players | Disable Start Game and explain the minimum |
| No identities | Reject the game file |
| Not enough eligible identities | Disable Start Game and show the required count |
| Missing image in Image Mode | Exclude the identity and explain the issue |
| Missing subtext in Image Mode | Exclude the identity and explain the issue |
| Invalid image URL | Show a validation error |
| Remote image fails | Show a placeholder and allow reassignment |
| Duplicate identity assigned | Reject unless duplicate assignment is enabled |
| Player name is blank | Require a name or apply an explicit host-approved default |
| Incorrect guess | Do not reveal the answer |
| Player leaves or is removed | Host can remove them and continue with remaining players |
| All players solved | Show the completion screen |
| Host ends early | Confirm before revealing unsolved identities |
| Browser refresh | Do not claim the session can be recovered unless session persistence was implemented and tested |

Do not silently discard players or identities to make an invalid setup start.

---

## 12. Testing Requirements

### 12.1 Schema and validator

- Valid Headbands files pass validation.
- Incorrect game types fail.
- Unsupported schema versions fail.
- Missing metadata/content fails.
- Empty identity decks fail.
- Duplicate IDs are handled consistently.
- Empty text identities fail.
- Invalid image protocols fail.
- Invalid embedded image MIME types fail.
- Oversized images fail.
- Image Mode identities without images fail eligibility validation.
- Image Mode identities without subtext fail eligibility validation.
- Text Mode can run without images.
- Imported strings are rendered as text, never executable HTML.

### 12.2 Session engine

- Two-player game can start.
- Eight-player game can start.
- One-player game cannot start.
- Manual assignment gives each player one identity.
- Random assignment produces valid unique assignments by default.
- Duplicate assignments work only when enabled and explicitly permitted.
- Solved players are skipped.
- Correct guesses mark the correct player solved.
- Incorrect guesses do not reveal the answer.
- Unlimited Guesses behaves as configured.
- Continue after Yes behaves as configured.
- Host override marks the correct player solved.
- Ending and restarting a round work correctly.

### 12.3 UI

- Text Mode displays the identity correctly.
- Image Mode displays the image with its subtext underneath.
- The active player is clearly identified.
- The identity can be hidden and shown by the host.
- The active guesser is not shown their own identity.
- Correct and incorrect feedback is clear.
- Player progress is accurate.
- The game works on desktop, tablet, and phone.
- Keyboard and touch controls work.
- Reduced-motion mode works.
- Dark and Light themes work.

### 12.4 Deployment

- `npm run build` succeeds.
- `npm test` succeeds.
- Production assets load from a GitHub Pages repository subpath.
- No runtime backend requests are required.
- Embedded image identities work on the deployed site.
- Importing a game file works on the deployed site.

---

## 13. Acceptance Criteria

Headbands is ready when:

### Platform integration

- [ ] Headbands appears in the Zuno game dashboard.
- [ ] The game is registered independently from Jeopardy.
- [ ] The shared importer recognizes Headbands game files.
- [ ] Headbands has its own validator and runtime.
- [ ] Existing Jeopardy functionality remains unchanged.
- [ ] The builder can create and export valid Headbands files.

### Gameplay

- [ ] The host can add 2–8 players.
- [ ] The host can select Text or Image Mode.
- [ ] The host can manually assign or randomly distribute identities.
- [ ] Players ask Yes/No questions.
- [ ] Players can submit guesses.
- [ ] Correct guesses mark players as solved.
- [ ] Incorrect guesses do not reveal answers.
- [ ] The game continues until all players solve or the host ends it.

### Image Mode

- [ ] Each image identity has an image and required subtext.
- [ ] The image appears as the main identity content.
- [ ] The subtext appears directly underneath the image.
- [ ] The subtext is the canonical answer for guess validation.
- [ ] The active guesser is not shown their own image or subtext.
- [ ] Local image uploads work without an external upload service.

### Zero setup

- [ ] No backend, accounts, API keys, or database are required.
- [ ] The production build works on GitHub Pages.
- [ ] Relative asset paths work under a repository subpath.
- [ ] Embedded images work without an image-hosting service.
- [ ] No special browser permissions are required.

### Quality

- [ ] The interface matches Zuno's existing design system.
- [ ] The game works with keyboard, mouse, and touch.
- [ ] The game is responsive.
- [ ] Reduced-motion preferences are respected.
- [ ] Tests cover validation, session logic, and core gameplay.

---

## 14. Recommended Implementation Order

1. **Schema and types** — define the Headbands identity, content, and settings types.
2. **Validator** — implement Headbands-specific validation using shared Zuno helpers.
3. **Session engine** — implement assignment, turn order, question history, guessing, and completion as testable pure logic.
4. **Registry integration** — register the new engine and verify dashboard discovery.
5. **Setup screen** — player names, mode selection, assignment, and rule options.
6. **Runtime UI** — identity card, privacy cover, player status, questions, guesses, and host controls.
7. **Application routing** — connect the Headbands setup and runtime to the existing app screen stack.
8. **Visual builder** — identity editing, image upload, previews, settings, validation, and export.
9. **AI Builder** — optional schema-aware Copy Guide.
10. **Testing and deployment** — regression-test Jeopardy, run the full test suite, and verify GitHub Pages subpath behavior.

Do not start with visual polish before the schema, validator, and session engine are stable.

---

## 15. Research and Design References

The game mechanics below are based on the widely used hidden-identity forehead guessing game, also commonly called Who Am I? or the sticky-note guessing game. The rules vary between groups, so this specification defines one consistent default rule set for Zuno.

1. **PostitGuess — How to play Who Am I?**  
   https://postitguess.io/guides/how-to-play-who-am-i/  
   Describes the hidden identity, yes/no questions, player turns, and the difference between manual, theme, and mixed identity selection.

2. **PostitGuess — How to play with pictures**  
   https://postitguess.io/guides/play-postitguess-with-pictures/  
   Describes image identities, the requirement that the guesser cannot see their own picture, and the use of a secret answer associated with a custom image.

3. **PostitGuess — What is the game with a name on your forehead?**  
   https://postitguess.io/guides/what-is-the-forehead-guessing-game/  
   Explains the defining hidden-information mechanic and common rule variations.

4. **EMStudio — Headbands Game Rules**  
   https://emstudio.pro/resources/games/headbands  
   Summarizes the physical card/headband version: wear an unseen identity, ask yes/no questions, receive group answers, guess, and continue.

5. **GitHub Pages documentation**  
   https://docs.github.com/en/pages  
   GitHub Pages serves static websites. Zuno's browser-only implementation is therefore compatible with Pages as long as the production build and asset paths are correct.

### 15.1 Research interpretation

The important mechanic is the information asymmetry: everyone else can see a player's assigned identity, but that player cannot. The image mode adds a visual identity while preserving the same question-and-answer rules.

Zuno's implementation should use its own interface, original copy, data structures, and visual assets. The references inform the gameplay concept only. Do not copy another site's name, branding, maps, avatars, illustrations, source code, or distinctive interface.

---

## 16. Final Product Definition

**Headbands** is a local, browser-based hidden-identity party game inside Zuno. The host loads a game file, adds players, chooses Text or Image Mode, assigns identities, and starts the round. Players take turns asking yes/no questions and guessing the identity assigned to them.

Text Mode uses written words or phrases. Image Mode uses a picture with its answer label displayed directly underneath. In both modes, the assigned player must not see their own identity until it is correctly guessed or the game ends.

The entire feature runs in the browser. Game files and embedded images are loaded locally; no account, backend, database, API key, or external hosting service is required.

**Headbands — See everyone else's identity. Discover your own.**
