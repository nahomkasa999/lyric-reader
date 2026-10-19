# Reference UI — digest of Nahom's zip (Oct 19, 2026)

Source: `~/workspace/user/files/lyric-reader-site_1_cnpt.zip` — a built single-file
site he was working on. Full CSS: `reference-css.txt`; full body markup:
`reference-body.html`; original files in `extracted/` (index.html has the JS).

**His instruction:** adopt this UI/UX into OUR app (our extraction + state logic
stays — he rates it superior), with the 4 fixes listed at the bottom.

## What the reference UI is

**Home:** `Lyric Reader` headline (28px, tight tracking), sub "Read one sentence
at a time. Everything stays on your phone.", primary indigo CTA button
"Start reading a book" (12px radius, 14px padding), paste textarea (card bg,
12px radius), alt button "Read pasted text", library = full-width card rows
(book title 500 weight + muted small meta, delete × on the right).

**Reader chrome:**
- Top bar `#bar`: muted 14px row — `← Library` left, `#pg` page button centre
  ("Go to page"), `A−` / `A+` right. Buttons get accent bg on :active.
- Progress: hairline bar under the top bar, indigo fill.
- Stage `#stage`: full-height, `mask-image` vertical gradient (transparent →
  black 12% → 88% → transparent) so sentences fade at top/bottom edges.
  `#track` translates with `transform .35s cubic-bezier(.2,.8,.2,1)`.
- Sentences `.s`: default = upcoming style (fs2 13px, dim colour, weight 500,
  big bottom margin ~18vh), `.past` = trail colour, `.cur` = fs 30px, weight
  600, line-height 1.22, main colour. Headings `.h`: uppercase, primary colour,
  letterspaced, small (0.8×fs2), current heading 0.6×fs in primary. Bullets
  `.li`: 1px left border in trail colour + 12px padding (the hairline).
  Word spans `.pt` exist for highlight (`background: color-mix(hl 42%)`,
  radius 4) and bookmark (primary dot after the word).
- Bottom bar `#foot`: « ‹ › » (prev chapter, prev page, next page, next chapter).
- Jump sheet `#jump`: blurred dark backdrop, centred card `.sheet.big`
  (radius 24, border, deep shadow) with title, a range slider, preview text,
  "Go to page" primary button, chapter list.
- Action pop `#pop` → `.menu`: a column of SEPARATE floating buttons
  (each its own card: icon 22px stroke SVG + label, radius 16, shadow),
  positioned at the tap point: Highlight, Bookmark, Copy. Active state =
  primary bg (highlight active = highlight colour bg, black text).

**Settings (in a `<details>` on Home in the ref — becomes a PAGE, see fix 4):**
rows with 13px muted labels: Font chips (pill buttons, selected = 2px primary
outline), Main sentence size slider 18–48, Top and bottom size slider 9–24,
Highlight colour chips (34px colour squares), Main text colour (color input +
"Default" reset + opacity slider 20–100), Top/bottom text colour (+ opacity
10–100), Reset settings button, and a live preview card `#prev` (muted line /
current line / muted line in the chosen font).

## Tokens (dark)

bg oklch(0 0 0) · fg .946 · card .145 · border .26 · primary oklch(.46 .22 266)
· muted .72 · trail .42 · dim .27 · accent .32 · highlight oklch(.62 .2 266).
Same family as his design-system.css (which stays our base).

## The 4 fixes (his words, translated)

1. **Type the page, don't scroll it.** The page button shows `10 / 20`; tapping
   opens the jump sheet where the hero control is a numeric INPUT to type the
   page into (with "of N" and a Go button, Enter works, invalid clamps). The
   range slider goes away. Chapter list stays.
2. **Popup = ONE card + staggered micro-animation.** Highlight / Bookmark /
   Copy live inside a single card surface; when it opens, rows appear one
   after another (small fade + rise, staggered ~50ms). Not separate floaters.
3. **Bottom « ‹ › » bar hides itself.** Hidden by default; appears on hover
   near the bottom (desktop), on tap near the bottom edge (touch), briefly on
   page change; auto-hides after a couple of seconds. Find a good UI for it.
4. **Settings icon → settings PAGE.** A gear icon opens a dedicated settings
   screen where everything is edited — no settings panels on the reader or
   layout pages.
