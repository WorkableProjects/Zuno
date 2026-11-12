# Headbands 1.1: Habit to Wear

On desktop, the Headbands UI should scale horizontally rather than vertically. At launch, ask whether the user is on mobile or desktop so the layout can adapt properly.

For Jeopardy 1.1 and Headbands 1.1, identify the improvements that would benefit both apps right now.

Music: For both apps, replace the root public folder with audio files stored in ~/public/music. Use them as very subtle hover sounds and include a mute toggle.

## Headbands 1.1

### Responsive layout and launch setup
- At launch, let the user choose Mobile or Desktop, then adapt the layout to that choice. Keep the choice easy to change later.
- On desktop, use available horizontal space: arrange the primary activity and supporting information side by side where appropriate, rather than stretching the experience vertically. On mobile, use a compact, vertically flowing layout that remains usable on a narrow screen.
- Preserve the existing Headbands experience and functionality while making layout changes; controls and content must remain readable and accessible at both sizes.

### Independent animated backgrounds
- Animate the background continuously and independently of pointer movement. Mouse movement must not drive, trigger, or be required for the animation; it must continue when the pointer is still or absent.
- Add a separate, moving lighter-gray layer behind the animated background. Give it a restrained glitter/particle treatment inspired by the subtle shimmer of a PS5 dashboard, at approximately 10% visibility. Keep the effect decorative and low-contrast so it does not compete with content.
- Keep the background and glitter layer behind all interactive content, and ensure the effect does not intercept pointer or keyboard input.

## Jeopardy 1.1

### Independent animated backgrounds
- Animate the background continuously and independently of pointer movement. Mouse movement must not drive, trigger, or be required for the animation; it must continue when the pointer is still or absent.
- Add a separate, moving lighter-gray layer behind the animated background. Give it a restrained glitter/particle treatment inspired by the subtle shimmer of a PS5 dashboard, at approximately 10% visibility. Keep the effect decorative and low-contrast so it does not compete with the board, clues, or controls.
- Keep the background and glitter layer behind all interactive content, and ensure the effect does not intercept pointer or keyboard input.

## Improvements shared by both apps

- Use a consistent visual language for animation, spacing, typography, and interaction feedback while keeping each app's distinct purpose and layout.
- Ensure text and controls remain legible above the animated layers; avoid motion or sound that distracts from gameplay or habit tracking.
- Honor reduced-motion preferences by minimizing or disabling decorative animation, and keep the experience functional when animations are unavailable.
- Make hover feedback subtle and do not make hover-only behavior necessary to understand or use either app.

## Music and sound

- Store the sound files in the repository-root `public/music` directory and reference them from both apps. This is the intended project path for the audio assets (rather than a home-directory path).
- Use the audio only for very subtle hover feedback. Do not play sounds continuously or unexpectedly.
- Provide a clearly accessible mute toggle in each app. Muting must immediately stop or suppress hover sounds and remain in effect as the user navigates the app.
- Keep the apps fully usable without audio, including when a sound file is unavailable.
