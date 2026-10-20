// The miniature background in Settings.
//
// It shows the same glow as the app draws — the same colours, the same
// strength, the same slow cycle — but as the CSS haze, not the shader.
//
// Why not the shader: the preview sits inside a sticky bar, and Chromium
// mis-composites a canvas layer in that position (it paints the frame
// somewhere else on the screen). The background itself is a full-screen
// canvas and has no such trouble, so the real glow keeps the shader and
// the preview takes the flat version.

import type { ReaderSettings } from "../lib/settings";
import { glow } from "../lib/ambient";
import "../ambient.css";

export default function BackgroundPreview({
  settings,
  live,
}: {
  settings: ReaderSettings;
  live: boolean;
}) {
  const { bgStyle, bgColourMode, bgColor, bgIntensity } = settings;

  if (bgStyle === "off") return null;

  if (bgStyle === "solid") {
    // Solid is flat: the picked colour fills the screen.
    return <div className="absolute inset-0" style={{ background: bgColor }} />;
  }

  const paint = glow({
    mode: bgColourMode,
    color: bgColor,
    intensity: bgIntensity,
  });

  return (
    <div
      data-testid="ambient-preview"
      className={`${paint.className}${live ? "" : " ambient-frozen"}`}
      style={paint.style as React.CSSProperties}
    >
      <div className="ambient-haze ambient-haze-mini" />
    </div>
  );
}
