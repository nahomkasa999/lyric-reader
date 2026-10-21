// YouTube → audio (v4.11).
//
// A small control at the bottom-left of the reader, on the same level as
// the "?" / ▶ / speaker cluster opposite it. Three shapes:
//
//   circle — the resting state: one round button.
//   bar    — tap it and it opens sideways: a field to paste a link in.
//   panel  — tap it again and it opens into a rectangle: the links you
//            played before on top, the controls (play/pause, next,
//            volume) and a field to change the audio at the bottom.
//
// The sound comes from a hidden YouTube embed: the frame sits off-screen
// (the player needs a real viewport to work at all), so only the audio
// is heard. The player is driven with postMessage (useYoutubePlayer) —
// the YouTube IFrame API script is never loaded.
//
// What it cannot do: read the audio. An embedded player is cross-origin,
// so the sound cannot be analysed — this is a player, not a mixer.
import { MusicIcon, WaveIcon } from "./icons";
import YoutubePanel from "./YoutubePanel";
import { useYoutubeAudio } from "./useYoutubeAudio";

interface Props {
  /** the reader's chrome is on screen */
  visible: boolean;
  /** the book is being read aloud — the music waits */
  interrupt?: boolean;
}

export default function YoutubeAudio({ visible, interrupt = false }: Props) {
  const audio = useYoutubeAudio(interrupt);
  const { mode, draft, setDraft, error, embedSrc, reload, player } = audio;

  // The control keeps its place once it has something to play: it is the
  // only way to stop the sound without digging for it.
  const shown = visible || mode !== "circle" || !!audio.now;

  return (
    <div
      data-testid="yt-root"
      className="absolute bottom-[calc(84px+env(safe-area-inset-bottom))] left-4 z-[25] h-11 w-11"
    >
      <button
        data-testid="yt-btn"
        aria-label={
          player.playing ? "YouTube audio — playing" : "YouTube audio"
        }
        aria-expanded={mode !== "circle"}
        onClick={audio.onCircle}
        className={[
          "relative grid h-11 w-11 place-items-center rounded-full border bg-black/55 text-foreground",
          "transition-opacity duration-200 active:bg-accent",
          shown
            ? "visible opacity-[0.55] pointer-events-auto"
            : "invisible opacity-0 pointer-events-none",
          player.playing ? "border-primary text-primary" : "border-border",
        ].join(" ")}
      >
        {player.playing ? <WaveIcon /> : <MusicIcon />}
      </button>

      {mode === "bar" && (
        <form
          data-testid="yt-bar"
          onSubmit={(e) => {
            e.preventDefault();
            audio.submit(draft);
          }}
          className="absolute bottom-0 left-14 flex w-[min(280px,calc(100vw-6rem))] flex-col gap-1.5"
        >
          {error && (
            <p
              data-testid="yt-error"
              className="m-0 px-1 text-[11px] leading-[1.4] text-destructive"
            >
              {error}
            </p>
          )}
          <div className="flex h-11 items-center gap-2 rounded-full border border-border bg-black/90 pl-3.5 pr-1.5 backdrop-blur-[18px] backdrop-saturate-150">
            <input
              data-testid="yt-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste a YouTube link"
              aria-label="YouTube link"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              data-testid="yt-play"
              className="press h-[34px] shrink-0 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
            >
              Play
            </button>
          </div>
        </form>
      )}

      {mode === "panel" && <YoutubePanel audio={audio} />}

      {/* The sound: a real player, off-screen. */}
      {embedSrc && (
        <iframe
          key={`${embedSrc}|${reload}`}
          ref={player.frameRef}
          data-testid="yt-frame"
          src={embedSrc}
          onLoad={audio.onFrameLoad}
          allow="autoplay; encrypted-media; picture-in-picture"
          title="YouTube audio"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute left-[-9999px] top-0 h-[200px] w-[200px] border-0"
        />
      )}
    </div>
  );
}
