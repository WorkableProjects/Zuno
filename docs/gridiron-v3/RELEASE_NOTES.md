# Gridiron GM v3 release notes

Covers items 1-15 of "Required final deliverable" in `docs/gridiorinv3.md`. Everything marked verified was run; anything not run is listed under limitations or deferred.

## 1. Summary
- Engine rule fixes and an engine-supplied after-play snapshot on every play record.
- Playbook grown from 18 to 45 offensive plays and from 8 to 22 defensive calls, with stable ids, tags and situational AI.
- Real custom plays: create, edit, duplicate, delete, enable/disable, import/export, saved per career.
- A trade builder with a value meter, validation, a counter-offer helper and before/after cap and roster. Free agency, cap and draft room were also improved.
- A rebuilt game-day screen: scorebug, play picker, controls, replay and scrub, step mode, skip drive/quarter/end, halftime adjustments, fourth-down sheet.
- Save format v2, safer storage handling, export and import, leave guards.
- Management screens polished: roster, depth chart, staff, hub, standings, leaders, history, player card.

## 2. Root cause of the downs / incomplete-pass problem
The down and distance arithmetic was already correct. T1 instrumented 400+ games and found no bad state.
- `step()` changes `GameState` immediately, but `PlayRecord` only held the snap situation. The old game-day UI read live `g.down/dist/ballOn` for the scorebug and line-to-gain while the play was still animating.
- During an incomplete pass the bug therefore showed the already-advanced down (3rd & 6 became 4th & 6 before the throw). After a turnover on downs it showed the other team's spot.
- Fix: `PlayRecord.after` (`down, dist, ballOn, poss, phase, quarter, clock, score, firstDown, turnoverOnDowns`) is captured at the end of `record()`. The UI shows the snap values while animating and `after` when the animation ends.
- Browser-verified in this QA pass. The bug kept the snap value during animation and updated at the end: 1st & 10 became 2nd & 7 on a +3 run. 4th & 1 "go for it" held "4th & 1" while animating, then showed 1st & 10 after the conversion. A sack went from 1st & 10 to 2nd & 14, and a penalty from 2nd & 14 to 2nd & 9.

## 3. Files added or significantly changed (`src/games/gridiron/`)
- New: `gmPlayCatalog.ts`, `gmCustomPlays.ts`, `gmTrade.ts`, `gridironShell.css`, `screens/Playbook.tsx`, `screens/PlayPicker.tsx`, `screens/playbook.css`, `screens/manage.css`, `screens/trade.css`
- Rewritten: `gmSave.ts`, `gmPlaybook.ts`, `screens/GameDay.tsx`, `GridironPlay.tsx`
- Significantly changed: `gmEngine.ts`, `gmTypes.ts` (additive), `gmRoutes.ts`, `gmDraft.ts`, `gmPlayers.ts`, `fieldRender.ts`, `gridiron.css`, `screens/Front.tsx`, `Hub.tsx`, `Team.tsx`, `League.tsx`, `screens/ui.tsx`, `src/game-files/schema/gridiron.ts`
- New tests: `tests/gridiron-engine.test.ts`, `-playbook.test.ts`, `-trade.test.ts`, `-trade-ui.test.tsx`, `-save.test.ts`, `-gameday.test.tsx`, `-screens.test.tsx`

## 4. Engine changes
All are in `gmEngine.ts`, with tests.
- Penalty distance is no longer capped at 30. It now uses `clamp(dist - penaltyYards, 1, 100 - ballOn)`, and penalty yards are recomputed from the actual spot.
- No stray pass breakup on a roughing penalty.
- A safety closes the drive.
- Interception touchback starts at the 20.
- A lost fumble that already crossed a goal line no longer becomes a turnover at the 1.
- Kneel cannot fire on 4th down. Explicit kneel and spike calls are honoured, and a 4th-down spike is a turnover on downs.
- Punt distance near the goal is clamped.
- New outcome flags: `firstDown`, `turnoverOnDowns`, `safety`, `deflected`, `dropped`.
- `runPlay(g, PlayDefinition | OffCall)` is the hook custom plays use.

