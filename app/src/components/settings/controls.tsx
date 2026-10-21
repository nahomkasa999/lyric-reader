// The building blocks every Settings group is made of.
// One set of shapes for the whole page: a group, a row, a switch, a
// segmented choice, a slider. On/off is always a switch; choices are
// chips, swatches or segments; nothing else.
import type { ReactNode } from "react";
import Slider from "../Slider";

export function Group({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={`settings-group-${id}`} className="set-group">
      <div className="set-group-head">
        <h2 className="set-group-label">{title}</h2>
      </div>
      {hint && <p className="set-note">{hint}</p>}
      {children}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-row-label">{label}</span>
      {children}
    </div>
  );
}

/** On/off control — a switch, never a chip (DESIGN.md, components). */
export function Switch({
  testid,
  checked,
  onChange,
  disabled,
  label,
}: {
  testid: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testid}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="set-switch"
    >
      <span aria-hidden="true" />
    </button>
  );
}

/** Single choice — a segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  testid,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  testid: string;
}) {
  return (
    <div className="set-seg" role="group" aria-label={label} data-testid={testid}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          data-testid={`${testid}-${o.id}`}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SliderRow({
  testid,
  min,
  max,
  value,
  onChange,
  suffix,
  disabled,
  label,
  step = 1,
}: {
  testid: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  disabled?: boolean;
  /** the name a screen reader reads out */
  label?: string;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <Slider
        testid={testid}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        disabled={disabled}
        label={label ?? testid}
        format={(v) => `${v}${suffix ?? ""}`}
      />
      <span className="w-14 shrink-0 text-right text-sm text-foreground tabular-nums">
        {value}
        {suffix}
      </span>
    </div>
  );
}
