// The word speaks (v4.12).
//
// Looking a word up is half hearing it: the app says the word out loud
// when its meaning arrives, with the phone's own voice — instant, free,
// offline — and the meaning card carries a button to hear it again.
//
// The phone's engine, not ElevenLabs: a pronunciation is one short word,
// and a network round trip per lookup would make the card feel slow.
import { speak, speechSupported } from "./speech";

/** A touch slower than reading — a word wants to be heard clearly. */
const WORD_RATE = 0.9;

export interface WordVoice {
  /** the voiceURI of the phone's voice, "" for its default */
  voiceURI?: string;
  /** 0.5 – 2 */
  rate?: number;
}

/** Say a word out loud. A device with no speech engine says nothing. */
export function sayWord(word: string, voice: WordVoice = {}): void {
  const w = word.trim();
  if (!w || !speechSupported()) return;
  void speak(w, {
    rate: voice.rate ?? WORD_RATE,
    pitch: 1,
    voiceURI: voice.voiceURI ?? "",
  }).catch(() => {
    /* the engine gave up — the meaning is still on screen */
  });
}
