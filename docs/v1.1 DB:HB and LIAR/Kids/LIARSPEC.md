# LIAR — Game Plan

**Product:** Zuno  
**Game:** LIAR  
**Game type:** `liar`  
**Document:** `LIARSPEC.md`  
**Status:** Product and implementation plan  
**Target:** Add LIAR as a first-party Zuno party-game engine  
**Deployment:** Static GitHub Pages; no backend required

---

## 1. Overview

LIAR is a social guessing game based on **Two Truths and a Lie**. On their turn, one player presents three personal statements: two true statements and one lie. The other players ask follow-up questions, discuss the answers, and vote on which statement they believe is false. The storyteller then reveals the answer.

To make the game more creative and interactive than simply reading three statements, every statement must have one or more prepared follow-up questions. The storyteller answers questions from the group, giving players clues while keeping the lie uncertain.

LIAR is designed for groups of three or more. Every player takes a storyteller turn; the game can continue for a chosen number of rounds or until players decide to stop.

LIAR is a separate game engine inside Zuno. It must not change Jeopardy's or Headbands' gameplay, file format, or existing host flow.

### 1.1 Product goals

- Recreate the familiar two-truths-and-a-lie party game with clear turn-taking.
- Require three statements per storyteller: exactly two truths and one lie.
- Attach question prompts to each statement so the group can investigate before voting.
- Let players create personal, imaginative statements rather than relying only on preset trivia.
- Support parties of three or more with a fair turn for every player.
- Keep setup, play, and content portable in Zuno's existing `.zuno.json` format.
- Work without accounts, a server, or third-party services.
- Match Zuno's design system and support desktop, tablet, and phone.

### 1.2 Non-goals

- Online multiplayer, matchmaking, room codes, or cross-device synchronization.
- Accounts, registration, profiles, or cloud saves.
- AI-generated personal stories or automatic fact-checking.
- Determining whether a personal statement is objectively true.
- Requiring players to disclose sensitive, private, or identifying information.
- Requiring a backend, paid service, or external runtime API.

---

## 2. Core Gameplay

### 2.1 The basic idea

Each storyteller creates three statements about themselves:

- Two statements are true.
- One statement is false.
- Each statement includes at least one follow-up question that other players can ask to learn more.

The storyteller presents the statements without identifying the lie. The rest of the group asks questions, listens to the answers, and chooses which statement they believe is false.

Example:

1. “I once got lost in a museum.” Follow-up: “Which part of the museum were you trying to find?”
2. “I can name every planet in order.” Follow-up: “Can you do it without pausing?”
3. “I have never eaten a strawberry.” Follow-up: “What fruit do you usually choose instead?”

The example is illustrative; players should be encouraged to use safe, personal, surprising, or funny details that they are comfortable sharing.

### 2.2 Player count and turn order

- Support **3–10 players** in the initial release; allow the host to set a different maximum if the existing Zuno conventions support it.
- Require at least 3 players to start a standard game. The host may enable an explicitly labeled two-player house-rule mode if desired, but it is not the default experience.
- The host may participate as a storyteller or host only.
- Every participating player gets one storyteller turn per round.
- Default turn order is the order entered by the host. The host can change the order before starting.
- After the last player in a round has taken a turn, start the next round if one was selected; otherwise show the end-of-game screen.

### 2.3 Round flow

1. The host starts a game and enters player names.
2. The host selects the number of rounds and scoring options, or chooses casual play without scores.
3. The current storyteller prepares three statements and follow-up question prompts. They mark exactly one statement as the lie in private.
4. The storyteller presents the three statements to the group. The secret lie marker is not displayed on the shared play screen.
5. The group asks follow-up questions about any of the statements. The storyteller answers aloud or enters answers for the group to see.
6. When discussion ends, every non-storyteller player submits a private vote for the statement they think is the lie.
7. Votes are locked before the answer is revealed.
8. The storyteller reveals which statement was false.
9. The game shows the vote results and awards points if scoring is enabled.
10. Play passes to the next player. Continue until every player has had a turn in the round.

The storyteller cannot vote on their own turn. Players should be able to abstain only if the host enables that option.

### 2.4 Statement and question requirements

