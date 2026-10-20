// The ambient background — one soft glow behind the reader and Home.
//
// The model (DESIGN.md, Oct 20 2026):
// · gradient — a glow rising from the bottom, fading to black by ~55% of
//   the height; alternate slowly cycles the hue (green → teal → blue →
//   indigo → purple → pink → amber → back) over 4 minutes, one colour
//   holds the user's pick
// · solid — the picked colour fills the screen, flat
// · off — pure black
// · motion off — the glow freezes where it is
//
// Every hook sits above every return: the style can change at any time and
// the component must never change its hook order.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../lib/settings";
import { AMBIENT_CYCLE_SECONDS, glow } from "../lib/ambient";
import "../ambient.css";

/** The drift: a slow float, transform only (DESIGN.md: transform/opacity). */
const DRIFT_SECONDS = 180;

export default function AmbientBackground() {
  const { settings } = useSettings();
  const { bgStyle, bgColourMode, bgColor, bgMotion, bgIntensity } = settings;

  const glowRef = useRef<HTMLDivElement>(null);
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

  const motionEnabled = bgMotion && !reduced;

  // The animation lives on the glow element: transform (drift) and the
  // hue custom property (cycle). Nothing else animates.
  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;
    if (!motionEnabled) {
      // Freeze where the glow is: keep the colour it has right now.
      const current = window
        .getComputedStyle(el)
        .getPropertyValue("--ambient-hue")
        .trim();
      if (current) el.style.setProperty("--ambient-hue", current);
      el.style.animation = "none";
      return;
    }
    if (bgStyle !== "gradient") {
      el.style.animation = "none";
      return;
    }
    const drift = `ambient-drift ${DRIFT_SECONDS}s var(--lr-ease) infinite`;
    el.style.animation =
      bgColourMode === "alternate"
        ? `ambient-hue-cycle ${AMBIENT_CYCLE_SECONDS}s linear infinite, ${drift}`
        : drift;
  }, [bgStyle, bgColourMode, motionEnabled]);

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
          ref={glowRef}
          data-testid="ambient-glow"
          className={`ambient-glow ${paint.className}`}
          style={paint.style as React.CSSProperties}
        />
      )}
    </div>
  );
}
