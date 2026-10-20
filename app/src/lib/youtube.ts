// YouTube links → an embeddable, background-only player.
//
// The ambience player is a plain iframe: the YouTube IFrame API script is
// deliberately not loaded (no third-party script, nothing to block, no
// extra bytes). The embed understands postMessage commands on its own, so
// volume and play/pause are one small message each.
//
// What this cannot do (and the UI says so): read the audio. An embedded
// YouTube player is cross-origin, so there is no way to analyse the
// sound — any beat-sync has to be simulated, not measured.

/** A YouTube video id is exactly 11 URL-safe characters. */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function isId(value: string | null | undefined): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

/**
 * The video id inside a YouTube link.
 *
 * Accepts the shapes people actually paste:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/shorts/ID
 *   https://www.youtube.com/live/ID
 *   ID
 * Returns null for anything else (playlists, other hosts, typos).
 */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  // A bare id, pasted straight from the URL bar.
  if (isId(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    return isId(parts[0]) ? parts[0] : null;
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  if (parts[0] === "watch") {
    const v = url.searchParams.get("v");
    return isId(v) ? v : null;
  }
  // /embed/ID · /shorts/ID · /live/ID · /v/ID
  if (parts.length >= 2 && isId(parts[1])) return parts[1];
  return null;
}

/**
 * The embed URL for a video id.
 *
 * autoplay + loop: the ambience plays on its own and repeats, so it can
 * run under a long reading session. enablejsapi is what lets the embed
 * accept the postMessage commands below.
 */
export function youtubeEmbedUrl(
  id: string,
  opts: { autoplay?: boolean; loop?: boolean } = {},
): string {
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    controls: "0",
    disablekb: "1",
    iv_load_policy: "3",
  });
  if (opts.autoplay) params.set("autoplay", "1");
  if (opts.loop) {
    params.set("loop", "1");
    // Looping one video needs the video itself in the playlist.
    params.set("playlist", id);
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/** One command for the embedded player. */
export function youtubeCommand(func: string, args: unknown[] = []): string {
  return JSON.stringify({ event: "command", func, args });
}
