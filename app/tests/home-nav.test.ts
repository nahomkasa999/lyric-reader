// The Home view (glass restyle): the header, the Continue Reading hero,
// the Add Book sheet and the bottom navigation.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createElement } from "react";
import Library from "../src/components/Library";
import GlassNav from "../src/components/GlassNav";

const books = [
  {
    id: "b1",
    title: "Dune",
    totalSentences: 120,
    createdAt: 2,
    source: "upload" as const,
  },
  {
    id: "b2",
    title: "Emma",
    totalSentences: 90,
    createdAt: 1,
    source: "paste" as const,
  },
];

vi.mock("../src/lib/db", () => ({
  listBooks: async () => books,
  getBook: async () => undefined,
  getProgress: async () => undefined,
  saveBook: async () => {},
  deleteBook: async () => {},
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(node: React.ReactNode): Promise<{
  container: HTMLElement;
  root: Root;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

function q<T extends HTMLElement>(container: HTMLElement, id: string): T {
  const el = container.querySelector<T>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  return el;
}

describe("home", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the glass header, the add button and the library", async () => {
    const { container, root } = await mount(
      createElement(Library, {
        onOpen: () => {},
        onOpenSettings: () => {},
        onOpenSaved: () => {},
      }),
    );
    expect(q(container, "library-root")).toBeTruthy();
    expect(q(container, "library-header")).toBeTruthy();
    expect(q(container, "add-book-btn")).toBeTruthy();
    expect(q(container, "book-list")).toBeTruthy();
    expect(q(container, "book-card-b1")).toBeTruthy();
    expect(q(container, "open-book-b1")).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("keeps the paste form out of Home and inside the sheet", async () => {
    const { container, root } = await mount(
      createElement(Library, {
        onOpen: () => {},
        onOpenSettings: () => {},
        onOpenSaved: () => {},
      }),
    );
    // Not on Home any more.
    expect(container.querySelector('[data-testid="paste-text"]')).toBeNull();
    expect(container.querySelector('[data-testid="file-input"]')).toBeNull();

    await act(async () => {
      q<HTMLButtonElement>(container, "add-book-btn").click();
    });
    expect(q(container, "add-book-sheet")).toBeTruthy();
    expect(q(container, "add-tab-file")).toBeTruthy();
    expect(q(container, "add-tab-paste")).toBeTruthy();
    expect(q(container, "upload-btn")).toBeTruthy();
    expect(q(container, "file-input")).toBeTruthy();
    expect(q(container, "paste-title")).toBeTruthy();
    expect(q(container, "paste-text")).toBeTruthy();
    expect(q(container, "paste-save")).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("the add-book sheet is opaque enough to read over the page", async () => {
    const { container, root } = await mount(
      createElement(Library, {
        onOpen: () => {},
        onOpenSettings: () => {},
        onOpenSaved: () => {},
      }),
    );
    await act(async () => {
      q<HTMLButtonElement>(container, "add-book-btn").click();
    });
    const sheet = q(container, "add-book-sheet");
    expect(sheet.className).toContain("sheet-surface");
    await act(async () => root.unmount());
  });

  it("the sheet surface is a near-opaque dark fill", () => {
    const css = readFileSync(
      path.resolve(process.cwd(), "src/glass.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.glass\.sheet-surface\s*\{[^}]*background:\s*rgba\(10,\s*10,\s*12,\s*0\.94\)/,
    );
  });

  it("resumes the last read book from the Continue Reading hero", async () => {
    localStorage.setItem("lyric-reader.last-book", "b2");
    const onOpen = vi.fn();
    const onActiveBook = vi.fn();
    const { container, root } = await mount(
      createElement(Library, {
        onOpen,
        onOpenSettings: () => {},
        onOpenSaved: () => {},
        onActiveBook,
      }),
    );
    const hero = q(container, "continue-reading");
    expect(hero.textContent).toContain("Emma");
    expect(onActiveBook).toHaveBeenCalledWith("b2");
    await act(async () => {
      q<HTMLButtonElement>(container, "continue-reading").click();
    });
    expect(onOpen).toHaveBeenCalledWith("b2");
    await act(async () => root.unmount());
  });
});

describe("bottom navigation", () => {
  it("offers Home, Words, Saved and Settings", async () => {
    const { container, root } = await mount(
      createElement(GlassNav, {
        active: "home",
        onNavigate: () => {},
        canOpenBook: true,
      }),
    );
    expect(q(container, "nav-home")).toBeTruthy();
    expect(q(container, "nav-words")).toBeTruthy();
    expect(q(container, "nav-saved")).toBeTruthy();
    expect(q(container, "nav-settings")).toBeTruthy();
    expect(
      q<HTMLButtonElement>(container, "nav-home").getAttribute("aria-current"),
    ).toBe("page");
    await act(async () => root.unmount());
  });

  it("disables Words and Saved when there is no book yet", async () => {
    const { container, root } = await mount(
      createElement(GlassNav, {
        active: "home",
        onNavigate: () => {},
        canOpenBook: false,
      }),
    );
    expect(q<HTMLButtonElement>(container, "nav-words").disabled).toBe(true);
    expect(q<HTMLButtonElement>(container, "nav-saved").disabled).toBe(true);
    expect(q<HTMLButtonElement>(container, "nav-home").disabled).toBe(false);
    await act(async () => root.unmount());
  });
});
