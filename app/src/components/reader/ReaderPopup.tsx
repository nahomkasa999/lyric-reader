// The action popup (v4.13): one card at the sentence.
//
// Four rows — bookmark, highlight, note, copy — and, when the note is
// being written, the editor instead of the rows.
import type { PopupRow, Mark } from "./readerTypes";

interface Props {
  rows: PopupRow[];
  /** the marks of the part the popup acts on */
  mark: Mark;
  /** the note is being written */
  noteEditing: boolean;
  noteDraft: string;
  onNoteDraft: (v: string) => void;
  onSaveNote: () => void;
  onDeleteNote: () => void;
  onCancelNote: () => void;
  /** the card element — the reader anchors it */
  menuRef: React.RefObject<HTMLDivElement | null>;
}

export default function ReaderPopup({
  rows,
  mark,
  noteEditing,
  noteDraft,
  onNoteDraft,
  onSaveNote,
  onDeleteNote,
  onCancelNote,
  menuRef,
}: Props) {
  return (
    <div className="pop-layer" data-testid="action-popup">
      <div
        ref={menuRef}
        data-testid="popup-card"
        className="menu"
        role="dialog"
        aria-label="Sentence actions"
      >
        {noteEditing ? (
          <div className="note-editor" data-testid="note-editor">
            <textarea
              data-testid="note-textarea"
              value={noteDraft}
              onChange={(e) => onNoteDraft(e.target.value)}
              placeholder="Write a note on this part…"
              rows={4}
              autoFocus
              className="note-textarea"
              aria-label="Note text"
            />
            <div className="note-editor-actions">
              {mark.note && (
                <button
                  data-testid="note-delete"
                  onClick={onDeleteNote}
                  className="note-btn danger"
                >
                  Delete
                </button>
              )}
              <span className="flex-1" />
              <button
                data-testid="note-cancel"
                onClick={onCancelNote}
                className="note-btn"
              >
                Cancel
              </button>
              <button
                data-testid="note-save"
                onClick={onSaveNote}
                className="note-btn primary"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          rows.map((r) => (
            <button
              key={r.key}
              data-testid={r.testid}
              onClick={r.onClick}
              className="action-row"
              style={r.active ? r.activeStyle : undefined}
            >
              {r.icon}
              <span>{r.label}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
