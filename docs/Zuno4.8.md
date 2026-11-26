# Zuno 4.8
- Fix multi-button (soundboard/volume) when a different siedbar is applied (e.g., the button is flowing up when set to the TOP SIDEBAR position)
- Create a Lofi-based music prompt for a Menu Music (then tell what the file is supposed to be named before Merge)
- Research and create a plan for an 1-Player Football Manager Game -- how it will be created and implmeneted into zUno -- able to see the games

## Status
- [x] Multi-button on the TOP sidebar: now anchored to the top and opens downward (`src/components/launcher/rail.css`).
- [x] Menu music: prompt in `docs/Zuno4.8-menu-music-prompt.md`. **Before merge, add the file as `public/music/Menu Lofi.mp3`.**
- [x] American football GM plan: `docs/Football Manager Plan.md`.
- [x] Library split into **Solo** and **Party** sections, with a Solo filter (`registry.ts` `players` field).