- A turn must contain exactly three non-empty statements.
- Exactly one statement must be marked as the lie before the turn begins.
- Each statement must have at least one associated follow-up question prompt.
- The storyteller may add their own questions or select optional prompts provided by the game.
- Prompts should invite elaboration without directly revealing or confirming the truth status.
- Questions are discussion prompts, not proof requirements. The game must not attempt to validate personal stories.
- The storyteller may answer verbally; entering answers in the app is optional.
- The storyteller may skip a question they are uncomfortable answering. The UI should not pressure players to explain sensitive details.
- Do not require players to submit real names, locations, contact information, or other sensitive personal data.

Example neutral prompt patterns:

- “What happened next?”
- “When did that happen?”
- “What made you try that?”
- “Who was with you?”
- “Would you do it again?”
- “What is one detail you remember?”

### 2.5 Voting and reveal

- Each non-storyteller player gets one vote per turn.
- Votes should be private until voting closes so earlier votes do not sway later players.
- The host can end discussion and start voting.
- The storyteller may not change the secret lie marker after voting starts.
- Once votes are locked, reveal the lie and display the group results.
- The game must not automatically decide whether a statement is true; the storyteller's marked answer is authoritative for scoring.
- A host override may correct an accidental lie-marker selection before the next turn begins.

### 2.6 Scoring

Scoring is optional; casual play without points is supported.

Default points when scoring is enabled:

- Each player who correctly identifies the lie earns **1 point**.
- The storyteller earns **1 point for each player who votes for a truthful statement**, rewarding successful deception.
- If every voter identifies the lie, the storyteller receives no deception points.
- The storyteller does not vote and cannot earn a correct-guess point during their own turn.
- Show a tie in the vote results as a tie; do not treat the most-voted statement as correct unless it is the lie.

The host can disable scoring. Avoid elimination: all players continue taking turns regardless of score. At the end, show the highest score as the winner, with ties clearly displayed. In casual mode, finish with a recap rather than declaring a winner.

### 2.7 Game completion

A game ends when all players have taken the configured number of storyteller turns, or when the host ends it early.

The end screen should show:

- Game title and rounds completed.
- Player names and scores, if scoring was enabled.
- A recap of statements and revealed lies, if the host chooses to show it.
- A **Play Again** action.
- A **Return to Zuno** action.

If the host ends early, confirm before revealing any unrevealed lie markers.

---

## 3. Game Setup and Host Controls

### 3.1 Setup screen

The host setup screen must include:

- Game title and short rules summary.
- Player count and player-name fields.
- Round count or an open-ended/casual option.
- Scoring on/off.
- Optional abstentions on/off.
- Turn order preview and reorder controls.
- A **Start Game** action.

### 3.2 Storyteller turn setup

The storyteller's private turn editor must let them:

- Enter exactly three statements.
- Mark exactly one statement as the lie.
- Add at least one follow-up question to each statement.
- Add, edit, and remove optional extra questions.
- Preview the statements in the order they will be presented.
- Randomize statement order before presentation without losing the lie association.
- Confirm that they are comfortable sharing the statements with the group.

Do not show the lie marker in the public view or accessible text exposed on the shared screen before reveal. On a shared device, include a clear pass-device/private-entry step so the storyteller can mark their lie without others seeing it.

### 3.3 Host controls during play

Provide a compact host control panel with:

- Start/end discussion and open/close voting.
- Pause/resume.
- Skip a question or move directly to voting.
- Undo the most recent accidental host action where practical.
- Skip a player's turn, with confirmation.
- End game, with confirmation before unrevealed answers are shown.
- Restart game, with confirmation.

The host must be able to keep the storyteller's private selection hidden during group discussion and voting.

---

## 4. Session Interface

### 4.1 Main play screen

Display:

- Game title in a compact header.
- Current storyteller's name and turn progress (for example, Player 2 of 5).
- The three public statements, clearly numbered.
- Follow-up question prompts associated with each statement.
- A discussion indicator and a clear action to begin voting.
- Voting status without exposing individual votes before voting closes.
- Host controls and player progress.

The interface should be understandable from a distance and on a small screen. The lie indicator must remain hidden until the reveal phase.

### 4.2 Voting interface

