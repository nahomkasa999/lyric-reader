// YouTube links → an embeddable, background-only player.
//
// The player is a plain iframe: the YouTube IFrame API script is
// deliberately not loaded (no third-party script, nothing to block, no
// extra bytes). The embed talks to its parent over postMessage — the
// very same wire the official script uses (see lib/youtubeWire.ts) — so
// play/pause/volume are one small message each, and the player pushes
// its own state back.
//
// What this cannot do (and the UI says so): read the audio. An embedded
// YouTube player is cross-origin, so there is no way to analyse the
// sound — any beat-sync has to be simulated, not measured.

/** A YouTube video id is exactly 11 URL-safe characters. */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Playlist ids are longer than a video id and always carry letters
 * (PL…, LL…, RD…, UU…, OLAK5uy_…).
 */
const LIST_RE = /^[A-Za-z0-9_-]{12,64}$/;

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
 * The playlist id inside a YouTube link, when it carries one.
 *
 *   https://www.youtube.com/playlist?list=PL…
 *   https://www.youtube.com/watch?v=ID&list=PL…
 *   PL…
 *
 * A bare 11-character id is a video, never a playlist.
 */
export function parseYouTubePlaylistId(input: string): string | null {
  const raw = input.trim();
  if (!raw || isId(raw)) return null;
  if (LIST_RE.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (
    host !== "youtube.com" &&
    host !== "youtube-nocookie.com" &&
    host !== "youtu.be"
  )
    return null;

  const list = url.searchParams.get("list");
  return list && LIST_RE.test(list) ? list : null;
}

/** What a pasted link points at: a video, a playlist, or both. */
export interface YouTubeRef {
  /** the video id, when the link points at one video */
  videoId: string | null;
  /** the playlist id, when the link carries one */
  playlistId: string | null;
}

/** Read one pasted link. */
export function parseYouTubeRef(input: string): YouTubeRef {
  return {
    videoId: parseYouTubeId(input),
    playlistId: parseYouTubePlaylistId(input),
  };
}

/**
 * Every YouTube link in a blob of text.
 *
 * People paste one link, or a page of links — one per line, or side by
 * side. A link never contains a space, so splitting on whitespace is
 * safe. Several links become a playlist (see the audio player).
 */
export function parseYouTubeLinks(text: string): YouTubeRef[] {
  return text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseYouTubeRef)
    .filter((ref) => ref.videoId || ref.playlistId);
}

/**
 * The embed URL for a video id.
 *
 * autoplay + loop: the ambience plays on its own and repeats, so it can
 * run under a long reading session. enablejsapi is what lets the embed
 * accept the postMessage commands.
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

/**
 * The embed URL for a whole playlist.
 *
 * `videoseries` is YouTube's playlist player: it plays the list by
 * itself, answers the same commands (so next/previous work), and needs
 * no key and no extra script.
 */
export function youtubePlaylistEmbedUrl(
  listId: string,
  opts: { autoplay?: boolean } = {},
): string {
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    controls: "0",
    disablekb: "1",
    iv_load_policy: "3",
    list: listId,
  });
  if (opts.autoplay) params.set("autoplay", "1");
  return `https://www.youtube-nocookie.com/embed/videoseries?${params.toString()}`;
}
