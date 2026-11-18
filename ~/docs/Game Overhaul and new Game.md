# Zuno Game Overhaul and New Game Specification 11/17

## Document status

- **Audience:** Zuno maintainers, designers, and contributors
- **Scope:** Improvements to Jeopardy, Headbands, and LIAR; cross-app UI improvements; one major new game
- **New game:** **Zuno Trivia Gauntlet** (working title)
- **Architecture baseline:** React + TypeScript + Vite; static game files in `src/game-files/schema`; engines under `src/games`; shared shell and screen stack in `src/app/App.tsx`

---

## 1. Goals

The overhaul should make Zuno:

1. Faster to set up.
2. Easier for mixed-age groups and unfamiliar players.
3. Clearer on every shared and individual screen.
4. More reliable for local and online play.
5. Dramatically more replayable through presets and a larger, mode-rich fourth game.
6. Consistent across the dashboard, builders, setup screens, and game screens.

Success means a group can open Zuno, understand the selected game, configure it, and begin play without reading documentation or relying on the host to explain controls.

---

## 2. Cross-game requirements

### 2.1 Consistent session lifecycle

Every game should support a predictable lifecycle:

```text
Load or create game
  -> Configure session
  -> Add/join players
  -> Confirm settings
  -> Ready check
  -> Play
  -> Pause/interruption handling
  -> Round summary
  -> Results
  -> Rematch or exit
```

Required behavior:

- Host state is visible on every play screen.
- Pausing is available to hosts, with an explicit paused overlay.
- Leaving and reconnecting do not silently reset session state.
- The **Back**, **Exit**, **Restart**, and **Rematch** actions have confirmation where destructive.
- A session summary appears at both the round and match levels.
- Keyboard and touch controls are complete alternatives.
- All game engines expose pure state-transition functions where practical.

### 2.2 Shared accessibility

- Visible focus rings on every control.
- Minimum interactive target size: 44 × 44 CSS pixels.
- Status information never relies on color alone.
- Every icon-only button has an accessible label and tooltip.
- Text contrast satisfies WCAG AA.
- Timers support pause and an optional high-contrast mode.
- Reduced-motion users receive the static equivalent of every animation.
- Screen readers receive a live region for turn, score, phase, and reveal announcements.
- Avoid flashing or strobing effects.

### 2.3 Shared setup standard

Each setup screen must contain:

1. **Game summary**: title, player count, duration, and one-sentence explanation.
2. **Mode cards**: concise descriptions, not hidden configuration menus.
3. **Required configuration** with sensible defaults.
4. **Optional configuration** collapsed by default.
5. **Preview** of the first board, round, card, or lobby state.
6. **Validation state** that identifies and scrolls to the first invalid field.
7. **Start action** that is disabled only with a clear explanation.

---

## 3. Jeopardy overhaul

### 3.1 Current base

Jeopardy currently provides category boards, clue selection, team setup, timer support, scoring, a final-round option, and a winner reveal. It uses `JeopardyGame.tsx`, `JeopardySetup.tsx`, `jeopardyEngine.ts`, and the Jeopardy game-file schema.

### 3.2 Setup improvements

Replace the separate configuration list with a structured setup page:

- Team editor with drag-and-drop reorder and quick duplicate-name checking.
- Team colors and two-letter initials.
- Presets:
  - **Classic:** 6 categories, 5 clues per category, 30-second response timer.
  - **Quick:** 5 categories, 4 clues per category, 20-second timer.
  - **Tournament:** 6 categories, 5 clues per category, strict scoring and final Jeopardy.
  - **Custom:** all settings manually controlled.
- Board preview showing category count and clue distribution.
- Optional **Daily Double** placement preview.
- A clear summary of final Jeopardy configuration.
- Time limits may be disabled entirely for informal play.

### 3.3 Board improvements

- Keep category headers sticky while scrolling on smaller screens.
- Dim and mark completed clues rather than removing them suddenly.
- Show clue point value, status, and selected state in a consistent tile.
- Make category/row navigation fully keyboard operable.
- Add an on-screen board legend:
  - Available
  - Open
  - Correct
  - Incorrect
  - Skipped
