// The knowledge base and the assistant's prompt (v4.12).
//
// These are the numbers that decide whether the answer is the RIGHT one:
// how a book is cut into passages, how a question is matched against
// them, and what the model is actually shown.
import { describe, it, expect } from "vitest";
import { CHUNK_CHARS, chunkBook } from "../src/lib/chunks";
import {
  combinedScore,
  cosine,
  lexicalScore,
  wordsOf,
} from "../src/lib/vectorScore";
import {
  RECENT_MESSAGES,
  buildAssistantPrompt,
  digestOf,
  passagesOf,
} from "../src/lib/assistantContext";
import type { AssistantMessage } from "../src/lib/assistantStore";
import type { Item } from "../src/lib/types";
import type { SearchHit } from "../src/lib/vectorIndex";

/** A small book: a heading, two paragraphs, a second heading. */
function book(): Item[] {
  return [
    { kind: "heading", depth: 1, text: "Chapter 3", page: 0, paraStart: false },
    { kind: "para", depth: 0, text: "The crash happened at the corner of 30th Street.", page: 0, paraStart: true },
    { kind: "para", depth: 0, text: "Nobody saw the car until it was too late.", page: 0, paraStart: false },
    { kind: "heading", depth: 1, text: "Chapter 4", page: 1, paraStart: false },
    { kind: "para", depth: 0, text: "Afterwards the whole town talked about it.", page: 1, paraStart: true },
  ];
}

describe("cutting a book into passages", () => {
  it("keeps the heading with its passage", () => {
    const chunks = chunkBook("b1", book());
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].heading).toBe("Chapter 3");
    expect(chunks[0].text).toContain("30th Street");
    const last = chunks[chunks.length - 1];
    expect(last.heading).toBe("Chapter 4");
  });

  it("knows where every passage is", () => {
    const chunks = chunkBook("b1", book());
    const c = chunks[0];
    expect(c.id).toBe("b1:0");
    expect(c.bookId).toBe("b1");
    expect(c.page).toBe(1);
    expect(c.from).toBe(0);
    expect(c.to).toBeGreaterThanOrEqual(c.from);
    expect(c.text.length).toBeGreaterThan(10);
  });

  it("cuts a long book into passages that stay under the limit", () => {
    const items: Item[] = [];
    for (let i = 0; i < 200; i++) {
      items.push({
        kind: "para",
        depth: 0,
        text: `Sentence number ${i} says something worth keeping.`,
        page: 0,
        paraStart: i % 3 === 0,
      });
    }
    const chunks = chunkBook("b1", items);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(CHUNK_CHARS + 120);
    }
    // The passages cover the book.
    expect(chunks[0].from).toBe(0);
    expect(chunks[chunks.length - 1].to).toBe(items.length - 1);
  });

  it("says nothing about an empty book", () => {
    expect(chunkBook("b1", [])).toEqual([]);
  });
});

describe("matching a question against the passages", () => {
  it("drops the words that carry no meaning", () => {
    const w = wordsOf("The crash was at the corner of the 30th Street");
    expect(w).toContain("crash");
    expect(w).toContain("street");
    expect(w).not.toContain("the");
    expect(w).not.toContain("of");
    expect(new Set(w).size).toBe(w.length);
  });

  it("measures how close two vectors are", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    const c = new Float32Array([0, 1, 0]);
    expect(cosine(a, b)).toBeCloseTo(1, 5);
    expect(cosine(a, c)).toBeCloseTo(0, 5);
  });

  it("finds a passage by its exact words", () => {
    const words = wordsOf("The crash happened at the corner of 30th Street.");
    const score = lexicalScore("what happened on 30th street", words);
    expect(score).toBeGreaterThan(0.5);
    expect(lexicalScore("how did the fish sleep", words)).toBe(0);
  });

  it("lets meaning count for more than words", () => {
    expect(combinedScore(1, 0)).toBeGreaterThan(combinedScore(0, 1));
    expect(combinedScore(0.5, 0.5)).toBeCloseTo(0.5, 5);
  });
});

describe("what the model is shown", () => {
  const messages: AssistantMessage[] = [
    { role: "user", text: "Who is Ada?", at: 1 },
    { role: "ai", text: "She is the engineer.", at: 2 },
  ];

  it("lists the earlier questions when the thread grows", () => {
    const long: AssistantMessage[] = [];
    for (let i = 0; i < RECENT_MESSAGES + 4; i++) {
      long.push({ role: "user", text: `Question ${i}`, at: i });
    }
    const digest = digestOf(long);
    expect(digest).toContain("Question 0");
    expect(digest).toContain("Earlier in this thread");
    // A short thread needs no digest.
    expect(digestOf(messages)).toBe("");
  });

  it("puts the passages before the question", () => {
    const prompt = buildAssistantPrompt(
      "what happened on 30th street",
      [
        {
          bookTitle: "The Crash",
          heading: "Chapter 3",
          page: 4,
          text: "The car turned at 30th Street.",
        },
      ],
      [],
    );
    expect(prompt.system).toContain("PASSAGES");
    const last = prompt.messages[prompt.messages.length - 1];
    expect(last.text.indexOf("PASSAGES")).toBeLessThan(
      last.text.indexOf("MY QUESTION"),
    );
    expect(last.text).toContain("The Crash");
    expect(last.text).toContain("p.4");
  });

  it("keeps only the recent messages of a thread", () => {
    const long: AssistantMessage[] = [];
    for (let i = 0; i < 40; i++) {
      long.push({ role: i % 2 ? "ai" : "user", text: `m${i}`, at: i });
    }
    const prompt = buildAssistantPrompt("and why?", [], long);
    // The recent window + the question.
    expect(prompt.messages.length).toBe(RECENT_MESSAGES + 1);
    expect(prompt.messages[0].text).toBe(`m${40 - RECENT_MESSAGES}`);
  });

  it("says so when nothing was found", () => {
    const prompt = buildAssistantPrompt("anything?", [], []);
    const last = prompt.messages[prompt.messages.length - 1];
    expect(last.text).toContain("none found");
  });

  it("names the book every passage came from", () => {
    const hits = [
      {
        chunk: {
          id: "b1:0",
          bookId: "b1",
          text: "text",
          heading: "Chapter 3",
          page: 4,
          from: 10,
          to: 12,
        },
        score: 1,
        semantic: 1,
        lexical: 0,
      },
    ] as SearchHit[];
    const passages = passagesOf(hits, new Map([["b1", "The Crash"]]));
    expect(passages[0].bookTitle).toBe("The Crash");
    expect(passages[0].page).toBe(4);
    expect(passages[0].heading).toBe("Chapter 3");
  });
});
