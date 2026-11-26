# Gridiron GM — V2 audit and polish plan

Audit method: scripted Playwright tour of every screen (save slots, new career, hub, all 11 management screens, player card dialog, live game day) at 1440×900 and 390×844, 43 screenshots before and after. No console errors either pass. Before/after samples are in `screens/`.

## Findings by screen

| Screen | Works | Basic / broken | Change (status) |
|---|---|---|---|
| Save slots | Clear 3-slot model, autosave note | Small title repeats the file title as meta; empty slots read as dead boxes; **Delete erases a career in one click** | Hero header with field-line motif and broadcast-yellow rule; empty-slot copy + primary CTA; two-step delete (**done**) |
| New career | Team grid with ratings | Plain heading; selection feedback weak; start bar hard border | Hero header, raised team cards, selected glow + logo scale, faded sticky start bar (**done**) |
| Shell / nav | Full feature set reachable | Flat sidebar; page title only; no transitions; **mobile: 16 nav items fill the whole first screen before any content** | Team identity card, accent indicator, unread pill, eyebrow + title header, screen entrance motion; mobile becomes a sticky header with swipeable tab strip (**done**) |
| Hub | Matchup, schedule, league scores, inbox | Matchup cards flat; "AT" misaligned on mobile | Team-color radial cards, hover lift, centered divider (**done**) |
| Roster / Cap / Contracts / FA / Staff / Standings | Dense, correct data | Loud uppercase-less headers, no row hover, your-team row weak; **tables overflow the phone viewport** | Uppercase micro headers, row hover, team-accent row marker, panel-level horizontal scroll on phones (**done**) |
| Stat leaders | Correct ranking | **Empty cards with no text before week 1**; scope toggle stretched full width | Empty state copy; toggle sized to content (**done**) |
| League history / FA negotiation | — | Empty states as tiny grey text | Dashed empty-state component (**done**) |
| Player card dialog | Full attributes & contract tools | Cramped inputs, flat bars | Display-face name, animated attribute bars, larger inputs (**done**) |
| Game day | Strong field render, broadcast bug | Side panels unframed; caption pops; play cards static | Framed side sections, caption/final/card entrances, deeper stage shadow (**done**) |
| Advance button | Works | Only text changes while simulating | Spinner + fixed width (**done**) |

## Sound audit

| Cue | Problem | Fix (done) |
|---|---|---|
| All game-day cues | Bypassed Zuno's sfx bus: ignored the sound-effects switch, no compressor/reverb, their own AudioContext created outside a gesture | Route through new `openSfxVoice()` on the shared bus; silent unless the bus is already running (no sound on load, autoplay-safe) |
| Whistle | Pure 2.9 kHz sine with vibrato — sounded like a test tone | Pea-whistle model: detuned triangles + band-passed breath, 34–42 Hz flutter, slight pitch fall, randomised |
| Hit | Low-passed white noise burst | Pitch-dropping body thump + short mid "crack"; scaled per event (sack > tackle > block > kick) |
| Crowd | Band-passed white noise — hiss | Pink noise through three vowel-like formants, swell-and-settle envelope, random variation |
| Horn | Raw saw chord | Detuned saws, opening low-pass, vibrato, then crowd roar |
| Overlap | Tackle fired hit + whistle on the same frame; repeats could stack | Whistle follows the hit by 260 ms (speed-scaled); per-cue rate gates |
| Missing | Blocks/kicks silent; Save silent | Pancake and kick thumps; soft confirm chime on Save |

## V2 roadmap

Priority / complexity in brackets. ✅ = shipped in this pass.

**Phase 1 — Visual foundation**
- ✅ Gridiron token layer on Zuno tokens: 3 surface depths + top light + elevation, team color as sole accent, broadcast yellow reserved for game day [Critical / M]
- ✅ Type scale: Graduate display for titles only, uppercase micro labels for headers/eyebrows, tabular figures [High / S]
- ✅ Shared empty-state, spinner, focus ring, press feedback [High / S]

**Phase 2 — Page-by-page**
- ✅ All items in the table above [Critical–Medium / M]
- Next: depth chart drag preview and drop indicator [Medium / M]; trade builder value meter visual (balance bar) [Medium / M]; bracket connectors in Standings playoffs [Low / M]; mobile game-day controls collapsed into one menu [High / M]

**Phase 3 — Motion**
- ✅ Screen/header entrances (≤320 ms, out-expo), staggered panels/cards, nav indicator grow, bar fills, card hover lifts, press scale [High / S]
- ✅ `prefers-reduced-motion` collapses all Gridiron animation [Critical / S]
- Next: animated score ticks on the bug, first-down line flash [Medium / M]

**Phase 4 — Sound**
- ✅ Everything in the sound table [Critical / M]
- Next: optional low ambient stadium bed during live games, ducked under cues [Low / M]

**Phase 5 — Functional polish**
- ✅ Two-step delete, mobile overflow, mobile nav reachability, stat-leaders empty state [Critical / S]
- Next: keyboard shortcuts for play calls (1–9) [Medium / S]; focus return to the triggering row when the player card closes [Medium / S]

**Phase 6 — QA**
- ✅ Before/after screenshot tour at desktop and phone, no console errors, `tsc` clean, 258 unit tests pass
- Next: real-device audio check on iOS Safari