- Add optional **Double Jeopardy** round generation.
- Support a final-board preview before opening Final Jeopardy.
- Add category-level progress and team answer progress.

### 3.4 Clue state improvements

Define a strict clue phase:

```text
Available -> Revealing -> Buzzing -> Answering -> Judging -> Resolved
```

For each clue:

- Record team that answered.
- Record whether the answer was judged correct, incorrect, or no response.
- Record whether host override occurred.
- Preserve the original clue and answer for rematches and export.
- Support one or multiple attempted teams according to setup.
- Show who is currently eligible to answer.

### 3.5 Scoring improvements

- Make all score changes previewable before confirmation.
- Add explicit `+point`, `-point`, and custom adjustment controls.
- Prevent accidental negative scores unless `allowNegativeScores` is enabled.
- Show scoring history and the reason for every adjustment.
- Support tie handling:
  - Sudden-death clue
  - Final-round tie vote
  - Shared winner
- Add undo for the latest score action.
- Add a match report with category strengths, best team, total clues answered, and missed clues.

### 3.6 Buzzer and timing improvements

- Local host controls: one action per team, with keyboard shortcuts.
- Color plus team name and player position for buzzers.
- Lockout mode for incorrect or premature answers.
- Visual timer only when the timer is enabled.
- Audio cues for final seconds and reveal transitions.
- Never allow timer expiry to alter score without explicit host confirmation.

### 3.7 Engine implementation targets

In `src/games/jeopardy/jeopardyEngine.ts`:

- Extract board creation, clue resolution, score adjustment, and winner selection into testable pure functions.
- Add immutable state snapshots for undo and rematch.
- Add a serializable `sessionId`, `revision`, and `phase` to session state.
- Keep old game-file schema versions valid.

Required test cases:

- Scoring with positive and negative values
- Multiple-team buzz-in order
- Lockout behavior
- Skipped/expired clues
- Final Jeopardy wager bounds
- Tie-breaking
- Undo and replay
- Invalid clue data

---

## 4. Headbands overhaul

### 4.1 Current base

Headbands currently supports text/image identities, private identity cards, yes/no guessing, host overrides, activity logs, local or online play, player shuffling, and reordering.

### 4.2 Setup improvements

- Preview both the identity and the clue-player’s perspective.
- Clear mode cards for:
  - **Local sharing:** one display and private identities.
  - **Phone mode:** every player uses their own device.
  - **Spectator-free:** no host identity required.
- Separate gameplay and fairness settings:
  - Round length
  - Questions per player
  - Attempts per identity
  - Passing
  - Guess checking
  - Time remaining
  - Host controls
- Deck health preview:
  - Text count
  - Image count
  - Duplicate count
  - Difficulty mix
  - Estimated round length
- Shuffle preview that keeps the host from accidentally changing an in-progress identity order.

### 4.3 Identity lifecycle

Define explicit states:

```text
Assigned -> Ready -> Asking -> Guessed -> Passed -> Reviewed
```

Each identity should track:

- Owner/assigned player
- Guesser
- Start time
- Question count
- Guess count
- Pass count
- Final result
- Optional host override reason

### 4.4 Host tools

Improve `HeadbandsGame.tsx` and `headbandsEngine.ts`:

- Persistent player strip with time, progress, question count, and status.
- Large, one-tap `Solved`, `Not solved`, `Skip`, `Pause`, and `Back` controls.
- Host confirmation for score-affecting and identity-removal actions.
- A full turn timeline with a clear active player marker.
- Optional hosted timer per identity or per round.
- Automatic next-player prompt only after an explicit confirmation.
- Activity log filters: questions, guesses, skips, overrides, and system events.

### 4.5 Guessing clarity

- Show the exact allowed response set: **Yes / No / Almost / Unsure**.
- Preserve question history for the active turn.
- Prevent repeat questions only when the fairness setting enables duplicate detection.
- Mark skipped identities clearly rather than deleting them.
- Separate “correct guess” from “host override” in logs and scores.
- Add a confidence check for guesses: `Correct`, `Likely`, `Uncertain`.

