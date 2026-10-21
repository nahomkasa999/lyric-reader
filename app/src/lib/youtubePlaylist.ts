// The links the user has played — the "previous links" list at the top
// of the YouTube panel, and the playlist those links can be played back
// as.
//
// It lives in localStorage: a handful of ids, titles and links, no need
// for IndexedDB, and it must survive a reload (the user expects their
// list to still be there tomorrow).

/** One playable link. */
export interface YtTrack {
  /** the video id */
  id: string;
  /** the title, once the player tells us */
  title: string | null;
  /** the link, as it was pasted */
  url: string;
  /** when it was last played */
  addedAt: number;
}

export const HISTORY_KEY = "lyric-reader.yt-history";

/** How many links the list keeps. */
export const HISTORY_CAP = 50;

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** The canonical link for a video id. */
export function trackUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** A new entry for the list. */
export function makeTrack(
  id: string,
  url?: string,
  title: string | null = null,
  addedAt: number = Date.now(),
): YtTrack {
  return { id, title, url: url && url.trim() ? url.trim() : trackUrl(id), addedAt };
}

/**
 * Put a track in the list.
 *
 * Newest first, one entry per video (a link that is played again moves
 * back to the top), and a title we already know is never lost.
 */
export function addTrack(
  list: YtTrack[],
  track: YtTrack,
  cap: number = HISTORY_CAP,
): YtTrack[] {
  const prev = list.find((t) => t.id === track.id);
  const merged: YtTrack = {
    ...track,
    title: track.title ?? prev?.title ?? null,
  };
  return [merged, ...list.filter((t) => t.id !== track.id)].slice(0, cap);
}

/** Take a track out of the list. */
export function removeTrack(list: YtTrack[], id: string): YtTrack[] {
  return list.filter((t) => t.id !== id);
}

/**
 * The next place in a list, wrapping around.
 * -1 when the list is empty.
 */
export function stepIndex(
  list: YtTrack[],
  index: number,
  dir: 1 | -1,
): number {
  if (!list.length) return -1;
  const n = list.length;
  return ((index + dir) % n + n) % n;
}

/** The list as it was left. Anything unreadable is dropped. */
export function loadHistory(): YtTrack[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (t): t is YtTrack =>
          !!t && typeof t === "object" && typeof (t as YtTrack).id === "string",
      )
      .filter((t) => ID_RE.test(t.id))
      .map((t) => ({
        id: t.id,
        title: typeof t.title === "string" ? t.title : null,
        url: typeof t.url === "string" && t.url ? t.url : trackUrl(t.id),
        addedAt: typeof t.addedAt === "number" ? t.addedAt : 0,
      }))
      .slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

/** Keep the list. A phone in private mode just forgets it. */
export function saveHistory(list: YtTrack[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_CAP)));
  } catch {
    /* private mode: the list just won't persist */
  }
}

/** The link, shortened for a row that has no title yet. */
export function shortLink(url: string): string {
  const v = /[?&]v=([A-Za-z0-9_-]{11})/.exec(url);
  if (v) return v[1];
  const short = /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(url);
  if (short) return short[1];
  return url.replace(/^https?:\/\//, "").slice(0, 42);
}

/** What is playing right now. */
export type NowPlaying =
  | { kind: "video"; track: YtTrack }
  | { kind: "list"; tracks: YtTrack[]; index: number }
  | { kind: "series"; listId: string; name: string };

/** The video that is playing right now, when we know which one it is. */
export function nowId(now: NowPlaying | null): string | null {
  if (!now) return null;
  if (now.kind === "video") return now.track.id;
  if (now.kind === "list") return now.tracks[now.index]?.id ?? null;
  // A YouTube playlist: the player tells us which one it is on.
  return null;
}
