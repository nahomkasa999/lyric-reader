import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractEpub, extractPdf, extractTxt } from "../src/lib/extract";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "../src/lib/sample";

async function makeEpub(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Fixture Book</dc:title></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`,
  );
  zip.file(
    "OEBPS/ch1.xhtml",
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Ch1</title></head><body><h1>Chapter One</h1><p>Dr. Finch arrived late. The room was silent.</p><ul><li>First point.<ul><li>Nested point here.</li></ul></li><li>Second point.</li></ul><p>He left quietly.</p></body></html>`,
  );
  const buf = await zip.generateAsync({ type: "arraybuffer" });
  return buf as ArrayBuffer;
}

async function makePdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([600, 800]);
  p1.drawText("Dr. Smith walked home. The rain was cold.", {
    x: 50, y: 700, size: 14, font,
  });
  const p2 = doc.addPage([600, 800]);
  p2.drawText("He paused at the stairs. Then he ran!", {
    x: 50, y: 700, size: 14, font,
  });
  return (await doc.save()).buffer as ArrayBuffer;
}

describe("extractTxt (sample book)", () => {
  it("produces an item stream with heading page breaks, max 7 items/page", async () => {
    const book = await extractTxt(SAMPLE_TEXT, SAMPLE_TITLE, "sample");
    expect(book.title).toBe(SAMPLE_TITLE);
    expect(book.totalSentences).toBeGreaterThan(40);
    const all = book.items;
    // At most 7 items per page, and every heading starts a fresh page.
    const perPage = new Map<number, number>();
    for (const it of all) perPage.set(it.page, (perPage.get(it.page) ?? 0) + 1);
    expect(Math.max(...perPage.values())).toBeLessThanOrEqual(7);
    all.forEach((it, i) => {
      if (it.kind === "heading" && i > 0) {
        expect(it.page).not.toBe(all[i - 1].page);
      }
    });
    expect(all.some((s) => s.kind === "heading")).toBe(true);
    const bullets = all.filter((s) => s.kind === "bullet");
    expect(bullets.length).toBeGreaterThan(0);
    expect(Math.max(...bullets.map((b) => b.depth))).toBeGreaterThan(0);
    expect(bullets.some((b) => b.paraStart)).toBe(false);
    // Sample sentences survive extraction in order
    const texts = all.map((s) => s.text);
    const i1 = texts.findIndex((t) => t.includes("grandfather clock"));
    const i2 = texts.findIndex((t) => t.includes("edge of the stairs"));
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
  });
});

describe("extractEpub", () => {
  it("reads title, headings, paragraphs and nested bullets in spine order", async () => {
    const book = await extractEpub(await makeEpub(), "fallback");
    expect(book.title).toBe("Fixture Book");
    const all = book.items;
    expect(all[0]).toMatchObject({ kind: "heading", text: "Chapter One" });
    // "Dr. Finch" must not be split
    expect(all.some((s) => s.text === "Dr. Finch arrived late.")).toBe(true);
    const bullets = all.filter((s) => s.kind === "bullet");
    expect(bullets.map((b) => b.depth)).toEqual([0, 1, 0]);
    expect(all[all.length - 1].text).toBe("He left quietly.");
  });
});

describe("extractPdf", () => {
  it("keeps one reader page per PDF page, in order", async () => {
    const book = await extractPdf(await makePdf(), "Fixture PDF");
    expect(book.title).toBe("Fixture PDF");
    const pages = [...new Set(book.items.map((i) => i.page))];
    expect(pages).toEqual([0, 1]);
    expect(book.items.filter((i) => i.page === 0).map((s) => s.text)).toEqual([
      "Dr. Smith walked home.",
      "The rain was cold.",
    ]);
    expect(book.items.filter((i) => i.page === 1).map((s) => s.text)).toEqual([
      "He paused at the stairs.",
      "Then he ran!",
    ]);
  });
});