### 4.6 Phone mode improvements

- Larger identity card with low-distraction reveal controls.
- Never show a player’s identity on their own turn device.
- Keep the active card in a recoverable state after refresh.
- Reconnect with the same identity or host-issued invitation state.
- Add a shareable session QR/link generated from the lobby.
- Show only the information relevant to the current action.

### 4.7 Headbands engine implementation targets

- Separate pure turn logic from Firebase lobby synchronization.
- Centralize player rotation and skip behavior.
- Add lobby revisions and conflict-safe last-write handling.
- Define a typed reconnection state and stale-session policy.
- Preserve identity/privacy boundaries in generated state.
- Add tests for host handoff, skipped turns, reshuffle, reconnect, and privacy leaks.

### 4.8 Privacy requirements

- Identity text and image data must never appear in the activity log.
- Device logs must not expose another player’s identity.
- Online lobbies must use database rules that limit reads to necessary lobby state.
- Host console state must remain the source of truth for identity assignment.

---

## 5. LIAR overhaul

### 5.1 Current base

LIAR currently supports local and online play, story prompts, three statements, follow-up questions, questioning/voting, score modes, private statement writing, reveal views, and activity logs.

### 5.2 Setup improvements

- Add presets:
  - **Party:** 6–12 players, 60-second discussion, points on.
  - **Quick:** 4–8 players, 30-second discussion, two rounds.
  - **Hardcore:** 5–10 players, no follow-up hints, points on.
  - **Local:** pass-and-play statement entry.
- Show estimated session length from player count and round count.
- Make question prompts optional in setup.
- Add a first-round walkthrough for new players.
- Clarify whether the storyteller is known, hidden, or randomly revealed.

### 5.3 Statement-writing improvements

- Add autosave drafts locally and an explicit restore option.
- Show character limits and duplicate checks.
- Provide a rewrite prompt, but never silently alter player text.
- Let hosts send an optional 30-second “write prompt” cue.
- In local mode, use a privacy overlay before the next person receives the device.
- Preserve an explicit “no text entered” state rather than generating an empty statement.

### 5.4 Question phase improvements

Define phases:

```text
Writing -> Assigned -> Reading -> Questioning -> Voting -> Reveal -> Scoring
```

- Separate question asking and follow-up asking.
- Let players mark statements as suspicious or reviewed.
- Host controls for pause, skip, remove, and time extension.
- Show only each player’s own writing state until entry closes.
- Display a turn/order rail that is identical across host and player views.

### 5.5 Voting improvements

- Lock an initial vote, then allow edits until the host closes voting.
- Never allow a player to vote for themselves.
- Show vote totals only after reveal unless live results are explicitly enabled.
- Add an optional confidence slider.
- Support anonymous and visible-voter modes.
- Add tie handling for multiple suspected storytellers.
- Record each vote revision for audit purposes.

### 5.6 Reveal improvements

- Reveal each statement and whether it is true or false.
- Clearly identify the storyteller separately from the liar.
- Show player-by-player vote paths.
- Animate only the final reveal, not every state change.
- Add reveal pauses with an explicit “Continue” action.
- Explain points at the moment they change.

### 5.7 Scoring improvements

Make score rules visible before the round:

- Storyteller bonus for fooling at least one player.
- Points for identifying the liar/storyteller.
- Points for avoiding false accusation.
- Optional no-penalty mode.
- Streak bonus, if enabled, must be separately identified.
- Score history must show the exact rule that awarded or removed points.

### 5.8 LIAR engine implementation targets

- Move all statement and vote resolution into `liarEngine.ts` pure functions.
- Add server-safe lobby state revision checks.
- Add reconnection state for every phone.
- Ensure private statements are not included in broadcast state.
- Test simultaneous votes, duplicate statements, invalid names, and host disconnect.

---

## 6. New game: Zuno Trivia Gauntlet

### 6.1 What it is

