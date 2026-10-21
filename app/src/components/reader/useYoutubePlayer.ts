// The connection to the hidden YouTube embed (v4.11).
//
// The embed talks to its parent over postMessage: we greet it with
// `listening`, it answers with its state (`initialDelivery` once, then
// `infoDelivery` patches), and we drive it with `command` messages.
//
// The two rules of that wire live in lib/youtubeWire.ts and are honoured
// here: the greeting is repeated until the player answers, and every
// load of the frame is a NEW player — the old state is forgotten.
import { useCallback, useEffect, useRef, useState } from "react";
import { parseYouTubeId } from "../../lib/youtube";
import {
  YT_BUFFERING,
  YT_CUED,
  YT_HOST_RE,
  YT_ID,
  YT_PAUSED,
  YT_PLAYING,
  YT_UNSTARTED,
  parseYouTubeMessage,
  youtubeErrorText,
  type YouTubeInfo,
  type PlayerArg,
} from "../../lib/youtubeWire";

export interface YoutubePlayer {
  /** the frame the caller must render */
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  /** the player has spoken at least once */
  ready: boolean;
  /** it is making sound (playing or buffering) */
  playing: boolean;
  /** the player's own state — -1 unstarted, 0 ended, 1 playing, 2 paused… */
  state: number | undefined;
  /** seconds into the video */
  currentTime: number;
  /** how long the video is */
  duration: number;
  /** 0–100 */
  volume: number;
  muted: boolean;
  /** the title of the video playing now */
  title: string | null;
  /** the id of the video playing now */
  videoId: string | null;
  /** why the player refused, when it did */
  error: string | null;
  /** the iframe's onLoad — greet the new player */
  handshake: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  next: () => void;
  previous: () => void;
  stop: () => void;
}

const EMPTY: YouTubeInfo = {};

export function useYoutubePlayer(id: string = YT_ID): YoutubePlayer {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [info, setInfo] = useState<YouTubeInfo>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const infoRef = useRef<YouTubeInfo>(EMPTY);
  const readyRef = useRef(false);
  const askTimer = useRef<number | null>(null);
  /** true while the user wants sound: the player is asked to play. */
  const wantPlay = useRef(false);

  const post = useCallback((msg: Record<string, unknown>) => {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    try {
      w.postMessage(JSON.stringify(msg), "*");
    } catch {
      /* the frame is gone — nothing to say to it */
    }
  }, []);

  const command = useCallback(
    (func: string, args: PlayerArg[] = []) => {
      post({ event: "command", func, args, id });
    },
    [post, id],
  );

  const stopAsking = useCallback(() => {
    if (askTimer.current !== null) {
      window.clearInterval(askTimer.current);
      askTimer.current = null;
    }
  }, []);

  /** A new player: forget the old one and greet this one. */
  const handshake = useCallback(() => {
    stopAsking();
    infoRef.current = EMPTY;
    readyRef.current = false;
    setInfo(EMPTY);
    setReady(false);
    setError(null);
    const ask = () => post({ event: "listening", id, channel: "widget" });
    ask();
    askTimer.current = window.setInterval(ask, 500);
  }, [post, id, stopAsking]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      let host = "";
      try {
        host = new URL(e.origin).hostname;
      } catch {
        return;
      }
      if (!YT_HOST_RE.test(host)) return;
      const msg = parseYouTubeMessage(e.data);
      if (!msg) return;
      // Several players on one page each echo the name they were
      // greeted with — only ours is ours.
      if (
        msg.id !== undefined &&
        msg.id !== null &&
        String(msg.id) !== String(id)
      )
        return;
      stopAsking();
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
      if (msg.event === "onError") {
        setError(youtubeErrorText(msg.info ?? null));
        return;
      }
      if (msg.info) {
        const next = { ...infoRef.current, ...msg.info };
        infoRef.current = next;
        setInfo(next);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      stopAsking();
    };
  }, [id, stopAsking]);

  const play = useCallback(() => {
    wantPlay.current = true;
    command("playVideo");
  }, [command]);

  const pause = useCallback(() => {
    wantPlay.current = false;
    command("pauseVideo");
  }, [command]);

  const toggle = useCallback(() => {
    if (wantPlay.current) pause();
    else play();
  }, [pause, play]);

  // The browser may refuse to start sound that nobody asked for. When
  // the player sits there cued and the user DID ask for sound, ask
  // again — that ask is what a tap on the player's own button does.
  const state = info.playerState;
  useEffect(() => {
    if (state === undefined) return;
    if (!wantPlay.current) return;
    if (state === YT_UNSTARTED || state === YT_CUED || state === YT_PAUSED) {
      command("playVideo");
    }
  }, [state, command]);

  const setVolume = useCallback(
    (v: number) => {
      command("setVolume", [Math.max(0, Math.min(100, Math.round(v)))]);
    },
    [command],
  );

  const setMuted = useCallback(
    (m: boolean) => {
      command(m ? "mute" : "unMute");
    },
    [command],
  );

  const next = useCallback(() => command("nextVideo"), [command]);
  const previous = useCallback(() => command("previousVideo"), [command]);
  const stop = useCallback(() => {
    wantPlay.current = false;
    command("stopVideo");
  }, [command]);

  const playing = state === YT_PLAYING || state === YT_BUFFERING;
  const title =
    typeof info.videoData?.title === "string" ? info.videoData.title : null;
  const videoId =
    info.videoData?.video_id ??
    (typeof info.videoUrl === "string" ? parseYouTubeId(info.videoUrl) : null);

  return {
    frameRef,
    ready,
    playing,
    state,
    currentTime: typeof info.currentTime === "number" ? info.currentTime : 0,
    duration: typeof info.duration === "number" ? info.duration : 0,
    volume: typeof info.volume === "number" ? info.volume : 0,
    muted: info.muted === true,
    title,
    videoId,
    error,
    handshake,
    play,
    pause,
    toggle,
    setVolume,
    setMuted,
    next,
    previous,
    stop,
  };
}
