// The conversations of a book (v4.14).
//
// A thread belongs to the book it was about. The reader who opens a
// book sees that book's conversations — and the assistant answers from
// that book alone.
import { describe, it, expect } from "vitest";
import { threadsOfBook, type Thread } from "../src/lib/assistantStore";

function thread(bookId: string | undefined, updatedAt: number): Thread {
  return {
    id: `th-${bookId ?? "all"}-${updatedAt}`,
    title: `Thread ${updatedAt}`,
    scope: bookId ? "book" : "library",
    bookId,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("the conversations of a book", () => {
  const rows = [
    thread("b1", 30),
    thread("b2", 20),
    thread("b1", 10),
    thread(undefined, 5),
  ];

  it("shows only the threads of the book on screen", () => {
    const mine = threadsOfBook(rows, "b1");
    expect(mine.map((t) => t.id)).toEqual(["th-b1-30", "th-b1-10"]);
  });

  it("shows every thread when no book is open", () => {
    const all = threadsOfBook(rows);
    expect(all).toHaveLength(4);
  });

  it("puts the newest first", () => {
    const mine = threadsOfBook(rows, "b1");
    expect(mine[0].updatedAt).toBe(30);
    expect(mine[1].updatedAt).toBe(10);
  });

  it("has nothing for a book that was never asked about", () => {
    expect(threadsOfBook(rows, "b3")).toEqual([]);
  });
});
