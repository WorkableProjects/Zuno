# Zuno Gridiron GM — American Football Manager Specification

## Document status

- **Audience:** Zuno maintainers, designers, and contributors
- **Scope:** A new single-player (SOLO) game: an American football GM / head-coach career with LIVE 2D play-by-play
- **New game:** **Zuno Gridiron GM** (working title), `gameType: "gridiron"`
- **Architecture baseline:** React + TypeScript + Vite; schemas in `src/game-files/schema`; engines under `src/games`; screen stack in `src/app/App.tsx`; registry in `src/games/registry.ts` (`players: "solo"` puts it in the Library's Solo section)
- **Reference for the live view:** the way Tactical FPS Manager lets you watch matches play out live in 2D. Every snap here is animated with all 22 players.

---

## 1. Concept

"Zuno Gridiron GM" is a single-player, offline career as GM and head coach of a fictional pro American football franchise. There are no NFL teams, names or logos.

---

## 2. League generation (seeded)

- 32 teams in 2 conferences, each with 4 divisions of 4.
- A 17-game regular season built with a divisional schedule formula, including bye weeks.
- Playoffs: 7 seeds per conference, with a bye for seed 1. Wild Card, Divisional and Conference rounds, then the "Zuno Bowl".
- Each team has a 53-man roster plus a 16-man practice squad, a city, a nickname, colours, a shape-based logo, a stadium (dome or open), an owner patience level and a market size.

---

## 3. Player model

- Positions: QB, RB, FB, WR, TE, OT, OG, C, DE, DT, OLB, MLB, CB, FS, SS, K, P and LS.
- Attributes from 1–99:
  - Speed, Strength, Agility, Awareness, Catching, Route Running, Throw Power and Throw Accuracy (short/medium/deep).
  - Run Block, Pass Block, Pass Rush, Tackle, Coverage (man/zone), Ball Carrier Vision, Kick Power and Kick Accuracy.
  - Hidden: Potential, Injury-prone, Clutch and Work Ethic.
- Overall rating = a position-specific weighting.
- Archetypes, for example Pocket Passer, Scrambler, Power Back, Deep Threat, Possession WR, Shutdown CB and Edge Rusher.
- Age, years pro, contract (years, cap hit, guaranteed money, dead cap), morale, fatigue, development trait (Normal/Star/Superstar) and injury status.

---

## 4. Depth chart and schemes

- Drag-and-drop depth chart for each position, plus kick and punt returners and personnel packages (11, 12, 21, Nickel, Dime).
- Offensive scheme: West Coast, Air Raid, Power Run, Spread or Pro-Style.
- Defensive base: 4-3 or 3-4, with Cover 1, Cover 2, Cover 3 or Man Blitz tendencies.
- Scheme fit affects player ratings (±3).
- Game plan sliders: run/pass ratio, aggression on 4th down, blitz frequency, tempo, and the two-point conversion policy.

---

## 5. Play-by-play sim engine (`gmEngine.ts`, pure and deterministic, seeded with mulberry32)

- Clock: four 15-minute quarters, game and play clock, timeouts (3 per half), the two-minute warning, and clock management for kneels, spikes and running out the clock.
- Each snap:
  - Down and distance plus field position and score/time decide offense and defense play selection (AI coach logic, or yours).
  - Run, short pass, medium pass, deep pass, screen and play-action play types face run defense, blitz, man and zone.
  - Matchup rolls: OL vs DL for pressure and sack, WR vs CB for separation, then QB accuracy for completion, interception or drop, then yards after catch vs tackle.
- Outcomes:
  - Gain/loss, first down and touchdown.
  - Sack, fumble and recovery, interception and pick-six.
  - Penalties: holding, offside, pass interference, false start and roughing.
  - Field goals with distance-based accuracy, punts, kickoffs and touchbacks, onside kicks and safeties.
- Overtime follows modern rules (both teams get a possession). There are also challenges and replay review.
- Fatigue, in-game injuries and weather (rain, snow, wind affecting the passing and kicking game), with home-field advantage.
- Box score and player stats: passing (comp/att, yds, TD, INT, rating), rushing, receiving, defense (tackles, sacks, INT, PD, FF) and kicking.
- The same seed gives the same game, which is unit tested.

---

## 6. LIVE 2D gameplay (Game Day screen)

The centrepiece. Like Tactical FPS Manager's live match viewer, every snap plays out as real-time 2D animation of all 22 players, not just a text feed.

- **Two layers:** `gmEngine` resolves each play into a **PlayScript**, which `FieldView` renders.
  - The engine stays deterministic and headless, so the sim, tests and instant results share it.
  - A PlayScript is a timeline of 22 player paths plus the ball path, sampled at 10 Hz for about 3–8 seconds.
  - It also holds an event list (snap, handoff, throw, catch, tackle, whistle).
- **How a PlayScript is generated:** the engine picks the offense and defense formation and play, then lays players out on formation anchors and simulates with simple steering behaviour:
  - Routes (slant, go, out, curl, post, flat, wheel) come from a route library. Run lanes are gap assignments (A–D gaps).
  - OL/DL engage in blocks whose outcome comes from the Block vs Pass Rush roll. A winning rusher breaks through toward the QB, so a sack looks like a sack.
  - Defenders run man assignments (shadowing a receiver) or zone (dropping to a zone landmark and reacting to the ball).
  - Ball physics: a throw arc with flight time set by Throw Power and distance. Catch radius and contest are rolled at arrival. The carrier pathfinds through gaps, and tackle checks happen on contact.
  - Speed attributes set each player's top speed and acceleration, so fast players visibly outrun others.
  - The final yardage is decided by the animation's own outcome. The animation is the play.
- **Rendering (canvas, about 60 fps, interpolates 10 Hz frames):**
  - A green field with yard numbers, hash marks, end zones painted in team colours, and line-of-scrimmage (blue) and first-down (yellow) lines.
  - Player tokens are circles in team colours with jersey numbers and a facing direction. The ball carrier is highlighted.
  - The QB's read is shown as a faint line to each target. On a throw there is a ball trail, and a "pancake" or "sack" flash appears on impact.
  - The camera follows the ball with smooth pan. There is also an all-22 zoomed-out view and a broadcast (sideline-tilted) view toggle.
  - Overlays you can toggle: route trees, coverage shells, block matchups and player names/ratings on hover.
- **Playback controls:**
  - Speed: 0.5×, 1×, 2× and 4×.
  - Pause between snaps, Instant replay of the last play (scrub bar, slow-mo), and skip to the next drive, quarter or end.
- **HUD:**
  - A scoreboard bug (score, quarter, clock, down and distance, timeouts, possession).
  - A play-by-play caption that updates during the play.
  - A drive tracker, a win probability graph and a live stats sidebar.
- **Coach mode during live play:**
  - Before each snap, a playbook picker (formation + concept cards, play clock timer) on offense and defense, or let the coordinator auto-call.
  - Hot keys for timeout, challenge and audible. 4th-down and two-point decision prompts.
  - Halftime adjustments.
- **Highlights:** big plays (20+ yards, TDs, turnovers, sacks) are saved as PlayScripts in game history and can be replayed from the box score or the season page. Other games around the league can be watched live in the same viewer, or as highlights.
- **Performance:** a plain 2D canvas, with a static field layer cached on a second canvas. Phone layout keeps the field vertical (end zones top and bottom).
- **Files:** `gmPlayScript.ts` (types and generation), `gmRoutes.ts`, `gmSteering.ts`, `FieldView.tsx` and `fieldRender.ts`.

---

## 7. Career / GM systems

- **Salary cap:** a hard cap rises each year, with cap space, restructures, cuts (pre or post June 1), dead money and a franchise tag.
- **Free agency:** contract negotiation (years, guarantees, incentives), with player interest based on money, contender status and role.
- **Trades:** player and draft pick trades, with an AI value chart and trade-deadline logic.
- **Draft:** 7 rounds and a generated draft class.
  - Scouting points reveal attribute ranges, combine results (40 time, bench, vertical, cone) and Pro Day.
  - Big board, mock drafts, draft-day trades and undrafted free agents.
- **Coaching staff:** hire OC, DC and ST coordinators and position coaches. Their scheme and development bonuses carry over.
- **Development:** weekly training focus and practice intensity (affects injuries), progression and regression each offseason, rookies and veterans, and retirements.
- **Injuries:** weekly reports, IR (injured reserve), and Questionable/Doubtful/Out tags.
- **Owner and media:** a job-security meter, season goals, press conference choices that affect morale, and an inbox of news, agent calls and trade offers.
- **History:** season awards (MVP, OPOY, DPOY, ROTY, Coach of the Year), All-Pro, a Hall of Fame, franchise records and a trophy room.

---

## 8. Screens

- New career and team select.
- Hub (week view, "Advance").
- Roster, Depth Chart, Game Plan/Playbook, Cap and Contracts, Free Agency, Trades, Draft Room, Staff, Standings and Playoff Bracket, Stats Leaders, Game Day and League History.
- The offseason calendar: Re-sign, Combine, FA, Draft, Camp, Cutdown to 53.

---

## 9. Persistence

- 3 save slots in IndexedDB, with autosave weekly.
- Export/import a `.zuno.json` (`gameType: "gridiron"`) with schema validation in `src/game-files/schema/gridiron.ts`.
- An optional "custom league file" lets you build team names and colours, using `hasBuilder` later.

---

## 10. Integration

 - A `GameEngine` entry with `players: "solo"`.
 - `GAME_INFO`: 1 player, mode "One screen", length "Career".
 - Files in `src/games/gridiron/`: `gmEngine.ts`, `gmPlaybook.ts`, `gmLeague.ts`, `gmCareer.ts`, `gmDraft.ts`, `GridironPlay.tsx`, `screens/*`, `FieldView.tsx` (canvas) and `gridiron.css`.
 - A screen in the `App.tsx` stack, artwork, a sample file and a music theme (`Gridiron GM.mp3`).
 - SFX: whistle, crowd, TD horn and hit.

---

## 11. Delivery phases

 - **M1:** league generation, PlayScript play engine (player paths generated from day one), text play-by-play, box score, standings, one regular season.
 - **M2:** LIVE 2D PlayScript viewer (all 22 animated), replay, coach-mode play-calling, other games live.
 - **M3:** playoffs and the Zuno Bowl, injuries, depth chart, game plans.
 - **M4:** cap, free agency, trades, draft and offseason.
 - **M5:** staff, development, awards, history and custom league files.

---

## 12. Tests (vitest)

 - Determinism, and that PlayScript outcome = recorded yardage, with no players leaving the field.
 - Realism checks over 1,000 sims: about 22 points per team per game, 63% completion, about 4.3 yards per carry, sack rate around 6%.
 - Clock and overtime rules, tiebreakers (head-to-head, division, common games, conference), cap math, draft order and save round-trip.

