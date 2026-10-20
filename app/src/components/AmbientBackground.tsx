// The ambient background — the glow behind the reader and Home.
//
// The model (DESIGN.md, Oct 20 2026 + the reviews):
// · gradient — a WebGL shader draws a soft light that rises from the
//   bottom, reaches up about half the screen and drifts; alternate
//   slowly cycles the hue (19 stops over 5 minutes), one colour holds
//   the user's pick
// · solid — the picked colour fills the screen, flat
// · off — pure black
// · motion off — the light freezes where it is
//
// Every hook sits above every return: the style can change at any time
// and the component must never change its hook order.
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../lib/settings";
import { glow, installCycleStyles } from "../lib/ambient";
import AmbientCanvas from "./AmbientCanvas";
import "../ambient.css";

export default function AmbientBackground() {
  const { settings } = useSettings();
  const { bgStyle, bgColourMode, bgColor, bgMotion, bgIntensity } = settings;

  const [reduced, setReduced] = useState(false);

  // The system asks for less motion → the background stops moving.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // The CSS fallback walks the same colour cycle as the shader.
  useEffect(() => {
    installCycleStyles();
  }, []);

  const frozen = !bgMotion || reduced;

  const paint = useMemo(
    () => glow({ mode: bgColourMode, color: bgColor, intensity: bgIntensity }),
    [bgColourMode, bgColor, bgIntensity],
  );

  const canvas =
    bgStyle === "solid" ? { background: bgColor } : { background: "#000000" };

  return (
    <div
      data-testid="ambient-background"
      aria-hidden="true"
      className="ambient"
      style={canvas}
    >
      {bgStyle === "gradient" && (
        <div
          data-testid="ambient-glow"
          className={`${paint.className}${frozen ? " ambient-frozen" : ""}`}
          style={paint.style as React.CSSProperties}
        >
          <AmbientCanvas
            mode={bgColourMode}
            color={bgColor}
            intensity={bgIntensity}
            motion={!frozen}
          />
        </div>
      )}
    </div>
  );
}