**Zuno Trivia Gauntlet** is a fast, cooperative-competitive trivia relay for 3–16 players. Teams race through themed lanes, survive elimination-style pressure rounds, and earn a chance to reach the final “Gauntlet” round.

It combines:

- A Jeopardy-style knowledge board
- Team relays
- LIAR-style deception opportunities
- Headbands-style visual and verbal clues
- Short time pressure
- Shared public state and private devices

The new game should feel like Zuno’s own event rather than a fourth trivia clone.

### 6.2 Experience promise

The host runs one high-energy match while teams compete across multiple stages. Every team remains engaged because each stage rotates a different role: reader, responder, challenger, or captain.

### 6.3 Core modes

#### Standard Gauntlet

- 3–8 teams
- 2–8 players per team
- 3 lanes
- 3 round types
- Final Gauntlet

#### Relay

- Individual answers feed a team streak.
- One wrong answer breaks the relay.
- Fastest successful team gets a tiebreak advantage.

#### Survival

- Lowest-scoring team is eliminated after each round.
- Final three teams enter the final round.
- Safe mode disables elimination for classroom use.

#### Co-op Gauntlet

- All players work toward a shared score.
- Individual mistakes remove stamina but do not eliminate a player.
- Designed for 1–16 people or a virtual host.

#### Custom Gauntlet

- Pick lanes, round count, timer, elimination, scoring, and final format.

### 6.4 Match structure

```text
Lobby and Team Draft
  -> Reveal Match Format
  -> Warm-Up Sprint
  -> Lane Selection
  -> Lane Round 1
  -> Intermission
  -> Lane Round 2
  -> Intermission
  -> Choice Round
  -> Chaos Round
  -> Final Gauntlet
  -> Winner Reveal
```

A 30-minute default, 60-minute extended, or custom match length is available.

### 6.5 Lobby and team setup

1. Host selects mode, duration, and difficulty mix.
2. Players join by room code or link.
3. Teams auto-fill by order, or the host enables draft mode.
4. Teams receive names, accents, and an optional icon.
5. Host checks readiness.
6. A warm-up round confirms devices and audio.

Host controls:

- Add/remove team
- Rename/reorder team
- Move player
- Pause/resume
- Skip round
- Substitute host
- End match
- Reopen lobby

### 6.6 Warm-Up Sprint

- 5 short questions.
- 10 seconds each.
- No elimination.
- Winner gains 1 relay token.
- Winner order determines lane choice.

### 6.7 Lane system

The board contains three lanes:

| Lane | Format | Reward | Risk |
|---|---|---|---|
| **Quickfire** | 10 second answers | Fast streak points | Wrong answer breaks streak |
| **Puzzle** | Solve using text, image, or clue sequence | High consistency points | Time expires without partial credit |
| **Wild** | A twist determined by the round deck | Bonus points | Rule may affect every team |

Each team chooses a lane in turn. Once chosen, the lane becomes locked for that round.

### 6.8 Round types

#### 6.8.1 Relay

- Questions arrive one at a time.
- Only the active team member may answer.
- A correct answer advances the relay.
- Passing advances only after the host confirms the pass.
- An incorrect answer breaks the streak and passes control to the next teammate.

Default round:

- 8 questions
- 15 seconds per question
- 100 points per correct answer
- Streak multiplier of 1× through 5×

#### 6.8.2 Puzzle Lane

Possible puzzle types:

- Four clues leading to one answer
- Reorder events or items
- Match terms to definitions
- Find a common link
- Image sequence
- Category elimination
- Logic grid

Scoring:

- 500 points for correct before the first hint
- 350 after the first hint
- 200 after the second hint
- 0 after expiry

#### 6.8.3 Risk and Wild Lane

Wild events are drawn at round start:

- **Double or Nothing:** hide or reveal a 2× score choice.
- **Shift:** transfer a bonus from highest to lowest team.
- **Silence:** team captain cannot speak for 30 seconds.
- **Bounty:** a team claims a category; the challenge is worth extra points.
- **Swap:** team member roles rotate.
- **Sabotage:** each team chooses another team to add one challenge.
- **Mirror:** answers must be submitted by a second player.
- **Sudden Light:** all normal timers become 5 seconds shorter.

