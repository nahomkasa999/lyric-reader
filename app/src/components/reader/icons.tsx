// The reader's icon set — one place, one stroke language (Emil's rules:
// 1.8 stroke, round caps, no fills except the solid dots).
// Every icon is decorative: the button around it carries the label.
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function ArrowIcon() {
  return (
    <svg {...base} width="20" height="20">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg {...base} width="17" height="17">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function SavedIcon() {
  return (
    <svg {...base} width="17" height="17">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

export function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}

export function HighlightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 11l7-7 4 4-7 7z" />
      <path d="M9 11l-5 5v4h4l5-5" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

export function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg {...base} width="17" height="17">
      <path d="M7.5 4.8v14.4L19 12z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...base} width="17" height="17">
      <path d="M8.5 5v14M15.5 5v14" />
    </svg>
  );
}

export function SpeakerIcon() {
  return (
    <svg {...base} width="19" height="19">
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}

/** v4.11: the music note — the YouTube audio button. */
export function MusicIcon() {
  return (
    <svg {...base} width="19" height="19">
      <path d="M9 18V6.5l10-2V16" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  );
}

/** v4.11: the level bars — the same button while it is playing. */
export function WaveIcon() {
  return (
    <svg {...base} width="19" height="19">
      <path d="M4 10v4M8 7v10M12 9v6M16 6v12M20 10v4" />
    </svg>
  );
}

/** v4.11: the previous track. */
export function PrevIcon() {
  return (
    <svg {...base} width="18" height="18">
      <path d="M16.5 6v12L7.5 12z" />
      <path d="M5.5 6v12" />
    </svg>
  );
}

/** v4.11: the next track. */
export function NextIcon() {
  return (
    <svg {...base} width="18" height="18">
      <path d="M7.5 6v12L16.5 12z" />
      <path d="M18.5 6v12" />
    </svg>
  );
}

/** v4.11: the volume. */
export function VolumeIcon() {
  return (
    <svg {...base} width="18" height="18">
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

/** v4.11: the muted volume. */
export function MuteIcon() {
  return (
    <svg {...base} width="18" height="18">
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
    </svg>
  );
}

/** v4.12: the assistant — a chat bubble. */
export function ChatIcon() {
  return (
    <svg {...base} width="18" height="18">
      <path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5z" />
    </svg>
  );
}

/** v4.13: the outline — a list of lines. */
export function ListIcon() {
  return (
    <svg {...base} width="18" height="18">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </svg>
  );
}
