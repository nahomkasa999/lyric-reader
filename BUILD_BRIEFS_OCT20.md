# Build briefs — Oct 20, 2026 (keep it simple)

Read first: `DESIGN.md` (repo root). It is short on purpose.
Start from GitHub main (da02c98, 136/136) — local app/ is stale v4.6.

Skills to install in the Codespace (one line each):
- Design/motion: `npx skills add emilkowalski/skill` (emil-design-eng)
- Engineering discipline (Matt Pocock, optional): `npx skills@latest add mattpocock/skills -a opencode` — use only `tdd` + `implement`
- shadcn skill NOT needed: app already uses shadcn-style OKLCH tokens, no components.json.
- writing-prds (Lenny): later, only for the Quiz PRD.

Work in herdr, 3 panes, one job each. No two panes edit the same file.

## Pane 1 — Kilo: Background
New `AmbientBackground.tsx` + settings fields `bgStyle/bgColourMode/bgColor/bgMotion/bgIntensity`
(bgStyle: gradient|solid|off; bgColourMode: alternate|single; bgMotion bool, default on;
defaults: gradient / alternate / green / on / 60).
Gradient glow = screenshot: soft glow rising from the bottom, fading to black by ~55%,
hue slowly cycling green → teal → blue → indigo → purple → pink → amber → back
(full cycle 3–5 min, blending between neighbours, so slow it's barely noticed changing)
plus gentle position drift; transform/opacity only.
One colour = glow holds the user's picked hue (swatches + custom picker); position drifts only.
Motion switch off freezes the glow completely (Alternate pauses on its current colour).
Solid = picked colour fills the whole screen, flat. Off = pure black.
Render in Reader + Home, behind text. Tests for settings load/persist.

## Pane 2 — opencode: Home + navigation
Restyle Library per DESIGN.md flow: glass header, Continue Reading glass
hero, Add Book sheet (File/Paste tabs, paste form off Home), glass-lite
book rows, glass bottom nav (Home/Words/Saved/Settings) for non-reader views.
Keep every data-testid. Reader behaviour untouched.

## Pane 3 — Kilo (after Pane 1): Settings
Grouped glass sections: Background (new, first) → Reading → Ambience →
Read Aloud → Quiz → AI → Reset. Sticky glass preview incl. background.
On/off = switches. Choices = chips/swatches.

## Later panes (after the above push)
- YouTube ambience: paste link → IFrame player in a sheet. Simulated
  beat-sync only (real analysis blocked by iframe CORS — say so in UI).
- Read aloud: speechSynthesis MVP, then Kokoro on-device premium.
- Quiz: toggle in Settings, pre-generate every 5 pages/chapter via
  lib/ai.ts, cache in IndexedDB, gate card Start/Later.

## Push rule
Lint + typecheck + unit tests green → push to main → Vercel deploys →
screenshots of Home, Settings, Reader to Nahom. No keys in code.
