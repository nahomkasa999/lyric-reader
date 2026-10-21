// The spoilers switch (v4.13).
//
// It sits in the header, next to the new-thread button: the reader
// decides once, and the answer is allowed to say what happens later in
// the book. It is off by default — an answer about a book you are
// halfway through must not give away the end.
interface Props {
  on: boolean;
  onChange: (v: boolean) => void;
}

export default function SpoilersToggle({ on, onChange }: Props) {
  return (
    <button
      data-testid="assistant-spoilers"
      className={`chat-toggle${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label="Allow spoilers"
      title="Allow spoilers — let the answer say what happens later"
      onClick={() => onChange(!on)}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"
          stroke="currentColor"
          strokeWidth="1.7"
          fill="none"
        />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
      <span>Spoilers</span>
    </button>
  );
}
