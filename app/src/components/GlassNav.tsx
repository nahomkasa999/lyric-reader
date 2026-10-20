// The glass bottom navigation (Home / Words / Saved / Settings).
// It belongs to the non-reader views only — the reader keeps its own
// auto-hiding page navigation.
export type NavKey = "home" | "words" | "saved" | "settings";

interface Props {
  /** The view the user is on right now. */
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  /** Words/Saved need a book — without one they stay disabled. */
  canOpenBook?: boolean;
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function GlassNav({ active, onNavigate, canOpenBook = true }: Props) {
  return (
    <nav data-testid="glass-nav" className="glass glass-nav" aria-label="Main">
      <button
        data-testid="nav-home"
        aria-current={active === "home" ? "page" : undefined}
        onClick={() => onNavigate("home")}
      >
        <HomeIcon />
        <span>Home</span>
      </button>
      <button
        data-testid="nav-words"
        aria-current={active === "words" ? "page" : undefined}
        disabled={!canOpenBook}
        onClick={() => onNavigate("words")}
      >
        <span className="nav-glyph" aria-hidden>
          Aa
        </span>
        <span>Words</span>
      </button>
      <button
        data-testid="nav-saved"
        aria-current={active === "saved" ? "page" : undefined}
        disabled={!canOpenBook}
        onClick={() => onNavigate("saved")}
      >
        <BookmarkIcon />
        <span>Saved</span>
      </button>
      <button
        data-testid="nav-settings"
        aria-current={active === "settings" ? "page" : undefined}
        onClick={() => onNavigate("settings")}
      >
        <GearIcon />
        <span>Settings</span>
      </button>
    </nav>
  );
}
