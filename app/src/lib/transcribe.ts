// Transcribing a video or an audio file (v4.12).
//
// The file goes to ElevenLabs' Scribe v2 and comes back as text — the
// same text the reader shows, cut into passages and indexed like a
// book. So "what did they say about the 30th Street" works on a lecture
// the same way it works on a textbook.
//
// The reader's own key and the reader's own quota (see lib/elevenlabs.ts
// — there is no shared key in the build).
import { errorText } from "./elevenlabs";

/** The transcription model. */
export const STT_MODEL = "scribe_v2";

/** The file types the transcriber takes. */
export const MEDIA_EXTENSIONS = [
  "mp4",
  "m4a",
  "mp3",
  "wav",
  "webm",
  "mov",
  "ogg",
  "oga",
  "aac",
  "flac",
  "mkv",
  "avi",
  "m4v",
];

/** True when the file is something the transcriber can read. */
export function isMediaFile(file: File): boolean {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return MEDIA_EXTENSIONS.includes(ext);
}

/**
 * Transcribe a media file into text.
 *
 * The SDK is 4.6 MB — it is loaded here, the first time somebody
 * actually transcribes something, and the browser keeps it after that.
 */
export async function transcribeMedia(
  file: File,
  key: string,
): Promise<string> {
  if (!key) {
    throw new Error(
      "Add your ElevenLabs key in Settings — the transcription runs in the cloud.",
    );
  }
  const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
  const client = new ElevenLabsClient({ apiKey: key });
  try {
    const res = await client.speechToText.convert({
      file,
      modelId: STT_MODEL,
    });
    const text = (res as { text?: string })?.text ?? "";
    if (!text.trim()) {
      throw new Error("No speech was found in that file.");
    }
    return text;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No speech")) throw e;
    throw new Error(errorText(e, "ElevenLabs could not transcribe that."));
  }
}
