// What is playing, and the list of links the user has played (v4.11).
//
// The panel shows the list at the top; a link can be played again — or
// the whole list, as a playlist. Whatever is playing joins the list as
// it goes, so a YouTube playlist fills it while it plays.
//
// The list lives in localStorage (lib/youtubePlaylist.ts): a handful of
// ids, titles and links, and it must survive a reload.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  youtubeEmbedUrl,
  youtubePlaylistEmbedUrl,
} from "../../lib/youtube";
import {
  addTrack,
  loadHistory,
  makeTrack,
  removeTrack,
  saveHistory,
  stepIndex,
  trackUrl,
  type NowPlaying,
  type YtTrack,
} from "../../lib/youtubePlaylist";
import { YT_ENDED } from "../../lib/youtubeWire";
import type { YoutubePlayer } from "./useYoutubePlayer";

export interface YoutubePlaylistState {
  /** what is playing right now */
  now: NowPlaying | null;
  /** the links the user has played, newest first */
  history: YtTrack[];
  /** the video playing right now, when we know which one it is */
  playingId: string | null;
  /** the frame the player needs, or nothing */
  embedSrc: string | null;
  /** bumped on every new track — it is what re-loads the frame */
  reload: number;
  start: (next: NowPlaying) => void;
  playTrack: (track: YtTrack) => void;
  playAll: () => void;
  forget: (id: string) => void;
  step: (dir: 1 | -1) => void;
  onFrameLoad: () => void;
}

export function useYoutubePlaylist(
  player: YoutubePlayer,
): YoutubePlaylistState {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [history, setHistory] = useState<YtTrack[]>(() => loadHistory());
  const [reload, setReload] = useState(0);
  /** The frame that just ended must only advance once. */
  const ended = useRef(false);

  // The list survives a reload.
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const embedSrc = useMemo(() => {
    if (!now) return null;
    if (now.kind === "series") {
      return youtubePlaylistEmbedUrl(now.listId, { autoplay: true });
    }
    const id = now.kind === "video" ? now.track.id : now.tracks[now.index]?.id;
    return id ? youtubeEmbedUrl(id, { autoplay: true }) : null;
  }, [now]);

  /** Start something playing. */
  const start = useCallback(
    (next: NowPlaying) => {
      setNow(next);
      setReload((r) => r + 1);
      player.play();
    },
    [player],
  );

  /** One of the links from the list. */
  const playTrack = useCallback(
    (track: YtTrack) => {
      start({ kind: "video", track });
    },
    [start],
  );

  /** The whole list, as a playlist. */
  const playAll = useCallback(() => {
    if (!history.length) return;
    start({ kind: "list", tracks: history, index: 0 });
  }, [history, start]);

  const forget = useCallback((id: string) => {
    setHistory((prev) => removeTrack(prev, id));
  }, []);

  /** Next / previous in whatever is playing. */
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!now) return;
      if (now.kind === "list") {
        const i = stepIndex(now.tracks, now.index, dir);
        if (i < 0) return;
        start({ ...now, index: i });
        return;
      }
      if (now.kind === "series") {
        if (dir === 1) player.next();
        else player.previous();
        return;
      }
      // A single link: it plays again from the start.
      start(now);
    },
    [now, player, start],
  );

  /** The track that ended: the next one in our own list takes over. */
  const advance = useCallback(() => {
    if (!now || now.kind !== "list") return; // a playlist walks itself
    const i = now.index + 1;
    if (i >= now.tracks.length) {
      setNow(null);
      return;
    }
    start({ ...now, index: i });
  }, [now, start]);

  // The player says it ended: the next track takes over.
  useEffect(() => {
    if (player.state !== YT_ENDED) return;
    if (ended.current) return;
    ended.current = true;
    advance();
  }, [player.state, advance]);

  /** A new player greeted us: the old one is gone. */
  const onFrameLoad = useCallback(() => {
    ended.current = false;
    player.handshake();
  }, [player.handshake]);

  // Whatever plays joins the list of previous links.
  useEffect(() => {
    const id = player.videoId;
    if (!id) return;
    setHistory((prev) => {
      const known = prev.find((t) => t.id === id);
      if (known) {
        if (player.title && known.title !== player.title) {
          return prev.map((t) =>
            t.id === id ? { ...t, title: player.title } : t,
          );
        }
        return prev;
      }
      return addTrack(
        prev,
        makeTrack(id, trackUrl(id), player.title, Date.now()),
      );
    });
  }, [player.videoId, player.title]);

  const playingId =
    now?.kind === "video"
      ? now.track.id
      : now?.kind === "list"
        ? (now.tracks[now.index]?.id ?? null)
        : null;

  return {
    now,
    history,
    playingId,
    embedSrc,
    reload,
    start,
    playTrack,
    playAll,
    forget,
    step,
    onFrameLoad,
  };
}