- Show the three statements as distinct, large, selectable options.
- Clearly indicate that the player is choosing the lie.
- Do not reveal other players' votes until all votes are locked or the host closes voting.
- Prevent a player from submitting more than one vote.
- Provide clear confirmation and a way to change a vote only while voting remains open.
- After voting closes, show vote totals and the revealed lie.

### 4.3 Responsive behavior and accessibility

- Desktop: use a spacious, centered discussion and voting layout.
- Tablet: keep statements and prompts readable without unnecessary scrolling.
- Phone: use a single-column layout with touch-friendly vote controls.
- Avoid horizontal scrolling.
- Support keyboard, mouse, and touch.
- Use semantic headings, visible focus states, and accessible labels.
- Do not use color alone to distinguish the lie or show scores.
- Respect browser zoom and `prefers-reduced-motion`.

---

## 5. Game File Format

LIAR must use the existing Zuno game-file envelope.

- `schemaVersion`: `1`
- `gameType`: `"liar"`
- Shared metadata and appearance fields must follow the existing common schema.
- Content and settings must be validated by a LIAR-specific validator.
- The importer must reject a LIAR file when the user explicitly selected a different game engine.
- Personal statement content should not be required in a game file. The default flow is to create statements privately during the session.
- Optional prompt decks may be included in the game file as neutral inspiration, not as prewritten claims players are expected to present as personal facts.

Suggested content shape:

```ts
export const LIAR_TYPE = "liar";

export interface LiarQuestionPrompt {
  id: string;
  text: string;
}

export interface LiarContent {
  questionPrompts: LiarQuestionPrompt[];
}

export interface LiarSettings {
  minPlayers: number;
  maxPlayers: number;
  defaultRounds: number;
  scoringEnabled: boolean;
  allowAbstain: boolean;
}
```

Session-only turn state should be separate from the portable game file and include the three statements, private lie index, question prompts per statement, votes, reveal state, and score changes. Do not persist private statements or secret lie markers unless the existing Zuno session conventions explicitly require it and the player is informed.

### 5.1 Validation requirements

The LIAR validator must check:

- Supported schema version and correct `gameType`.
- Valid shared metadata and appearance.
- `questionPrompts` is an array of non-empty, plain-text prompts.
- Prompt IDs are unique and non-empty.
- Settings have valid types and supported ranges.
- Imported content respects existing file-size and text-length limits.
- Imported strings are treated as untrusted plain text and never injected as HTML.

At runtime, validate each storyteller turn:

- Exactly three non-empty statements.
- Exactly one lie selected.
- Every statement has at least one non-empty follow-up question.
- Valid player and turn references for votes.
- No storyteller vote and no duplicate votes.

---

## 6. Technical Architecture and Repository Integration

Preserve Zuno's existing extension points. Add LIAR as an independent engine rather than adding LIAR-specific conditionals throughout the Jeopardy or Headbands code.

Likely implementation areas, following repository conventions:

```text
src/
  game-files/
    schema/
      liar.ts
  games/
    registry.ts
    liar/
      LiarSetup.tsx
      LiarGame.tsx
      liarEngine.ts
      liarSession.ts
```

The session engine should keep game rules and state transitions outside React presentation components. It should manage:

- Player order and round progress.
- Current storyteller.
- Three statements and private lie marker for the active turn.
- Per-statement follow-up prompts.
- Discussion and voting phase.
- Private votes and reveal results.
- Scores and game completion.
- Host overrides, pause, skip, and end-game behavior.

Suggested pure operations:

- Create a session from validated setup options.
- Validate and submit a storyteller turn.
- Begin voting and record/update a vote.
- Close voting and reveal the lie.
- Calculate score changes.
- Advance to the next player or round.
- End or reset a game.

Register LIAR in the existing game registry with `gameType: "liar"`, a LIAR-specific validator, builder availability if supported, and a distinct but compatible appearance preset. Route LIAR files only to LIAR setup and runtime.

---

## 7. Zero-Setup and GitHub Pages Requirements

- Run entirely in the browser; no backend, database, accounts, API keys, or network multiplayer.
- Use the existing Vite build process and preserve the relative base path.
- Work when deployed under a GitHub Pages repository subpath.
- Do not require special browser permissions or external runtime services.
- The game must remain playable verbally if optional question entry or vote tracking is disabled.
- Do not claim that a session can be recovered after refresh unless persistence is implemented and tested.

