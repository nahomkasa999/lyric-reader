// Custom text selection via the CSS Custom Highlight API (v4.1).
//
// The reader NEVER creates a native Selection. Native selection is what
// summons Android Chrome's selection toolbar (Define / Copy / Select all /
// Web search) over our UI — his screenshot showed exactly that bar. By
// painting our own range with `CSS.highlights` and `::highlight()`, the
// phone shows only our Meaning / Copy pill. No native handles, no Google
// bar. Nothing in this file logs or networks; it is pure DOM.

const WORD_CH = /[A-Za-z0-9'’\-]/;

export function highlightsSupported(): boolean {
  try {
    return (
      typeof CSS !== "undefined" &&
      !!CSS.highlights &&
      typeof window.Highlight !== "undefined"
    );
  } catch {
    return false;
  }
}

/** Caret range at a viewport point, or null. */
export function caretRangeAt(x: number, y: number): Range | null {
  const d = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => {
      offsetNode: Node;
      offset: number;
    } | null;
  };
  try {
    if (typeof d.caretRangeFromPoint === "function")
      return d.caretRangeFromPoint(x, y);
    if (typeof d.caretPositionFromPoint === "function") {
      const p = d.caretPositionFromPoint(x, y);
      if (!p) return null;
      const r = document.createRange();
      r.setStart(p.offsetNode, p.offset);
      r.collapse(true);
      return r;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function textNodeAt(
  container: Node,
  offset: number,
): { node: Node; offset: number } | null {
  if (container.nodeType === Node.TEXT_NODE)
    return { node: container, offset };
  const el = container as Element;
  const child =
    el.childNodes[Math.min(offset, Math.max(0, el.childNodes.length - 1))];
  if (child && child.nodeType === Node.TEXT_NODE)
    return { node: child, offset: 0 };
  return null;
}

/**
 * Expand a caret range to the full word boundary inside its text node.
 * Null when the point isn't on a word. `scope` scopes the hit to the
 * current sentence (we never select across sentences).
 */
export function wordRangeAt(
  x: number,
  y: number,
  scope: Element,
): Range | null {
  const caret = caretRangeAt(x, y);
  if (!caret) return null;
  const hit = textNodeAt(caret.startContainer, caret.startOffset);
  if (!hit || !scope.contains(hit.node)) return null;
  const text = hit.node.textContent ?? "";
  const o = Math.min(hit.offset, text.length);
  let s = o;
  let e = o;
  while (s > 0 && WORD_CH.test(text[s - 1])) s--;
  while (e < text.length && WORD_CH.test(text[e])) e++;
  if (s === e) return null;
  const r = document.createRange();
  r.setStart(hit.node, s);
  r.setEnd(hit.node, e);
  return r;
}

/** Which of two collapsed points comes first in the document. */
function pointOrder(
  a: { node: Node; offset: number },
  b: { node: Node; offset: number },
): number {
  try {
    const ra = document.createRange();
    ra.setStart(a.node, a.offset);
    ra.collapse(true);
    const rb = document.createRange();
    rb.setStart(b.node, b.offset);
    rb.collapse(true);
    return ra.compareBoundaryPoints(Range.START_TO_START, rb);
  } catch {
    return 0;
  }
}

/**
 * Extend a selection from a fixed anchor to the word boundary at (x, y).
 * Used while the finger drags: anchor stays, the loose end follows.
 */
export function extendSelection(
  anchor: { node: Node; offset: number },
  x: number,
  y: number,
  scope: Element,
): Range | null {
  const caret = caretRangeAt(x, y);
  if (!caret) return null;
  const hit = textNodeAt(caret.startContainer, caret.startOffset);
  if (!hit || !scope.contains(hit.node)) return null;
  const text = hit.node.textContent ?? "";
  const o = Math.min(hit.offset, text.length);
  const forward = pointOrder(hit, anchor) >= 0;
  let e = o;
  if (forward) {
    while (e < text.length && WORD_CH.test(text[e])) e++;
  } else {
    while (e > 0 && WORD_CH.test(text[e - 1])) e--;
  }
  const r = document.createRange();
  if (forward) {
    r.setStart(anchor.node, anchor.offset);
    r.setEnd(hit.node, e);
  } else {
    r.setStart(hit.node, e);
    r.setEnd(anchor.node, anchor.offset);
  }
  return r;
}

/** Paint (or clear) our custom selection. Returns whether it painted. */
export function paintSelection(range: Range | null): boolean {
  try {
    const HL = CSS.highlights;
    const H = window.Highlight;
    if (!HL || !H) return false;
    HL.delete("lr-sel");
    if (range) HL.set("lr-sel", new H(range));
    return true;
  } catch {
    return false;
  }
}

/** Whether our custom selection is currently painted. */
export function selectionPainted(): boolean {
  try {
    return !!CSS.highlights?.has("lr-sel");
  } catch {
    return false;
  }
}

/** Text of the painted selection (for tests). */
export function paintedText(): string | null {
  try {
    const v = CSS.highlights?.get("lr-sel");
    if (!v) return null;
    let out: string | null = null;
    v.forEach((r) => {
      if (out === null) out = r.toString();
    });
    return out;
  } catch {
    return null;
  }
}
