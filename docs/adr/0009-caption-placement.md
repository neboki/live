# 0009 — Captions where the user wants them: the page or the floating window

- **Status:** accepted
- **Date:** 2026-10-26
- **Related:** [0008](0008-video-sync.md) (video sync, which lives in the page)

## Context

The browser decided where the captions showed: in Chrome and Edge on a computer they always
went to the floating window (Document Picture-in-Picture), and the live page only said so,
beside a copy of the settings. The captions showed in the page only where no floating window
exists (phones), and then only for the microphone. There was no way to work inside the app
with everything in one tab (a second monitor, the picture in step with the captions, the
summary), nor to bring the captions back once the window was closed: the session went on
blind until the window was opened again.

The bar already knew both places (`popped`) and its header had Float and Back-to-page buttons
that nothing showed. A `FloatingBar` component that once did the moving, and held the keyboard
shortcuts, was no longer mounted anywhere, so the shortcuts had silently stopped working.

## Decision

1. **The placement is a preference.** `placement: 'page' | 'floating'` is remembered with the
   other bar preferences (`overlayPrefs`), floating by default. The start screen offers it next
   to what the session listens to; where the browser cannot float, the page is the only choice
   and the picker says so without touching the remembered value.
2. **One bar, two places, moved from the bar itself.** The floating window is opened at start
   only when the preference asks for it. The bar in the page offers _Float above other
   windows_ and the bar in the window _Back to the page_, beside Stop; both change the
   preference. Closing the window by hand brings the bar to the page for that session and
   leaves the preference alone. Where the bar is follows from whether the window is open
   (`inPage = !floating.isOpen`), never from the preference, so the captions always have a
   place.
3. **The live page is a place to work.** With the captions in the page the bar fills the
   column, with the synced picture above it when on; with them in the window, the page shows
   the last sentence, a _Bring to the page_ button and the settings panel. The page bar keeps
   its own settings menu, so the settings panel is only shown while the bar is out of reach.
4. **Shortcuts in one composable.** `useCaptionShortcuts` listens in the page and in the
   floating window: Ctrl+Shift+Space hides the bar wherever it is, Ctrl+Shift+E exports.
   `FloatingBar` is gone.

## Consequences

- ✅ The user chooses, before and during the session, and never loses the captions.
- ✅ Everything that worked keeps working as it was by default: the floating window opens at
  start in Chrome and Edge, phones keep the page.
- ✅ The keyboard shortcuts work again.
- ❌ Moving the bar remounts it: an open settings menu closes, and a size dragged in the page
  does not carry over to the window (which has its own remembered size).
- ❌ With a shared tab and the captions in the page, the user has to keep the app in view: the
  page says so and suggests a second monitor or the synced picture.
- A screen share cannot be listened to where the browser has no floating window: that limit is
  the browser's (no `getDisplayMedia` on phones), unchanged.