Wild events must be balanced and can be excluded in school or family mode.

### 6.9 Choice Round

Before the round, teams secretly choose:

- **Safe:** 300 points for a moderate challenge
- **Bold:** 600 points for a difficult challenge
- **Unknown:** 450 points plus a mystery modifier

Reveal choices together, then run the round. Teams that choose Bold and answer incorrectly lose 100 points unless negative scores are disabled.

### 6.10 Chaos Round

All teams receive a shared prompt. The first team to complete a criterion advances in brackets. Examples:

- Answer three related questions
- Identify the odd item out
- Complete the longest word chain
- Solve a visual sequence
- Finish a mini Headbands card
- Choose the statement nobody proves false

Chaos rounds must use the same state machine as normal rounds, with no hidden score changes.

### 6.11 Final Gauntlet

The final round is a direct elimination of the top two to four teams, depending on setup.

Default Final Gauntlet:

1. **Climb:** answer 5 questions; 20 seconds each.
2. **Crossroads:** choose a special category and risk 500 points.
3. **Lock:** identify the one false statement among 4.
4. **Summit:** shortest team reaction time wins.

Scoring:

- Climb: 200 per correct answer
- Crossroads: 500 if correct, −250 if incorrect
- Lock: 400 if all statements are ordered correctly
- Summit: 750 to the fastest correct team

If the match reaches a tie:

1. Both teams receive one 10-second sudden-death question.
2. One-time 5-second rematch.
3. If still tied, use a host-visible coin-flip/tiebreaker or declare co-winners.

The final mode must always allow co-winners; random game outcomes must never select a false sole winner.

### 6.12 Roles

Each team maintains these roles:

- **Captain:** final answer and relay control
- **Reader:** sees/read public prompt first in visual rounds
- **Responder:** submits text or touch answer
- **Challenger:** can call one challenge or second guess
- **Wildcard:** randomized role change in Wild rounds

Roles rotate automatically after each round. Host can disable role-specific rules.

### 6.13 Player actions

Every phone player may:

- Submit text answer
- Select from choices
- Pass
- Request a hint
- Challenge a score (once per round)
- Mark ready
- Change seat/team only while lobby-open
- Vote in a choice round

The host may:

- Reveal answer
- Award partial credit
- Accept/reject answer
- Pause timer
- Undo latest state transition
- Request review
- Advance stage

### 6.14 Game file format

Add a `GauntletFile` to `src/game-files/schema/gauntlet.ts`.

Suggested shape:

```ts
interface GauntletFile {
  gameType: "gauntlet";
  schemaVersion: 1;
  metadata: {
    title: string;
    description: string;
    author?: string;
    coverImage?: string;
  };
  appearance: {
    accentColor: string;
    backgroundPreset: BackgroundPreset;
  };
  settings: {
    minTeams: number;
    maxTeams: number;
    playersPerTeam: [number, number];
    defaultRoundSeconds: number;
    allowNegativeScores: boolean;
    elimination: boolean;
  };
  warmup: GauntletQuestion[];
  lanes: {
    quickfire: QuickfireDeck;
    puzzle: PuzzleDeck;
    wild: WildDeck;
  };
  choice: ChoiceRoundDeck;
  chaos: ChaosRoundDeck;
  final: FinalGauntletDeck;
}
```

Required validation:

- 1–16 teams
- 1–8 players per team
- At least 1 warm-up question
- Each lane contains at least 4 questions or puzzles
- Wild cards have valid effects
- Choice deck has safe/bold/unknown options
- Final deck has at least 5 climb questions
- No duplicate answer identifiers within a round
- Questions and answers are strings with safe limits
- Images use approved URLs or are excluded

### 6.15 State model

Create `src/games/gauntlet/gauntletEngine.ts` with pure transitions.

Core state:

```ts
interface GauntletState {
  sessionId: string;
  revision: number;
  phase:
    | "lobby"
    | "warmup"
    | "laneChoice"
    | "laneRound"
    | "intermission"
    | "choice"
    | "chaos"
    | "final"
    | "results";
  teams: GauntletTeam[];
  activeTeamId: string | null;
  laneSelections: Record<string, LaneType>;
  roundIndex: number;
  timer: TimerState;
  scores: Record<string, number>;
  streaks: Record<string, number>;
  eliminationHistory: string[];
  wildModifier: WildModifier | null;
  finalists: string[];
  history: GauntletAction[];
}
```

Required transitions:

- `joinTeam`
- `movePlayer`
- `setReady`
- `chooseLane`
- `submitAnswer`
- `submitChoice`
- `passQuestion`
- `resolveAnswer`
- `awardPartialCredit`
- `activateWildModifier`
- `eliminateTeam`
- `advanceRound`
- `pauseTimer`
- `undoLastAction`
- `finishMatch`

### 6.16 UI architecture

Recommended files:

```text
src/games/gauntlet/
  GauntletLobby.tsx
  GauntletSetup.tsx
  GauntletBoard.tsx
  GauntletGame.tsx
  GauntletPhone.tsx
  GauntletJoin.tsx
  GauntletResults.tsx
  gauntletEngine.ts
  gauntletLobby.ts
  gauntlet.css
```

Shared patterns can be extracted into existing UI components instead of duplicating dashboard and setup controls.

### 6.17 Screen descriptions

#### Lobby

- Room code/link
- Team slots
- Readiness per team
- Join button
- Host settings summary
- QR code
- Device status

#### Board

- Team rail
- Lane cards
- Round objective
- Active team
- Timer
- Score/streak state
- Event log
- Host actions

#### Phone

- Name/team/role
- Ready state
- Current action
- Submit or pass controls
- Private hint state
- Reconnection state
- No answer, response, or private role should leak to an unauthorized player

#### Results

- Winner or co-winners
- Rank ladder
- Team stats
- Lane wins
- Biggest comeback
- Fastest answer
- Fun awards
- Rematch and lobby buttons

### 6.18 Online behavior

- One room per match
- Host revision is authoritative
- Player submissions are timestamped and deduplicated
- Timer state is derived from server/host timestamps, not local-only countdown
- Submit locks after closure
- Late submissions are rejected visibly
- Reconnection restores team and role from local storage
- Room cleanup follows the existing lobby lifecycle
- Database rules must prevent a player from changing score or phase directly

### 6.19 Builder support

Gauntlet should use a visual builder:

- Lane builder
- Question editor
- Puzzle editor
- Wild card editor
- Choice deck editor
- Final round editor
- Validation summary
- Preview as host and team
- Export to `.zuno.json`
- Import existing trivia content
- AI Builder can generate a deck from a topic and required difficulty mix

A generated draft must always remain editable and must require validation before export.

### 6.20 Sample starter deck

Create `public/samples/trivia-gauntlet.zuno.json`.

It should include:

- 12 Quickfire questions
- 6 puzzle cards
- 6 wild cards
- 4 choice challenges
- 4 chaos challenges
- 8 climb questions
- 3 crossroads
- 3 false-statement lock challenges
- summit questions

It must pass the new game validator and be loadable from the dashboard/import flow.

### 6.21 New game acceptance criteria

- Three+ teams can join and play a complete match.
- Every stage can be reached in a local test without Firebase.
- Host refresh restores or safely pauses the active match.
- Player refresh restores lobby and team state.
- Invalid submissions do not alter scores or timers.
- Timer expiry resolves once only.
- Undo works for at least answer resolution and score changes.
- Wild cards can be enabled/disabled by preset.
- Elimination can be disabled.
- Negative scores can be disabled.
- Final Gauntlet supports a tie and co-winners.
- Results correctly calculate ranks and team statistics.

---

## 7. UI overhaul

### 7.1 Visual system

Extend `src/styles/tokens.css` with semantic tokens:

- Surface levels
- Border levels
- Text levels
- Focus ring
- Success/warning/danger states
- Game accent
- Timer states
- Overlay density
- Motion duration