## 5. Custom plays
- A custom play is a template choice: formation, personnel, play type, concept, gap, side. **There is no route drawing**, and the UI says so.
- Fields are tagged "Changes the game" or "Label only".
- Stored as `career.customPlays`, and validated and sanitized on load and import. Invalid entries are dropped with notes.
- User-only. Coordinators and the CPU never call them; the UI makes no such claim.
- Verified in a browser: create, save, reload, edit (a type change repaired the dependent concept list), duplicate, delete with a "Delete play / Keep it" confirm. The custom play was called in a live game and ran as a medium pass.

## 6. Trades
- `gmTrade.ts` is pure and unit-tested (31 tests).
  - Validation: ownership, used picks, roster max and min, cap, trade window, IR and practice squad.
  - Value analysis: values come from the engine, and the verdict matches `evaluateTrade`.
  - Sweeteners: `suggestSweeteners` only proposes additions that flip a rejection.
  - `proposeTrade` revalidates, then executes once.
- UI: partner list with needs, give and receive panels, roster and draft-asset tabs, value meter with asking-price marker, verdict and reasons, "What would they take?", before/after cap and roster, Review then Propose with a double-submit lock. Below 860px it becomes four steps.
- Browser-verified:
  - A 1-for-1 deal shows the meter and verdict.
  - An invalid 3-for-1 deal is blocked with a reason ("You would have 54 players").
  - A rejection changes nothing and gives a readable reason.
  - "What would they take?" returns a sweetener or an honest "no single asset" message.
  - An accepted deal moved the player in the roster, and the Roster screen showed the incoming player and not the outgoing one.

## 7. Playbook and picker
- 45 offensive plays across Singleback, I-Form, Shotgun, Pistol, Empty and Goal Line, and 22 defensive calls. Engine-support rules are encoded, so there are no coverages the engine cannot honour.
- Playbook screen: search, filters, sort, pin, preview, copy a built-in to custom.
- Game-day picker: tabs Suggested, All, Run/Coverage, Pass/Pressure, Situational, Starred, Recent, Custom. Number keys pick a card, `0` calls the coordinator, and star and recents are stored in localStorage per slot.
- QA fix: "Long yardage" is no longer suggested on 1st & 10.

## 8. UI, responsive and accessibility
- Scorebug, call sheet and side panel are rebuilt. Controls: pause, speed, step with N, skip, replay with scrub, Keys panel, play clock, timeout, challenge. Reduced motion is respected.
- Phone call sheet is a bottom sheet with safe-area padding and 44px targets.
- Dialogs have a focus-first button and Escape. Statuses use `role=status` and live regions.
- QA fixes are listed in section 12.

## 9. Save and schema compatibility
- `saveVersion: 2` with optional `customPlays`. `Career.version` stays 1, so v1 saves load and old builds can still read v2 saves. `migrateCareer` never mutates its input and rejects newer saves.
- Storage: IndexedDB with a localStorage fallback. A success is reported only after the transaction completes. Quota and unavailable errors have readable messages. Unreadable slots are shown as "Unreadable save" with a delete option.
- Export and import: `.zuno.json`, validated. Import shows a preview and a slot choice before anything is overwritten.
- Verified in a browser: save, reload and Continue, custom plays persisting across reload, export download (1.5 MB), import into a slot, import of an invalid file, a corrupt slot, and a simulated full storage with a Retry and "Continue without saving" prompt.

## 10. Tests added
About 130 new tests across the 7 files in section 3. They cover engine invariants over 320 seeded games, the playbook, trades, saves, and SSR render smokes for game day and the screens.

## 11. Commands and results (final)
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 22 files, 388 passed, 18 skipped, 0 failed.
- `npx vite build`: succeeds, with the usual chunk-size warning.

## 12. Browser QA (Playwright, Chromium; run by T7)
Driven through the real app (Library, Gridiron GM, Play).

