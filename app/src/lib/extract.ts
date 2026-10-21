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
}

/** Rebuild reading-order lines from a PDF page's text items. */
async function pageLines(page: any): Promise<string[]> {
  const tc = await page.getTextContent();
  const items: TextItem[] = [];
  for (const it of tc.items as any[]) {
    if (!("str" in it) || !it.str.trim()) continue;
    const t = it.transform as number[];
    items.push({ str: it.str, x: t[4], y: t[5] });
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
    .map((l) =>
      l
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

export async function extractPdf(
  data: ArrayBuffer,
  title: string,
): Promise<BookDoc> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const items: Item[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const lines = await pageLines(page);
    const blocks = parseTextBlocks(lines.join("\n"));
    // One reader page per PDF page (the user's rule keeps real pages).
    const drafts = flattenBlocks(blocks, splitSentences);
    for (const d of drafts) items.push({ ...d, page: n - 1 });
    page.cleanup();
  }
  // pdf.destroy() exists at runtime in pdfjs-dist v4/v5; the bundled
  // types omit it, so call it defensively.
  await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
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
