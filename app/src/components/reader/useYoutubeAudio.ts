// The state of the YouTube audio control (v4.11).
//
// Everything the control knows lives here: what is playing (that is the
// playlist hook), the shape it is in (circle / bar / panel), the field
// the user pastes a link into and the sound itself.
//
// The views (YoutubeAudio, YoutubePanel) only draw what this says.
import { useCallback, useEffect, useRef, useState } from "react";
import { parseYouTubeLinks } from "../../lib/youtube";
import { makeTrack, type NowPlaying, type YtTrack } from "../../lib/youtubePlaylist";
import { useYoutubePlayer, type YoutubePlayer } from "./useYoutubePlayer";
import { useYoutubePlaylist, type YoutubePlaylistState } from "./useYoutubePlaylist";

/** The three shapes of the control. */
export type YoutubeMode = "circle" | "bar" | "panel";

export interface YoutubeAudioState {
  mode: YoutubeMode;
  setMode: (m: YoutubeMode) => void;
  draft: string;
  setDraft: (s: string) => void;
  error: string | null;
  history: YtTrack[];
  now: NowPlaying | null;
  playingId: string | null;
  label: string;
  volume: number;
  muted: boolean;
  embedSrc: string | null;
  reload: number;
  player: YoutubePlayer;
  submit: (raw: string) => void;
  playTrack: (t: YtTrack) => void;
  playAll: () => void;
  forget: (id: string) => void;
  step: (dir: 1 | -1) => void;
  onCircle: () => void;
  onVolume: (v: number) => void;
  onMute: () => void;
  onFrameLoad: () => void;
}

export function useYoutubeAudio(interrupt = false): YoutubeAudioState {
  const [mode, setMode] = useState<YoutubeMode>("circle");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(55);
  const [muted, setMuted] = useState(false);

  const player = useYoutubePlayer();
  const list: YoutubePlaylistState = useYoutubePlaylist(player);
  /** The music paused itself because the book started reading. */
  const pausedForSpeech = useRef(false);

  /** The pasted text: one link, several links, or a playlist. */
  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const refs = parseYouTubeLinks(text);
      if (!refs.length) {
        setError("That doesn't look like a YouTube link.");
        return;
      }
      setError(null);
      const videoIds = refs.map((r) => r.videoId).filter((v): v is string => !!v);
      const playlistId = refs.find((r) => r.playlistId)?.playlistId ?? null;

      if (videoIds.length > 1) {
        // Several links: they become a playlist of our own.
        const tracks = videoIds.map((id) => makeTrack(id));
        list.start({ kind: "list", tracks, index: 0 });
        setDraft("");
        setMode("panel");
        return;
      }
      if (videoIds.length === 1) {
        // One link: it plays, and the control folds back into its circle.
        list.start({ kind: "video", track: makeTrack(videoIds[0], text) });
        setDraft("");
        setMode((m) => (m === "panel" ? "panel" : "circle"));
        return;
      }
      if (playlistId) {
        // A YouTube playlist: the player walks through it by itself.
        list.start({
          kind: "series",
          listId: playlistId,
          name: "YouTube playlist",
        });
        setDraft("");
        setMode("panel");
      }
    },
    [list],
  );

  // The book reads itself: the music waits its turn.
  useEffect(() => {
    if (interrupt) {
      if (player.playing) {
        pausedForSpeech.current = true;
        player.pause();
      }
      return;
    }
    if (pausedForSpeech.current) {
      pausedForSpeech.current = false;
      player.play();
    }
  }, [interrupt, player.playing, player.pause, player.play]);

  const onVolume = useCallback(
    (v: number) => {
      setVolume(v);
      player.setVolume(v);
      if (v > 0 && muted) {
        setMuted(false);
        player.setMuted(false);
      }
    },
    [muted, player],
  );

  const onMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    player.setMuted(next);
  }, [muted, player]);

  /** The circle: sideways for a link, or the panel when it is playing. */
  const onCircle = useCallback(() => {
    if (mode !== "circle") {
      setMode("circle");
      return;
    }
    setMode(list.now ? "panel" : "bar");
  }, [mode, list.now]);

  const label =
    player.title ??
    (list.now?.kind === "series" ? list.now.name : null) ??
    "Nothing playing";

  return {
    mode,
    setMode,
    draft,
    setDraft,
    error,
    history: list.history,
    now: list.now,
    playingId: list.playingId,
    label,
    volume,
    muted,
    embedSrc: list.embedSrc,
    reload: list.reload,
    player,
    submit,
    playTrack: list.playTrack,
    playAll: list.playAll,
    forget: list.forget,
    step: list.step,
    onCircle,
    onVolume,
    onMute,
    onFrameLoad: list.onFrameLoad,
  };
}
