// The postMessage wire between the page and the YouTube embed.
//
// The embed talks to its parent on its own: we greet it with
// `listening`, it answers with its state (`initialDelivery` once, then
// `infoDelivery` patches), and we drive it with `command` messages.
//
// Two rules the wire taught us, and both of them shipped as bugs once:
//   · the player ignores a greeting that arrives before its own script
//     has run, so the greeting is repeated until it answers;
//   · every load of the frame is a NEW player — the greeting starts over
//     and the old state is forgotten, or a stale "playing" would judge
//     the new one before it has said anything.
//
// This is not the YouTube IFrame API and it is not documented by
// YouTube — it is the wire the official script uses underneath.

/** The hosts the embed answers from. */
export const YT_HOST_RE = /(^|\.)youtube(-nocookie)?\.com$/;

/** The name the player echoes back to us on every message. */
export const YT_ID = "ytp";

/** The player's own states — the official numbers. */
export const YT_UNSTARTED = -1;
export const YT_ENDED = 0;
export const YT_PLAYING = 1;
export const YT_PAUSED = 2;
export const YT_BUFFERING = 3;
export const YT_CUED = 5;

/** The greeting. The player stays silent until it has been greeted. */
export function youtubeListening(id: string = YT_ID): string {
  return JSON.stringify({ event: "listening", id, channel: "widget" });
}

/** One command for the embedded player. */
export function youtubeCommand(
  func: string,
  args: unknown[] = [],
  id: string = YT_ID,
): string {
  return JSON.stringify({ event: "command", func, args, id });
}

/** What the player tells us about itself. */
export interface YouTubeInfo {
  currentTime?: number;
  duration?: number;
  playerState?: number;
  volume?: number;
  muted?: boolean;
  videoUrl?: string;
  videoData?: { video_id?: string; title?: string; author?: string };
  playlist?: string[];
  playlistIndex?: number;
  [key: string]: unknown;
}

/** One message from the embedded player. */
export interface YouTubeMessage {
  /** `initialDelivery`, `infoDelivery`, `onError`, … */
  event?: string;
  /** the name we were greeted with */
  id?: string | number;
  /** the state itself */
  info?: YouTubeInfo;
}

/**
 * Read one message from the embedded player.
 *
 * The player sends its whole state once (`initialDelivery`) and then
 * the changes as they happen (`infoDelivery`). Anything else on the
 * page — our own commands, another script — is ignored.
 */
export function parseYouTubeMessage(raw: unknown): YouTubeMessage | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const msg = data as YouTubeMessage;
  if (typeof msg.event !== "string" && msg.info === undefined) return null;
  if (
    msg.info !== undefined &&
    (typeof msg.info !== "object" || msg.info === null)
  )
    return null;
  return msg;
}

/** What the player says when it refuses to play (its own error codes). */
export function youtubeErrorText(info: unknown): string {
  const code =
    info &&
    typeof info === "object" &&
    typeof (info as { errorCode?: unknown }).errorCode === "number"
      ? (info as { errorCode: number }).errorCode
      : null;
  switch (code) {
    case 2:
      return "That video id is not valid.";
    case 5:
      return "YouTube will not play this video here.";
    case 100:
      return "That video is gone or private.";
    case 101:
    case 150:
      return "The owner does not allow this video to be played here.";
    case 153:
      return "YouTube needs to know this app — the player cannot start.";
    default:
      return "YouTube would not play that.";
  }
}
