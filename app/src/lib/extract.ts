// Extraction pipeline: file bytes -> BookDoc. Fully client-side.
// (Untouched in v3 except the model: blocks now flatten into the item
// stream and take the user's page rule — headings or 7 items per page.)
import JSZip from "jszip";
import { pdfjsLib } from "./pdfWorker";
import type { Block, BookDoc, Item } from "./types";
import { flattenBlocks, nextId, paginateBlocks } from "./types";
import { splitSentences } from "./segment";
import { parseTextBlocks } from "./structure";
import { transcribeMedia } from "./transcribe";

export type Source = "upload" | "paste" | "sample" | "media";

function makeBook(title: string, items: Item[], source: Source): BookDoc {
  return {
    id: nextId("book"),
    title: title || "Untitled",
    items,
    totalSentences: items.length,
    createdAt: Date.now(),
    source,
  };
}

export async function extractTxt(
  text: string,
  title: string,
  source: Source = "upload",
): Promise<BookDoc> {
  const blocks = parseTextBlocks(text);
  return makeBook(title, paginateBlocks(blocks, splitSentences), source);
}

/* ---------------- PDF ---------------- */

interface TextItem {
  str: string;
  x: number;
  y: number;
  /** the font height — how big this run of text is set */
  size: number;
}

/** One line of a PDF page, with the type size it is set in. */
interface PdfLine {
  text: string;
  size: number;
}

/**
 * A line is a heading when its type is clearly bigger than the body
 * text. 1.12 catches a chapter title set one point above the text
 * without firing on a stray italic or a footnote marker.
 */
const HEADING_RATIO = 1.12;
/** A heading is a title, not a sentence. */
const HEADING_MAX_CHARS = 120;

/** Font sizes are compared in half-points, so near-equal sizes match. */
function roundSize(s: number): number {
  return Math.round(s * 2) / 2;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The heading levels by size: the biggest type is level 1, then 2, 3. */
function levelsBySize(sizes: number[]): Map<number, number> {
  const distinct = [...new Set(sizes.map(roundSize))].sort((a, b) => b - a);
  const map = new Map<number, number>();
  distinct.forEach((s, i) => map.set(s, Math.min(3, i + 1)));
  return map;
}

/** Rebuild reading-order lines from a PDF page's text items. */
async function pageLines(page: any): Promise<PdfLine[]> {
  const tc = await page.getTextContent();
  const items: TextItem[] = [];
  for (const it of tc.items as any[]) {
    if (!("str" in it) || !it.str.trim()) continue;
    const t = it.transform as number[];
    const height = typeof it.height === "number" ? it.height : 0;
    items.push({
      str: it.str,
      x: t[4],
      y: t[5],
      size: height > 0 ? height : Math.abs(t[3] ?? 0),
    });
  }
  // Group into lines by y (tolerance), then order lines top->bottom,
  // items left->right.
  const TOL = 2.5;
  const lines: TextItem[][] = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l[0].y - it.y) <= TOL);
    if (line) line.push(it);
    else lines.push([it]);
  }
  lines.sort((a, b) => b[0].y - a[0].y);
  return lines
    .map((l) => ({
      text: l
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
      size: l.reduce((m, i) => Math.max(m, i.size), 0),
    }))
    .filter((l) => l.text);
}

export async function extractPdf(
  data: ArrayBuffer,
  title: string,
): Promise<BookDoc> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  // Every page is read first: the size of the body text is only known
  // once the whole book has been seen, and the headings are ranked
  // against it. The lines are kept per page, not joined, so the text
  // that becomes a heading can still be found in it.
  const pages: PdfLine[][] = [];
  const allSizes: number[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const lines = await pageLines(page);
    pages.push(lines);
    for (const l of lines) allSizes.push(l.size);
    page.cleanup();
  }
  // pdf.destroy() exists at runtime in pdfjs-dist v4/v5; the bundled
  // types omit it, so call it defensively.
  await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});

  // The body text: the size most of the book is set in.
  const body = median(allSizes);
  // The headings, ranked: the biggest type is the book's top level.
  const levels = levelsBySize(
    allSizes.filter((s) => s >= body * HEADING_RATIO),
  );

  const items: Item[] = [];
  pages.forEach((lines, n) => {
    const headingLines: number[] = [];
    lines.forEach((l, i) => {
      if (l.size < body * HEADING_RATIO) return;
      if (!l.text.trim() || l.text.length > HEADING_MAX_CHARS) return;
      headingLines.push(i);
    });
    const blocks = parseTextBlocks(
      lines.map((l) => l.text).join("\n"),
      { headingLines, sizes: lines.map((l) => l.size) },
    );
    for (const b of blocks) {
      if (b.kind === "heading" && typeof b.size === "number") {
        b.level = levels.get(roundSize(b.size)) ?? 2;
      }
    }
    // One reader page per PDF page (the user's rule keeps real pages).
    const drafts = flattenBlocks(blocks, splitSentences);
    for (const d of drafts) items.push({ ...d, page: n });
  });
  return makeBook(title, items, "upload");
}

