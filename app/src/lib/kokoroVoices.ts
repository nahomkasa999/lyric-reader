// The voices Kokoro-82M ships with (v4.8) — 28 of them, with the name,
// the language, the gender and the quality grade the model reports.
export interface VoiceMeta {
  id: string;
  name: string;
  lang: string;
  gender: "Female" | "Male";
  /** the little mark some voices carry (❤️ 🔥 🎧) */
  traits?: string;
  /** the quality grade (A is best) */
  grade: string;
}

type Row = [string, string, string, "Female" | "Male", string | undefined, string];

const RAW: Row[] = [
  ["af_heart", "Heart", "en-us", "Female", "❤️", "A"],
  ["af_bella", "Bella", "en-us", "Female", "🔥", "A-"],
  ["af_nicole", "Nicole", "en-us", "Female", "🎧", "B-"],
  ["af_nova", "Nova", "en-us", "Female", undefined, "C"],
  ["af_sky", "Sky", "en-us", "Female", undefined, "C-"],
  ["af_sarah", "Sarah", "en-us", "Female", undefined, "C+"],
  ["af_alloy", "Alloy", "en-us", "Female", undefined, "C"],
  ["af_aoede", "Aoede", "en-us", "Female", undefined, "C+"],
  ["af_kore", "Kore", "en-us", "Female", undefined, "C+"],
  ["af_jessica", "Jessica", "en-us", "Female", undefined, "D"],
  ["af_river", "River", "en-us", "Female", undefined, "D"],
  ["am_michael", "Michael", "en-us", "Male", undefined, "C"],
  ["am_fenrir", "Fenrir", "en-us", "Male", undefined, "C+"],
  ["am_puck", "Puck", "en-us", "Male", undefined, "C"],
  ["am_echo", "Echo", "en-us", "Male", undefined, "D"],
  ["am_eric", "Eric", "en-us", "Male", undefined, "D"],
  ["am_onyx", "Onyx", "en-us", "Male", undefined, "D"],
  ["am_liam", "Liam", "en-us", "Male", undefined, "D"],
  ["am_adam", "Adam", "en-us", "Male", undefined, "F+"],
  ["am_santa", "Santa", "en-us", "Male", undefined, "D-"],
  ["bf_emma", "Emma", "en-gb", "Female", "🚺", "B-"],
  ["bf_isabella", "Isabella", "en-gb", "Female", undefined, "C"],
  ["bf_lily", "Lily", "en-gb", "Female", "🚺", "D"],
  ["bf_alice", "Alice", "en-gb", "Female", "🚺", "D"],
  ["bm_george", "George", "en-gb", "Male", undefined, "C"],
  ["bm_lewis", "Lewis", "en-gb", "Male", undefined, "D+"],
  ["bm_daniel", "Daniel", "en-gb", "Male", "🚹", "C"],
  ["bm_fable", "Fable", "en-gb", "Male", "🚹", "C"],
];

export const KOKORO_VOICES: VoiceMeta[] = RAW.map(
  ([id, name, lang, gender, traits, grade]) => ({
    id,
    name,
    lang,
    gender,
    traits,
    grade,
  }),
);

export const DEFAULT_VOICE = "af_heart";