| Checklist item | Result |
|---|---|
| New career, team, coach name, save, reload, Continue | Pass |
| Export and import career | Pass (import was unreachable; fixed, see below) |
| Playbook create, reload, select, result, edit, duplicate, delete with confirm | Pass |
| Trade: add player, review, reject, accept, roster change | Pass |
| Add a pick to a trade | Pick rows list and the Draft assets tab loads. Adding a pick to a deal was **not** exercised in the browser (covered by unit tests). |
| Live game: kickoff, touchback, offense and defense calls | Pass |
| Complete pass, incomplete (dropped), sack, first down | Pass |
| Failed third down | Not specifically exercised. 3rd & 5 and 3rd & 11 snaps appeared. |
| Fourth-down sheet, go for it | Pass |
| Penalty, punt, safety, TD flow | Pass |
| Turnover | Only punt and safety were observed. No interception or fumble was seen in the live runs (engine tests cover them). |
| Halftime panel | Pass |
| Overtime | Pass (one game ended in OT on a safety) |
| Final, Continue, result recorded | Pass (record 0-1 and score recorded; autosaved) |
| Pause, step with N, replay, scrub, Esc to exit replay | Pass after a fix |
| Skip drive, quarter, end | Pass. These controls are disabled while a call is awaited. |
| Keyboard-only play calling (`0` and `1`) | Pass |
| Reduced motion (emulated) | Pass: no animation, no errors |
| Muted audio | **Not tested**. Only the autoplay warning was seen (filtered). |
| Reload on a live game | The live game is lost. Continue returns to the last save with the game unplayed (documented limitation). |
| Corrupt save, full storage | Pass |
| Layouts 320, 390, 768, 1440 (`scrollWidth > innerWidth`) | Pass after fixes. 1100px was checked for the depth chart only. |
| Console | **0 errors and 0 warnings** across the final runs, after the fix below. AudioContext autoplay warnings are filtered; they come from Zuno's shared audio. |

Real bugs found and fixed:
1. Roster and Staff tables caused page-level horizontal overflow on phones. Cause: absolutely positioned children escaped `.gr-xscroll` clipping. Fixed with `position: relative` and no-wrap cells.
2. The depth chart overflowed at 768px. It now collapses to one column at 1100px and below.
3. A GameDay Halftime React "unique key" warning (the console error seen in QA).
4. After scrubbing a replay, Esc and R did nothing because range inputs counted as "typing". Fixed.
5. The Pause/Live label was clipped ("Paus"/"Liv") in the control bar.
6. The Gridiron career file could be exported but not imported, because no UI reached the import preview. Added an "Import career file" button on the slots screen.
7. The trade success message claimed the deal was "final and saved" while the career showed "Unsaved changes". The copy now matches.
8. Negative cap space showed as `$-26.7M`. It now shows `-$26.7M`.
9. Trade player rows at mid-width desktop hid the player name (the name column collapsed to zero). The name now takes its own line.
10. "Long yardage" was suggested on 1st & 10.
11. The mobile call sheet was translucent, so field text showed through. It is now opaque.

Screenshots (deviceScaleFactor 2) are in `docs/gridiron-v3/qa/`: playbook editor, trade builder, game-day call sheet at 1440, animating at 1440, and call sheet at 390.

## 13. Known limitations
- No route drawing and no free-form play design. The engine only reads formation alignment, personnel, type, concept, gap and side.
- Custom plays are user-picked only. Coordinators and the CPU never use them.
- A live game is not saved mid-game. Quitting or reloading discards it.
- Fumble-return touchdowns are not modelled.
- Play usage counts are not tracked, so the library shows none. Favorites and recents are localStorage per slot, not in the save.
- Penalty spot-move animation is not shown.
- Drag-and-drop in the depth chart has no touch drag. Arrow buttons are the touch and keyboard path.
- Trade value is the game's own estimate. Leaving Trades through the in-app nav with a deal in progress asks for confirmation. Trade-in-draft works via pick ownership, with no UI undo.
- Trade-row and team-list text are very tight at 1440px. Team cap amounts in the partner list can touch the right edge.
- Halftime adjustments apply to that game only, which is a deliberate change from v2.
- The kickoff touchback spot is the 30. It was left as is.

## 14. Release blockers
None found. Unrun items (muted audio, the pick-in-trade UI path, interception and fumble in the live UI) are gaps in QA, not known defects.

## 15. Deferred
- A route editor.
- Per-career play usage and favorites stored in the save.
- A live-game mid-save and resume.
- Letting the user's coordinator choose custom plays.
- Clinched/eliminated labels in standings.
- Haptics and a stadium sound bed.
- Fatigue and win probability in coordinator calls.
- A touch drag for the depth chart.
