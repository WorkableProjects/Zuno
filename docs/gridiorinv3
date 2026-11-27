Your assignment is to turn **Gridiron GM** into a **complete, mega-polished v3 release** that is suitable for public use.

This is not a visual-only redesign, a speculative feature proposal, or an instruction to make isolated mockups. You must inspect the existing repository, understand the current implementation, make coordinated code changes across the engine, screens, styles, persistence, and tests, and verify the result.

Before editing:

1. Read the repository status and confirm the active branch and working tree.
2. Preserve unrelated local changes.
3. Inspect `package.json` and the available scripts before choosing test/build commands.
4. Read the existing Gridiron implementation and documentation.
5. Run the relevant baseline tests and build/typecheck commands if practical.
6. Treat the existing code as the authority until you have confirmed that a behavior is incorrect.

The existing repository already contains substantial functionality. Do not remove working systems or perform an unnecessary rewrite. Improve the implementation in place, use existing patterns, and preserve compatibility with other Zuno games.

---

## Repository orientation

Gridiron GM is a React/TypeScript/Vite franchise game with these major areas:

- `src/games/gridiron/gmEngine.ts`
  - Core deterministic live-game engine
  - Possessions
  - Downs
  - Distance
  - Clock
  - Scrimmage outcomes
  - Penalties
  - Special teams
  - Overtime
  - Player/team statistics
  - Game records
  - Seeded random state
- `src/games/gridiron/gmTypes.ts`
  - Shared game, team, player, career, play, and result types
- `src/games/gridiron/gmPlaybook.ts`
  - Offensive and defensive play-card metadata
  - Built-in play definitions
  - Offensive and defensive coordinator play selection
- `src/games/gridiron/gmCareer.ts`
  - Career advancement
  - Schedule progression
  - Live/simulated result recording
  - Career state transitions
- `src/games/gridiron/gmLeague.ts`
  - League generation
  - Schedule
  - Standings
  - Tiebreakers
  - Win probability utilities
- `src/games/gridiron/gmPlayers.ts`
  - Player ratings
  - Contracts
  - Player names
  - Scheme fit and utility calculations
- `src/games/gridiron/gmSave.ts`
  - Save-slot behavior
  - Browser persistence
  - Save index
  - Delete/export/load behavior
- `src/games/gridiron/GridironPlay.tsx`
  - Career shell
  - Save-slot entry
  - New-career flow
  - Navigation
  - Live-game routing
  - Career and screen state
- `src/games/gridiron/screens/GameDay.tsx`
  - Live game experience
  - Scorebug
  - Play-calling sheet
  - Playback controls
  - Replay
  - Field camera/overlays
  - Live stats
  - Play-by-play
  - End-game handling
- `src/games/gridiron/screens/Front.tsx`
  - Trades
  - Draft
  - Free agency
  - Other front-office surfaces
- `src/games/gridiron/screens/Team.tsx`
  - Roster
  - Depth chart
  - Game plan
  - Staff and player-card interactions
- `src/games/gridiron/screens/Hub.tsx`
  - Weekly hub
  - Schedule
  - Scores
  - Inbox
  - Next user game
- `src/games/gridiron/screens/League.tsx`
  - Standings
  - Leaders
  - History
- `src/games/gridiron/screens/ui.tsx`
  - Shared Gridiron UI primitives and context
- `src/games/gridiron/gridiron.css`
  - Main Gridiron visual system
- `src/games/gridiron/FieldView.tsx`
  - React field rendering
- `src/games/gridiron/fieldRender.ts`
  - Player routes and play animation
- `src/games/gridiron/gmPlayScript.ts`
  - Conversion of play specs into animation frames
- `src/games/gridiron/gmSfx.ts`
  - Gridiron synth effects
- `src/game-files/schema/gridiron.ts`
  - Gridiron file/save validation
- `tests/gridiron.test.ts`
  - Existing league, engine, career, draft, save, and schema tests
- `docs/gridiron-v2/AUDIT.md`
  - The previous public UI audit and roadmap
  - Read this before changing existing screens

Search for additional references rather than assuming these files are complete or isolated. Inspect the imports and usages of every type and function you modify.

The public Zuno app includes different visual surfaces and game implementations. The Gridiron v3 work should feel native to Zuno while giving Gridiron GM a stronger identity, deeper hierarchy, and more professional sports-broadcast presentation.

---

# Overall public-release standard

The result should meet the following standard:

- Gridiron GM feels complete rather than experimental.
- Every important control has a clear purpose and visible state.
- Every important state has an empty, loading, error, success, or confirmation state.
- Visual polish is backed by working interactions.
- The engine is deterministic and internally consistent.
- Saves survive reloads and are compatible with earlier careers.
- Mobile, tablet, and desktop layouts are usable.
- The interface works with mouse, touch, and keyboard.
- The interface remains usable with reduced motion and with audio disabled.
- No public-facing copy should imply functionality that does not exist.
- No proprietary real-world assets or branding should be introduced.
- No external visual asset is required unless it is already present and appropriately licensed for the repository.

Do not simply add more cards, tables, and pop-ups. The goal is to reduce friction and make the franchise easier to understand while retaining useful information density.

---

# Priority one: engine correctness and football integrity

The public engine must be trusted. The highest priority is correcting and hardening the downs, passing, field-position, possession, and result-stat pipelines.

The existing engine generates a `PlaySpec` and outcome, animates it, and applies the result to `GameState`. This pipeline must remain coherent at every step.

## Establish authoritative rules

Before changing behavior, trace:

1. Outcome generation in `gmEngine.ts`
2. `baseSpec`
3. `applyScrimmage`
4. `record`
5. Play-record downs and distance
6. `gmPlayScript.ts`
7. `gmTypes.ts`
8. `GameDay.tsx`
9. Live team stats
10. Player stats
11. Down and line-to-gain display
12. Replay and play-by-play text
13. Save/export state
14. Existing tests

Define a clear internal invariant:

- The engine state is authoritative.
- Stats are derived from or validated against the authoritative outcome.
- The play record contains a snapshot of the situation at the snap.
- `ballOn` remains the spot from the offense’s own goal.
- A positive yards change is measured in the offense’s direction.
- A negative yards change is a loss in the offense’s direction.
- Intended/air yards are not automatically net yards.
- The animation endpoint must be calculated from the snap line and net yards, not a different or guessed yardage value.
- The displayed outcome must describe the actual state change, not an invented result.

Do not rely on UI calculations to repair an incorrect engine transition.

## Incomplete passes

Complete-pass, incomplete-pass, and interception behavior must be unambiguous.

For a standard incomplete pass:

- It must not change `ballOn`.
- It must not change yards-to-go or automatically advance/downshift the down by engine gain.
- It must add one pass attempt for the quarterback.
- It may add one target record for the intended receiver.
- It must not add receiving yards or completion yards.
- It must not count as a rush, reception, gain, loss, or completed team yardage.
- It must not trigger a first down.
- It must not use air yards as a net gain.
- It must never be animated into a positive or negative field change unless the play is a separately modeled penalty or thrown-away/reviewed outcome.
- It must stop the clock according to the existing clock rules.
- The play record must expose `kind: "incomplete"`, not a complete or generic result.
- The play-by-play text must not imply that the pass gained or lost yards.
- A dropped pass and pass breakup may alter description, but not net yardage.

