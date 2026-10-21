// Audio playback (v4.9) — one AudioContext for the whole app.
//
// Phones only let audio start from a user gesture, so the context is
// created once and unlocked by the first tap. Everything that plays a
// sound (the read-aloud voice) goes through here.

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

/** Safari's name for the same thing. */
interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) throw new Error("This browser has no audio.");
    ctx = new Ctor();
  }
  return ctx;
}

/** Stop whatever is playing. */
export function stopAudio(): void {
  if (current) {
    try {
      current.stop();
    } catch {
      /* already stopped */
    }
    current = null;
  }
}

/** Play an audio buffer; resolves when the sound ends. */
export async function playAudio(data: ArrayBuffer): Promise<void> {
  const ac = audioContext();
  if (ac.state === "suspended") await ac.resume();
  const buffer = await ac.decodeAudioData(data);
  stopAudio();
  return new Promise<void>((resolve) => {
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    src.onended = () => {
      if (current === src) current = null;
      resolve();
    };
    current = src;
    src.start();
  });
}