Existing games should consume these tokens instead of hard-coded color values.

### 7.2 Dashboard

Improve `Dashboard.tsx`, `GameTile.tsx`, `railItems.ts`, and dashboard CSS:

- Add an information strip for recent activity.
- Use stable tile ordering.
- Add tile badges: `Local`, `Online`, `Builder`, `New`, or `Updated`.
- Show last played and duration in a consistent location.
- Add an all-games search/filter.
- Put Join/Load/Build actions in a consistent hierarchy.
- Keep the ambient background secondary, never obscuring content.
- Ensure mobile dashboard is a two-column or single-column list, not a stretched rail.

### 7.3 Navigation

Improve `src/components/navigation/spatialNav.ts`:

- Every screen gets a visible page title.
- Back behavior uses the screen stack consistently.
- Escape closes the topmost dialog, then returns focus to trigger.
- Tab never enters off-screen or hidden elements.
- Use roving tabindex for boards and teams.
- Add skip-to-content and skip-to-controls links.
- Preserve scroll position when returning to dashboard or setup.

### 7.4 Dialog and confirmation system

Create or consolidate reusable components in `src/components/ui`:

- `ConfirmDialog`
- `ActionSheet`
- `Toast`
- `ProgressSteps`
- `StatusPill`
- `PlayerStrip`
- `TimerRing`
- `LiveRegion`
- `EmptyState`
- `ValidationSummary`
- `ReconnectionBanner`

Dialogs must:

- Trap focus
- Restore focus on close
- Label all actions
- Identify destructive actions
- Support Escape and Enter appropriately
- Work without mouse controls

### 7.5 Responsive rules

- Desktop: rail plus focused content area
- Tablet: compact rail plus centered content
- Mobile: top action bar and bottom safe-area navigation
- Game boards: no horizontal overflow without intentional scroll
- Phone game views: one primary action per state
- Results: summary first, detail cards second

Minimum test widths:

- 320 px
- 375 px
- 768 px
- 1024 px
- 1440 px

Minimum test orientations:

- Portrait phone
- Landscape phone
- Tablet
- Desktop

### 7.6 Motion

Create a shared motion policy:

- Screen transition: 160–240 ms
- Tile hover: 120 ms
- Dialog reveal: 180 ms
- Toast: 220 ms
- Timer pulse: no more than once per second
- Reveal: 600 ms max
- Disable transforms for reduced-motion users

### 7.7 Loading and error states

- No blank loading pages.
- Every import, lobby, and Firebase operation has an inline state.
- Network failure displays retry and continue-offline options where possible.
- Validation errors list file name and field path.
- Missing files show a recoverable not-found state.
- Stale lobby sessions show a clear rejoin or exit state.

### 7.8 Sound and haptics

Keep existing browser-synthesized effects in `src/lib/sfx.ts` and hooks.

Add:

- Global volume slider
- Preview button
- Separate game event and navigation volumes
- Haptic toggle for supported mobile devices
- Reduced-sound mode
- No haptic or sound effect that is critical for understanding state

---

## 8. Registration and routing

### 8.1 Registry changes

Extend `src/games/registry.ts` with a Gauntlet entry:

- `gameType: "gauntlet"`
- title and description
- schema versions
- builder support
- accent and background appearance
- sample file
- file holds description
- build title
- summary/stat/listing functions

### 8.2 App changes

Extend `src/app/App.tsx`:

- Add Gauntlet setup, lobby/join, play, and results screen types.
- Route imported Gauntlet files through validation and import.
- Include Gauntlet in `backdropTheme`.
- Add host and phone lobby cleanup handling.
- Add Gauntlet to dashboard and recent-game storage.
- Preserve existing stack behavior and direct lobby hash handling.

### 8.3 Builder changes

- Add Gauntlet to Builder Home.
- Add Gauntlet visual editor and AI guide.
- Use the shared schema preview and validation screen.
- Export JSON only after validation passes.

### 8.4 Data compatibility

