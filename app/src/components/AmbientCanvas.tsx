// The ambient glow, drawn on a canvas by a small WebGL shader.
//
// The canvas is the background of the app: a soft light that rises from
// the bottom of the screen, with shapes that drift inside it. The
// renderer (lib/ambientRenderer.ts) draws it into a small buffer and the
// browser stretches that, so the cost is the same on every device.
//
// If the device has no WebGL — or the shader will not compile — the
// component falls back to the CSS haze, a flat approximation of the same
// look. The fallback is the CSS class "ambient-haze".

import { useEffect, useRef, useState } from "react";
import { createRenderer, type Renderer } from "../lib/ambientRenderer";
import type { AmbientMode } from "../lib/ambient";

export interface AmbientCanvasProps {
  /** alternate cycles the hues, single holds the picked colour */
  mode: AmbientMode;
  /** the picked colour, used in single mode */
  color: string;
  /** 0-100 */
  intensity: number;
  /** false freezes the light where it is */
  motion: boolean;
}

export default function AmbientCanvas(props: AmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  // The renderer reads the latest values every frame, so changing the
  // colour never has to rebuild the shader.
  const propsRef = useRef(props);
  propsRef.current = props;
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas, () => propsRef.current);
    if (!renderer) {
      setFallback(true);
      return;
    }
    rendererRef.current = renderer;
    renderer.setMotion(propsRef.current.motion);
    return () => {
      rendererRef.current = null;
      renderer.destroy();
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setMotion(props.motion);
  }, [props.motion]);

  // No WebGL: the CSS haze takes over.
  if (fallback) {
    return <div className="ambient-haze" data-testid="ambient-haze" />;
  }
  return (
    <canvas
      className="ambient-canvas"
      data-testid="ambient-canvas"
      ref={canvasRef}
    />
  );
}
