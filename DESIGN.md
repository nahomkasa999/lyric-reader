---
name: Lyric Reader Dark Glass
colors:
  primary: "#5B4FE9"
  background: "#000000"
  surface: "#0A0A0B"
  foreground: "#F2F2F2"
  muted: "#B8B8B8"
  glow: "#A6E22E"
  destructive: "#E5484D"
typography:
  headline:
    fontFamily: Geist
    fontSize: 28px
  body:
    fontFamily: Geist
    fontSize: 15px
rounded:
  sm: 10px
  md: 14px
  lg: 20px
  full: 999px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
---

# Lyric Reader — Dark Glass (simple)

## Overview

Dark-only reading app. Pure black, one slowly-shifting ambient glow,
frosted glass on navigation and settings only. Reading itself stays
plain — no glass, no cards over the sentence.

Skills this file follows:
- Emil Kowalski `emil-design-eng` (github.com/emilkowalski/skills) — motion rules below
- Google DESIGN.md spec — this file's format, lint with `npx @google/design.md lint DESIGN.md`
- shadcn/ui theming — OKLCH CSS variables, Tailwind v4 (the app already uses both)
- One free MotionSites design as the visual reference: **Design World**
  (free on motionsites.org) — white on pure black, one glass element,
  huge headline. We copy that language, not its 3D cube (too heavy for a phone reader).

## Colors

- Background #000000 — the canvas, everywhere.
- Primary indigo #5B4FE9 — buttons, progress, active states. It acts.
- Glow — the ambient background glow (Nahom's screenshot: soft green rising
  from the bottom, fading to black by half the screen). Alternate mode slowly
  cycles rainbow hues (green is the starting colour); One-colour mode holds a
  single user-picked hue. It never acts.
- Glass — white 6% fill, white 12% 1px border, blur 18px. See Elevation.
- Foreground #F2F2F2, muted #B8B8B8 (metadata only).

Background presets: Green, Indigo, Teal, Amber, Pink, Purple — one hue each.
Solid mode: user colour fills the whole screen. Off: pure black.

## Typography

Geist for UI. Headline 28/600, body 15, small 13, section labels 11 uppercase.
Reading text keeps the user's own font/size settings — untouched by this file.

## Layout

Home, in this order (this is the whole user flow):
1. Glass top bar — title left, Settings/Saved as glass pills right
2. Continue Reading — one glass card, glow behind it, progress inside, tap = resume
3. Add Book button — opens a sheet with two tabs: File / Paste (paste form leaves Home)
4. Your Library — simple glass-lite rows with progress
5. Glass bottom nav — Home / Words / Saved / Settings

Settings, in groups: Background → Reading → Ambience → Read Aloud → Quiz → AI → Reset.
Sticky glass preview at the top that shows the background + a sentence, live.

Reader: unchanged layout. Ambient background sits behind the text.

## Elevation & Depth

One glass recipe, used for header, hero, bottom nav, sheets, settings groups:

```css
background: rgba(255,255,255,0.06);
backdrop-filter: blur(18px) saturate(140%);
border: 1px solid rgba(255,255,255,0.12);
box-shadow: 0 8px 32px rgba(0,0,0,0.36);
```

Max 3 blurred surfaces on screen at once (Android performance).
Book rows: same fill + border, no blur.

Ambient background: one blurred glow div behind everything, `pointer-events: none`.
Gradient glow = hue slowly cycles green → teal → blue → indigo → purple → pink → amber → back
(full cycle 3–5 minutes, blending between neighbours, so slow it's barely noticed changing),
plus gentle position drift; transform/opacity only.
One colour = the glow holds the user's picked hue; only its position drifts gently.
Motion switch off = the glow freezes completely (Alternate pauses on its current colour).
Solid = the picked colour fills the whole screen, flat. Off = pure black.

## Shapes

Cards 20px, sheets 28px top, buttons 14px, pills/chips/nav full round.
Icon buttons 40×40 glass pills.

## Components

- Button primary: indigo fill, white text, `scale(0.97)` on press.
- Chip: glass pill; active = brighter fill + white outline.
- Switch: for every on/off setting (Background motion, Quiz, Read Aloud). Chips are for choices only.
- Slider: indigo accent.
- Colour row: round swatches + one custom colour input.
- Background group (Settings, first): Style [Gradient glow | Solid | Off],
  Colour [Alternate | One colour], swatches (Green, Indigo, Teal, Amber, Pink, Purple)
  + custom colour picker, Motion switch (default on), intensity slider 0–100 (default 60).
  Fields: `bgStyle` (gradient|solid|off), `bgColourMode` (alternate|single), `bgColor`,
  `bgMotion` (default on), `bgIntensity` (default 60).
  Defaults: gradient / alternate / green / on / 60.
- Sheets: slide up, 240ms, `cubic-bezier(0.32, 0.72, 0, 1)`.

## Motion

Emil Kowalski's rules, kept simple:
- Animate only occasional things (sheets, hero entrance). Never animate frequent actions.
- Everything under 300ms, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`. Never ease-in.
- Enter from `scale(0.95)` + opacity, never `scale(0)`.
- Buttons `scale(0.97)` on `:active`.
- Use transitions, not keyframes, for anything interruptible.
- `prefers-reduced-motion` → no entrances, background motion forced off.

## Do's and Don'ts

- Do keep all existing `data-testid`s when restyling.
- Do check text stays readable over the glow (4.5:1).
- Don't put glass or blur on the reading stage.
- Don't add a second action colour. Indigo acts; the ambient glow never acts.
- Don't copy MotionSites code or paid prompts — free Design World language only.