An incomplete pass from a pass-interference or roughing penalty must be modeled as a penalty play or as a separate penalty resolution that clearly supersedes the underlying incomplete play. It must not leave two unrelated scrimmage outcomes attached to one snap.

If there is a bug caused by an existing branch or an existing data field, fix the cause. Add a test that uses a snapshot of the state before and after an incomplete pass and asserts:

- `ballOn` is unchanged
- `down` advances exactly once
- `dist` is unchanged
- total offense yards are unchanged
- passing yards are unchanged
- receiving yards are unchanged
- no first down is awarded
- the animation final spot equals the snap ball location for the incomplete outcome
- pass attempts and targets update exactly once
- the player or team stats do not accidentally count it as a completion

Add tests for short, medium, deep, and screen incomplete passes if the model supports those depths.

## Downs and line to gain

Correct all down and distance transitions.

A gain should be considered a first down when:

- The final net field position crosses or reaches the first-down line,
- Or the play is an awarded/automatic-first-down penalty,
- Or the play is a specifically modeled first-down outcome.

A gain short of the first-down line should:

- Increase down by one
- Reduce yards-to-go by the gain
- Preserve the correct goal-to-go indicator
- Respect existing snap-down data in the play record
- Avoid negative or impossible distance values

A loss should:

- Move backward by the loss
- Increase distance by the loss
- Continue to represent the down as the next down
- Not manufacture a first down
- Not allow a ball location below the back of the offense’s own end zone
- Not produce a negative yards-to-go display

At goal-to-go, a result with enough yards to reach the goal earns a touchdown. If it is not enough, calculate down and distance as appropriate. The UI must display “Goal” in place of or in addition to “& [distance]” when the offense is within 10 yards and at the goal line.

At fourth down:

- A successful gain that reaches the line to gain resets to first down.
- A failed gain that does not reach the line to gain changes possession.
- The new field position must be the offense’s actual new spot, not a synthetic value.
- The turnover’s next possession must begin with first down and the correct remaining distance.
- A fourth-down sack or loss should not be treated as a normal fourth-down gain.
- A fourth-down incomplete pass should turn possession over without adding yardage.
- Turnovers on downs must be represented in the play record and play-by-play text.

## Penalties

Audit pre-snap, scrimmage, pass-interference, holding, false-start, offside, roughing, and special-team penalties.

Fix or test:

- Where the penalty is marked off from
- The attacking/defensive direction
- Half-the-distance behavior
- Automatic first downs
- Replay-down behavior
- Loss of down behavior if used
- Penalty effects on clock
- Penalty effects on team/player stats
- Whether a penalty play should cancel or replace the underlying result
- Whether `dist` should be adjusted based on yards gained on the penalty, not the original play
- Whether penalties after a touchdown or turnover apply in the right frame
- Whether missed or declined penalties are possible and accurately displayed

Do not count a play as a completion or run if an offensive penalty nullifies the play. Do not award first downs for a defensive penalty unless the penalty is designed to do so or the yardage reaches the existing line to gain.

Add targeted tests around:

- False start
- Offside
- Offensive holding after a successful result
- Defensive pass interference
- Roughing the passer
- Goal-line and end-zone penalties
- Penalties that create a first down
- Penalties that do not create a first down
- Defensive encroachment or replay/down behavior only if those mechanisms exist

## Turnovers

Audit:

- Interceptions
- Fumble recoveries
- Sack fumbling
- Scrimmage-fumble recovery
- Kickoff/onside recovery
- Punts
- Field-goal misses
- Safeties
- Touchdowns
- Defensive touchdowns
- Kick return touchdowns
- Overtime possession changes

For every turnover:

- The receiving team must become the offense.
- The new ball spot must be in the receiving team’s own frame.
- Down and distance must become first-and-10 or the correct first goal.
- Existing team turnover stats must update once.
- The play record must preserve the snap situation and the final spot.
- The animation endpoint must match the modeled play result.
- The clock and run-clock state must be correct.

Review interception return logic carefully. Confirm that the result spot accounts for the offense’s ball location plus the throw air position and return distance. Add tests for interceptions, pick-sixes, and interceptions in the end zone.

Do not change the core football model more aggressively than necessary unless there is a demonstrated bug.

## Clock and overtime

Inspect and improve if necessary:

- Clock subtraction for every play type
- Running clock after a run
- Clock stopping after an incomplete pass
- Clock stopping for a sideline play
- Timeouts
- Two-minute warnings
- Halftime
- Quarter transitions
- Playoff and regular-season overtime
- Possession counting
- First possession/second possession overtime rules
- PAT and touchdown overtime behavior
- Defensive touchdowns
- Field goals
- Tied regular-season games
- Kickoff logic
- Spike logic
- Kneel logic
- End-of-period possession changes

No public release should expose impossible clock values or crash while advancing at the end of a period.

Existing `step()` behavior should remain deterministic and pure enough to test. If needed, extract small helpers to make the clock and downs rules easier to verify. Do not compromise seeded random behavior or save serialization.

## Whole-game simulation and regression testing

Add tests that catch unrealistic and invalid states after random and repeated simulation.

Examples:

- A 1,000-game or 300-game simulation run only as a test if runtime remains acceptable.
- Assert every play keeps `ballOn` between valid values.
- Assert every play’s `down` is 1 through 4 or 0 for specials.
- Assert distance is 1 or greater during scrimmage unless a goal-to-go or special state explicitly requires otherwise.
- Assert clocks remain within valid bounds.
- Assert second and fourth quarters show the two-minute warning only when appropriate.
- Assert no regular-season game ends with an invalid overtime state.
- Assert tied regular-season or playoff behavior matches the intended current league rules.
- Assert stats for the same seed and same calls are repeatable.
- Assert replayed play scripts end at the same recorded spot.
- Assert every animation frame is inside the field.
- Assert every run, pass, sack, punt, kickoff, kneel, and special-team outcome has an intentionally defined end condition.
- Assert team total yards equal the sum or appropriate signed convention of rush and pass yards.
- Do not assert impossible exact averages unless the engine has stable, justified distributions.

Update existing tests rather than weakening them. Add test fixtures or pure helpers where useful.

## Save and state integrity

The engine’s RNG and game state must remain serializable where practical.

Verify:

- Seeded RNG state is stored and restored correctly
- Review snapshots restore the correct state
- Challenge reversals restore the snap, clock, down, distance, and ball
- `resolveReview()` does not corrupt cumulative stats or the play list
- `review` state is not lost in save/reload
- Rehydrates with missing optional fields have defaults
- Custom play data can be migrated safely
- No save or career object contains function-only fields that cannot be serialized
- Export/import round-trips the career exactly enough to reproduce or continue the state
- Imported custom play IDs do not collide with built-in play identity or another career

---

# Priority two: mega-polished live game day

The live game screen should feel like a dense, high-quality broadcast and management experience, not a basic demo.

Start with `src/games/gridiron/screens/GameDay.tsx`, `FieldView.tsx`, `fieldRender.ts`, `gmPlayScript.ts`, `gridiron.css`, and `docs/gridiron-v2/AUDIT.md`.

Preserve:

- The scorebug
- The field animation
- Existing camera modes
- Replay
- Speed controls
- Drive information
- Win probability
- Live stats
- Play-by-play
- Coach decision inputs
- Halftime adjustment controls
- Existing sound routing
- Keyboard shortcuts

Improve them, not merely restyle them.

## Top broadcast bar

Make the top bar feel deliberate and useful:

