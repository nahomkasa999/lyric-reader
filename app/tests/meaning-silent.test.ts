// Looking a word up is silent (v4.13): the word is spoken only when the
// speaker button in the meaning card is tapped. The card must never speak
// by itself when the definition arrives.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement, useRef, useState } from "react";
import type { RefObject } from "react";
import { useReaderMeaning } from "../src/components/reader/useReaderMeaning";
import MeaningCard from "../src/components/reader/MeaningCard";
import type {
  MeaningState,
  SelectionState,
} from "../src/components/reader/readerTypes";
import type { BookDoc, Item } from "../src/lib/types";
import type { VocabRecord } from "../src/lib/db";
import { sayWord } from "../src/lib/wordSound";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const lookup = vi.fn(async () => ({
  status: "ready" as const,
  model: {
    word: "night",
    groups: [
      { partOfSpeech: "noun", defs: [{ definition: "The time of darkness." }] },
    ],
  },
}));

vi.mock("../src/lib/meaning", () => ({
  lookupMeaning: (...args: []) => lookup(...args),
  geminiInContext: async () => "",
}));
vi.mock("../src/lib/apikey", () => ({ getEffectiveApiKey: () => "" }));
vi.mock("../src/lib/db", () => ({ saveVocab: vi.fn() }));
vi.mock("../src/lib/wordSound", () => ({ sayWord: vi.fn() }));

const item: Item = {
  kind: "para",
  depth: 0,
  text: "The night was dark.",
  page: 0,
  paraStart: true,
};
const book: BookDoc = {
  id: "b1",
  title: "A Book",
  items: [item],
  totalSentences: 1,
  createdAt: 0,
  source: "upload",
};
const selection: SelectionState = { text: "night", top: 0, left: 0 };

function ref<T>(current: T): RefObject<T> {
  return { current };
}

function Harness() {
  const [meaning, setMeaning] = useState<MeaningState | null>(null);
  const meaningRef = useRef<MeaningState | null>(null);
  meaningRef.current = meaning;
  const vocabRef = useRef<VocabRecord[]>([]);
  const meaningState = useReaderMeaning({
    meaningRef,
    setMeaning,
    selRef: ref(selection),
    bookRef: ref(book),
    posRef: ref({ item: 0, part: 0 }),
    itemsRef: ref([item]),
    partsRef: ref([["The night was dark."]]),
    vocabRef,
    collapseSelection: vi.fn(),
    pauseAuto: vi.fn(),
    stopVoice: vi.fn(),
    setVocab: vi.fn(),
  });
  return createElement(
    "button",
    { id: "meaning", onClick: () => void meaningState.openMeaning() },
    "meaning",
  );
}

function mount(node: React.ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return { container, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("meaning is silent until the speaker is tapped", () => {
  beforeEach(() => {
    vi.mocked(sayWord).mockClear();
    lookup.mockClear();
  });

  it("does not speak when the definition arrives", async () => {
    const { container, root } = mount(createElement(Harness));
    await act(async () => {
      (container.querySelector("#meaning") as HTMLButtonElement).click();
    });
    await flush();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(sayWord).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("speaks only when the card's speaker button is tapped", async () => {
    const meaning: MeaningState = {
      text: "night",
      status: "ready",
      saved: false,
      model: {
        word: "night",
        groups: [
          {
            partOfSpeech: "noun",
            defs: [{ definition: "The time of darkness." }],
          },
        ],
      },
    };
    const { container, root } = mount(
      createElement(MeaningCard, {
        meaning,
        cardRef: ref(null),
        voiceURI: "",
        onSave: vi.fn(),
        onClose: vi.fn(),
        onOpenSettings: vi.fn(),
      }),
    );
    expect(sayWord).not.toHaveBeenCalled();
    await act(async () => {
      (container.querySelector('[data-testid="meaning-say"]') as HTMLButtonElement).click();
    });
    expect(sayWord).toHaveBeenCalledTimes(1);
    expect(sayWord).toHaveBeenCalledWith("night", { voiceURI: "" });
    act(() => root.unmount());
    container.remove();
  });
});
