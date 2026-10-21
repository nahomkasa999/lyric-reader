// The reader's types (v4.13).
//
// The reader is one component with a lot of state, and the state used
// to live in the component file. These are the shapes it shares with
// its own pieces — the stage, the popup, the overlays — so they have a
// home of their own.
import type { CSSProperties, ReactNode } from "react";
import type { VocabRecord } from "../../lib/db";
import type { MeaningModel } from "../../lib/meaning";
import type { Item } from "../../lib/types";

/** What is marked on one part. */
export interface Mark {
  highlight: boolean;
  bookmark: boolean;
  note: string | null;
}

export const NO_MARK: Mark = { highlight: false, bookmark: false, note: null };

/** Where the meaning lookup stands. */
export type MeaningStatus =
  | "loading"
  | "ready"
  | "not-found"
  | "needs-key"
  | "offline"
  | "error";

export interface MeaningState {
  /** text as the user selected it */
  text: string;
  status: MeaningStatus;
  model?: MeaningModel;
  saved: boolean;
  /** for phrases without a key */
  query?: string;
}

/** The floating pill above the selection. */
export interface SelectionState {
  text: string;
  top: number;
  left: number;
}

/** Which part the action popup acts on. */
export interface PopTarget {
  i: number;
  p: number;
}

/** The saved-word card, anchored at the word. */
export interface VocabPreviewState {
  record: VocabRecord;
  top: number;
  left: number;
}

/** One item of the current page, with its parts. */
export interface PageItem {
  idx: number;
  item: Item;
  parts: string[];
}

/** One row of the action popup. */
export interface PopupRow {
  key: string;
  label: string;
  testid: string;
  icon: ReactNode;
  active: boolean;
  activeStyle?: CSSProperties;
  onClick: () => void;
}

/** The props the reader takes. */
export interface ReaderProps {
  bookId: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenSaved: () => void;
  /** the assistant — the whole library, in a sheet */
  onOpenAssistant: (bookTitle: string, item: number) => void;
  /** the assistant sheet is open over the reader */
  assistantOpen: boolean;
}