- Stronger score hierarchy
- Clear possession indicator
- Distinct down-and-distance area
- Quarter and clock clearly separated
- Timeout indicators
- Weather indicator
- Pause/play state
- Speed controls
- Step-between-snaps state
- Drive and quarter skip controls
- Replay control
- Sim to end behavior
- Mobile-safe action wrapping

Avoid duplicating information unnecessarily.

Add a compact game situation summary if it helps at narrow widths:

- Possession team
- Down/distance
- Ball position
- Clock
- Timeouts
- Weather
- Score

Do not hide important information behind hover-only tooltips.

## Field presentation

Use the field render as the visual center:

- Preserve All-22, broadcast, and follow cameras
- Make LOS and line-to-gain clearer
- Distinguish field lines, ball, yard markers, first-down marker, boundary, and player roles
- Add first-down and timeout-related visual cues only when useful
- Prevent field labels or markers from becoming visually noisy
- Maintain the 22-player animation within field bounds
- Make route and coverage overlays legible without obscuring action
- Provide an “interactive field” state that does not imply that the field can be clicked if it cannot
- Make end zones, sidelines, hashes, and goal posts readable
- Keep animations on-screen at every supported viewport
- Respect reduced-motion settings
- Verify no console errors, SVG issues, or state update loops

Improve replay:

- Clearly indicate replay mode
- Preserve the live event caption
- Make playback scrubber easy to use
- Make replay speed clear
- Add replay of the last play
- Make it easy to return to live
- Pause and scrub should not leak or mutate live state
- Replaying a prior play should not alter score, downs, clock, or stats
- Replay should use a single frozen play script and should not restart the engine

## Game playback controls

Improve:

- Pause
- Space keyboard shortcut
- Step mode
- Replay
- Speed
- Skip drive
- Skip quarter
- End/simulate
- Timeout
- Challenge
- Halftime
- Final result

Use clear labels and disabled states. If a control is unavailable, explain it through copy or a visible state.

For keyboard controls:

- 1–9 selects listed offense/defense cards
- 0 selects coordinator call
- T calls timeout
- R replay
- C challenge
- Space pauses
- 1–4 can change speed as currently intended
- Document shortcuts somewhere visible without taking over the screen
- Do not use keyboard shortcuts while a text field or editable control has focus
- Do not trigger hidden buttons or elements outside the visible state
- Make shortcut hints optional on touch layouts
- Ensure every keyboard action has an equivalent button

## Game-day side panels

Improve:

- Drive summary
- Win probability
- Live team stats
- Top player summaries
- Play-by-play
- Event log
- Injury and turnover summaries
- Possession labels
- Scoring events

Make the side panel a broadcast sidebar rather than a dense pile of text.

Recommended improvements:

- Clear section headers
- Empty states
- Current/last drive indicator
- Compact team comparison rows
- Highlight the most recent result
- Allow play-by-play entries to represent the event type
- Add a scroll/height strategy that works on desktop and mobile
- Collapse or stack side sections intentionally on small screens
- Make screen readers receive meaningful live announcements

Do not add a large sidebar below the field that makes the field unusable at laptop heights.

## Status and call sheets

The current `CallSheet` appears in the field layer for:

- Play calls
- Fourth-down decisions
- Kickoffs
- PAT/two-point decisions
- Challenges
- Halftime adjustment

Improve each state:

- Make it obvious whether the user is on offense or defense
- Show score, down, distance, field position, and clock prominently
- Show the play clock if applicable
- Make timeout state obvious
- Make fourth-down choices explain the situation: go, punt, field goal distance and risk
- Make challenge decisions show that a lost challenge costs a timeout
- Make kickoff choices clear
- Make PAT/two-point choices clear
- Make halftime adjustments easy to understand and return to a final confirmation state
- Add confirmation for destructive or major in-game decisions if one can be taken accidentally
- Never let a hidden or stale decision sheet remain after a state changes
- Ensure `CallSheet` closes or updates immediately as the engine state changes
- Add a live-region announcement for new decisions and major outcomes
- Support Escape or a clearly labeled close for overlays if they are closeable
- Do not allow an overlay to trap focus unnecessarily if it is not a dialog

## AI versus coaching mode

Verify exactly how `coaching`, `userTeam`, `coachMode`, and `nextDecision` interact.

Fix any mismatch:

- In coaching mode, only the user team should receive active decisions unless the existing feature intentionally allows both teams
- Watch mode must not accidentally expose a user call sheet
- Simulated games must not depend on UI callbacks
- Skipping, quarter-sim, or watch mode must not leave a stale decision
- On a timeout, ensure it is charged to the intended team
- Halftime appears only once
- The game should not ask for a call after the game is final
- Kickoff and special-team decisions should follow the engine and intended coaching mode
- PAT/two-point choices and challenges should be controlled correctly
- Fast-forward and sim controls must not mutate or expose a random call when the UI says the user is inactive
- Advance/final result callbacks must receive the completed state once

---

# Priority three: entire management experience

Improve Gridiron as a franchise mode across every management screen.

## New career and save slots

Review `Saves`, `NewCareer`, save slot cards, and existing save behavior.

Improve:

- Team selection
- Coach name field
- Slot state
- Existing/save/new career distinction
- Confirm before delete
- Confirm before overwriting a save
- Clear imported-career handling
- Auto-save messaging
- Export messaging
- Storage/full-storage failure handling
- Corrupt save recovery
- Empty slot visual hierarchy
- Last-saved date
- Career age/year
- Team logo and colors
- Mobile layout
- Keyboard and focus behavior
- Loading state while creating a generated league
- Cancellation while a career is building
- Prevent starting twice
- No blank or low-information save slot state
- Clear back/quit behavior
- Imported career destination slot selection

Keep three-slot behavior if it is appropriate for Zuno. Do not introduce another save model without a migration benefit.

Add tests for:

- Save/load round trip
- Delete confirmation behavior is UI-level or E2E where practical
- Corrupt JSON
- Missing optional fields
- Export/import
- Multiple slots
- Team/user-team changes
- Custom play storage
- Old-career schema compatibility
- Empty and full storage

## Navigation and shell

Review `GridironPlay.tsx` and the shared nav.

Improve:

- Page title and active section
- Team identity
- Season/week context
- Current mode/phase
- Inbox unread indicator
- Save status
- Advance/simulate state
- Mobile reachability
- Bottom safe-area behavior
- Escape/back behavior
- Return to saved scroll position where useful
- Screen transitions
- Busy state
- Toast behavior
- Confirmation before quit to Zuno if there are unsaved changes
- Clear distinction between save, export, and save slots
- Avoid duplicate advance buttons or stale busy states
- Preserve nav while player cards/dialogs are open
- Make icon-only buttons have labels
- Ensure visible focus rings
- Keep the team accent as the sole primary brand accent
- Preserve broadcast yellow or a deliberate score/action accent for game day
- Do not use team colors in a way that reduces text contrast

The nav should remain a compact navigation component rather than consuming the phone viewport.

## Hub

Improve the weekly hub:

- A clear next-game card
- Opponent details
- Schedule context
- Week and season phase
- Recent scores
- Standings or division context
- Inbox summaries
- Key team news
- Injury updates
- Streak and record
- Playoff positioning if relevant
- Offseason state
- Advance action
- Watch/play controls
- Simulated progress feedback
- Clear distinction between the user game and other games
- No dead next-game action