/* ---------------- EPUB ---------------- */

function epubTextOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function walkEpubBody(body: Element, depth: number, out: Block[]) {
  for (const node of Array.from(body.children)) {
    const tag = node.tagName.toLowerCase();
    if (tag === "script" || tag === "style") continue;
    const h = tag.match(/^h([1-6])$/);
    if (h) {
      const t = epubTextOf(node);
      if (t) out.push({ kind: "heading", level: Number(h[1]), text: t });
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      walkEpubBody(node, depth, out);
      continue;
    }
    if (tag === "li") {
      // Own text (excluding nested lists)
      const clone = node.cloneNode(true) as Element;
      for (const nl of Array.from(clone.querySelectorAll("ul,ol"))) nl.remove();
      const t = epubTextOf(clone);
      if (t) out.push({ kind: "bullet", level: Math.min(4, depth), text: t });
      for (const nl of Array.from(node.children)) {
        const nt = nl.tagName.toLowerCase();
        if (nt === "ul" || nt === "ol") walkEpubBody(nl, depth + 1, out);
      }
      continue;
    }
    if (tag === "p" || tag === "div" || tag === "blockquote" || tag === "section" || tag === "article") {
      const hasBlock = Array.from(node.children).some((c) =>
        /^(p|div|ul|ol|h[1-6]|blockquote|section|article)$/i.test(c.tagName),
      );
      if (hasBlock) {
        walkEpubBody(node, depth, out);
      } else {
        const t = epubTextOf(node);
        if (t) out.push({ kind: "para", level: 0, text: t });
      }
      continue;
    }
    // Inline or unknown: recurse
    walkEpubBody(node, depth, out);
  }
}

export async function extractEpub(
  data: ArrayBuffer,
  fallbackTitle: string,
): Promise<BookDoc> {
  const zip = await JSZip.loadAsync(data);
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("Not a valid EPUB (no container.xml)");
  const containerXml = await containerFile.async("text");
  const cdoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const rootfile = cdoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!rootfile) throw new Error("Not a valid EPUB (no rootfile)");
  const opfPath = rootfile;
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error("Not a valid EPUB (missing OPF)");
  const opf = new DOMParser().parseFromString(await opfFile.async("text"), "application/xml");

  let title = fallbackTitle;
  // getElementsByTagNameNS("*", ...) is unreliable in some DOM parsers
  // (happy-dom), so try the prefixed name first, then the NS query.
  const dcTitle =
    opf.getElementsByTagName("dc:title")[0]?.textContent?.trim() ||
    (() => {
      try {
        return (
          opf
            .getElementsByTagNameNS("*", "title")[0]
            ?.textContent?.trim() ?? ""
        );
      } catch {
        return "";
      }
    })();
  if (dcTitle) title = dcTitle;

  const manifest = new Map<string, string>();
  for (const item of Array.from(opf.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, decodeURIComponent(href));
  }
  const spine: string[] = [];
  for (const ref of Array.from(opf.getElementsByTagName("itemref"))) {
    const idref = ref.getAttribute("idref");
    const href = idref ? manifest.get(idref) : undefined;
    if (href) spine.push(opfDir + href);
  }

  const blocks: Block[] = [];
  for (const path of spine) {
    const f = zip.file(path.split("?")[0]);
    if (!f) continue;
    const html = await f.async("text");
    const doc = new DOMParser().parseFromString(html, "application/xhtml+xml");
    const body = doc.querySelector("body");
    if (body) walkEpubBody(body, 0, blocks);
  }
  return makeBook(title, paginateBlocks(blocks, splitSentences), "upload");
}

export async function extractFile(file: File): Promise<BookDoc> {
  const name = file.name.replace(/\.[^.]+$/, "") || "Untitled";
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return extractPdf(await file.arrayBuffer(), name);
  }
  if (lower.endsWith(".epub")) {
    return extractEpub(await file.arrayBuffer(), name);
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return extractTxt(await file.text(), name, "upload");
  }
  throw new Error(`Unsupported file type: ${file.name} (PDF, EPUB, TXT only)`);
}

/**
 * A video or an audio file (v4.12): the speech becomes text, and the
 * text becomes a book — read like any other, and searchable by the
 * assistant like any other.
 */
export async function extractMedia(
  file: File,
  key: string,
): Promise<BookDoc> {
  const name = file.name.replace(/\.[^.]+$/, "") || "Untitled";
  const text = await transcribeMedia(file, key);
  return extractTxt(text, name, "media");
}
