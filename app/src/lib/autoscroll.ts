// Auto-scroll (v4.4): reading pace + speed cycle, pure and testable.
// The reader owns the timer; this file owns the math.

import { stepParts, type Position } from "./types";

/** Speed multipliers the button cycles through (long-press). */
export const AUTO_SPEEDS = [1, 1.25, 1.5, 0.75] as const;
export type AutoSpeed = (typeof AUTO_SPEEDS)[number];

const MIN_PACE = 1200; // ms
const MAX_PACE = 6500; // ms
const BASE_MS = 900;
const PER_WORD_MS = 340;

export function clampPace(ms: number): number {
  return Math.min(MAX_PACE, Math.max(MIN_PACE, ms));
}

/**
 * How long the current part stays lit before auto-advancing.
 * Base 900ms + 340ms per word (a rough reading speed), clamped to
 * 1200–6500ms, divided by the speed multiplier.
 */
export function paceMs(text: string, speed: number): number {
  const s = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clampPace((BASE_MS + PER_WORD_MS * words) / s);
}

/** Next multiplier in the 1× → 1.25× → 1.5× → 0.75× → 1× cycle. */
export function nextSpeed(speed: number): number {
  const i = AUTO_SPEEDS.indexOf(speed as AutoSpeed);
  return AUTO_SPEEDS[(i + 1) % AUTO_SPEEDS.length];
}

export function isAutoSpeed(s: unknown): s is number {
  return typeof s === "number" && (AUTO_SPEEDS as readonly number[]).includes(s);
}

export type AutoStep = { next: Position } | { end: true };

/**
 * One auto-advance tick: forward one part (same stepParts path as manual
 * input, so pages flow into each other). Returns {end:true} when the
 * book is exhausted — the reader stops there (icon back to ▶).
 */
export function nextAutoStep(
  parts: string[][],
  pos: Position,
): AutoStep {
  if (!parts.length) return { end: true };
  const next = stepParts(parts, pos, 1);
  if (next.item === pos.item && next.part === pos.part) return { end: true };
  return { next };
}
