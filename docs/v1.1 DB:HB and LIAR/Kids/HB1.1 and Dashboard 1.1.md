# Headbands 1.1: Habit to Wear

On desktop, the Headbands UI should scale horizontally rather than vertically. At launch, ask whether the user is on mobile or desktop so the layout can adapt properly.

For Jeopardy 1.1 and Headbands 1.1, identify the improvements that would benefit both apps right now.

Music: For both apps, replace the root public folder with audio files stored in ~/public/music. Use them as very subtle hover sounds and include a mute toggle.

## Headbands 1.1

### Responsive layout and launch setup
- At launch, ask the user whether they are on mobile or desktop. Store that preference and use it to determine the initial layout, while allowing the user to switch later if needed.
- On desktop, the Headbands interface should scale horizontally instead of vertically. Use the extra space to widen panels, cards, and content regions while preserving visual balance and readability.
- On mobile, keep the interface compact and vertical, with clear spacing and touch-friendly controls.
- Preserve the main habit-tracking functionality without compromising speed, clarity, or accessibility across device types.

### Shared app improvements for Headbands
- Audit both Headbands and Jeopardy for any cross-app improvements that would fit both experiences right now, including animation polish, sound behavior, layout consistency, and state feedback.
- Keep any shared changes lightweight and low-risk so they can be added without altering the core gameplay or habit loop.
- Ensure both apps benefit from improved visual polish, reduced friction, and consistent interaction patterns.

### Background animation requirements
- The background animation should run continuously and independently of mouse movement. It should not be tied to pointer position, pointer velocity, or pointer hover state.
- Even when the mouse moves, the background must continue animating on its own. Mouse movement should never be required to trigger or sustain the effect.
- Use a layered animated background system that keeps movement alive in the background while the UI remains stable and responsive.
- Add a subtle moving lighter-gray layer behind the animated background. It should behave like a restrained PS5 dashboard glitter effect, approximately 10% visible, low-contrast, and decorative rather than distracting.
- This glitter layer should be moving and independent from the pointer, and it should sit behind all main content without interfering with taps, clicks, or keyboard focus.
- Keep the animation behind all interactive content so it never blocks input or user actions.

### Sound and interaction polish
- Place audio files in the root `public/music` directory for both apps. The implementation should use those assets directly from the project root, not from a user home directory path.
- Use the music as extremely subtle hover sounds only; avoid loud or constant playback.
- Include a mute toggle in the app that can be toggled on or off at any time.
- Ensure the app remains fully usable when audio is muted or disabled.

## Jeopardy 1.1

### Shared app improvements for Jeopardy
- Identify and implement the improvements that would benefit both Jeopardy and Headbands right now, including extras that reduce friction, improve motion polish, and create a more consistent UI language.
- Keep the shared enhancements subtle and useful rather than decorative-only; they should support clarity, interaction quality, and theme consistency.
- Use the same sound and background treatment approach across both apps so the experiences feel cohesive while still preserving their own identity.

### Background animation requirements
- The Jeopardy background should animate continuously without any dependence on pointer movement.
- Mouse movement must not be required to start, amplify, or maintain the background motion. The background should remain active even when the pointer is still.
- Keep the animation independent of user input so the board and game area always feel alive without requiring hover-driven effects.
- Add a moving lighter-gray layer behind the background, similar to a subtle PS5 dashboard half-glitter effect. The layer should be approximately 10% visible and should gently drift or shimmer in the background.
- This subtle shimmering layer must remain behind the interactive game UI and never obstruct gameplay, pointer interactions, or accessibility focus states.

### Game UI and interaction polish
- The background and decorative layers must remain behind the visible board, clue area, and controls.
- Keep motion low-contrast and unintrusive so it does not distract from reading question text or interacting with the game.
- If the app supports accessibility preferences, reduce or disable non-essential motion when reduced-motion settings are enabled.

### Sound and interaction polish
- Store the audio assets in the root `public/music` directory and reference them from the app code.
- Use very subtle hover sounds only; do not create repetitive or intrusive sound effects.
- Add a visible mute toggle with clear state feedback and keep the toggle accessible during play.
- Ensure sound is optional and does not block the user from using the app when it is muted or unavailable.

## Improvements shared by both apps

- Reuse a consistent visual system across Jeopardy and Headbands for spacing, animation rhythm, hover feedback, and controls.
- Keep decorative motion subtle so it supports the layout without dominating the UI.
- Ensure all interfaces remain readable and usable with low-contrast or reduced-motion conditions.
- Avoid requiring hover or pointer persistence for essential interaction flow.
- Use the same general sound approach for both apps: very subtle auditory feedback, short and quiet, with a proper mute toggle.

## Music and file placement

- Place the sound files in the root directory `public/music` for both apps.
- Use those audio files for minimal hover feedback only.
- Include a mute toggle in each app and ensure it can be toggled immediately and reliably.
- Keep all implementations resilient if a file is missing or audio is unavailable.

## Final implementation note

The intent is to deliver a polished, modern dashboard-style background while keeping the interactive content clean, legible, and fully functional. Both apps should use a non-pointer-driven animated background with a subtle moving lighter-gray glitter layer behind it, plus very quiet hover sound effects and a clear mute control.

This keeps the visual sophistication high without sacrificing usability, game clarity, or habit-tracking focus.


















































