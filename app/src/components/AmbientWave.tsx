// The wave — the top edge of the ambient glow.
//
// Two layers of the same wave, half a phase apart: the lower one is always
// there, the upper one breathes in and out on top of it. The visible edge
// therefore undulates slowly, while the blur stays rasterised once.
import { useId } from "react";
import {
  AMBIENT_WAVE_A,
  AMBIENT_WAVE_B,
  type AmbientMode,
} from "../lib/ambient";
import "../ambient.css";

interface Props {
  /** Alternate cycles the hue; one colour holds the user's pick. */
  mode: AmbientMode;
  /** The miniature version used by the Settings preview. */
  mini?: boolean;
}

function WaveLayer({
  d,
  id,
  mode,
  mini,
  layer,
}: {
  d: string;
  id: string;
  mode: AmbientMode;
  mini: boolean;
  layer: "a" | "b";
}) {
  const classes = [
    "ambient-wave",
    `ambient-wave-${layer}`,
    mini ? "ambient-wave-mini" : "",
    mode === "single" ? "ambient-wave-single" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      className={classes}
      viewBox="0 0 1000 620"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-testid={`ambient-wave-${layer}`}
    >
      <defs>
        <linearGradient
          id={id}
          x1="0"
          y1="620"
          x2="0"
          y2="437"
          gradientUnits="userSpaceOnUse"
        >
          <stop className="ambient-fade-strong" offset="0" />
          <stop className="ambient-fade-mid" offset="0.7" />
          <stop className="ambient-fade-soft" offset="1" />
        </linearGradient>
      </defs>
      <path
        className="ambient-wave-path"
        d={d}
        fill={`url(#${id})`}
        data-testid={`ambient-wave-path-${layer}`}
      />
    </svg>
  );
}

export default function AmbientWave({ mode, mini = false }: Props) {
  // A unique id per instance — the preview and the background both draw.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <>
      <WaveLayer
        d={AMBIENT_WAVE_A}
        id={`ambient-fade-${uid}-a`}
        mode={mode}
        mini={mini}
        layer="a"
      />
      <WaveLayer
        d={AMBIENT_WAVE_B}
        id={`ambient-fade-${uid}-b`}
        mode={mode}
        mini={mini}
        layer="b"
      />
    </>
  );
}
