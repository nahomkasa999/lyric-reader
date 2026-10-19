# Reference reader mechanics — read from Nahom's code (Oct 19, 2026)

Extracted from the app script in his `index.html` (identical in the zip and the
re-attached file, md5 e67e3d19…). This is the "main study part" he says v2
missed. **These mechanics are the spec for v3's reader.** His words: keep only
our extractor; ALL the UI is his.

## Item model + pagination

- Items: `{t: 'h'|'li'|'p', d: depth, s: sentence, g: paragraphStart?, p: page}`.
- `paginate()`: new page when an item is a heading OR the page already has
  **7 items**. PDFs keep their real pages (`paged: true`, page per PDF page).

## Long sentences split into parts — `splitS(s)`

- If `s.length <= 130` → one part.
- Else split into `k = ceil(len/120)` parts at clause boundaries
  `[,;:—–)]` followed by space, choosing the candidate nearest the ideal cut
  (within 45% of chunk size), min part length 25 chars; fallback = nearest
  space to the ideal cut. Parts are rendered as `<span class="pt" data-p>`
  inside the sentence element and cached per item (WeakMap).

## Stepping is per PART — `go(n)`

- Forward: if current item has more parts, `P++`; else next item, `P=0`.
- Back: if `P>0`, `P--`; else previous item at its LAST part.
- In the current sentence, the current part is bright (`.pt.on` = main
  colour); its other parts (already read AND not yet read) sit in trail
  colour. Highlight per part: wash `color-mix(hl 42%)`; bookmark per part:
  primary dot after the part. Marks keyed `"itemIndex:partIndex"` in
  `book.hl` / `book.bm` arrays, saved with the book.

## Track rendering — `buildPage()` + `place()`

- The track DOM contains ONLY the current page's items (rebuilt on page
  change). Items are `.s` paragraphs with big bottom margin
  `max(2.6em, 18vh)`; bullets offset `margin-left: depth*18px` + hairline.
- Visibility window: `.far` (opacity 0) for items `< I-2` or `> I+1` — so at
  most 2 past + current + 1 next are visible.
- Classes: `.past` trail colour, `.cur` main size (fs, 600 weight); non-current
  items render at fs2 size. Headings `.h` uppercase/indigo/letterspaced.
- `place()`: `track.style.transform = translateY(stageH/2 − (itemTop +
  partOffset + targetH/2))` — centres the current item; **if the item has
  >1 part and is taller than 50% of the stage, it centres the current PART
  span instead.** Track transition: `transform .35s cubic-bezier(.2,.8,.2,1)`.
- Stage has the vertical mask fade (transparent → 12% → 88% → transparent).

## Input

- Wheel: one step per flick (200ms lock, |deltaY| ≥ 4).
- Keys: ↓/→/Space/PgDn forward, ↑/←/PgUp back; Esc closes pop.
- Touch: touchmove, one step per 30px swipe, `moved` flag eats the click.
- **Click (the part he flagged):** click an item ≠ current → if adjacent
  (|i−I| = 1) jump to it (forward = part 0, back = last part). Click a part
  of the current sentence ≠ current part → select that part. Click the
  current part again within 350ms — or any click on a single-part current
  sentence → **open the action pop**, anchored to the item (below it +16px,
  flipping above when near the bottom; right-aligned to the item, clamped).

## Chrome

- Page label format: `Page {cp} / {pages} · {pct}%`; progress = item-based.
- Footer: « prev chapter (prev heading item anywhere), ‹ prev page,
  › next page, » next chapter (next heading item).
- Settings model `S`: `{ff, fs:30, fs2:13, hl:idx, cm, cs, om:100, os:100}`
  in localStorage `lr-s`; fonts Geist/Serif/Mono/Lexend (font chip labels
  render in their own font); highlight palette = 5 oklch colours
  (.62 .2 266 / .85 .17 90 / .75 .18 150 / .68 .2 20 / .72 .19 330);
  colours applied via color-mix opacity vars `--cm/--ct/--cd`.

## Nahom's v3 corrections on top of this

- **No page popup at all.** The top bar shows `Page [ 3 ] / 20` — clicking
  the number turns it into an editable field right there in the bar; type,
  Enter/confirm, done. (His jump sheet + slider AND v2's jump sheet both go.)
- v2's other fixes STAY (they were his explicit asks, not retracted):
  one-card popup with staggered rows (but triggered/anchored HIS way,
  above), auto-hiding « ‹ › » bar, Settings as a page via gear icon.