On desktop, use a strong hierarchy. On mobile, put the most important action high, but do not let decorative cards push the next game off-screen.

## Roster

Improve roster browsing and player management:

- Search
- Position filters
- Starter/reserve distinction
- Active/practice squad distinction
- Injury state
- Salary/cap relevance
- Contract relevance
- Age
- Overall
- Position
- Sort controls
- Clear player name and number
- Comparison-friendly rows
- Mobile table behavior
- Empty-state after cut/fade
- Confirmation before cuts/trades
- Clear back from player card
- Focus return after closing player dialog
- Keyboard-accessible sort/filter controls

Do not change position or roster rules without first understanding the existing roster logic.

## Depth chart

If the depth chart has drag-and-drop or editing, improve:

- Clear starters versus backups
- Current position groups
- Available/available-after-injury state
- Drag preview
- Drop indicator
- Reordering feedback
- Touch alternative
- Keyboard alternative
- Invalid placement prevention
- Save/dirty state
- Reset confirmation
- Clear explanation of depth-slot effects on the game engine
- Test or verify that lineup changes affect player selection in games
- Prevent duplicate player assignment across conflicting slots
- Account for missing/injured/retired players

If the current depth-chart feature is shallow or absent, implement a version that works within the existing data model. Do not show drag controls that cannot produce a result.

## Contracts, cap, and free agency

Preserve existing cap math and contract rules.

Improve:

- Cap space
- Payroll
- Contract years
- Guaranteed money
- Cap hit by year
- Restructure information
- Cut/release preview
- Dead-money preview
- Free-agent filtering
- Value/fit where meaningful
- Positional need
- Minimum and maximum roster constraints
- Confirm before major salary moves
- Explain the effect of an action before confirmation
- Add empty and no-affordable-player states
- Prevent invalid transaction values
- Ensure cut/restructure math cannot produce impossible cap values
- Add or update tests for contract/release/restructure edge cases
- Keep UI calculations consistent with existing engine functions

## Staff

Improve staff page if present:

- Staff roles
- Ratings
- Salaries
- Contracts
- Staff replacement
- Scheme and coach fit
- Clear confirmation for hiring/firing
- Explain meaningful bonuses
- Avoid invented effects in UI copy
- Show which engine functions are affected by staff ratings
- Mobile layout
- Empty-state behavior

## Draft

Improve:

- Current draft order
- Team needs
- Player ratings
- Position
- Prospect info
- Board and available players
- User selection
- AI selection
- Trade-in-draft support only if the engine supports it
- Clock/pick processing state
- Undo only if an engine state supports it
- Round/pick context
- Final roster counts
- Simulation/skip behavior
- Cancel/exit behavior
- Confirmation before leaving unfinished draft work
- Clear tie between generated prospects and career player records
- Tests for draft order and offseason completion

## Standings and history

Improve:

- Division/conference layout
- Tie-break display
- Playoff bracket/connectors
- Clinched, eliminated, and wildcard labels
- Head-to-head context
- Common-games or conference ties only if meaningful
- Sort and expand behavior
- Season results
- League history
- Awards
- Team records
- Super Bowl/Bowl terminology if used in the game
- Empty-state for week one
- Empty-state for no championship history
- Mobile overflow
- Clear legends for status indicators
- No color-only meaning

## Stats and leaders

Improve:

- Stat scope
- Regular-season/playoffs/league options if supported
- Minimum attempts/filters only if based on engine data
- Rank
- Player
- Team
- Position
- Team colors
- Correct table sorting
- Empty cards before week one
- No fake leaders
- Ties handled consistently
- Mobile list/table behavior
- Player drill-down
- MVP and awards where supported
- Career records vs season leaders as two clear categories
- Export not necessary unless already feasible

## Player card

Improve existing player card/dialog:

- Main identity
- Number
- Position
- Overall
- Age
- Status
- Attributes
- Contract
- Scheme fit
- Recent or season production
- Injury status
- Transaction actions
- Close and focus behavior
- Mobile layout
- Clear focus trap
- Escape close
- Restore focus to trigger
- Scroll and height behavior
- No inaccessible nested controls
- No accidental close after transaction

---

# Priority four: Madden-like trades and trade-building

The trade menu is currently called out as too weak. It must become a complete and understandable front-office feature.

Use the existing trade and career logic in `Front.tsx` and `gmCareer.ts` or `gmLeague.ts` as the base. Do not assume trade UI logic can perform a transaction without engine support.

## Desired trade experience

Create a polished two-side trade builder:

- Your team and selected trade partner clearly separated
- Team search/selection
- Give side
- Receive side
- Available roster assets
- Available draft picks
- Staff assets if supported
- Existing custom future pick data if supported
- Clear no-trade/no-asset conditions
- Player salary and contract summary
- Positional label and overall
- Years remaining and cap impact
- Draft pick year and round
- Trade value or value range
- Reset deal
- Review deal
- Submit/propose
- Cancel
- Confirmation
- Success
- Rejection
- Accepting/not accepting based on engine rules
- Processing state
- Prevent duplicate submission
- Prevent adding the same asset twice
- Prevent trading the same player out and back in
- Prevent trading for players on a roster if inactive roster rules prohibit it
- Prevent trading an unavailable or already traded asset
- Account for practice-squad or IR assets if relevant
- Preserve existing `Career` save model

## Player asset UI

For each player, show:

- Name
- Position
- Number
- Age
- Overall
- Position rating or relevant attribute
- Injury status
- Contract/cap data
- Years remaining
- Roster status
- Any existing player-team lock or constraint supported by engine
- A clear remove action
- A clear give/receive label

Do not claim that a player is a perfect positional need fit unless the engine has the data and logic to support it.

## Draft asset UI

For each available pick, show:

- Current/compensatory status if supported
- Year
- Round
- Original team/ownership if relevant
- Expected value where meaningful
- Availability
- Whether the pick is committed elsewhere
- A remove action

Do not generate or trade draft picks that are not real in the current league state.

## Value meter

If the trade engine has an existing value model, expose it accurately.

If no defensible model exists:

- Do not fabricate exact numbers
- Implement a clearly labeled transparent estimate
- Test the estimate
- Provide an explanation of inputs
- Make sure it updates immediately
- Distinguish fair/balanced, one-sided, and insufficient data
- Never present the estimate as an official guarantee
- Ensure UI acceptance/rejection is not only based on the estimate if the engine uses separate logic
- The meter should never imply that a higher number always means a better player deal

An existing trade without a value meter can remain simple, but v3 should include a useful summary and clear confirmation.

## Engine and transaction rules

Any proposal must eventually be validated in engine logic:

- Both teams exist
- The player/pick belongs to the expected team
- The recipient can receive the asset
- No asset is duplicated
- Roster size remains valid or can be resolved safely
- Salary-cap rules remain valid or the engine explains/corrects the result
- The trade does not exceed maximum roster count
- Injury/IR rules remain consistent
- Contracts transfer correctly
- Players’ `teamId` updates correctly
- Draft pick ownership updates if supported
- Save state updates once
- Rejected trades do not mutate career state
- Cancelled trades do not mutate career state
- Accepted trades update standings-independent history or inbox if existing systems support this
- Trade transactions can be undone only with an explicit confirmed mechanism and if engine state supports it
- Trades before, during, and after a season follow existing league phase rules
- No UI-only mutation bypasses save/export

Add trade tests for:

- Player-only accepted/rejected flows
- Pick-only flows if supported
- Mixed player/pick flows
- Duplicate assets
- Wrong-team assets
- Invalid or missing teams
- Roster caps
- Salary-cap constraints
- Proposed trade state reset
- Save/export after trade
- No mutations on rejection/cancel
- Duplicate click/submit protection
- Deterministic trade outcome for seeded career/test input if the engine is deterministic

## Trade UI layout

On desktop:

- A left column for trade partner and roster/pick selection
- A large center trade canvas
- Give/receive panels
- A right or bottom summary/value panel
- Clear apply/confirm actions

On tablet/mobile:

- Use tabs or step-by-step flow:
  1. Partner
  2. Give
  3. Receive
  4. Review
- Keep the total deal visible in summary
- Use bottom safe-area actions
- Prevent accidental navigation away from an unfinished transaction
- Make all asset rows usable at least 44px tall
- Avoid horizontal overflow
- Use text and icon status so information is not color-only

## Trade copy

All copy should be understandable:

- “Propose trade”
- “Trade rejected: this team will not make the deal”
- “Review trade”
- “Clear deal”
- “Remove”
- “You receive”
- “You give”
- “Draft assets”
- “Roster assets”
- “Unavailable”
- “Contract”
- “Cap impact”

Avoid overly dense finance language unless the user can expand or view details.

---

# Priority five: custom plays

Gridiron needs a first-class custom-play feature.

This feature must be real and useful. It cannot be a static form that saves a label or a card with no engine effect.

## Scope

Inspect `gmTypes.ts`, `gmPlaybook.ts`, `gmEngine.ts`, `gmPlayScript.ts`, and `FieldView.tsx` to determine what a custom play can safely control.

At minimum, a custom play must be able to store supported values for:

- Name
- Description/tagline if supported
- Offensive/defensive category
- Formation
- Personnel
- Play type
- Concept/name
- Run gap
- Run side/direction
- Defensive package
- Defensive call
- Defensive shell
- Built-in/custom identifier
- Optional metadata/version
- Active/enabled state

Do not add fields that the engine ignores.

## Custom play editor

Create a polished editor that supports:

- Create
- Duplicate
- Edit
- Validate
- Save
- Delete
- Cancel
- List/search
- Filter by offense/defense/category
- Built-in/custom distinction
- Import/export integration if compatible
- Empty state
- Unsaved changes warning
- Unique-name handling or deterministic ID collision handling
- Clear confirmation before deletion
- Clear confirmation before discarding unsaved changes
- Inline field errors
- Preview of how the play card will appear
- “This play may be used in Live Game”
- “This play may be selected by the coordinator” only if the engine also supports/uses it
- Copy from a built-in play
- Default/sensible values
- A valid current state upon opening

Use controlled form components and existing Zuno UI patterns.

## Route editor decision

Do not add route drawing unless it is complete end-to-end.

If the existing route system can meaningfully support custom routes:

- Add a safe route editor
- Store route definitions in a versioned custom-play schema
- Convert routes into play scripts
- Validate route points are inside field bounds
- Ensure quarterback, receiver, blocker, and defender behavior remains coherent
- Add route preview
- Add route type/direction/target fields
- Test animation endpoint consistency
- Test custom routes do not crash or produce invalid player coordinates
- Ensure route behavior does not contradict pass depth/type metadata

If custom route editing is not feasible within v3:

- State this clearly in the UI
- Implement the supported metadata editor instead
- Do not describe the feature as “draw routes” or imply that custom routes can be drawn
- Keep it as a custom play-call library, play identity, and engine-understood concept feature
- Do not leave disabled buttons or mock route canvases

## Persistence

Custom plays must persist through:

- Career save
- Save slot reload
- Exported `.zuno.json`
- Imported career
- Existing career migration
- Browser/storage failure
- Save corruption or invalid custom play entries
- Old/custom play type schema versions
- New builds

Choose an approach compatible with the existing data model.

Possible approaches:

- A versioned `customPlays` field on `Career`
- A separate validated JSON blob in the career
- Extension of the existing game file schema

Whichever approach is used:

- Define it in `gmTypes.ts`
- Add schema validation
- Include migration/default handling
- Keep `JSON.stringify`/parse round trips valid
- Add tests
- Avoid global browser storage collisions
- Prevent custom plays from leaking between careers or save slots unless intentionally shared
- Preserve custom plays in export/import

## Game-day integration

Custom offensive plays:

- Must appear in the play picker
- Must pass the exact same engine route as built-in plays
- Must resolve concept/name through `playName()` safely
- Must affect pass/run outcome based on supported fields
- Must animate using existing play-script logic
- Must affect stats and play records
- Must have no missing personnel, formation, side, or gap behavior
- Must not create invalid IDs or crash
- Must remain visible after the file is reloaded

Custom defensive plays:

- Must appear in defense call selection
- Must use valid package, call, and shell values
- Must affect existing defensive unit selection and outcome logic as supported
- Must use a fallback if older/corrupt data is encountered
- Must be namespaced or identified distinctly from built-in calls
- Must not collide with built-in names or IDs

The custom play editor may have more fields than the engine currently models, but it must distinguish informational fields from simulation fields.

Do not expose a setting that claims to change quarterback accuracy, route behavior, coverage, or blitzing if the engine cannot read it.

## Engine integration

Improve `gmPlaybook.ts` so built-in and custom plays use a unified catalog API:

- `getOffensivePlays(career?)`
- `getDefensivePlays(career?)`
- `validateOffensivePlay`
- `validateDefensivePlay`
- `resolvePlayName`
- `resolveDefensiveName`
- Coordinator selection
- Fallback behavior

Keep AI functions deterministic and situation-aware.

Custom plays may be added to the AI pool only if explicitly allowed and coordinator behavior uses them safely. If they are intended for user-only play-calling, make that explicit.

## Playbook library experience

Create a dedicated library surface that is reachable from the navigation or game-plan screen.

Use tabs or sections for:

- Offensive
- Defensive
- Custom
- Built-in

Features:

- Search
- Category filters
- Formation filters
- Personnel filters
- Sort
- Favorite/pinned plays
- Recent uses
- Usage count
- Copy/duplicate
- Edit
- Delete
- Preview
- “Used on offense/defense”
- Empty state

Do not hide custom-play management inside a tiny settings menu.

## Tests

Add tests for:

- Valid offense and defense play creation
- Invalid combinations
- Name uniqueness/collision
- Duplicate/custom IDs
- Delete
- Save/load
- Career export/import
- Game-day selection
- Engine outcome for a custom run
- Engine outcome for a custom pass
- Custom defensive call
- Snapshot determinism
- Corrupt custom play fallback
- Existing save migration
- Built-in playbook catalog validity
- No empty coordinator call set
- Custom play that has unsupported fields
- Custom route points if implemented

---

# Priority six: much larger default playbooks

The existing playbook is too limited for a public v3 release.

## Offensive playbook

Expand the default offensive catalog beyond simple pass depth and run concepts.

Add a coherent set across:

- Singleback
- I-Formation
- Shotgun
- Empty
- Goal-line
- Pistol if already compatible
- Trips/3-wide formations if compatible
- 21/22/12/11/10 personnel

Use only combinations the engine can simulate safely.

Examples of categories to consider, based on existing mechanics:

