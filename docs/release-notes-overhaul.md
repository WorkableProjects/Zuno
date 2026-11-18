# Release notes: game overhaul

## New: Trivia Gauntlet
- Local hosting from one shared screen: Warm-Up, two lane rounds (Quickfire, Puzzle, Wild), Choice, Chaos and the Final Gauntlet (Climb, Crossroads, Lock, Summit).
- **Online play.** Choose "Host online" in setup. Players scan the QR code or enter the room code, pick a team and answer from their phones. Phones only receive a public view: answers appear after the host judges a turn, and Choice tiers stay secret until revealed.
- Phones rejoin automatically after a refresh or a locked screen. If the host's connection drops, phones show a waiting notice; a refreshed host is offered to resume the room where it left off (cancel closes it). Rooms older than six hours are reused for new codes.
- Results add fun awards: Fastest answer, Biggest comeback, Hot streak and Bold wins.
- Build your own deck in the Builder: a visual editor with live validation, or the AI guide.

## LIAR
- Presets, vote revisions, score rule log and drafts.
- Online rooms now carry the options chosen on the setup screen (live totals, anonymous votes, streak bonus) and can toggle them in the lobby.
- Phones rejoin after a refresh and ignore out-of-date broadcasts.

## Headbands
- Identity lifecycle, fairness settings, host overrides and log filters.
- Phones rejoin after a refresh and ignore out-of-date game snapshots.

## Interface
- Shared status, timer and player chip components and semantic status colors.
- Leaving or restarting a game in progress asks first.
- Larger tap targets and stacked dialog buttons on phones; visible focus rings.
- "Still" background motion in Settings also calms interface animation, matching the system reduced-motion setting.

## Known limits
- Rooms left open by a host who never returns stay in the database until their code is reused.
- Gauntlet phones join one team each; the host can move players before the match starts.
