# Lyric Reader — Layout (from Nahom's mockup, Oct 18, 2026)

Source image: `~/workspace/user/files/1000004457_0_rehl.jpg` — phone mockup he sent as the rough layout. This file translates it into build rules. His words + this image are the source of truth.

## What the mockup shows

- **Full-screen, pure black background** (#000), no chrome, no visible UI controls on the reading screen. Edge-to-edge text with generous side margins (~12% of width each side).
- **Top zone — previous text:** the already-read sentences of the current page, rendered together as a small muted paragraph block, anchored to the top under the status area. Dark grey (~25–30% white), regular weight, small size (~15–16px at phone width), left-aligned. Slightly transparent/faded feel, readable if you glance up, never competing.
- **Middle zone — current sentence:** ONE sentence, huge and bold (semibold, ~40px at phone width, tight leading ~1.15), pure white, left-aligned, vertically centred slightly below middle. This is the only thing that feels "loud". Long sentences shrink to fit rather than overflow.
- **Bottom zone — next text:** the upcoming sentences of the current page, same small muted style as the top block, anchored near the bottom above the home indicator. You can sense what's coming without it pulling focus.
- Between zones: **lots of empty black space.** The emptiness is the design — nothing else on screen. No progress bar, buttons, or page numbers visible in the mockup (any controls must be hidden until tapped, or kept to the library screen — builder decision, logged in DECISIONS.md).

## Carried over from his verbal spec (still binding)

- Scroll = one sentence per gesture (swipe/wheel/tap/keys); passed sentences accumulate in the top muted block for the current page.
- Page end: accumulated top block clears, next page starts fresh; scroll back restores the previous page's block.
- Bullets: thin hairline connector linking a bullet back to its parent point, indentation by nesting level (inside the sentence flow when the current sentence is a bullet, and in the muted blocks as compact markers).
- Upload flow + library sit outside the reading screen (not in the mockup): keep them equally minimal/black.

## Feel notes for the builder

- Spotify-lyrics energy: when the sentence advances, the new current sentence should glide/scale into focus and the old one settle up into the muted block — smooth ~300ms motion, never a hard cut or a jump that loses the eye.
- Muted means muted: if the top/bottom blocks draw the eye in screenshots, they're too bright.