- Inside zone
- Outside zone
- Counter
- Power
- Toss
- Draw
- QB sneak
- Jet sweep only if the model can model it
- Screen
- Quick flat
- Slant flat
- Quick out
- Mesh
- Curl flat
- Dig
- Smash
- Levels
- Four verts
- Post/wheel
- Deep cross
- Play action pass
- Bootleg
- Flood
- Y-cross
- Red-zone concepts
- Short-yardage concepts
- Fourth-down concepts

Do not add 40 random cards with duplicate names or labels.

A good v3 catalog can have 30–50 offensive calls if internally coherent, but only if every entry is useful and valid.

## Defensive playbook

Expand defensive calls across:

- Base
- Nickel
- Dime
- Goal line
- 3-4 or 4-3 alignment compatibility if supported
- Zone
- Man
- Run D
- Blitz
- Cover 1
- Cover 2
- Cover 3
- Tampa 2 if supported
- Prevent
- Red-zone goal-line
- Short-yardage
- Quarter coverage if supported
- Two-deep safety looks
- Nickel blitz
- Dime prevent
- Four-man rush
- Simulated pressure if the engine supports the effect

Do not add coverages that do not affect engine logic and only exist as labels.

A useful catalog should support:

- First down/base
- Second and long
- Third and medium
- Third and long
- Short yardage
- Goal line
- Two-minute defense
- Prevent situations
- Run-heavy offenses

## Data quality

For every play:

- Name
- Formation
- Personnel
- Type
- Concept
- Gap for runs
- Side
- Defensive package
- Defensive call
- Defensive shell
- Any other actual engine fields
- Optional display metadata
- Stable ID
- Built-in/custom origin

Remove or consolidate duplicate concepts.

Avoid playing a quarterback under “fullback” or a receiver as an offensive lineman. Validate personnel against existing lineups.

Update `OFF_PLAYS` and `DEF_PLAYS` or introduce a compatible catalog that wraps them.

## Coordinator logic

Improve AI offensive and defensive calls:

- Situation awareness
- Down
- Distance
- Ball location
- Clock
- Quarter
- Score differential
- Timeouts
- Red zone
- Goal line
- Two-minute drill
- Half
- Overtime
- Team scheme
- Pass ratio
- Aggression
- Blitz
- Coverage preference
- Tempo
- Win probability if useful
- Weather
- Fatigue if meaningful
- Available custom plays if enabled

Use the existing situation and plan model where possible.

No empty-category fallback should crash.

No pass picker category should be empty because `aiOffCall` requests a nonexistent type.

Add tests for many situations and each scheme.

## Play-picker UI

Replace or improve the flat `OFF_PLAYS.map` and `DEF_PLAYS.map` UI.

Recommended structure:

- Tabs or segmented controls: Run / Pass / Situational / All
- Formation/personnel quick filters
- Search
- Favorites
- Recent
- Custom
- Offensive or defensive mode
- Situation-aware recommended section
- Full play list grouped by formation or depth
- Coordinator call card remains distinct
- Play names and descriptions
- Formation/personnel/type metadata
- 1–9 shortcuts
- 0 coordinator call
- Clear filters
- “No plays match” state
- Fast scrolling
- Play-card height suitable for touch
- No card list extending so far that the call sheet blocks the field on mobile
- Return focus after filter changes
- Avoid losing the selected state when the engine rerenders

At desktop, the picker can use a popup/panel or a field-overlay call sheet with grouped cards.

At phone width, consider:

- Full-width bottom sheet
- Compact cards
- Category tabs
- Sticky situation header
- Sticky confirm/back controls
- A first visible list of situational picks
- A maximum viewport height with internal scroll

Do not shrink text to a level that is unreadable.

---

# Priority seven: presentation, visual system, and interaction polish

Gridiron should receive a cohesive visual identity across all screens.

Read the existing `gridiron.css`, `screens/ui.tsx`, and V2 audit.

The V2 audit says visual foundation, page polish, motion, sound, and QA work was already addressed. Build on that work. Do not undo accessibility, reduced-motion, or mobile fixes.

## Team color strategy

Use team colors:

- Primary accent
- Team identity
- Selected state
- Progress indicators
- Player/roster highlights
- Field/team distinction

Do not allow team colors to create unreadable text.

Where a team has a dark or low-contrast primary:

- Use the second color
- Add a background
- Use white or dark text based on contrast
- Test black/white/gray teams
- Avoid text directly on a bright color without a proper contrast layer
- Preserve a fallback accent outside team selection

## Typography

Use existing Zuno/Graduate or Gridiron font patterns only if license and implementation already allow.

Improve:

- Type scale
- Page title hierarchy
- Team name vs coach name
- Metric hierarchy
- Micro labels
- Tabular/monospace numbers
- No all-caps text everywhere
- Uppercase only for intentional broadcast/micro labels
- Truncated long names with title/aria text where appropriate
- Large readable game score and down-distance
- Consistent h1/h2/h3/page labels
- Short line lengths
- Long coach/team names

Do not introduce web-font downloads unless required and consistent with Zuno.

## Surface and depth

Create/extend a coherent set of surface levels:

- Page background
- Shell/panel
- Elevated card
- Interactive card
- Dialog
- Selected state
- Pressed state
- Hover state
- Border and divider
- Broadcast scorebug
- Stadium/field stage

Gridiron should not look like the entire Zuno app with a green border. It should have a mature sports presentation based on a restrained dark surface, team accent, and clear typography.

## Motion

Add or refine:

- Screen entrance
- Header entrance
- Panel/card stagger
- Navigation active indicator
- Selected card transitions
- Press feedback
- Scorebug score change
- First-down marker
- Down/distance transition
- Dialog transition
- Toast
- Spinner
- Play-card filtering
- Empty-state appearance
- Modal reveal
- Reduced-motion fallback

Keep animation duration short and disciplined:

- Screen: ~160–240 ms
- Card hover: ~120 ms
- Dialog: ~180 ms
- Toast: ~220 ms
- Field and play animation remain tied to engine, not UI timers
- No continuous pulsing
- No motion that hides or shifts the primary action
- Respect `prefers-reduced-motion`

## States and feedback

Every major action needs feedback:

- Save
- Export
- Delete
- Trade proposal
- Trade rejection
- Custom play saved
- Custom play deleted
- Contract cut
- Contract restructure
- Roster change
- Advance
- Start career
- Import
- Timeout
- Replay
- Challenge
- Skip/step
- Advance week

Use existing toast and dialog patterns only if they can provide the needed level of clarity.

Confirm destructive actions:

- Delete career
- Delete custom play
- Cut player
- Simulate/leave unfinished game
- Quit unsaved career
- Clear trade
- Discard unsaved custom-play changes
- Reset depth chart
- Leave a live game
- Replace staff

Do not confirm every harmless navigation action.

## Audio and haptics

Preserve and improve `gmSfx.ts`:

- Route all Gridiron cues through Zuno audio infrastructure
- Preserve sound-effects settings
- Respect muted state
- Maintain existing sound profiles
- Add event cues only if useful
- Avoid overlap stacking
- Include haptic/soft feedback only for mobile-supported interactions
- No haptic or sound cue is the sole indicator of a game state
- Preview should be optional
- V2 notes say real-device iOS Safari audio still needs validation

If audio changes are needed:

- Test browser gesture behavior
- Avoid creating separate unmanaged AudioContexts
- Preserve existing bus, compressor, reverb, and volume behavior
- Add rate limits for repeated hit/whistle events
- Keep stadium bed optional
- Respect reduced-sound mode
- Avoid audio continuing after replay or exit

