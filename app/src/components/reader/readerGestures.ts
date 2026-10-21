// The gestures of the reader (v4.13) — the shared parts.
//
// The reader's input is one effect in the component today: the wheel,
// the swipe, the click, the keys and the long-press selection, all on
// the same stage element. It is split here into two halves — stepping
// and selecting — because they answer different questions and they
// read different state.
//
// This file holds what the two halves share: the refs that remember
// what just happened, and the list of everything they need.
import { useRef } from "react";
import type { RefObject } from "react";
import type { BookDoc, Item, Position } from "../../lib/types";
import type { VocabRecord } from "../../lib/db";
import type {
  MeaningState,
  PopTarget,
  SelectionState,
  VocabPreviewState,
} from "./readerTypes";

/** A long-press that is waiting to become a selection. */
export interface LongPress {
  x: number;
  y: number;
  timer: number;
}

/** The fixed end of a selection that is being dragged out. */
export interface ExtendEnd {
  node: Node;
  offset: number;
}

/** Everything the two gesture halves read. */
export interface GestureDeps {
  stageRef: RefObject<HTMLDivElement | null>;
  /** the book — the effect re-attaches once the stage exists */
  book: BookDoc | null;
  selRef: RefObject<SelectionState | null>;
  meaningRef: RefObject<MeaningState | null>;
  popRef: RefObject<PopTarget | null>;
  outlineOpenRef: RefObject<boolean>;
  vocabPreviewRef: RefObject<VocabPreviewState | null>;
  assistantOpenRef: RefObject<boolean>;
  lpRef: RefObject<LongPress | null>;
  extendRef: RefObject<ExtendEnd | null>;
  selRangeRef: RefObject<Range | null>;
  posRef: RefObject<Position>;
  itemsRef: RefObject<Item[]>;
  partsRef: RefObject<string[][]>;
  vocabRef: RefObject<VocabRecord[]>;
  goRef: RefObject<(dir: 1 | -1) => void>;
  showChrome: () => void;
  hideChrome: () => void;
  openPop: (i: number, p: number) => void;
  closePop: () => void;
  collapseSelection: (resume?: boolean) => void;
  closeMeaning: () => void;
  closeVocabPreview: () => void;
  /** the outline sheet closes itself */
  closeOutline: () => void;
  /** the page field is being edited — it owns its keys */
  editingRef: RefObject<boolean>;
  openVocabPreview: (
    record: VocabRecord,
    el: HTMLElement,
    item: number,
    part: number,
  ) => void;
  raiseCustomSelection: (range: Range | null) => void;
  toggleAuto: () => void;
  /** a swallowed gesture must not act for a moment */
  suppressUntil: RefObject<number>;
  /** where the reader is going */
  setPos: (p: Position) => void;
}

/** The state the two halves share. */
export interface GestureShared {
  /** the finger moved — the click that follows must be ignored */
  moved: RefObject<boolean>;
  /** the last tap, so a double-tap can be recognised */
  lastTap: RefObject<{ t: number; key: string }>;
  /** when the last selection gesture ended */
  lastSelEnd: RefObject<number>;
}

/** The refs the two halves share. */
export function useGestureShared(): GestureShared {
  const moved = useRef(false);
  const lastTap = useRef({ t: 0, key: "" });
  const lastSelEnd = useRef(0);
  return { moved, lastTap, lastSelEnd };
}
