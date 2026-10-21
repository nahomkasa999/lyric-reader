// Structure parsing: plain text -> Blocks (heading / para / bullet + level).
// Used for TXT and paste input; PDF reuses it per extracted page.

import type { Block } from "./types";

const BULLET_RE = /^(\s*)([-*•–—]|\d+[.)]|[a-zA-Z][.)])\s+(.*)$/;
const MD_HEADING_RE = /^(#{1,6})\s+(.*)$/;

export interface ParseOptions {
  /**
   * 0-based line indices that are known headings. A PDF has no blank lines
   * to spot a title by, so the reader tells the parser which lines were
   * set in a bigger type — they become real headings.
   */
  headingLines?: number[];
  /** the font size of each line, aligned with the lines of the text */
  sizes?: number[];
}

/**
 * Heuristic heading detection for a lone short line surrounded by blank
 * lines (e.g. chapter titles in plain text). Conservative: short, no
 * terminal punctuation, Title-ish or ALL CAPS.
 */
function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 70) return false;
  // The Ethiopic marks count as terminal punctuation too: an Amharic
  // title usually ends with ።, and must not be read as a heading
  // because of it.
  if (/[.?!…:፡።፧]$/.test(t)) return false;
  if (/^[A-Z][^a-z]*$/.test(t) && t.length > 3) return true; // ALL CAPS
  const words = t.split(/\s+/);
  if (words.length <= 8 && words.length >= 1) {
    const capped = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
    if (capped / words.length >= 0.6) return true;
  }
  return false;
}

export function parseTextBlocks(
  text: string,
  opts: ParseOptions = {},
): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const known = opts.headingLines?.length
    ? new Set(opts.headingLines)
    : null;

  const flushPara = () => {
    const t = para.join(" ").replace(/\s+/g, " ").trim();
    para = [];
    if (t) blocks.push({ kind: "para", level: 0, text: t });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flushPara();
      continue;
    }
    const md = line.match(MD_HEADING_RE);
    if (md) {
      flushPara();
      blocks.push({ kind: "heading", level: md[1].length, text: md[2].trim() });
      continue;
    }
    // A line the caller knows is a heading (a PDF's bigger type) — it
    // stands alone, not glued into the paragraph around it.
    if (known?.has(i)) {
      flushPara();
      blocks.push({
        kind: "heading",
        level: 2,
        text: line.trim(),
        size: opts.sizes?.[i],
      });
      continue;
    }
    const b = line.match(BULLET_RE);
    if (b) {
      flushPara();
      const indent = b[1].replace(/\t/g, "    ").length;
      blocks.push({
        kind: "bullet",
        level: Math.min(4, Math.floor(indent / 2)),
        text: b[3].trim(),
      });
      continue;
    }
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i === lines.length - 1 || !lines[i + 1].trim();
    if (prevBlank && nextBlank && looksLikeHeading(line)) {
      flushPara();
      blocks.push({ kind: "heading", level: 2, text: line.trim() });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}
