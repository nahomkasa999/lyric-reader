// The slider (v4.13) — a thumb you can actually grab.
//
// The native range input is thin: on a phone the thumb is a few
// pixels wide, and a tap on the track jumps the value to where the
// finger landed. Both are wrong for a setting the reader is trying to
// feel their way to.
//
// So the slider is built here: a 26px thumb, a 44pt tall hit area,
// and a rule that a tap changes NOTHING — the value only moves when
// the thumb is dragged, or when a key is pressed.
import { useRef } from "react";

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  /** the smallest move */
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** the name a screen reader reads out */
  label: string;
  testid?: string;
  /** what the value reads as — "60%" instead of "60" */
  format?: (v: number) => string;
}

/** How far the finger must travel before the value moves. */
const ARM = 4;

/**
 * The value a drag lands on.
 *
 * The drag is measured from where it started, not from where the
 * thumb is now, so the thumb never runs away from the finger.
 */
export function trackValue(
  startValue: number,
  deltaX: number,
  width: number,
  min: number,
  max: number,
  step: number,
): number {
  if (!(width > 0)) return startValue;
  const raw = startValue + (deltaX / width) * (max - min);
  const clamped = Math.min(max, Math.max(min, raw));
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  const out = Math.min(max, Math.max(min, snapped));
  return Number(out.toFixed(6));
}

export default function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  label,
  testid,
  format,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; value: number; moved: boolean } | null>(
    null,
  );

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const width = () => trackRef.current?.getBoundingClientRect().width ?? 0;

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    // The press only arms the drag — the value does not move yet.
    drag.current = { x: e.clientX, value, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* the capture is a nicety, not a requirement */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < ARM) return;
    d.moved = true;
    onChange(trackValue(d.value, dx, width(), min, max, step));
  };

  const onPointerUp = () => {
    // A press that never moved changes nothing.
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const big = step * 10;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - step;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else if (e.key === "PageUp") next = value + big;
    else if (e.key === "PageDown") next = value - big;
    if (next === null) return;
    e.preventDefault();
    onChange(
      Number(
        Math.min(max, Math.max(min, next)).toFixed(6),
      ),
    );
  };

  return (
    <div
      data-testid={testid}
      className={`slider${disabled ? " slider-disabled" : ""}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format ? format(value) : String(value)}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className="slider-track" ref={trackRef}>
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        <div className="slider-thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
