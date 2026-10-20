// The ambient background — one soft haze behind the reader and Home.
//
// The model (DESIGN.md, Oct 20 2026 + the reviews):
// · gradient — one oversized, heavily blurred colour field whose centre
//   sits below the viewport: on screen it is a smooth falloff, brightest
//   at the bottom edge and black by ~55% of the height, with no shape
//   edge anywhere; alternate slowly cycles the hue (green → teal → blue
//   → indigo → purple → pink → amber → back) over 4 minutes, one colour
//   holds the user's pick
// · solid — the picked colour fills the screen, flat
// · off — pure black
// · motion off — the colour cycle and the drift freeze where they are
//
// Every hook sits above every return: the style can change at any time and
// the component must never change its hook order.
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../lib/settings";
import { glow } from "../lib/ambient";
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
          <div data-testid="ambient-haze" className="ambient-haze" />
        </div>
      )}
    </div>
  );
}
