// The YouTube audio panel (v4.11).
//
// The rectangle the control opens into: the links the user played
// before on top (they can be played again, or all of them as a
// playlist), and the controls at the bottom — change the audio, pause,
// next, volume.
import { shortLink } from "../../lib/youtubePlaylist";
import {
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  VolumeIcon,
} from "./icons";
import type { YoutubeAudioState } from "./useYoutubeAudio";

interface Props {
  audio: YoutubeAudioState;
}

export default function YoutubePanel({ audio }: Props) {
  const {
    setMode,
    draft,
    setDraft,
    error,
    history,
    playingId,
    label,
    volume,
    muted,
    player,
    submit,
    playTrack,
    playAll,
    forget,
    step,
    onVolume,
    onMute,
  } = audio;

  return (
    <div
      data-testid="yt-panel"
      role="dialog"
      aria-label="YouTube audio"
      className="absolute bottom-14 left-0 flex max-h-[min(58vh,460px)] w-[min(320px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] border border-border bg-black/90 backdrop-blur-[18px] backdrop-saturate-150 shadow-[0_8px_32px_rgba(0,0,0,0.36)] animate-yt-in motion-reduce:animate-none"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
        <span
          data-testid="yt-now"
          className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground"
        >
          {label}
        </span>
        <button
          type="button"
          data-testid="yt-collapse"
          aria-label="Close"
          onClick={() => setMode("circle")}
          className="press shrink-0 border-0 bg-transparent p-1 text-[13px] leading-none text-muted-foreground"
        >
          ✕
        </button>
      </div>

      <div data-testid="yt-list" className="min-h-0 flex-1 overflow-y-auto py-2">
        <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <span>Previous links</span>
          {history.length > 0 && (
            <button
              type="button"
              data-testid="yt-play-all"
              onClick={playAll}
              className="press border-0 bg-transparent p-0 text-[12px] font-semibold normal-case tracking-normal text-primary"
            >
              Play all
            </button>
          )}
        </div>
        {history.length === 0 && (
          <p className="m-0 px-3.5 pb-2.5 pt-1 text-[12px] leading-[1.5] text-muted-foreground">
            The links you play show up here — then you can play them all as
            a playlist.
          </p>
        )}
        {history.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-1 pr-2 ${
              t.id === playingId ? "bg-primary/10" : ""
            }`}
          >
            <button
              type="button"
              data-testid={`yt-row-${t.id}`}
              onClick={() => playTrack(t)}
              className="flex min-w-0 flex-1 flex-col gap-px border-0 bg-transparent py-1.5 pl-3.5 pr-2.5 text-left"
            >
              <span className="truncate text-[13px] text-foreground">
                {t.title ?? shortLink(t.url)}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {shortLink(t.url)}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${t.title ?? t.id}`}
              onClick={() => forget(t.id)}
              className="press shrink-0 border-0 bg-transparent p-1.5 text-[15px] leading-none text-muted-foreground"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-3 pb-3 pt-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
          className="flex h-10 items-center gap-2 rounded-full border border-border bg-black/60 pl-3 pr-1"
        >
          <input
            data-testid="yt-panel-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Change the audio…"
            aria-label="YouTube link"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            data-testid="yt-panel-play"
            className="press h-[30px] shrink-0 rounded-full bg-primary px-3.5 text-[12px] font-semibold text-primary-foreground"
          >
            Play
          </button>
        </form>
        {error && (
          <p
            data-testid="yt-panel-error"
            className="m-0 text-[11px] leading-[1.4] text-destructive"
          >
            {error}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="yt-prev"
            aria-label="Previous"
            onClick={() => step(-1)}
            className="press grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-border bg-transparent text-foreground active:bg-accent"
          >
            <PrevIcon />
          </button>
          <button
            type="button"
            data-testid="yt-toggle"
            aria-label={player.playing ? "Pause" : "Play"}
            onClick={() => player.toggle()}
            className="press grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-border bg-transparent text-foreground active:bg-accent"
          >
            {player.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            data-testid="yt-next"
            aria-label="Next"
            onClick={() => step(1)}
            className="press grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-border bg-transparent text-foreground active:bg-accent"
          >
            <NextIcon />
          </button>
          <button
            type="button"
            data-testid="yt-mute"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={onMute}
            className="press grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-border bg-transparent text-foreground active:bg-accent"
          >
            {muted ? <MuteIcon /> : <VolumeIcon />}
          </button>
          <input
            data-testid="yt-volume"
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="Volume"
            className="min-w-0 flex-1 accent-primary"
          />
        </div>
      </div>
    </div>
  );
}