---

## 8. Error Handling and Edge Cases

| Situation | Required behavior |
|---|---|
| Fewer than 3 players | Disable Start Game and explain the minimum; offer only an explicitly labeled house-rule alternative if implemented |
| Blank player name | Require a name or apply an explicit host-approved default |
| Fewer or more than 3 statements | Do not start the turn; explain that exactly 3 are required |
| Zero or multiple lie markers | Do not start the turn; require exactly one lie |
| Missing follow-up question | Identify the statement and require at least one question |
| Storyteller changes their mind | Permit edits only before presentation/voting begins |
| Player does not want to answer | Allow skipping the question without penalty |
| Player submits duplicate vote | Reject the duplicate and preserve the existing vote |
| Voter leaves or is removed | Let the host remove them and update the required vote count |
| Vote tie | Show the tie; score only players who chose the actual lie correctly |
| Host ends early | Confirm before revealing unrevealed lie markers |
| Unsafe imported prompt | Reject or safely display as plain text; never execute it |

Do not silently discard player turns, statements, or votes to make an invalid state proceed.

---

## 9. Testing Requirements

### 9.1 Validator and setup

- Valid LIAR files pass validation.
- Incorrect game types and unsupported schema versions fail.
- Invalid settings, empty prompts, and duplicate prompt IDs are handled correctly.
- Fewer than three players cannot start the standard game.
- A turn with other than three statements cannot start.
- A turn with zero or multiple lie markers cannot start.
- Every statement must have at least one question prompt.
- Imported content is rendered as text, never executable HTML.

### 9.2 Session engine

- Three-player and maximum-player games can start.
- Every player receives a storyteller turn per round.
- Storyteller's lie marker remains hidden until reveal.
- Storyteller cannot vote on their own turn.
- Votes remain private until voting closes.
- Players cannot submit duplicate votes.
- Correct guessers and the storyteller receive the configured points.
- Casual mode does not assign or display scores.
- Ties, abstentions, removed players, skips, early end, and restart behave as configured.

### 9.3 UI and deployment

- Statement entry supports exactly three claims and one lie selection.
- Questions are visibly associated with their statements.
- Discussion, voting, and reveal phases are clear.
- The lie is not exposed before voting closes.
- The game works on desktop, tablet, and phone with keyboard and touch.
- Reduced-motion preferences and dark/light themes are respected.
- `npm run build` and `npm test` succeed.
- Production assets work under a GitHub Pages repository subpath.

---

## 10. Acceptance Criteria

- [ ] LIAR appears in the Zuno game dashboard and is registered independently from other games.
- [ ] The host can set up a party of at least three players and configure rounds.
- [ ] Every player gets a storyteller turn in each round.
- [ ] A turn requires exactly two truths and one lie, with at least one question prompt for each statement.
- [ ] The storyteller's lie selection remains private until the reveal.
- [ ] Players can ask questions, discuss, and submit private votes.
- [ ] Votes are revealed only after voting closes.
- [ ] Scoring can be enabled or disabled, and scores are calculated correctly.
- [ ] The game supports a complete round recap and replay.
- [ ] No backend, accounts, API keys, or special permissions are required.
- [ ] The game is responsive, accessible, tested, and compatible with GitHub Pages.
- [ ] Existing Jeopardy and Headbands behavior remains unchanged.

---

## 11. Recommended Implementation Order

1. **Schema and types** — define LIAR game-file types and session state.
2. **Validator** — validate prompt deck, settings, and runtime turn requirements.
3. **Session engine** — implement turn order, private lie selection, voting, scoring, and completion as testable pure logic.
4. **Registry integration** — register LIAR and verify dashboard discovery and importer routing.
5. **Setup screen** — add players, rounds, scoring, and turn order.
6. **Storyteller flow** — create three statements, attach questions, privately mark one lie, and preview.
7. **Play UI** — implement discussion, private voting, reveal, score display, and host controls.
8. **Testing and deployment** — test rules and regressions, run the full suite, and verify GitHub Pages subpath behavior.
9. **Visual polish** — align the finished interaction with Zuno's design system and accessibility requirements.

Build and test the schema and session rules before focusing on visual polish.
