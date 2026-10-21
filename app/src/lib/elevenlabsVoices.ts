// The standard ElevenLabs voices (v4.9).
//
// A key can be made without the "voices_read" permission — then the API
// refuses to list the account's voices, even though the key can still
// speak. These are the well-known library voices, so the reader still
// has something to read with.
export interface StandardVoice {
  id: string;
  name: string;
  meta: string;
}

/**
 * Is this an ElevenLabs voice id?
 *
 * The ids look like "JBFqnCBsd6RMkjVDRZzb" — letters and digits, no
 * spaces. A phone's own voice is called "English (United States)" or
 * "Microsoft Zira Desktop - English (United States)": sending one of
 * those to ElevenLabs is what makes the API answer "An invalid ID has
 * been received", so they are told apart here.
 */
export function isVoiceId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,64}$/.test((id ?? "").trim());
}

export const STANDARD_VOICES: StandardVoice[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", meta: "male · narrative" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", meta: "male · deep" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", meta: "male · authoritative" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", meta: "male · young" },
  { id: "flq6f7yk4E4fJM5XTYuZ", name: "Michael", meta: "male · middle-aged" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", meta: "male · deep" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", meta: "male · raspy" },
  { id: "ZQe5CZNOzWyzUMPnXp4vee", name: "James", meta: "male · middle-aged" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", meta: "male · narration" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", meta: "male · calm" },
  { id: "D38z5RcWu1voky8WS1ja", name: "Fin", meta: "male · British" },
  { id: "CYw3kZ02Hs0563khs1Fj", name: "Dave", meta: "male · mature" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", meta: "male · young" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", meta: "male · confident" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", meta: "female · calm" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", meta: "female · soft" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", meta: "female · conversational" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", meta: "female · confident" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", meta: "female · warm" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy", meta: "female · elderly" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", meta: "female · youthful" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", meta: "female · upbeat" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Chloe", meta: "female · playful" },
  { id: "LcfcDJNUP1GQjkzn1xUU", name: "Emily", meta: "female · calm" },
  { id: "zrHiDhphv9ZnVXBqCLjz", name: "Mimi", meta: "female · humorous" },
  { id: "z9fAnlkpzviPz146aGW9", name: "Glinda", meta: "female · British" },
];