## Accessibility

Implement at least:

- Visible focus on every control
- 44x44px minimum interactive target size on touch
- Screen-reader labels for icon-only controls
- Status text for possession, down, clock, score, and outcomes
- Live regions for state changes
- Color plus text for status
- No flashing/strobing effects
- Focus trap in modal dialogs
- Escape close for dialogs
- Return focus to trigger after closing
- Roving tab navigation for game-day cards/board-like lists where appropriate
- Skip-to-content and skip-to-controls if practical
- Keyboard operation for trades, custom play editor, depth chart, player card, and play picker
- Validation errors announced and linked to fields
- Reduced motion
- High contrast of text and icons
- Clear table semantics
- Avoid empty buttons
- Ensure custom play controls do not rely on drag-only interactions
- Ensure trade, sort, and filter operations have keyboard alternatives
- Test keyboard-only play calling
- Test zoom and browser text scaling
- Avoid hidden elements receiving focus

---

# Priority eight: persistence and public file compatibility

Gridiron saves, careers, and custom plays must be stable.

Inspect:

- `gmSave.ts`
- `gmCareer.ts`
- `gmTypes.ts`
- `src/game-files/schema/gridiron.ts`
- `src/game-files/schema/validateGameFile.ts`
- `src/components/import/loadGame.ts`
- `src/components/import/GameImporter.tsx`
- Existing save tests
- Existing game file export/import behavior

## Save slots

Preserve three local save slots unless a test or real limitation requires change.

Improve:

- Save index metadata
- Auto-save after week
- Manual save
- Save timestamp
- Corrupt slot recovery
- Incomplete writes
- Storage full handling
- Delete two-step flow
- Export career
- Import career
- Migration of old careers
- Clear distinction between save slot and exported file
- Save/load while live game is active
- No “saved” success unless the storage operation completed
- Prevent save status from falsely reporting success
- Keep slot index and career data consistent
- Handle browser privacy/storage disabled gracefully
- Add retry behavior
- Keep no-save/offline copy/export options when possible

## Schema

If custom plays or new data are added:

- Update `GridironFile`
- Add schema version or optional fields appropriately
- Preserve older game files
- Validate imports
- Reject impossible or invalid custom play data safely
- Provide safe fallback for unknown play types or concepts
- Add `schemaVersion` migration support if needed
- Add validation for:
  - Career exists or is nullable
  - League team count
  - Custom play fields
  - Asset ownership
  - IDs
  - Enumerated values
  - Player/pick references
  - Name length
  - Description length
  - File size if practical
- Do not break existing sample `gridiron-league.zuno.json`
- Do not break round-trip career tests

## Export

Exported careers should include:

- Career state
- Custom plays
- User team
- Season/year
- Week/phase
- Staff/depth/roster/contract state
- League state
- Trades/draft state if represented
- Version
- Metadata

If a field is not used or is intentionally omitted, document it.

## Import

Imported careers should:

- Open in a slot
- Warn if import schema is newer or unknown
- Migrate known older schema
- Preserve custom play data
- Validate references
- Recover gracefully from partial invalid data
- Avoid overwriting existing slot until the user confirms destination
- Offer a clear imported career preview

## Storage

Custom plays and save data must not bloat or fail unexpectedly.

- Keep JSON serializable
- Do not store runtime UI state
- Avoid DOM references
- Avoid functions
- Avoid circular references
- Avoid timestamp values that cannot be reconstructed
- Check storage failure
- Add cache or index only where appropriate
- Test exported content through `validateGameFile`
- Keep data privacy in the browser

---

# Priority nine: responsive and QA matrix

The v3 public build must work across common devices and viewport sizes.

Minimum test widths:

- 320px portrait
- 375px portrait
- 390px portrait
- 768px portrait
- 1024px
- 1280px
- 1440px
- Wide desktop if practical

Minimum orientations:

- Portrait phone
- Landscape phone
- Tablet
- Desktop
- Short laptop display

Every screen should be checked for:

- Horizontal overflow
- Hidden primary actions
- Fixed-height page issues
- Nav overflow
- Tables with too many columns
- Dialog overflow
- Field overflow
- Long team names
- Long player names
- Long coach names
- Long trade or custom-play names
- Long play-by-play text
- Toast overlap
- Scorebug overlap
- Bottom safe area
- Browser zoom
- Focus ring clipping
- Keyboard-only navigation
- Reduced motion
- Audio disabled
- Storage unavailable
- Slow/blocked network
- Corrupt save
- Invalid import
- Reload during live game

## Desktop

- Use a focused content area plus nav
- Avoid excessively wide roster tables
- Keep game day field dominant
- Keep side panel useful but secondary
- Use visible page headers
- Use sticky actions only when useful
- Preserve scroll position where practical
- Keep dialog and transaction summaries visible

## Tablet

- Compact navigation
- Larger targets
- Grids adapt
- Trade flow remains usable
- Play picker remains usable
- Field and side panel can stack or become tabs
- Avoid tiny two-column fields

## Mobile

- Top action bar and/or bottom safe-area navigation
- Two-column play cards only if text remains readable
- No horizontal overflow
- Play calling one primary action at a time
- Sticky situation header
- Bottom-sheet style pickers if appropriate
- Long tables become rows/cards or controlled horizontal scroll
- Hidden nav items are reachable
- No field controls outside the viewport
- No fixed height that prevents scrolling
- No small text under essential game information
- Keep back/quit/sim controls reachable
- Preserve focus after modal close

## Browser behavior

Test and fix:

- Browser back/forward if routing exists
- Escape behavior
- Window resize
- Page reload
- Save reload
- Live-game hot reload in development
- Long-running setInterval/setTimeout cleanup
- React Strict Mode if enabled
- Stale callbacks
- Duplicate useEffect work
- State updates after unmount
- Timeouts in `runStep`, `skip`, and animations
- Replaying while a live play is animating
- Speed changes during animation
- Pause changes during events
- Skip/advance while replaying
- Final state reached twice
- Callback invoked twice
- Invalid indexed access
- Missing player or team
- Missing custom play
- Missing old save fields
- Missing `g.drives[g.drives.length - 1]`
- Missing stat records
- Missing defensive cover/target entries
- Missing route frames
- Missing weather
- Missing overtime state
- Missing import

---

# Priority ten: testing and verification

Use Vitest and existing repository test conventions unless the repository clearly expects another framework.

## Engine tests

Keep existing tests.

Add tests for:

- Incomplete pass field stability
- Complete pass gain
- Sack loss
- First-down gain
- Third-down failed gain
- Fourth-down success
- Fourth-down turnover
- Goal-to-go
- Holding nullified gain
- PI awarded first down
- Roughing passer
- Safety
- Interception
- Pick-six
- Fumble
- Fumble return
- Turnover on downs
- Touchdown
- Clock
- Overtime
- Two-minute warning
- Kneel
- Spike
- Special teams
- Challenge reversal
- Challenge standing
- 1,000-game realism with runtime appropriate to CI
- Determinism
- Animation endpoint
- Valid state after every play
- Team and player stats

Tests should cover actual source behavior, not only helper functions invented for testing. Export small pure helpers only if they improve maintainability.

## UI tests

Add or update React tests where practical:

- Game-day call sheet states
- Custom play editor validation
- Custom play save/delete/duplicate
- Custom play picker
- Trade asset selection
- Trade validation
- Trade review/reject/accept
- Save slot corrupt/empty state
- Player card close/focus
- Responsive overflow only with browser tooling
- Keyboard play calling
- Keyboard shortcut conflicts
- Halftime adjustment
- Replay state
- Skip controls
- Final result
- Empty leader state
- Mobile nav reachability
- Toast timing

## Build commands

Before completion, run the commands documented by the repository.

At minimum:

- `npm test` or the specific Vitest command
- `npm run test` if defined
- `npm run typecheck` if defined
- `npm run lint` if defined
- `npm run build`

Do not install arbitrary packages unless they solve a clear repository need.

If dependencies are missing or scripts differ, inspect `package.json` and adapt.

Report:

- Commands run
- Pass/fail status
- Any test timeout or environment limitation
- Any browser check limitation
- Any pre-existing failure versus a v3 failure
- Any release blocker

## Manual QA checklist

If Playwright or browser automation is available:

- Create a new career
- Choose a team
- Enter a coach name
- Save
- Reload
- Continue from slot
- Export/import career
- Advance to a game
- Start live/coaching mode
- Verify the opening kickoff
- Call offense
- Call defense
- Verify a complete pass
- Verify an incomplete pass
- Verify a sack
- Verify a first down
- Verify a failed third down
- Verify fourth down
- Verify a turnover
- Verify halftime
- Verify overtime or skip
- Verify final result
- Verify career result recording
- Create a custom offensive play
- Reload
- Select the custom play
- Verify the result
- Edit and duplicate a custom play
- Delete with confirmation
- Open trade
- Add a player
- Add a pick if available
- Review
- Reject/cancel
- Accept and verify roster/cap changes
- Test storage failure by simulating full storage if practical
- Test corrupt save
- Test 320px layout
- Test 390px layout
- Test 768px layout
- Test 1440px layout
- Test keyboard-only play calling
- Test reduced-motion mode
- Test muted audio
- Test replay and scrub
- Test pause/step
- Test skip drive/quarter/end
- Test quit/save/export
- Test reload on live game

Do not claim browser QA passed if it was not performed.

---

# Suggested implementation phases

Use this order unless repository constraints justify a change.

## Phase 1: baseline and engine diagnosis

- Inspect repository state and scripts
- Read audit and relevant source
- Run baseline tests/build
- Trace downs and passes
- Add focused engine tests
- Fix down-and-distance/incomplete-pass bugs
- Add validity assertions
- Fix review snapshots or challenge state if discovered

## Phase 2: data and playbook foundation

- Define/verify PlayCatalog APIs
- Add stable IDs and validation
- Expand built-in playbook
- Improve AI coordinator selection
- Add playbook tests
- Add custom play types/persistence/migration
- Update save schema

## Phase 3: custom-play editor and library

- Implement create/duplicate/edit/delete
- Implement validation
- Implement save/load
- Integrate custom offensive/defensive selection
- Prevent unsupported claims
- Add tests

## Phase 4: trade UI and logic

- Inspect existing trade implementation
- Fix logic bugs found
- Add polished two-sided builder
- Add summary and review
- Improve rejection/confirmation states
- Add transaction tests

## Phase 5: live game-day polish

- Improve call sheet
- Improve play picker
- Improve scorebug and status hierarchy
- Improve replay and controls
- Improve side panels
- Improve mobile layouts
- Improve keyboard and accessibility
- Improve field/caption/marker clarity

## Phase 6: management screens

- Improve save/new-career
- Improve hub
- Improve roster/depth
- Improve cap/contracts/free agency
- Improve staff/draft/standings/leaders/history
- Improve player card
- Apply visual consistency
- Test responsive behavior

## Phase 7: public-release hardening

- Add migration/fallback handling
- Improve empty/error/loading states
- Fix console errors
- Improve toasts and confirmations
- Improve audio
- Improve reduced motion
- Improve docs and release notes
- Run full validation

## Phase 8: release verification

- Run tests
- Run typecheck
- Run lint
- Run build
- Run browser QA
- Fix regressions
- Review final diff
- Produce final summary and known limitations

---

# Strict working rules

- Make real, coordinated code changes.
- Do not stop after an audit.
- Do not rewrite the entire app unless the existing structure makes a focused improvement impossible.
- Do not discard or replace working systems without evidence.
- Do not add fake data or placeholder UI.
- Do not invent engine capabilities.
- Do not copy proprietary Madden UI, branding, assets, or text.
- Do not alter save behavior backward-incompatibly.
- Do not weaken tests.
- Do not remove existing tests just to make the suite pass.
- Do not ship console errors or obvious TypeScript errors.
- Do not ship hard-coded fake scores or fake trades.
- Do not use a UI calculation as the source of engine truth.
- Do not allow custom plays to reference deleted or missing data.
- Do not allow custom plays to affect AI unless explicitly designed and tested.
- Do not expose unsupported controls.
- Do not leave a control that appears interactive but does nothing.
- Do not expose a route-drawing feature unless it is fully implemented.
- Do not claim a test or QA action succeeded unless it was actually run.
- Do not assume the current engine is correct just because an existing test passes.
- Do not hide reported bugs in the UI.
- Do not use overly broad random simulations without meaningful invariants.
- Do not introduce a dependency that can be avoided with existing React/TypeScript/CSS.
- Use existing Zuno patterns before creating a new component family.
- Extract reusable UI only when it reduces duplication or prevents bugs.
- Keep changes readable and reviewable.
- Add comments only where the rule or rationale is non-obvious.
- Update release documentation.

---

# Visual and code review checklist

Before finishing, inspect the final diff for:

- Incorrect `ballOn` updates
- Incorrect `dist` updates
- Incomplete pass gains/losses
- First-down regressions
- Fourth-down turnover regressions
- Challenge snapshot regressions
- Out-of-bounds animation
- Invalid down/distance values
- Invalid overtime possession state
- Invalid custom play fields
- Save migration omissions
- Trade mutation outside validated engine logic
- Duplicate state updates
- Missing dependencies in `useEffect`
- Stale closures
- Timeout cleanup
- Double-submit
- Double-click
- Accessibility regressions
- Focus loss
- Hidden overflow
- Long names
- Table overflow
- Mobile nav overflow
- Field overflow
- Unsupported route/coverage claims
- Fake trade value data
- Missing empty states
- Console warnings
- React key warnings
- No-op buttons
- Outdated documentation
- Existing V2 fixes accidentally removed
- `prefers-reduced-motion` regressions
- Audio setting bypasses
- Unrelated modifications

---

# Required final deliverable

When implementation is complete, provide:

1. A concise summary of the v3 changes.
2. The confirmed root cause or causes for downs/incomplete-pass problems.
3. A list of files added or significantly changed.
4. A summary of engine changes.
5. A summary of custom-play changes.
6. A summary of trade changes.
7. A summary of playbook and play-picker changes.
8. A summary of UI/responsive/accessibility changes.
9. Save/schema compatibility notes.
10. Tests added.
11. Commands run and actual results.
12. Browser/manual QA performed and actual results.
13. Known limitations.
14. Release blockers, if any.
15. Any follow-up work that is intentionally deferred.

Do not describe as complete anything that was not verified.

The final product should be **a polished, complete, reliable public v3 of Gridiron GM**: stronger football rules, a larger and more useful playbook, a Madden-like in-game management experience, real custom plays, a real trade builder, excellent live game-day presentation, complete save compatibility, and responsive, accessible Zuno-quality UI.
```
