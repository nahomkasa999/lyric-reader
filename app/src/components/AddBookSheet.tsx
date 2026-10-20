// The Add Book sheet: a bottom sheet with two tabs — File and Paste.
// The paste form used to live on Home; it lives here now.
import { useEffect, useRef, useState } from "react";

interface Props {
  /** True while an import is running. */
  busy: boolean;
  /** Import error message (null when the last import worked). */
  error: string | null;
  onClose: () => void;
  /** A file was picked (the sheet forwards the input's FileList). */
  onFiles: (files: FileList | null) => void;
  /** The pasted text + optional title. */
  onPaste: (text: string, title: string) => void;
}

export default function AddBookSheet({
  busy,
  error,
  onClose,
  onFiles,
  onPaste,
}: Props) {
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Escape closes the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-testid="add-book-layer"
      className="sheet-layer"
      onClick={onClose}
    >
      <div
        data-testid="add-book-sheet"
        className="add-sheet glass sheet-surface"
        role="dialog"
        aria-modal="true"
        aria-label="Add a book"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight">Add a book</h2>
          <button
            data-testid="add-book-close"
            onClick={onClose}
            aria-label="Close"
            className="glass-pill press pill-sm ml-auto"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div
          data-testid="add-book-tabs"
          className="sheet-tabs mt-4"
          role="tablist"
          aria-label="Add a book from a file or pasted text"
        >
          <button
            data-testid="add-tab-file"
            role="tab"
            aria-selected={tab === "file"}
            onClick={() => setTab("file")}
          >
            File
          </button>
          <button
            data-testid="add-tab-paste"
            role="tab"
            aria-selected={tab === "paste"}
            onClick={() => setTab("paste")}
          >
            Paste
          </button>
        </div>

        {error && (
          <div
            data-testid="import-error"
            className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            {error}
          </div>
        )}

        {/* Both panels stay in the DOM — only the inactive one is hidden. */}
        <div
          role="tabpanel"
          aria-label="Add from a file"
          className={tab === "file" ? "mt-5" : "mt-5 hidden"}
        >
          <label
            data-testid="upload-btn"
            className={`sheet-drop press${
              busy ? " pointer-events-none opacity-50" : ""
            }`}
          >
            <span className="block text-sm font-semibold">
              {busy ? "Working…" : "Choose a file"}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              PDF, EPUB, TXT or Markdown
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.epub,.txt,.md"
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                if (fileRef.current) fileRef.current.value = "";
              }}
              data-testid="file-input"
            />
          </label>
          <p className="mt-3 text-xs text-muted-foreground">
            Everything stays on this device.
          </p>
        </div>

        <div
          role="tabpanel"
          aria-label="Paste text"
          className={tab === "paste" ? "mt-5" : "mt-5 hidden"}
        >
          <input
            data-testid="paste-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="sheet-field"
          />
          <textarea
            data-testid="paste-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or paste text here"
            rows={5}
            className="sheet-field mt-3 resize-y"
          />
          <button
            data-testid="paste-save"
            onClick={() => onPaste(text, title)}
            disabled={!text.trim() || busy}
            className="home-cta press mt-3"
          >
            Read pasted text
          </button>
        </div>
      </div>
    </div>
  );
}