- Existing `jeopardy`, `headbands`, and `liar` game types remain valid.
- Unknown engine types fall back to the existing readable name behavior.
- Add schema migrations for new optional fields.
- Never replace missing optional fields with destructive defaults.

---

## 9. Test plan

### 9.1 Existing engine tests

Extend:

- `tests/jeopardyEngine.test.ts`
- `tests/headbands.test.ts`
- `tests/headbandsLobby.test.ts`
- `tests/liar.test.ts`
- `tests/online.test.ts`
- `tests/validateGameFile.test.ts`

Add scenario coverage for rematch, undo, reconnect, timer expiry, invalid moves, and duplicate submissions.

### 9.2 New engine tests

Create:

- `tests/gauntletEngine.test.ts`
- `tests/gauntletLobby.test.ts`
- `tests/gauntletValidator.test.ts`
- `tests/gauntletOnline.test.ts`

Required scenarios:

- Team joining and reordering
- Team move while active
- Round scoring and streaks
- Lane lock and lane choice order
- All Wild modifiers
- Elimination and safe mode
- Co-op mode
- Final Gauntlet qualification
- Tie and co-winner
- Timer expiry race
- Out-of-order submissions
- Host disconnect
- Player reconnect
- Host handover

### 9.3 UI tests

Test:

- Keyboard-only setup and play
- Focus restoration after dialogs
- Screen reader status announcements
- 320 px board width
- Long names and 16 teams
- Image and text identities
- Reduced motion
- High contrast
- Color blindness with text and icon labels
- Offline behavior

### 9.4 Data tests

- Schema version 1 validity
- Missing optional fields
- Unknown fields
- Excessive sizes
- Duplicate identifiers
- Invalid URLs
- JSON parse failures
- Legacy schema compatibility

---

## 10. Implementation phases

### Phase 1: Shared foundation

- Extract common setup, dialog, status, timer, and player components.
- Add semantic UI tokens.
- Improve App navigation and confirmations.
- Add session revision and undo patterns.
- Add responsive and accessibility test utilities.

### Phase 2: Jeopardy

- Setup presets and preview
- Strict clue state machine
- Improved buzz-in and score history
- Board accessibility and winner/tie behavior
- Expanded engine tests

### Phase 3: Headbands

- Identity lifecycle
- Host controls and turn timeline
- Phone privacy and reconnection
- Activity log filters
- Lobby conflict tests

### Phase 4: LIAR

- Writing and reveal lifecycle
- Voting locks and revisions
- Privacy-safe online state
- Scoring explanation
- Reconnection tests

### Phase 5: Gauntlet MVP

- Schema and validator
- Engine and state machine
- Setup and lobby
- Host board
- Phone actions
- Local mode
- Sample deck

### Phase 6: Gauntlet online and builder

- Firebase lobby
- Reconnection and room cleanup
- Visual builder
- AI guide
- Results and rematch
- Full online test suite

### Phase 7: Polish

- Motion and sound pass
- Responsive layout audit
- Accessibility audit
- Performance pass
- Content sample review
- Documentation and release notes

---

## 11. Definition of done

The overhaul is complete when:

- All three existing games pass engine, lobby, and validator tests.
- Gauntlet passes a complete local and online match test.
- Setup requires no ambiguous or hidden required field.
- Hosts can pause, undo, and recover a match.
- Phones recover from refresh and temporary disconnect.
- Private text and identities remain private.
- UI passes desktop/mobile and keyboard audits.
- Reduced motion and high contrast are usable.
- `.zuno.json` files validate and provide clear errors.
- README and docs reflect the current game count and setup flow.

---

## 12. Suggested user-facing release copy

> Zuno now features deeper scoring, clearer turns, safer lobbies, and more ways to play—plus **Trivia Gauntlet**, a team-based trivia adventure that mixes quickfire rounds, puzzles, wild events, and a final showdown.

This document should be treated as the implementation baseline for a major Zuno release. Individual details may be adjusted, but private state, deterministic state transitions, accessibility, and recovery behavior should remain mandatory.
